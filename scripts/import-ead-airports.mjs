#!/usr/bin/env node
/**
 * Import a unified airport list into Supabase.
 *
 * Includes:
 * - Current portal static airports (AIP + USA-by-state + Russia list)
 * - EAD airport JSON additions/overrides from provided file
 * - Coordinate completion from local map + OurAirports
 * - Russian airport name normalization to international English (OurAirports)
 *
 * Usage:
 *   node scripts/import-ead-airports.mjs
 *   node scripts/import-ead-airports.mjs --input "/path/to/file.json" --dry-run
 */

import fs from "fs/promises";
import path from "path";
import process from "process";
import { createClient } from "@supabase/supabase-js";

const DEFAULT_INPUT = "/Users/whae/Downloads/icao_codes_by_country_v3_cleaned.json";
const OURAIRPORTS_URL = "https://ourairports.com/data/airports.csv";
const ROOT = process.cwd();
const COORDS_PATH = path.join(ROOT, "data", "airport-coords.json");
const AIP_DATA_PATH = path.join(ROOT, "data", "aip-data.json");
const USA_BY_STATE_PATH = path.join(ROOT, "data", "usa-aip-icaos-by-state.json");
const RUS_DATA_PATH = path.join(ROOT, "data", "rus-aip-international-airports.json");
const MISSING_REPORT_PATH = path.join(ROOT, "data", "missing-coords.json");
const BATCH_SIZE = 200;

function getArg(flag, fallback = null) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return fallback;
  return process.argv[idx + 1] ?? fallback;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function parseCountryLabel(countryLabel) {
  return String(countryLabel || "")
    .replace(/\s*\([^)]+\)\s*$/, "")
    .trim();
}

function toUpperIcao(value) {
  return String(value || "").trim().toUpperCase();
}

