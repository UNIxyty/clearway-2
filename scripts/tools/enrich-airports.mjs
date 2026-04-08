#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { loadEnvFromProjectRoot } from "./_load-env.mjs";

const ROOT = process.cwd();
const IN_DEFAULT = path.join(ROOT, "data", "dynamic-packages.json");
const OUT_DEFAULT = path.join(ROOT, "data", "dynamic-airports.json");
const COORDS_PATH = path.join(ROOT, "data", "airport-coords.json");
const AIP_DATA_PATH = path.join(ROOT, "data", "aip-data.json");
const OURAIRPORTS_URL = "https://ourairports.com/data/airports.csv";
const OPENFLIGHTS_URL = "https://raw.githubusercontent.com/jpatokal/openflights/master/data/airports.dat";
const MANUAL_COORD_OVERRIDES = {
  OERS: { lat: 25.628333, lon: 37.088889 }, // Hanak / Red Sea International (AIP AD2)
  OEST: { lat: 22.709, lon: 53.284667 }, // Shabitah
  VTSY: { lat: 5.788833, lon: 101.147167 }, // Yala / Betong
};

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
    if (!/^[A-Z]{4}$/.test(icao)) continue;
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

function buildOpenFlightsMap(csvText) {
  const map = new Map();
  const lines = csvText.split(/\r?\n/).filter(Boolean);
  for (const line of lines) {
    const cols = parseCsvLine(line);
    const icao = String(cols[5] || "").trim().toUpperCase();
    if (!/^[A-Z]{4}$/.test(icao)) continue;
    const name = String(cols[1] || "").trim();
    const lat = Number(cols[6]);
    const lon = Number(cols[7]);
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
      if (!/^[A-Z]{4}$/.test(icao) || !name) continue;
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

function isValidIcao(icao) {
  const up = String(icao || "").trim().toUpperCase();
  if (!/^[A-Z]{4}$/.test(up)) return false;
  const banned = new Set(["AMDT", "AIRA", "AIPM", "AD2A", "GEN1", "GEN2", "EAIP", "HTML", "PDFS", "NONE", "NULL"]);
  return !banned.has(up);
}

function normalizeAirportName(name, icao) {
  const raw = String(name || "").replace(/\s+/g, " ").trim();
  if (!raw) return `${icao} Airport`;
  const stripped = raw
    .replace(/\((ARP|AIRPORT REFERENCE POINT)[^)]+\)/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  const deDupSlash = stripped
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean)
    .reduce((acc, cur) => {
      const key = cur.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
      if (!acc.some((x) => x.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim() === key)) acc.push(cur);
      return acc;
    }, [])
    .join(" / ");
  const tc = deDupSlash
    .toLowerCase()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase())
    .replace(/\bIntl\b/g, "Intl")
    .replace(/\bIntl\.\b/g, "Intl")
    .replace(/\bInt'l\b/g, "Intl")
    .replace(/\bAfb\b/g, "AFB")
    .replace(/\bAb\b/g, "AB")
    .replace(/\b\/\s+/g, "/ ")
    .replace(/\s+\./g, ".")
    .trim();
  return tc || `${icao} Airport`;
}

function looksGenericName(name, icao) {
  const n = String(name || "").trim().toLowerCase();
  const generic = `${icao} airport`.toLowerCase();
  return !n || n === generic || n === icao.toLowerCase();
}

async function fetchSupabaseAirportMap(icaos) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRole) return new Map();
  let createClient;
  try {
    ({ createClient } = await import("@supabase/supabase-js"));
  } catch {
    console.warn("[enrich-airports] @supabase/supabase-js not installed; skipping Supabase fallback enrichment.");
    return new Map();
  }
  const supabase = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const map = new Map();
  const list = Array.from(icaos);
  const chunk = 200;
  for (let i = 0; i < list.length; i += chunk) {
    const slice = list.slice(i, i + chunk);
    const { data, error } = await supabase
      .from("airports")
      .select("icao,name,lat,lon")
      .in("icao", slice);
    if (error) continue;
    for (const row of data || []) {
      const icao = String(row.icao || "").toUpperCase();
      if (!icao) continue;
      map.set(icao, {
        name: row.name ? String(row.name) : null,
        lat: Number.isFinite(Number(row.lat)) ? Number(row.lat) : null,
        lon: Number.isFinite(Number(row.lon)) ? Number(row.lon) : null,
      });
    }
  }
  return map;
}

