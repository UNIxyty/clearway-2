#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const IN_DEFAULT = path.join(ROOT, "data", "dynamic-packages.json");
const OUT_DEFAULT = path.join(ROOT, "data", "dynamic-airports.json");
const COORDS_PATH = path.join(ROOT, "data", "airport-coords.json");
const AIP_DATA_PATH = path.join(ROOT, "data", "aip-data.json");
const OURAIRPORTS_URL = "https://ourairports.com/data/airports.csv";

function argValue(flag, fallback = null) {
  const i = process.argv.indexOf(flag);
  if (i === -1) return fallback;
  return process.argv[i + 1] ?? fallback;
}

function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === "\"") {
      if (inQuotes && line[i + 1] === "\"") {
        cur += "\"";
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function buildOurAirportsMap(csvText) {
  const lines = csvText.split(/\r?\n/).filter(Boolean);
  const header = parseCsvLine(lines[0] || "");
  const idxIdent = header.indexOf("ident");
  const idxName = header.indexOf("name");
  const idxLat = header.indexOf("latitude_deg");
  const idxLon = header.indexOf("longitude_deg");
  const map = new Map();
  for (let i = 1; i < lines.length; i += 1) {
    const cols = parseCsvLine(lines[i]);
    const icao = String(cols[idxIdent] || "").trim().toUpperCase();
    if (!/^[A-Z0-9]{4}$/.test(icao)) continue;
    const name = String(cols[idxName] || "").trim();
    const lat = Number(cols[idxLat]);
    const lon = Number(cols[idxLon]);
    map.set(icao, {
      name: name || null,
      lat: Number.isFinite(lat) ? lat : null,
      lon: Number.isFinite(lon) ? lon : null,
    });
  }
  return map;
}

function buildAipNameMap(aipData) {
  const map = new Map();
  for (const c of Array.isArray(aipData) ? aipData : []) {
    for (const a of Array.isArray(c.airports) ? c.airports : []) {
      const icao = String(a["Airport Code"] || "").trim().toUpperCase();
      const name = String(a["Airport Name"] || "").trim();
      if (!/^[A-Z0-9]{4}$/.test(icao) || !name) continue;
      if (!map.has(icao)) map.set(icao, name);
    }
  }
  return map;
}

function normKey(v) {
  return String(v || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function matchesCountry(countryA, countryB) {
  const a = normKey(countryA);
  const b = normKey(countryB);
  if (!a || !b) return false;
  if (a === b) return true;
  const aliases = new Set([
    `${a}|north macedonia`,
    `${a}|republic of north macedonia`,
    `${a}|korea`,
    `${a}|republic of korea`,
    `${a}|turkmenistan`,
    `${a}|tajikistan`,
    `${a}|venezuela`,
    `${a}|pakistan`,
    `${a}|sri lanka`,
  ]);
  return aliases.has(`${a}|${b}`) || aliases.has(`${b}|${a}`);
}

function normalizeAirportName(name, icao) {
  const raw = String(name || "").replace(/\s+/g, " ").trim();
  if (!raw) return `${icao} Airport`;
  const stripped = raw
    .replace(/\((ARP|AIRPORT REFERENCE POINT)[^)]+\)/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  const tc = stripped
    .toLowerCase()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase())
    .replace(/\bIntl\b/g, "Intl")
    .replace(/\bIntl\.\b/g, "Intl")
    .replace(/\bAfb\b/g, "AFB")
    .replace(/\bAb\b/g, "AB");
  return tc || `${icao} Airport`;
}

async function main() {
  const inPath = argValue("--in", IN_DEFAULT);
  const outPath = argValue("--out", OUT_DEFAULT);
  const packages = JSON.parse(await fs.readFile(inPath, "utf8"));
  const coords = JSON.parse(await fs.readFile(COORDS_PATH, "utf8"));
  const aipData = JSON.parse(await fs.readFile(AIP_DATA_PATH, "utf8"));

  const ourRes = await fetch(OURAIRPORTS_URL);
  if (!ourRes.ok) throw new Error(`Failed to fetch ${OURAIRPORTS_URL}: ${ourRes.status}`);
  const ourMap = buildOurAirportsMap(await ourRes.text());
  const aipNameMap = buildAipNameMap(aipData);

  const packageByCountry = new Map(
    (packages.countries || []).map((c) => [normKey(c.countryName), c]),
  );
  const airportsByIcao = new Map();
  for (const country of packages.countries || []) {
    for (const icaoRaw of country.ad2Icaos || []) {
      const icao = String(icaoRaw || "").trim().toUpperCase();
      if (!/^[A-Z0-9]{4}$/.test(icao)) continue;
      if (airportsByIcao.has(icao)) continue;
      const localCoord = coords[icao] || null;
      const our = ourMap.get(icao) || null;
      const name = normalizeAirportName(aipNameMap.get(icao) || our?.name || "", icao);
      airportsByIcao.set(icao, {
        icao,
        country: country.countryName,
        name,
        lat: localCoord?.lat ?? our?.lat ?? null,
        lon: localCoord?.lon ?? our?.lon ?? null,
        source: "web_table_scraper_dynamic",
        effectiveDate: country.effectiveDate || null,
        webAipUrl: country.webAipUrl || null,
        visible: true,
      });
    }
  }

  // Fill gaps from existing hard-coded AIP data for countries that now have web-table scrapers.
  const targetCountries = new Set((packages.countries || []).map((c) => c.countryName));
  for (const countryRow of Array.isArray(aipData) ? aipData : []) {
    const rowCountry = String(countryRow.country || "");
    const shouldInclude = Array.from(targetCountries).some((c) => matchesCountry(c, rowCountry));
    if (!shouldInclude) continue;
    for (const airport of Array.isArray(countryRow.airports) ? countryRow.airports : []) {
      const icao = String(airport["Airport Code"] || "").trim().toUpperCase();
      if (!/^[A-Z0-9]{4}$/.test(icao)) continue;
      if (airportsByIcao.has(icao)) continue;
      const localCoord = coords[icao] || null;
      const our = ourMap.get(icao) || null;
      const pkg = packageByCountry.get(normKey(rowCountry)) || null;
      airportsByIcao.set(icao, {
        icao,
        country: rowCountry,
        name: normalizeAirportName(String(airport["Airport Name"] || "").trim() || our?.name || "", icao),
        lat: localCoord?.lat ?? our?.lat ?? null,
        lon: localCoord?.lon ?? our?.lon ?? null,
        source: "hardcoded_backfill_for_scraper_country",
        effectiveDate: pkg?.effectiveDate || null,
        webAipUrl: pkg?.webAipUrl || null,
        visible: true,
      });
    }
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    fromPackages: path.relative(ROOT, inPath),
    airports: Array.from(airportsByIcao.values()).sort((a, b) => a.icao.localeCompare(b.icao)),
  };
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, JSON.stringify(payload, null, 2) + "\n", "utf8");
  console.log(`[enrich-airports] wrote ${payload.airports.length} airports -> ${outPath}`);
}

main().catch((err) => {
  console.error("[enrich-airports] failed:", err?.message || err);
  process.exit(1);
});
