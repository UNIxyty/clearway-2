/**
 * Add USA airport coordinates from FAA CSV to data/airport-coords.json.
 * Run from repo root: node scripts/add_usa_coords_to_airport_coords.js
 * Requires: 19_Feb_2026_APT_CSV/APT_BASE.csv and data/usa-aip-icaos-by-state.json
 */

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const csvPath = path.join(root, "19_Feb_2026_APT_CSV", "APT_BASE.csv");
const usaPath = path.join(root, "data", "usa-aip-icaos-by-state.json");
const coordsPath = path.join(root, "data", "airport-coords.json");

if (!fs.existsSync(csvPath)) {
  console.warn("CSV not found at 19_Feb_2026_APT_CSV/APT_BASE.csv — skipping USA coords.");
  process.exit(0);
}

const usaData = JSON.parse(fs.readFileSync(usaPath, "utf8"));
const icaos = new Set();
if (usaData.airports && Array.isArray(usaData.airports)) {
  usaData.airports.forEach((a) => {
    const code = (a["Airport Code"] || a.icao || "").trim().toUpperCase();
    if (code && code.length === 4) icaos.add(code);
  });
}
if (usaData.by_state && typeof usaData.by_state === "object") {
  Object.values(usaData.by_state).forEach((arr) => {
    (arr || []).forEach((a) => {
      const code = (a["Airport Code"] || a.icao || "").trim().toUpperCase();
      if (code && code.length === 4) icaos.add(code);
    });
  });
}

const csv = fs.readFileSync(csvPath, "utf8");
const lines = csv.split(/\r?\n/).filter((l) => l.trim());
const headerRow = lines[0];
const cols = headerRow.split(",").map((c) => c.replace(/^"|"$/g, "").trim());
const latIdx = cols.indexOf("LAT_DECIMAL");
const lonIdx = cols.indexOf("LONG_DECIMAL");
const icaoIdx = cols.indexOf("ICAO_ID");

if (latIdx < 0 || lonIdx < 0 || icaoIdx < 0) {
  console.warn("Required columns not found in CSV.", { latIdx, lonIdx, icaoIdx });
  process.exit(1);
}

function parseCsvRow(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inQuotes = !inQuotes;
    else if (c === "," && !inQuotes) {
      out.push(cur.replace(/^"|"$/g, "").trim());
      cur = "";
    } else cur += c;
  }
  out.push(cur.replace(/^"|"$/g, "").trim());
  return out;
}

const usaCoords = {};
for (let i = 1; i < lines.length; i++) {
  const row = parseCsvRow(lines[i]);
  const icao = (row[icaoIdx] || "").trim().toUpperCase();
  if (!icaos.has(icao)) continue;
  const lat = parseFloat(row[latIdx] || "");
  const lon = parseFloat(row[lonIdx] || "");
  if (Number.isFinite(lat) && Number.isFinite(lon)) {
    usaCoords[icao] = { lat, lon };
  }
}

const coords = JSON.parse(fs.readFileSync(coordsPath, "utf8"));
let added = 0;
Object.entries(usaCoords).forEach(([icao, pos]) => {
  if (!coords[icao]) {
    coords[icao] = pos;
    added++;
  }
});

fs.writeFileSync(coordsPath, JSON.stringify(coords), "utf8");
console.log(`Added ${added} USA airport coordinates to data/airport-coords.json (${Object.keys(usaCoords).length} had CSV data).`);