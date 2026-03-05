#!/usr/bin/env node
/**
 * Fetches OurAirports airports.csv and builds ICAO -> name for all EAD ICAOs.
 * Output: data/ead-airport-names.json { "ESGG": "Göteborg Landvetter Airport", ... }
 * Run: node scripts/build-ead-airport-names.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, "..");
const eadPath = path.join(projectRoot, "data", "ead-icaos-from-document-names.json");
const outPath = path.join(projectRoot, "data", "ead-airport-names.json");

const ead = JSON.parse(fs.readFileSync(eadPath, "utf8"));
const eadIcaoSet = new Set();
for (const list of Object.values(ead.countries ?? {})) {
  if (Array.isArray(list)) for (const icao of list) eadIcaoSet.add(String(icao).toUpperCase());
}

console.log("EAD ICAOs to resolve names:", eadIcaoSet.size);

function parseCSVLine(line) {
  const out = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] === '"') {
      let end = i + 1;
      while (end < line.length) {
        const next = line.indexOf('"', end);
        if (next === -1) break;
        if (line[next + 1] === '"') { end = next + 2; continue; }
        end = next;
        break;
      }
      out.push(line.slice(i + 1, end).replace(/""/g, '"'));
      i = end + 1;
      if (line[i] === ",") i++;
    } else {
      const comma = line.indexOf(",", i);
      const end = comma === -1 ? line.length : comma;
      out.push(line.slice(i, end));
      i = end + (comma === -1 ? 0 : 1);
    }
  }
  return out;
}

const url = "https://davidmegginson.github.io/ourairports-data/airports.csv";
const res = await fetch(url);
const text = await res.text();
const lines = text.split(/\r?\n/);
const header = parseCSVLine(lines[0]);
const icaoIdx = header.indexOf("icao_code");
const identIdx = header.indexOf("ident");
const nameIdx = header.indexOf("name");

if ([icaoIdx, nameIdx].some((i) => i === -1)) {
  console.error("Missing columns: icao_code, name");
  process.exit(1);
}

const names = {};
for (let i = 1; i < lines.length; i++) {
  const row = parseCSVLine(lines[i]);
  if (row.length <= Math.max(icaoIdx, identIdx || 0, nameIdx)) continue;
  const icao = (row[icaoIdx] || (identIdx >= 0 ? row[identIdx] : "") || "").trim().toUpperCase();
  if (!eadIcaoSet.has(icao)) continue;
  const name = (row[nameIdx] || "").trim();
  if (name) names[icao] = name;
}

fs.writeFileSync(outPath, JSON.stringify(names, null, 2), "utf8");
console.log("Resolved names for", Object.keys(names).length, "EAD airports. Wrote", outPath);
