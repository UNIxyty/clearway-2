#!/usr/bin/env node
/**
 * Extract ICAO codes from EAD document names (ead-document-names-by-country.json).
 *
 * Pattern: _AD_N_XXXX where N is 2, 3, 4, or 5 (aerodromes, heliports, local, etc.) → ICAO is the 4-char code.
 * Handles underscores, dashes, and dots as separators after the ICAO.
 * Examples:
 *   LE_AD_2_LEHC_AOC_4_en.pdf  → LEHC
 *   LA_AD_2_LAKU_24-5_EN.pdf   → LAKU
 *   LI_AD_3_LIKB_en.pdf        → LIKB
 *   EP_AD_4_EPBA_en.pdf        → EPBA
 *   LJ_AD_4_LJAJ-3_en.pdf      → LJAJ
 *   XX_AD_5_XXXX_en.pdf        → XXXX (if AD_5 exists)
 *
 * Usage: node scripts/ead-extract-icaos-from-document-names.mjs [--input data/ead-document-names-by-country.json] [--output data/ead-icaos-from-document-names.json]
 */

import { join, dirname } from 'path';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');

const inputArg = process.argv.indexOf('--input');
const outputArg = process.argv.indexOf('--output');
const inputPath = inputArg !== -1 && process.argv[inputArg + 1]
  ? join(process.cwd(), process.argv[inputArg + 1])
  : join(PROJECT_ROOT, 'data', 'ead-document-names-by-country.json');
const outputPath = outputArg !== -1 && process.argv[outputArg + 1]
  ? join(process.cwd(), process.argv[outputArg + 1])
  : join(PROJECT_ROOT, 'data', 'ead-icaos-from-document-names.json');

// Match _AD_N_XXXX where N is 2–9 (aerodromes, heliports, local, etc.), XXXX is 4-char ICAO, then _ or - or .
// Examples: _AD_2_LEHC_, _AD_3_LIKB., _AD_4_EPBA_, _AD_5_XXXX_
const ICAO_RE = /_AD_[2-9]_([A-Z0-9]{4})(?:_|-|\.)/gi;

function extractIcaosFromDocName(name) {
  const icaos = new Set();
  let m;
  ICAO_RE.lastIndex = 0;
  while ((m = ICAO_RE.exec(name)) !== null) {
    icaos.add(m[1].toUpperCase());
  }
  return [...icaos];
}

const data = JSON.parse(readFileSync(inputPath, 'utf8'));
const docCountries = data.countries || {};

// Use full country list so output includes all countries (empty array if none)
const countryListPath = join(PROJECT_ROOT, 'data', 'ead-countries-with-prefixes.json');
let allCountryLabels = Object.keys(docCountries);
if (existsSync(countryListPath)) {
  try {
    const list = JSON.parse(readFileSync(countryListPath, 'utf8'));
    if (Array.isArray(list) && list.length > 0) allCountryLabels = list;
  } catch (_) {}
}

const result = { countries: {}, extractedAt: new Date().toISOString() };

for (const country of allCountryLabels) {
  const docNames = docCountries[country];
  const icaos = new Set();
  if (Array.isArray(docNames)) {
    for (const name of docNames) {
      for (const icao of extractIcaosFromDocName(name)) {
        icaos.add(icao);
      }
    }
  }
  result.countries[country] = [...icaos].sort();
}

const outDir = dirname(outputPath);
mkdirSync(outDir, { recursive: true });
writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf8');
console.log('Wrote', outputPath);

// Summary
let total = 0;
for (const list of Object.values(result.countries)) {
  total += list.length;
}
console.log('Countries:', Object.keys(result.countries).length);
console.log('Total unique ICAOs:', total);
