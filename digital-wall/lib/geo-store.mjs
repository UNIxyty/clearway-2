// Single source of truth for countries & airports (Item 6).
//
// The Supabase `airports` table (icao, name, country — display names like
// "Latvia", ~2.5k rows) feeds EVERY country/airport picker and the
// flight-country resolution used by IMP/limitation/CAA matching, so a value
// chosen in a picker is guaranteed to be the same string matching compares
// against (the old ISO-code vs directory-name mismatch can't reappear).
//
// Loading strategy:
//   1. Supabase REST, paged — freshest data.
//   2. On success the rows are snapshotted to data/geo-airports.json.
//   3. When Supabase is unreachable/unconfigured the snapshot is used, so
//      restarts and Supabase-less dev keep a full geo directory.
// Callers fall back to the legacy shared-data airport files when this
// returns null (no Supabase AND no snapshot).

import fs from "node:fs/promises";
import path from "node:path";

const SNAPSHOT_FILE = path.resolve(process.cwd(), "data", "geo-airports.json");
const PAGE_SIZE = 1000;

function supabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return { url: url.replace(/\/$/, ""), key };
}

function sanitizeRow(row) {
  const icao = String(row?.icao || "").trim().toUpperCase();
  if (!/^[A-Z0-9]{4}$/.test(icao)) return null;
  return {
    icao,
    name: String(row?.name || "").trim(),
    country: String(row?.country || "").trim(),
  };
}

async function fetchFromSupabase() {
  const env = supabaseEnv();
  if (!env) return null;
  const rows = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const response = await fetch(
      `${env.url}/rest/v1/airports?select=icao,name,country&order=icao.asc&offset=${offset}&limit=${PAGE_SIZE}`,
      { headers: { apikey: env.key, authorization: `Bearer ${env.key}` } }
    );
    if (!response.ok) {
      throw new Error(`airports table fetch failed: ${response.status}`);
    }
    const page = await response.json();
    if (!Array.isArray(page)) throw new Error("airports table returned a non-array payload.");
    for (const row of page) {
      const clean = sanitizeRow(row);
      if (clean) rows.push(clean);
    }
    if (page.length < PAGE_SIZE) break;
  }
  return rows.length > 0 ? rows : null;
}

async function readSnapshot() {
  try {
    const raw = await fs.readFile(SNAPSHOT_FILE, "utf-8");
    const payload = JSON.parse(raw);
    const rows = (Array.isArray(payload?.airports) ? payload.airports : [])
      .map(sanitizeRow)
      .filter(Boolean);
    return rows.length > 0 ? rows : null;
  } catch {
    return null;
  }
}

async function writeSnapshot(rows) {
  try {
    await fs.mkdir(path.dirname(SNAPSHOT_FILE), { recursive: true });
    await fs.writeFile(
      SNAPSHOT_FILE,
      JSON.stringify({ savedAt: new Date().toISOString(), airports: rows }, null, 1),
      "utf-8"
    );
  } catch (error) {
    console.warn(`[geo-store] snapshot write failed: ${error?.message || error}`);
  }
}

/**
 * Load the geo directory. Returns { rows, source } or null when neither
 * Supabase nor a snapshot is available (caller falls back to legacy files).
 */
export async function loadGeoAirports() {
  try {
    const rows = await fetchFromSupabase();
    if (rows) {
      await writeSnapshot(rows);
      return { rows, source: "supabase-airports" };
    }
  } catch (error) {
    console.warn(`[geo-store] Supabase airports load failed: ${error?.message || error}`);
  }
  const snapshot = await readSnapshot();
  if (snapshot) return { rows: snapshot, source: "geo-snapshot" };
  return null;
}