function normalizeName(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
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

function buildOurAirportsMaps(csvText) {
  const lines = csvText.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return { coordMap: new Map(), ruNameMap: new Map() };
  const header = parseCsvLine(lines[0]);
  const idxIcao = header.indexOf("ident");
  const idxIso = header.indexOf("iso_country");
  const idxName = header.indexOf("name");
  const idxLat = header.indexOf("latitude_deg");
  const idxLon = header.indexOf("longitude_deg");
  if (idxIcao === -1 || idxIso === -1 || idxName === -1 || idxLat === -1 || idxLon === -1) {
    throw new Error("Unexpected OurAirports CSV format");
  }

  const coordMap = new Map();
  const ruNameMap = new Map();
  for (let i = 1; i < lines.length; i += 1) {
    const cols = parseCsvLine(lines[i]);
    const icao = toUpperIcao(cols[idxIcao]);
    if (!icao) continue;
    const latRaw = Number(cols[idxLat]);
    const lonRaw = Number(cols[idxLon]);
    if (Number.isFinite(latRaw) && Number.isFinite(lonRaw)) {
      coordMap.set(icao, { lat: latRaw, lon: lonRaw });
    }
    const iso = String(cols[idxIso] || "").trim().toUpperCase();
    const name = normalizeName(cols[idxName]);
    if (iso === "RU" && name) {
      ruNameMap.set(icao, name);
    }
  }

  return { coordMap, ruNameMap };
}

function createRow({
  icao,
  country,
  state = null,
  name,
  source,
  coordsMap,
  ourCoordsMap,
  updatedAt,
}) {
  const localCoord = coordsMap[icao] || null;
  const ourCoord = ourCoordsMap.get(icao) || null;
  const lat = localCoord?.lat ?? ourCoord?.lat ?? null;
  const lon = localCoord?.lon ?? ourCoord?.lon ?? null;
  return {
    icao,
    country: normalizeName(country),
    state: normalizeName(state || "") || null,
    name: normalizeName(name),
    lat,
    lon,
    source,
    visible: true,
    updated_at: updatedAt,
  };
}

function upsertByPriority(map, row, priority) {
  if (!row.icao) return;
  const current = map.get(row.icao);
  if (!current || priority >= current.priority) {
    map.set(row.icao, { row, priority });
    return;
  }

  // Preserve best non-empty coordinates and optionally fill missing country/state/name.
  const merged = { ...current.row };
  if ((merged.lat == null || merged.lon == null) && row.lat != null && row.lon != null) {
    merged.lat = row.lat;
    merged.lon = row.lon;
  }
  if (!merged.country && row.country) merged.country = row.country;
  if (!merged.state && row.state) merged.state = row.state;
  if (!merged.name && row.name) merged.name = row.name;
  map.set(row.icao, { row: merged, priority: current.priority });
}

function buildUnifiedRows({
  eadInput,
  aipData,
  usaByState,
  rusData,
  coordsMap,
  ourCoordsMap,
  ruNameMap,
}) {
  const updatedAt = new Date().toISOString();
  const map = new Map();

  // Priority 1: current portal static data (non-EAD global list)
  for (const countryRow of Array.isArray(aipData) ? aipData : []) {
    const country = normalizeName(countryRow?.country);
    for (const airport of Array.isArray(countryRow?.airports) ? countryRow.airports : []) {
      const icao = toUpperIcao(airport?.["Airport Code"]);
      if (!icao) continue;
      const row = createRow({
        icao,
        country,
        name: airport?.["Airport Name"],
        source: "portal_static_aip",
        coordsMap,
        ourCoordsMap,
        updatedAt,
      });
      upsertByPriority(map, row, 1);
    }
  }

  const usaCountry = normalizeName(usaByState?.country || "United States of America");
  const byState = usaByState?.by_state && typeof usaByState.by_state === "object" ? usaByState.by_state : {};
  for (const [state, airports] of Object.entries(byState)) {
    for (const airport of Array.isArray(airports) ? airports : []) {
      const icao = toUpperIcao(airport?.["Airport Code"]);
      if (!icao) continue;
      const row = createRow({
        icao,
        country: usaCountry,
        state,
        name: airport?.["Airport Name"],
        source: "portal_static_usa",
        coordsMap,
        ourCoordsMap,
        updatedAt,
      });
      upsertByPriority(map, row, 1);
    }
  }

  for (const airport of Array.isArray(rusData?.airports) ? rusData.airports : []) {
    const icao = toUpperIcao(airport?.icao);
    if (!icao) continue;
    const row = createRow({
      icao,
      country: "Russia",
      name: airport?.airport_name,
      source: "portal_static_russia",
      coordsMap,
      ourCoordsMap,
      updatedAt,
    });
    upsertByPriority(map, row, 1);
  }

  // Priority 2: user-provided EAD list (adds missing and refreshes names/countries)
  const eadCountries = eadInput?.countries && typeof eadInput.countries === "object" ? eadInput.countries : {};
  for (const [countryLabel, airports] of Object.entries(eadCountries)) {
    const country = parseCountryLabel(countryLabel);
    for (const airport of Array.isArray(airports) ? airports : []) {
      const icao = toUpperIcao(airport?.icao);
      if (!icao) continue;
      const row = createRow({
        icao,
        country,
        name: airport?.name || "",
        source: "ead_v3_cleaned",
        coordsMap,
        ourCoordsMap,
        updatedAt,
      });
      upsertByPriority(map, row, 2);
    }
  }

  // Priority 3: RU international English names from OurAirports
  for (const [icao, englishName] of ruNameMap.entries()) {
    const current = map.get(icao);
    if (!current) continue;
    if (normalizeName(current.row.country).toLowerCase() !== "russia") continue;
    const patched = {
      ...current.row,
      name: englishName,
      source: "ourairports_ru_name",
      updated_at: updatedAt,
    };
    upsertByPriority(map, patched, 3);
  }

  const rows = Array.from(map.values()).map((x) => x.row);
  rows.sort((a, b) => a.icao.localeCompare(b.icao));
  const missingCoords = rows
    .filter((row) => row.lat == null || row.lon == null)
    .map((row) => ({
      icao: row.icao,
      country: row.country,
      state: row.state,
      name: row.name,
      source: row.source,
    }));

  return { rows, missingCoords };
}

async function listExistingIcaoSet(supabase) {
  const set = new Set();
  let page = 0;
  while (true) {
    const from = page * 1000;
    const to = from + 999;
    const { data, error } = await supabase
      .from("airports")
      .select("icao")
      .range(from, to);
    if (error) {
      console.error("Failed to read existing airports:", error.message);
      process.exit(1);
    }
    if (!data || data.length === 0) break;
    for (const row of data) {
      const icao = toUpperIcao(row?.icao);
      if (icao) set.add(icao);
    }
    if (data.length < 1000) break;
    page += 1;
  }
  return set;
}

async function main() {
  const inputPath = getArg("--input", DEFAULT_INPUT);
  const dryRun = hasFlag("--dry-run");

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const [eadInput, coordsMap, aipData, usaByState, rusData, ourResponse] = await Promise.all([
    readJson(inputPath),
    readJson(COORDS_PATH),
    readJson(AIP_DATA_PATH),
    readJson(USA_BY_STATE_PATH),
    readJson(RUS_DATA_PATH),
    fetch(OURAIRPORTS_URL),
  ]);
  if (!ourResponse.ok) {
    throw new Error(`Failed to fetch ${OURAIRPORTS_URL}: ${ourResponse.status}`);
  }
  const ourCsvText = await ourResponse.text();
  const { coordMap: ourCoordsMap, ruNameMap } = buildOurAirportsMaps(ourCsvText);

  const { rows, missingCoords } = buildUnifiedRows({
    eadInput,
    aipData,
    usaByState,
    rusData,
    coordsMap,
    ourCoordsMap,
    ruNameMap,
  });
  await fs.writeFile(MISSING_REPORT_PATH, JSON.stringify(missingCoords, null, 2) + "\n", "utf8");

  if (rows.length === 0) {
    console.log("No rows to import.");
    return;
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const existingIcaoSet = await listExistingIcaoSet(supabase);
  const inserts = [];
  const updates = [];
  for (const row of rows) {
    if (existingIcaoSet.has(row.icao)) updates.push(row);
    else inserts.push(row);
  }

  console.log(
    `Prepared ${rows.length} rows (${inserts.length} inserts, ${updates.length} updates).`,
  );
  console.log(`Missing coords reported: ${missingCoords.length} -> ${MISSING_REPORT_PATH}`);

  if (dryRun) {
    console.log("Dry run enabled. No database writes performed.");
    return;
  }

  for (let i = 0; i < inserts.length; i += BATCH_SIZE) {
    const batch = inserts.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from("airports").insert(batch);
    if (error) {
      console.error("Insert batch failed:", error.message);
      process.exit(1);
    }
  }

  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const batch = updates.slice(i, i + BATCH_SIZE);
    for (const row of batch) {
      const { error } = await supabase
        .from("airports")
        .update({
          country: row.country,
          state: row.state,
          name: row.name,
          lat: row.lat,
          lon: row.lon,
          source: row.source,
          visible: true,
          updated_at: row.updated_at,
        })
        .eq("icao", row.icao);
      if (error) {
        console.error(`Update failed for ${row.icao}:`, error.message);
        process.exit(1);
      }
    }
  }

  console.log("Unified airports import complete.");
}

main().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
