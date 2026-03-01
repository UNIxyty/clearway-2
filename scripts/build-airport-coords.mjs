/**
 * Fetches OurAirports CSV and builds ICAO -> { lat, lon } for AIP airports.
 * Run: node scripts/build-airport-coords.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, "..");
const icaosPath = path.join(projectRoot, "data", "icaos-list.json");
const aipPath = path.join(projectRoot, "data", "aip-data.json");

// Get ICAO list from AIP data directly (avoid bad entries from icaos-list)
const aip = JSON.parse(fs.readFileSync(aipPath, "utf8"));
const icaoSet = new Set();
aip.forEach((c) => c.airports.forEach((a) => {
  const code = a["Airport Code"];
  if (code && code.length === 4 && /^[A-Z0-9]{4}$/.test(code)) icaoSet.add(code);
}));

console.log("Looking for", icaoSet.size, "ICAO codes");

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
const latIdx = header.indexOf("latitude_deg");
const lonIdx = header.indexOf("longitude_deg");

if ([icaoIdx, identIdx, latIdx, lonIdx].some((i) => i === -1)) {
  console.error("Missing columns", { icaoIdx, identIdx, latIdx, lonIdx });
  process.exit(1);
}

const coords = {};
for (let i = 1; i < lines.length; i++) {
  const row = parseCSVLine(lines[i]);
  if (row.length <= Math.max(icaoIdx, identIdx, latIdx, lonIdx)) continue;
  const icao = (row[icaoIdx] || row[identIdx] || "").trim().toUpperCase();
  if (!icaoSet.has(icao)) continue;
  const lat = parseFloat(row[latIdx]);
  const lon = parseFloat(row[lonIdx]);
  if (Number.isFinite(lat) && Number.isFinite(lon)) coords[icao] = { lat, lon };
}

console.log("Found coords for", Object.keys(coords).length, "airports");
fs.writeFileSync(
  path.join(projectRoot, "data", "airport-coords.json"),
  JSON.stringify(coords, null, 0)
);
