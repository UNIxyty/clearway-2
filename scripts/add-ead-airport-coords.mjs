#!/usr/bin/env node
/**
 * Adds coordinates for EAD ICAOs (from ead-icaos-from-document-names.json) using
 * OurAirports CSV, and merges into data/airport-coords.json (keeps existing entries).
 * Run: node scripts/add-ead-airport-coords.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, "..");
const eadPath = path.join(projectRoot, "data", "ead-icaos-from-document-names.json");
const coordsPath = path.join(projectRoot, "data", "airport-coords.json");

const ead = JSON.parse(fs.readFileSync(eadPath, "utf8"));
const eadIcaoSet = new Set();
for (const list of Object.values(ead.countries ?? {})) {
  if (Array.isArray(list)) for (const icao of list) eadIcaoSet.add(String(icao).toUpperCase());
}

let existing = {};
if (fs.existsSync(coordsPath)) {
  existing = JSON.parse(fs.readFileSync(coordsPath, "utf8"));
}
const missing = [...eadIcaoSet].filter((icao) => !existing[icao]);
console.log("EAD ICAOs:", eadIcaoSet.size, "| Already in coords:", eadIcaoSet.size - missing.length, "| Fetching:", missing.length);

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

const missingSet = new Set(missing);
const url = "https://davidmegginson.github.io/ourairports-data/airports.csv";
const res = await fetch(url);
const text = await res.text();
const lines = text.split(/\r?\n/);
const header = parseCSVLine(lines[0]);
const icaoIdx = header.indexOf("icao_code");
const identIdx = header.indexOf("ident");
const latIdx = header.indexOf("latitude_deg");
const lonIdx = header.indexOf("longitude_deg");

if ([icaoIdx, identIdx, latIdx, lonIdx].some((i) => i === -1)) {
  console.error("Missing columns");
  process.exit(1);
}

const added = {};
for (let i = 1; i < lines.length; i++) {
  const row = parseCSVLine(lines[i]);
  if (row.length <= Math.max(icaoIdx, identIdx, latIdx, lonIdx)) continue;
  const icao = (row[icaoIdx] || row[identIdx] || "").trim().toUpperCase();
  if (!missingSet.has(icao)) continue;
  const lat = parseFloat(row[latIdx]);
  const lon = parseFloat(row[lonIdx]);
  if (Number.isFinite(lat) && Number.isFinite(lon)) added[icao] = { lat, lon };
}

const merged = { ...existing, ...added };
fs.writeFileSync(coordsPath, JSON.stringify(merged, null, 0), "utf8");
console.log("Added", Object.keys(added).length, "EAD coords. Total airport-coords.json entries:", Object.keys(merged).length);
console.log("Wrote", coordsPath);
