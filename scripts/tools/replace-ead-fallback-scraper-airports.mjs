#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { loadEnvFromProjectRoot } from "./_load-env.mjs";

const ROOT = process.cwd();
const TMP_DIR = path.join(ROOT, "data", ".tmp");
const EAD_COUNTRIES_PATH = path.join(ROOT, "data", "ead-country-icaos.json");
const SCRAPER_CONFIG_PATH = path.join(ROOT, "lib", "scraper-country-config.ts");
const PACKAGES_PATH = path.join(TMP_DIR, "dynamic-packages.ead-fallback-scrapers.json");
const FILTERED_PACKAGES_PATH = path.join(TMP_DIR, "dynamic-packages.ead-fallback-scrapers.filtered.json");
const ENRICHED_PATH = path.join(TMP_DIR, "dynamic-airports.ead-fallback-scrapers.json");
const BATCH_SIZE = 200;

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function argValue(flag, fallback = null) {
  const i = process.argv.indexOf(flag);
  if (i === -1) return fallback;
  return process.argv[i + 1] ?? fallback;
}

function normalizeCountry(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "'")
    .replace(/\s*\([^)]+\)\s*$/, "")
    .replace(/[-_/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function isValidIcao(value) {
  return /^[A-Z]{4}$/.test(String(value || "").trim().toUpperCase());
}

function parseStringArray(block, key) {
  const match = block.match(new RegExp(`${key}:\\s*\\[([^\\]]*)\\]`, "m"));
  if (!match) return [];
  return [...match[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

async function readScraperConfigs() {
  const src = await fs.readFile(SCRAPER_CONFIG_PATH, "utf8");
  const configs = [];
  for (const match of src.matchAll(/\{\s*country:\s*"([^"]+)"[\s\S]*?\n\s*\}/g)) {
    const block = match[0];
    configs.push({
      country: match[1],
      prefixes: parseStringArray(block, "prefixes"),
      extraIcaos: parseStringArray(block, "extraIcaos"),
      excludedIcaos: parseStringArray(block, "excludedIcaos"),
    });
  }
  return configs;
}

async function targetScraperCountries() {
  const ead = JSON.parse(await fs.readFile(EAD_COUNTRIES_PATH, "utf8"));
  const eadNames = new Set(Object.keys(ead || {}).map(normalizeCountry));
  const configs = await readScraperConfigs();
  return configs.filter((cfg) => eadNames.has(normalizeCountry(cfg.country)));
}

async function runNodeScript(scriptRelPath, args = []) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, scriptRelPath), ...args], {
      cwd: ROOT,
      env: process.env,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) reject(new Error(`${scriptRelPath} exited with code ${code}`));
      else resolve();
    });
  });
}

function packageCountryKey(country) {
  return normalizeCountry(country?.countryName);
}

async function collectPackages(targets, options) {
  const onlyCountries = targets.map((cfg) => cfg.country).join(",");
  await runNodeScript("scripts/tools/collect-all-packages.mjs", [
    "--out",
    PACKAGES_PATH,
    "--only-countries",
    onlyCountries,
    "--collect-timeout-ms",
    String(options.collectTimeoutMs),
    ...(options.offline ? ["--offline"] : []),
  ]);

  const packages = JSON.parse(await fs.readFile(PACKAGES_PATH, "utf8"));
  const targetKeys = new Set(targets.map((cfg) => normalizeCountry(cfg.country)));
  const filteredCountries = (Array.isArray(packages?.countries) ? packages.countries : [])
    .filter((country) => targetKeys.has(packageCountryKey(country)))
    .filter((country) => options.offline || country.collectOk === true)
    .map((country) => {
      const ad2Icaos = Array.from(
        new Set(
          (Array.isArray(country?.ad2Icaos) ? country.ad2Icaos : [])
            .map((icao) => String(icao || "").trim().toUpperCase())
            .filter(isValidIcao),
        ),
      ).sort((a, b) => a.localeCompare(b));
      return { ...country, ad2Icaos };
    })
    .filter((country) => country.ad2Icaos.length > 0);

  const filteredPayload = {
    generatedAt: new Date().toISOString(),
    source: "scripts/tools/replace-ead-fallback-scraper-airports.mjs",
    collectMode: packages?.collectMode || (options.offline ? "offline" : "network"),
    countries: filteredCountries,
  };
  await fs.writeFile(FILTERED_PACKAGES_PATH, `${JSON.stringify(filteredPayload, null, 2)}\n`, "utf8");
  return filteredPayload;
}

async function enrichPackages() {
  await runNodeScript("scripts/tools/enrich-airports.mjs", [
    "--in",
    FILTERED_PACKAGES_PATH,
    "--out",
    ENRICHED_PATH,
  ]);
  const enriched = JSON.parse(await fs.readFile(ENRICHED_PATH, "utf8"));
  return Array.isArray(enriched?.airports) ? enriched.airports : [];
}

