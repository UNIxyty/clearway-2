#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "data");
const TMP_DIR = path.join(DATA_DIR, ".tmp");
const CANONICAL_PATH = path.join(DATA_DIR, "icao_codes_by_country_v3_cleaned.json");
const EAD_COUNTRIES_PATH = path.join(DATA_DIR, "ead-country-icaos.json");
const PACKAGES_TMP_PATH = path.join(TMP_DIR, "dynamic-packages.non-ead.non-captcha.json");
const ENRICHED_TMP_PATH = path.join(TMP_DIR, "dynamic-airports.non-ead.non-captcha.json");

const CAPTCHA_COUNTRIES = new Set(["greece", "lithuania", "netherlands"]);

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function argValue(flag, fallback = null) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return fallback;
  return process.argv[idx + 1] ?? fallback;
}

function normalizeCountryName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "'")
    .replace(/\s*\([^)]+\)\s*$/, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function titleCaseCountry(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b([a-z])/gi, (m) => m.toUpperCase());
}

function isValidIcao(icao) {
  return /^[A-Z]{4}$/.test(String(icao || "").trim().toUpperCase());
}

async function runNodeScript(scriptRelPath, args = []) {
  return await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, scriptRelPath), ...args], {
      cwd: ROOT,
      env: process.env,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`${scriptRelPath} exited with code ${code}`));
        return;
      }
      resolve();
    });
  });
}

function buildNameLookup(canonicalCountries) {
  const out = new Map();
  for (const airports of Object.values(canonicalCountries || {})) {
    for (const airport of Array.isArray(airports) ? airports : []) {
      const icao = String(airport?.icao || "").trim().toUpperCase();
      const name = String(airport?.name || "").trim();
      if (!isValidIcao(icao) || !name) continue;
      if (!out.has(icao)) out.set(icao, name);
    }
  }
  return out;
}

function buildCountryKeyIndex(canonicalCountries) {
  const index = new Map();
  for (const key of Object.keys(canonicalCountries || {})) {
    const normalized = normalizeCountryName(key);
    if (!index.has(normalized)) index.set(normalized, key);
  }
  return index;
}

async function main() {
  const dryRun = hasFlag("--dry-run");
  const offline = hasFlag("--offline");
  const collectTimeoutMs = argValue("--collect-timeout-ms", "90000");
  const canonicalOut = argValue("--out", CANONICAL_PATH);

  await fs.mkdir(TMP_DIR, { recursive: true });

  console.log(`[collect-all-ad2-icaos] Collecting packages (offline=${offline ? "yes" : "no"})...`);
  await runNodeScript("scripts/tools/collect-all-packages.mjs", [
    "--out",
    PACKAGES_TMP_PATH,
    ...(offline ? ["--offline"] : []),
    "--collect-timeout-ms",
    String(collectTimeoutMs),
  ]);

  const [canonicalRaw, eadRaw, packagesRaw] = await Promise.all([
    fs.readFile(CANONICAL_PATH, "utf8"),
    fs.readFile(EAD_COUNTRIES_PATH, "utf8"),
    fs.readFile(PACKAGES_TMP_PATH, "utf8"),
  ]);
  const canonical = JSON.parse(canonicalRaw);
  const eadCountries = JSON.parse(eadRaw);
  const packages = JSON.parse(packagesRaw);

  const canonicalCountries = canonical?.countries && typeof canonical.countries === "object" ? canonical.countries : {};
  const countryKeyIndex = buildCountryKeyIndex(canonicalCountries);
  const nameByIcao = buildNameLookup(canonicalCountries);

  const eadBaseCountries = new Set(
    Object.keys(eadCountries || {}).map((key) => normalizeCountryName(key)),
  );

  const filteredCountries = (Array.isArray(packages?.countries) ? packages.countries : [])
    .filter((country) => {
      const normalized = normalizeCountryName(country?.countryName);
      return !eadBaseCountries.has(normalized) && !CAPTCHA_COUNTRIES.has(normalized);
    })
    .map((country) => {
      const ad2Icaos = Array.isArray(country?.ad2Icaos)
        ? country.ad2Icaos
            .map((icao) => String(icao || "").trim().toUpperCase())
            .filter(isValidIcao)
        : [];
      return {
        ...country,
        ad2Icaos: Array.from(new Set(ad2Icaos)).sort((a, b) => a.localeCompare(b)),
      };
    });

  if (filteredCountries.length === 0) {
    console.log("[collect-all-ad2-icaos] No non-EAD/non-captcha countries produced scrape data.");
    return;
  }

  const nextCountries = { ...canonicalCountries };
  const touchedCountryKeys = [];
  let totalIcaosMerged = 0;

  for (const country of filteredCountries) {
    if (!country.ad2Icaos.length) continue;
    const normalizedName = normalizeCountryName(country.countryName);
    const existingKey = countryKeyIndex.get(normalizedName);
    const targetKey = existingKey || titleCaseCountry(country.countryName);
    touchedCountryKeys.push(targetKey);

    const rows = country.ad2Icaos.map((icao) => ({
      icao,
      name: nameByIcao.get(icao) || `${icao} Airport`,
    }));
    nextCountries[targetKey] = rows;
    totalIcaosMerged += rows.length;
  }

  const nextCanonical = {
    ...canonical,
    scrapedAt: new Date().toISOString(),
    countries: nextCountries,
  };

  console.log(
    `[collect-all-ad2-icaos] Filtered countries=${filteredCountries.length} updatedCountries=${new Set(touchedCountryKeys).size} mergedIcaos=${totalIcaosMerged}`,
  );

  if (!dryRun) {
    await fs.writeFile(canonicalOut, `${JSON.stringify(nextCanonical, null, 2)}\n`, "utf8");
    console.log(`[collect-all-ad2-icaos] Wrote canonical ICAO file -> ${path.relative(ROOT, canonicalOut)}`);

    await runNodeScript("scripts/embed-ead-icaos.mjs");
    await runNodeScript("scripts/copy-ead-icaos-to-public.mjs");

    const filteredPayload = {
      generatedAt: new Date().toISOString(),
      source: "scripts/collect-all-ad2-icaos.mjs",
      collectMode: packages?.collectMode || "network",
      countries: filteredCountries,
    };
    await fs.writeFile(PACKAGES_TMP_PATH, `${JSON.stringify(filteredPayload, null, 2)}\n`, "utf8");

    await runNodeScript("scripts/tools/enrich-airports.mjs", [
      "--in",
      PACKAGES_TMP_PATH,
      "--out",
      ENRICHED_TMP_PATH,
    ]);
    await runNodeScript("scripts/tools/upsert-airports-to-supabase.mjs", [
      "--in",
      ENRICHED_TMP_PATH,
    ]);
  } else {
    console.log("[collect-all-ad2-icaos] Dry run enabled; skipped file writes, generation, and Supabase upsert.");
  }
}

main().catch((err) => {
  console.error("[collect-all-ad2-icaos] failed:", err?.message || err);
  process.exit(1);
});
