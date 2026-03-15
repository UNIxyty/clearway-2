#!/usr/bin/env node
/**
 * Generate lib/ead-country-icaos.generated.json from ead-icaos-from-document-names.json + names.
 * The API imports from the generated file so the bundle always has the full list (no fetch, no cache issues on Vercel).
 * 
 * Output format: { "Country (XX)": [{ icao: "XXXX", name: "Airport Name" }, ...] }
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const icaosSrc = join(root, "data", "ead-icaos-from-document-names.json");
const namesSrc = join(root, "data", "ead-airport-names.json");
const dest = join(root, "lib", "ead-country-icaos.generated.json");

if (!existsSync(icaosSrc)) {
  console.error("embed-ead-icaos: source not found (required for build):", icaosSrc);
  process.exit(1);
}

const icaosData = JSON.parse(readFileSync(icaosSrc, 'utf8'));
let namesData = {};
try {
  namesData = JSON.parse(readFileSync(namesSrc, 'utf8'));
} catch (_) {}

const result = {};

for (const [country, icaos] of Object.entries(icaosData.countries || {})) {
  result[country] = icaos.map(icao => ({
    icao,
    name: namesData[icao] || ''
  }));
}

mkdirSync(dirname(dest), { recursive: true });
writeFileSync(dest, JSON.stringify(result, null, 2), 'utf8');
console.log("embed-ead-icaos: wrote", dest);
console.log(`  ${Object.keys(result).length} countries, ${Object.values(result).flat().length} airports`);