async function createSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRole) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function fetchExistingRows(supabase, countries) {
  const out = [];
  const list = Array.from(countries);
  const pageSize = 1000;
  for (const country of list) {
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await supabase
        .from("airports")
        .select("icao,country")
        .eq("country", country)
        .range(offset, offset + pageSize - 1);
      if (error) throw new Error(`Failed reading existing airports for ${country}: ${error.message}`);
      out.push(...(data || []));
      if (!data || data.length < pageSize) break;
    }
  }
  return out;
}

async function deleteCountries(supabase, countries) {
  let deleted = 0;
  const list = Array.from(countries);
  for (const country of list) {
    const { data, error } = await supabase.from("airports").delete().eq("country", country).select("icao");
    if (error) throw new Error(`Failed deleting ${country}: ${error.message}`);
    deleted += (data || []).length;
  }
  return deleted;
}

async function upsertRows(supabase, rows) {
  let upserted = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from("airports").upsert(batch, { onConflict: "icao" });
    if (error) throw new Error(`Upsert batch ${Math.floor(i / BATCH_SIZE) + 1} failed: ${error.message}`);
    upserted += batch.length;
  }
  return upserted;
}

function rowsForReplaceableCountries(rows, replaceableCountries) {
  const countrySet = new Set(Array.from(replaceableCountries).map(normalizeCountry));
  const seen = new Set();
  return rows
    .map((row) => ({
      icao: String(row.icao || "").trim().toUpperCase(),
      country: String(row.country || "").trim(),
      state: row.state ?? null,
      name: String(row.name || "").trim(),
      lat: Number.isFinite(Number(row.lat)) ? Number(row.lat) : null,
      lon: Number.isFinite(Number(row.lon)) ? Number(row.lon) : null,
      source: "web_table_scraper_dynamic",
      visible: true,
      updated_at: new Date().toISOString(),
    }))
    .filter((row) => {
      if (!isValidIcao(row.icao) || !countrySet.has(normalizeCountry(row.country))) return false;
      if (seen.has(row.icao)) return false;
      seen.add(row.icao);
      return true;
    });
}

async function main() {
  loadEnvFromProjectRoot(ROOT);
  const dryRun = hasFlag("--dry-run") || !hasFlag("--confirm");
  const offline = hasFlag("--offline");
  const skipCollect = hasFlag("--skip-collect");
  const collectTimeoutMs = Number(argValue("--collect-timeout-ms", "90000")) || 90_000;

  await fs.mkdir(TMP_DIR, { recursive: true });
  const targets = await targetScraperCountries();
  console.log(`[replace-ead-fallback-scrapers] targets=${targets.length} dryRun=${dryRun ? "yes" : "no"} offline=${offline ? "yes" : "no"}`);
  console.log(`[replace-ead-fallback-scrapers] targetCountries=${targets.map((cfg) => cfg.country).join(", ")}`);

  const packages = skipCollect
    ? JSON.parse(await fs.readFile(FILTERED_PACKAGES_PATH, "utf8"))
    : await collectPackages(targets, { offline, collectTimeoutMs });
  const replaceableCountries = new Set(packages.countries.map((country) => String(country.countryName || "").trim()).filter(Boolean));
  console.log(
    `[replace-ead-fallback-scrapers] collectedCountries=${replaceableCountries.size} collectedIcaos=${packages.countries.reduce((sum, c) => sum + c.ad2Icaos.length, 0)}`,
  );

  if (replaceableCountries.size === 0) {
    throw new Error("Collect output did not produce any replacement countries; refusing to delete Supabase rows.");
  }

  const enrichedRows = await enrichPackages();
  const rows = rowsForReplaceableCountries(enrichedRows, replaceableCountries);
  if (rows.length === 0) {
    throw new Error("Enrichment produced no replacement airport rows; refusing to delete Supabase rows.");
  }

  const supabase = await createSupabaseClient();
  const existingRows = await fetchExistingRows(supabase, replaceableCountries);
  console.log(`[replace-ead-fallback-scrapers] existingSupabaseRows=${existingRows.length} replacementRows=${rows.length}`);
  for (const country of Array.from(replaceableCountries).sort((a, b) => a.localeCompare(b))) {
    const existing = existingRows.filter((row) => row.country === country).length;
    const replacement = rows.filter((row) => row.country === country).length;
    console.log(`[replace-ead-fallback-scrapers] ${country}: delete=${existing} upsert=${replacement}`);
  }

  if (dryRun) {
    console.log("[replace-ead-fallback-scrapers] dry-run only. Re-run with --confirm to delete and upsert.");
    return;
  }

  const deleted = await deleteCountries(supabase, replaceableCountries);
  const upserted = await upsertRows(supabase, rows);
  const afterRows = await fetchExistingRows(supabase, replaceableCountries);
  console.log(`[replace-ead-fallback-scrapers] complete deleted=${deleted} upserted=${upserted} afterRows=${afterRows.length}`);
}

main().catch((err) => {
  console.error("[replace-ead-fallback-scrapers] failed:", err?.message || err);
  process.exit(1);
});