async function geocodeMissingCoords(rows) {
  const missing = rows.filter((r) => (r.lat == null || r.lon == null) && !looksGenericName(r.name, r.icao));
  for (const row of missing.slice(0, 40)) {
    const q = encodeURIComponent(`${row.name}, ${row.country}`);
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${q}`;
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "clearway-airport-enricher/1.0",
          "Accept": "application/json",
        },
      });
      if (!res.ok) continue;
      const data = await res.json().catch(() => []);
      const first = Array.isArray(data) ? data[0] : null;
      const lat = Number(first?.lat);
      const lon = Number(first?.lon);
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        row.lat = lat;
        row.lon = lon;
      }
    } catch {}
  }
}

async function main() {
  loadEnvFromProjectRoot(ROOT);
  const inPath = argValue("--in", IN_DEFAULT);
  const outPath = argValue("--out", OUT_DEFAULT);
  const packages = JSON.parse(await fs.readFile(inPath, "utf8"));
  const coords = JSON.parse(await fs.readFile(COORDS_PATH, "utf8"));
  const aipData = JSON.parse(await fs.readFile(AIP_DATA_PATH, "utf8"));
  console.log(
    `[enrich-airports] start in=${path.relative(ROOT, inPath)} out=${path.relative(ROOT, outPath)} countries=${Array.isArray(packages.countries) ? packages.countries.length : 0}`,
  );

  const ourRes = await fetch(OURAIRPORTS_URL);
  if (!ourRes.ok) throw new Error(`Failed to fetch ${OURAIRPORTS_URL}: ${ourRes.status}`);
  const ourMap = buildOurAirportsMap(await ourRes.text());
  const ofRes = await fetch(OPENFLIGHTS_URL);
  const openFlightsMap = ofRes.ok ? buildOpenFlightsMap(await ofRes.text()) : new Map();
  const aipNameMap = buildAipNameMap(aipData);

  const packageByCountry = new Map(
    (packages.countries || []).map((c) => [normKey(c.countryName), c]),
  );
  const airportsByIcao = new Map();
  let skippedInvalidFromPackages = 0;
  let skippedDuplicatesFromPackages = 0;
  for (const country of packages.countries || []) {
    for (const icaoRaw of country.ad2Icaos || []) {
      const icao = String(icaoRaw || "").trim().toUpperCase();
      if (!isValidIcao(icao)) {
        skippedInvalidFromPackages += 1;
        continue;
      }
      if (airportsByIcao.has(icao)) {
        skippedDuplicatesFromPackages += 1;
        continue;
      }
      const localCoord = coords[icao] || null;
      const our = ourMap.get(icao) || null;
      const of = openFlightsMap.get(icao) || null;
      const name = normalizeAirportName(aipNameMap.get(icao) || our?.name || "", icao);
      airportsByIcao.set(icao, {
        icao,
        country: country.countryName,
        name: normalizeAirportName(name || of?.name || "", icao),
        lat: localCoord?.lat ?? our?.lat ?? of?.lat ?? null,
        lon: localCoord?.lon ?? our?.lon ?? of?.lon ?? null,
        source: "web_table_scraper_dynamic",
        effectiveDate: country.effectiveDate || null,
        webAipUrl: country.webAipUrl || null,
        visible: true,
      });
    }
  }
  console.log(
    `[enrich-airports] from packages unique=${airportsByIcao.size} skippedInvalid=${skippedInvalidFromPackages} skippedDuplicates=${skippedDuplicatesFromPackages}`,
  );

  const supabaseMap = await fetchSupabaseAirportMap(new Set(airportsByIcao.keys()));
  for (const [icao, row] of airportsByIcao.entries()) {
    const db = supabaseMap.get(icao);
    if (!db) continue;
    if ((row.lat == null || row.lon == null) && db.lat != null && db.lon != null) {
      row.lat = db.lat;
      row.lon = db.lon;
    }
    if (looksGenericName(row.name, icao) && db.name) {
      row.name = normalizeAirportName(db.name, icao);
    }
    airportsByIcao.set(icao, row);
  }

  // Fill gaps from existing hard-coded AIP data for countries that now have web-table scrapers.
  const targetCountries = new Set((packages.countries || []).map((c) => c.countryName));
  let backfillAdded = 0;
  let backfillSkippedInvalid = 0;
  let backfillSkippedExisting = 0;
  for (const countryRow of Array.isArray(aipData) ? aipData : []) {
    const rowCountry = String(countryRow.country || "");
    const shouldInclude = Array.from(targetCountries).some((c) => matchesCountry(c, rowCountry));
    if (!shouldInclude) continue;
    for (const airport of Array.isArray(countryRow.airports) ? countryRow.airports : []) {
      const icao = String(airport["Airport Code"] || "").trim().toUpperCase();
      if (!isValidIcao(icao)) {
        backfillSkippedInvalid += 1;
        continue;
      }
      if (airportsByIcao.has(icao)) {
        backfillSkippedExisting += 1;
        continue;
      }
      const localCoord = coords[icao] || null;
      const our = ourMap.get(icao) || null;
      const of = openFlightsMap.get(icao) || null;
      const pkg = packageByCountry.get(normKey(rowCountry)) || null;
      airportsByIcao.set(icao, {
        icao,
        country: rowCountry,
        name: normalizeAirportName(String(airport["Airport Name"] || "").trim() || our?.name || of?.name || "", icao),
        lat: localCoord?.lat ?? our?.lat ?? of?.lat ?? null,
        lon: localCoord?.lon ?? our?.lon ?? of?.lon ?? null,
        source: "hardcoded_backfill_for_scraper_country",
        effectiveDate: pkg?.effectiveDate || null,
        webAipUrl: pkg?.webAipUrl || null,
        visible: true,
      });
      backfillAdded += 1;
    }
  }
  console.log(
    `[enrich-airports] backfill added=${backfillAdded} skippedInvalid=${backfillSkippedInvalid} skippedExisting=${backfillSkippedExisting}`,
  );

  const finalRows = Array.from(airportsByIcao.values())
    .map((a) => ({ ...a, name: normalizeAirportName(a.name, a.icao) }))
    .sort((a, b) => a.icao.localeCompare(b.icao));

  await geocodeMissingCoords(finalRows);
  for (const row of finalRows) {
    if (row.lat != null && row.lon != null) continue;
    const override = MANUAL_COORD_OVERRIDES[String(row.icao || "").toUpperCase()];
    if (override) {
      row.lat = override.lat;
      row.lon = override.lon;
    }
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    fromPackages: path.relative(ROOT, inPath),
    airports: finalRows,
  };
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, JSON.stringify(payload, null, 2) + "\n", "utf8");
  const withCoords = finalRows.filter((r) => r.lat != null && r.lon != null).length;
  console.log(
    `[enrich-airports] wrote ${payload.airports.length} airports -> ${outPath} withCoords=${withCoords} withoutCoords=${payload.airports.length - withCoords}`,
  );
}

main().catch((err) => {
  console.error("[enrich-airports] failed:", err?.message || err);
  process.exit(1);
});
