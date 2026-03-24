#!/usr/bin/env node
/**
 * Generate lib/ead-country-icaos.generated.json from cleaned ICAO dataset.
 * The API imports from the generated file so the bundle always has the full list
 * (no fetch, no cache issues on Vercel).
 *
 * Source format:
 * {
 *   "scrapedAt": "...",
 *   "countries": {
 *     "Country (XX)": [{ "icao": "XXXX", "name": "Airport Name" }, ...]
 *   }
 * }
 *
 * Output format:
 * { "Country (XX)": [{ "icao": "XXXX", "name": "Airport Name" }, ...] }
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const sourcePath = join(root, "data", "icao_codes_by_country_v3_cleaned.json");
const dest = join(root, "lib", "ead-country-icaos.generated.json");

if (!existsSync(sourcePath)) {
  console.error("embed-ead-icaos: source not found (required for build):", sourcePath);
  process.exit(1);
}

const source = JSON.parse(readFileSync(sourcePath, "utf8"));
const countries = source?.countries && typeof source.countries === "object" ? source.countries : {};

const result = {};

for (const [country, rows] of Object.entries(countries)) {
  if (!Array.isArray(rows)) continue;
  const out = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const icao = String(row.icao || "").trim().toUpperCase();
    if (!/^[A-Z0-9]{4}$/.test(icao)) continue;
    out.push({
      icao,
      name: String(row.name || "").trim() || "EAD UNDEFINED",
    });
  }
  if (out.length > 0) result[country] = out;
}

mkdirSync(dirname(dest), { recursive: true });
writeFileSync(dest, JSON.stringify(result, null, 2), "utf8");
console.log("embed-ead-icaos: wrote", dest);
console.log(`  ${Object.keys(result).length} countries, ${Object.values(result).flat().length} airports`);
