#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { loadEnvFromProjectRoot } from "./_load-env.mjs";

const ROOT = process.cwd();
const BATCH_SIZE = 200;
const COORDS_PATH = path.join(ROOT, "data", "airport-coords.json");

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

async function createSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRole) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function fetchMissingCoordAirports(supabase) {
  const out = [];
  const pageSize = 1000;
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from("airports")
      .select("icao,name,country,lat,lon")
      .or("lat.is.null,lon.is.null")
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error(`Failed to read missing coords: ${error.message}`);
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < pageSize) break;
    offset += pageSize;
  }
  return out
    .map((r) => ({
      icao: String(r.icao || "").trim().toUpperCase(),
      name: String(r.name || ""),
      country: String(r.country || ""),
      lat: r.lat == null ? null : (Number.isFinite(Number(r.lat)) ? Number(r.lat) : null),
      lon: r.lon == null ? null : (Number.isFinite(Number(r.lon)) ? Number(r.lon) : null),
    }))
    .filter((r) => /^[A-Z0-9]{4}$/.test(r.icao));
}

async function loadLocalCoordMap() {
  try {
    const raw = await fs.readFile(COORDS_PATH, "utf8");
    const json = JSON.parse(raw);
    const map = new Map();
    for (const [icaoRaw, coord] of Object.entries(json || {})) {
      const icao = String(icaoRaw || "").trim().toUpperCase();
      const lat = Number(coord?.lat);
      const lon = Number(coord?.lon);
      if (/^[A-Z0-9]{4}$/.test(icao) && Number.isFinite(lat) && Number.isFinite(lon)) {
        map.set(icao, { lat, lon });
      }
    }
    return map;
  } catch {
    return new Map();
  }
}

async function loadOurAirportsMap(targetIcaos) {
  const res = await fetch("https://davidmegginson.github.io/ourairports-data/airports.csv");
  if (!res.ok) throw new Error(`Failed to fetch OurAirports CSV: ${res.status}`);
  const text = await res.text();
  const lines = text.split(/\r?\n/);
  const header = parseCSVLine(lines[0] || "");
  const icaoIdx = header.indexOf("icao_code");
  const identIdx = header.indexOf("ident");
  const latIdx = header.indexOf("latitude_deg");
  const lonIdx = header.indexOf("longitude_deg");
  if ([icaoIdx, identIdx, latIdx, lonIdx].some((i) => i === -1)) {
    throw new Error("OurAirports CSV format changed");
  }

  const map = new Map();
  for (let i = 1; i < lines.length; i++) {
    const row = parseCSVLine(lines[i]);
    if (row.length <= Math.max(icaoIdx, identIdx, latIdx, lonIdx)) continue;
    const icao = String(row[icaoIdx] || row[identIdx] || "").trim().toUpperCase();
    if (!targetIcaos.has(icao)) continue;
    const lat = Number(row[latIdx]);
    const lon = Number(row[lonIdx]);
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      map.set(icao, { lat, lon });
    }
  }
  return map;
}

async function loadOpenFlightsMap(targetIcaos) {
  const res = await fetch("https://raw.githubusercontent.com/jpatokal/openflights/master/data/airports.dat");
  if (!res.ok) return new Map();
  const text = await res.text();
  const map = new Map();
  for (const line of text.split(/\r?\n/)) {
    if (!line) continue;
    const cols = line.split(",");
    if (cols.length < 8) continue;
    const icao = String(cols[5] || "").replace(/^"|"$/g, "").trim().toUpperCase();
    if (!targetIcaos.has(icao)) continue;
    const lat = Number(String(cols[6] || "").replace(/^"|"$/g, "").trim());
    const lon = Number(String(cols[7] || "").replace(/^"|"$/g, "").trim());
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      map.set(icao, { lat, lon });
    }
  }
  return map;
}

async function upsertCoords(supabase, rows) {
  let updated = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase
      .from("airports")
      .upsert(batch, { onConflict: "icao" });
    if (error) throw new Error(`Upsert batch ${Math.floor(i / BATCH_SIZE) + 1} failed: ${error.message}`);
    updated += batch.length;
  }
  return updated;
}

async function geocodeByNameAndCountry(name, country) {
  const q = encodeURIComponent(`${name}, ${country}`);
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${q}`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "clearway-airport-enricher/1.0",
        "Accept": "application/json",
      },
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => []);
    const first = Array.isArray(data) ? data[0] : null;
    const lat = Number(first?.lat);
    const lon = Number(first?.lon);
    if (Number.isFinite(lat) && Number.isFinite(lon)) return { lat, lon };
  } catch {}
  return null;
}

async function main() {
  loadEnvFromProjectRoot(ROOT);
  const dryRun = process.argv.includes("--dry-run");
  const supabase = await createSupabaseClient();
  const missing = await fetchMissingCoordAirports(supabase);
  if (missing.length === 0) {
    console.log("[fill-missing-coords] No airports missing coordinates.");
    return;
  }
  const targetIcaos = new Set(missing.map((r) => r.icao));
  console.log(`[fill-missing-coords] missingRows=${missing.length}`);

  const localMap = await loadLocalCoordMap();
  const ourMap = await loadOurAirportsMap(targetIcaos);
  const openMap = await loadOpenFlightsMap(targetIcaos);

  const updates = [];
  const unresolved = [];
  let geocoded = 0;
  for (const row of missing) {
    const existingComplete = row.lat != null && row.lon != null;
    if (existingComplete) continue;
    const local = localMap.get(row.icao);
    const our = ourMap.get(row.icao);
    const open = openMap.get(row.icao);
    let candidate = local || our || open || null;
    if (!candidate && row.name.trim()) {
      candidate = await geocodeByNameAndCountry(row.name, row.country || "");
      if (candidate) geocoded += 1;
    }
    if (!candidate) {
      unresolved.push({ icao: row.icao, name: row.name, country: row.country });
      continue;
    }
    const lat = row.lat ?? candidate.lat;
    const lon = row.lon ?? candidate.lon;
    if (lat == null || lon == null) {
      unresolved.push({ icao: row.icao, name: row.name, country: row.country });
      continue;
    }
    updates.push({
      icao: row.icao,
      lat,
      lon,
      updated_at: new Date().toISOString(),
    });
  }

  console.log(`[fill-missing-coords] foundCoords=${updates.length} geocoded=${geocoded} unresolved=${unresolved.length} dryRun=${dryRun ? "yes" : "no"}`);
  if (unresolved.length > 0) {
    const unresolvedPath = path.join(ROOT, "data", ".tmp", "missing-airport-coords-unresolved.json");
    await fs.mkdir(path.dirname(unresolvedPath), { recursive: true });
    await fs.writeFile(unresolvedPath, JSON.stringify(unresolved, null, 2) + "\n", "utf8");
    console.log(`[fill-missing-coords] wrote unresolved list: ${unresolvedPath}`);
  }

  if (dryRun || updates.length === 0) return;
  const updated = await upsertCoords(supabase, updates);
  console.log(`[fill-missing-coords] updated=${updated}`);
}

main().catch((err) => {
  console.error("[fill-missing-coords] failed:", err?.message || err);
  process.exit(1);
});
