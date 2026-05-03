#!/usr/bin/env node
/**
 * Replace airport rows for countries listed in an ICAO-by-country JSON file.
 *
 * Input format:
 * {
 *   "icao_codes_by_country": {
 *     "Lithuania (EY)": [ { "icao": "EYVI", "name": "Vilnius..." }, ... ],
 *     ...
 *   }
 * }
 *
 * Behavior:
 * - Deletes existing airports for the target countries.
 * - Inserts airports from input JSON.
 * - Enriches coordinates using scripts/tools/enrich-airports.mjs pipeline.
 * - Skips ICAOs that already exist in Supabase under non-target countries.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { loadEnvFromProjectRoot } from "./_load-env.mjs";

const ROOT = process.cwd();
const TMP_DIR = path.join(ROOT, "data", ".tmp");
const DEFAULT_INPUT = path.join(ROOT, "data", "icao-codes-by-country.json");
const ENRICH_IN = path.join(TMP_DIR, "icao-codes-by-country.packages.json");
const ENRICH_OUT = path.join(TMP_DIR, "icao-codes-by-country.enriched.json");
const BATCH_SIZE = 200;

function argValue(flag, fallback = null) {
  const i = process.argv.indexOf(flag);
  if (i === -1) return fallback;
  return process.argv[i + 1] ?? fallback;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function stripCountryLabel(label) {
  return String(label || "").replace(/\s*\([A-Z0-9]{2}\)\s*$/, "").trim();
}

function normalizeCountry(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[./_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function isValidIcao(value) {
  return /^[A-Z0-9]{4}$/.test(String(value || "").trim().toUpperCase());
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

async function deleteCountryRows(supabase, countryNames, countryLabels) {
  let deleted = 0;
  const unique = new Set([...countryNames, ...countryLabels].filter(Boolean));
  for (const country of unique) {
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

async function main() {
  loadEnvFromProjectRoot(ROOT);
  const inPath = argValue("--in", DEFAULT_INPUT);
  const dryRun = hasFlag("--dry-run");
  await fs.mkdir(TMP_DIR, { recursive: true });

  const payload = JSON.parse(await fs.readFile(inPath, "utf8"));
  const countryMap = payload?.icao_codes_by_country;
  if (!countryMap || typeof countryMap !== "object") {
    throw new Error("Input must contain object key 'icao_codes_by_country'");
  }

  const packages = { countries: [] };
  const inputNameByIcao = new Map();
  const countryLabelByIcao = new Map();
  const targetCountryNames = new Set();
  const targetCountryLabels = new Set();
  let totalInputRows = 0;

  for (const [countryLabel, rows] of Object.entries(countryMap)) {
    const countryName = stripCountryLabel(countryLabel);
    targetCountryNames.add(countryName);
    targetCountryLabels.add(countryLabel);
    const ad2Icaos = [];
    for (const row of Array.isArray(rows) ? rows : []) {
      const icao = String(row?.icao || "").trim().toUpperCase();
      if (!isValidIcao(icao)) continue;
      totalInputRows += 1;
      ad2Icaos.push(icao);
      const name = String(row?.name || "").trim();
      if (name) inputNameByIcao.set(icao, name);
      countryLabelByIcao.set(icao, countryLabel);
    }
    const uniqueIcaos = Array.from(new Set(ad2Icaos)).sort((a, b) => a.localeCompare(b));
    if (uniqueIcaos.length > 0) {
      packages.countries.push({
        countryName,
        ad2Icaos: uniqueIcaos,
        effectiveDate: null,
        webAipUrl: null,
      });
    }
  }

  if (packages.countries.length === 0) {
    throw new Error("No valid countries/ICAOs found in input.");
  }
  await fs.writeFile(ENRICH_IN, JSON.stringify(packages, null, 2) + "\n", "utf8");

  console.log(`[replace-countries-json] countries=${packages.countries.length} rows=${totalInputRows} dryRun=${dryRun ? "yes" : "no"}`);
  await runNodeScript("scripts/tools/enrich-airports.mjs", ["--in", ENRICH_IN, "--out", ENRICH_OUT]);
  const enriched = JSON.parse(await fs.readFile(ENRICH_OUT, "utf8"));
  const enrichedRows = Array.isArray(enriched?.airports) ? enriched.airports : [];
  if (enrichedRows.length === 0) throw new Error("Enrichment produced no airport rows.");

  const supabase = await createSupabaseClient();
  const allIcaos = enrichedRows.map((r) => String(r.icao || "").toUpperCase()).filter(isValidIcao);
  const normalizedTarget = new Set(Array.from(targetCountryNames).map(normalizeCountry));

  // If an ICAO already exists in a non-target country, skip it to avoid accidental overwrite.
  const { data: existingRows, error: existingErr } = await supabase
    .from("airports")
    .select("icao,country")
    .in("icao", allIcaos);
  if (existingErr) throw new Error(`Failed reading existing ICAOs: ${existingErr.message}`);
  const existingByIcao = new Map((existingRows || []).map((r) => [String(r.icao || "").toUpperCase(), String(r.country || "")]));

  const skipIcaos = new Set();
  for (const [icao, country] of existingByIcao.entries()) {
    if (!normalizedTarget.has(normalizeCountry(country))) {
      skipIcaos.add(icao);
    }
  }

  const rows = enrichedRows
    .map((row) => {
      const icao = String(row.icao || "").trim().toUpperCase();
      const countryLabel = countryLabelByIcao.get(icao) || "";
      const country = stripCountryLabel(countryLabel) || String(row.country || "").trim();
      const inputName = inputNameByIcao.get(icao) || "";
      return {
        icao,
        country,
        state: null,
        name: inputName || String(row.name || "").trim() || icao,
        lat: Number.isFinite(Number(row.lat)) ? Number(row.lat) : null,
        lon: Number.isFinite(Number(row.lon)) ? Number(row.lon) : null,
        source: "icao_codes_by_country_json",
        visible: true,
        updated_at: new Date().toISOString(),
      };
    })
    .filter((r) => isValidIcao(r.icao))
    .filter((r) => !skipIcaos.has(r.icao));

  console.log(`[replace-countries-json] enrichedRows=${enrichedRows.length} skippedExistingOutsideTargets=${skipIcaos.size} finalRows=${rows.length}`);
  if (skipIcaos.size > 0) {
    console.log(`[replace-countries-json] skippedIcaos=${Array.from(skipIcaos).sort((a, b) => a.localeCompare(b)).join(",")}`);
  }

  if (dryRun) return;

  const deleted = await deleteCountryRows(supabase, targetCountryNames, targetCountryLabels);
  const upserted = await upsertRows(supabase, rows);
  console.log(`[replace-countries-json] complete deleted=${deleted} upserted=${upserted}`);
}

main().catch((err) => {
  console.error("[replace-countries-json] failed:", err?.message || err);
  process.exit(1);
});
