#!/usr/bin/env node
/**
 * Extract airport names from EAD document names.
 * 
 * Pattern examples:
 *   LE_AD_2_LEHC_en.pdf → LEHC (no name in filename)
 *   LE_AD_2_LEHC_AOC_4_en.pdf → LEHC (no name)
 * 
 * For names, we need to scrape from EAD or use existing airport name databases.
 * This script will create a mapping of ICAO → { name: "", country: "" }
 * 
 * Usage: node scripts/ead-extract-names-from-documents.mjs
 */

import { join, dirname } from 'path';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');

const icaoData = JSON.parse(readFileSync(join(PROJECT_ROOT, 'data', 'ead-icaos-from-document-names.json'), 'utf8'));

// Load existing airport names if available
const existingNamesPath = join(PROJECT_ROOT, 'data', 'ead-airport-names.json');
let existingNames = {};
try {
  existingNames = JSON.parse(readFileSync(existingNamesPath, 'utf8'));
} catch (_) {}

const result = {};

for (const [country, icaos] of Object.entries(icaoData.countries)) {
  for (const icao of icaos) {
    if (!result[icao]) {
      result[icao] = {
        icao,
        name: existingNames[icao]?.name || '',
        country,
      };
    }
  }
}

const outputPath = join(PROJECT_ROOT, 'data', 'ead-airports-with-names.json');
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf8');

console.log('Wrote', outputPath);
console.log('Total airports:', Object.keys(result).length);
const withNames = Object.values(result).filter(a => a.name).length;
console.log('With names:', withNames);
console.log('Without names:', Object.keys(result).length - withNames);
