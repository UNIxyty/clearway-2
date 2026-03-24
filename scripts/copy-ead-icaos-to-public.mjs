#!/usr/bin/env node
/**
 * Build public/ead-country-icaos.json from the cleaned EAD source dataset.
 * Output shape is legacy-compatible:
 * { "Country (XX)": ["ICAO1", "ICAO2", ...] }
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const src = join(root, "data", "icao_codes_by_country_v3_cleaned.json");
const dest = join(root, "public", "ead-country-icaos.json");

if (!existsSync(src)) {
  console.error("copy-ead-icaos-to-public: source not found (required for Vercel):", src);
  process.exit(1);
}

const raw = JSON.parse(readFileSync(src, "utf8"));
const countries = raw?.countries && typeof raw.countries === "object" ? raw.countries : {};
const legacy = {};
for (const [country, rows] of Object.entries(countries)) {
  if (!Array.isArray(rows)) continue;
  const icaos = rows
    .map((row) => String(row?.icao || "").trim().toUpperCase())
    .filter((icao) => /^[A-Z0-9]{4}$/.test(icao));
  if (icaos.length > 0) legacy[country] = Array.from(new Set(icaos));
}

mkdirSync(dirname(dest), { recursive: true });
writeFileSync(dest, JSON.stringify(legacy, null, 2), "utf8");
console.log("copy-ead-icaos-to-public: wrote", dest);
