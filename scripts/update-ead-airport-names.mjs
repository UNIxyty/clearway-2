#!/usr/bin/env node
/**
 * Add missing names for EAD airports:
 * 1. Merge in names from data/ead-aip-extracted.json (Airport Code -> Airport Name)
 * 2. Fetch OurAirports CSV and fill remaining EAD ICAOs by icao_code/ident -> name
 * 3. Write data/ead-airport-names.json (merge with existing, keep existing keys first)
 *
 * Usage: node scripts/update-ead-airport-names.mjs
 */

import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

const ROOT = join(process.cwd());
const NAMES_PATH = join(ROOT, "data", "ead-airport-names.json");
const EXTRACTED_PATH = join(ROOT, "data", "ead-aip-extracted.json");
const COUNTRY_ICAOS_PATH = join(ROOT, "data", "ead-icaos-from-document-names.json");
const OURAIRPORTS_URL =
  "https://raw.githubusercontent.com/davidmegginson/ourairports-data/main/airports.csv";

function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if (inQuotes) {
      cur += c;
    } else if (c === ",") {
      out.push(cur.trim());
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur.trim());
  return out;
}

async function fetchOurairportsIcaoToName() {
  const res = await fetch(OURAIRPORTS_URL);
  if (!res.ok) throw new Error(`OurAirports fetch failed: ${res.status}`);
  const text = await res.text();
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  const header = parseCsvLine(lines[0]);
  const icaoIdx = header.indexOf("icao_code");
  const identIdx = header.indexOf("ident");
  const nameIdx = header.indexOf("name");
  if (nameIdx === -1) throw new Error("No name column");
  const map = {};
  for (let i = 1; i < lines.length; i++) {
    const row = parseCsvLine(lines[i]);
    const name = row[nameIdx];
    if (!name) continue;
    const icao = (row[icaoIdx] || row[identIdx] || "").trim().toUpperCase();
    if (icao.length === 4 && /^[A-Z0-9]{4}$/.test(icao)) {
      if (!map[icao]) map[icao] = name;
    }
  }
  return map;
}

function main() {
  let existing = {};
  try {
    existing = JSON.parse(readFileSync(NAMES_PATH, "utf-8"));
  } catch (_) {}
  
  const countryIcaos = JSON.parse(readFileSync(COUNTRY_ICAOS_PATH, "utf-8"));
  const allEad = new Set();
  
  // Handle new format: { countries: { "Country (XX)": ["ICAO1", "ICAO2"] } }
  if (countryIcaos.countries) {
    for (const arr of Object.values(countryIcaos.countries)) {
      if (Array.isArray(arr)) {
        for (const icao of arr) allEad.add(icao.toUpperCase());
      }
    }
  } else {
    // Old format: { "Country": ["ICAO1", "ICAO2"] }
    for (const arr of Object.values(countryIcaos)) {
      if (Array.isArray(arr)) {
        for (const icao of arr) allEad.add(icao.toUpperCase());
      }
    }
  }

  let extracted = {};
  try {
    const ext = JSON.parse(readFileSync(EXTRACTED_PATH, "utf-8"));
    for (const a of ext.airports || []) {
      const code = (a["Airport Code"] || "").trim().toUpperCase();
      const name = (a["Airport Name"] || "").trim();
      if (code && name) extracted[code] = name;
    }
  } catch (_) {}

  const merged = { ...existing };
  let fromExtracted = 0;
  for (const [icao, name] of Object.entries(extracted)) {
    if (!merged[icao]) {
      merged[icao] = name;
      fromExtracted++;
    }
  }

  return fetchOurairportsIcaoToName()
    .then((ourairports) => {
      let fromOurairports = 0;
      for (const icao of allEad) {
        if (merged[icao]) continue;
        const name = ourairports[icao];
        if (name) {
          merged[icao] = name;
          fromOurairports++;
        }
      }
      writeFileSync(NAMES_PATH, JSON.stringify(merged, null, 2) + "\n", "utf-8");
      console.log(
        `update-ead-airport-names: added ${fromExtracted} from ead-aip-extracted, ${fromOurairports} from OurAirports. Total names: ${Object.keys(merged).length}`
      );
      const stillMissing = [...allEad].filter((i) => !merged[i]).length;
      if (stillMissing > 0) {
        console.log(`  EAD ICAOs still without name (will show as EAD UNDEFINED): ${stillMissing}`);
      }
    })
    .catch((err) => {
      console.error("OurAirports fetch failed, writing only extracted merge:", err.message);
      writeFileSync(NAMES_PATH, JSON.stringify(merged, null, 2) + "\n", "utf-8");
      console.log(`  Added ${fromExtracted} from ead-aip-extracted. Total names: ${Object.keys(merged).length}`);
    });
}

main();
