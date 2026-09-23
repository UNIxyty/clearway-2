#!/usr/bin/env node
// Backfill the Supabase `airports` table from OurAirports so an ICAO a
// dispatcher asks about resolves instead of quietly returning "no airports
// found" (agent build, Part 0 / P1).
//
// What it does (idempotent; nothing is deleted or hidden):
//   1. Reads every row of `airports` and the OurAirports airports/countries CSVs.
//   2. Territories with NO row at all: inserts large + medium airports and any
//      small airport with scheduled service (island states often have only
//      those). Territories already present: inserts missing large + medium
//      airports only (their small-airport sets are curated by the scrapers).
//   3. Repairs rows whose name is the "XXXX Airport" placeholder or whose
//      coordinates are 0/null, using OurAirports (only those fields).
//   4. If the table has an `iata` column (docs/supabase-airports-iata.sql),
//      fills it for every row OurAirports knows.
//
// Usage:
//   node scripts/airports-backfill-ourairports.mjs                 # dry run, prints the plan
//   node scripts/airports-backfill-ourairports.mjs --apply         # writes
//   node scripts/airports-backfill-ourairports.mjs --apply --iata-only
//   --cache-dir <dir>   reuse downloaded CSVs from a dir (default: data/.tmp/ourairports)
//   --report <file>     write the full before/after report as JSON
//
// Needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (read from .env).

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const ROOT = process.cwd();
const SOURCE_TAG = "ourairports_backfill_2026-09";
const AIRPORTS_CSV_URL = "https://davidmegginson.github.io/ourairports-data/airports.csv";
const COUNTRIES_CSV_URL = "https://davidmegginson.github.io/ourairports-data/countries.csv";
const BATCH = 200;

// Same list as lib/blocked-airports.ts — never re-insert what the portal hides.
const BLOCKED_ICAOS = new Set(["LBWB", "LIBI", "LIKB", "EVSM", "EVLU", "EHHA", "ENVR", "LRBG", "LRHO", "LRMA", "LRDD", "LECV", "LTHC"]);

// OurAirports names that should not be used verbatim as the portal country label.
const COUNTRY_LABEL_OVERRIDES = {
  EH: "Western Sahara",
  CD: "DR Congo",
  SH: "Saint Helena",
  TF: "French Southern Territories",
  UM: "US Minor Outlying Islands",
  VI: "US Virgin Islands",
  KP: "North Korea",
};

function hasFlag(flag) { return process.argv.includes(flag); }
function argValue(flag, fallback = null) {
  const idx = process.argv.indexOf(flag);
  return idx === -1 ? fallback : (process.argv[idx + 1] ?? fallback);
}

function loadEnv() {
  const out = { ...process.env };
  for (const file of [".env", ".env.local"]) {
    const p = join(ROOT, file);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (m && out[m[1]] === undefined) out[m[1]] = m[2].replace(/^"(.*)"$/, "$1").trim();
    }
  }
  return out;
}

// RFC-4180 parser (OurAirports has quoted fields with commas and newlines).
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i += 1; } else quoted = false; }
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const header = rows.shift();
  return rows.filter((r) => r.length === header.length).map((r) => Object.fromEntries(header.map((k, i) => [k, r[i]])));
}

async function fetchCsv(url, cacheDir, name) {
  mkdirSync(cacheDir, { recursive: true });
  const p = join(cacheDir, name);
  if (existsSync(p)) return readFileSync(p, "utf8");
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  const text = await res.text();
  writeFileSync(p, text);
  return text;
}

const isIcao = (s) => /^[A-Z]{4}$/.test(String(s || ""));
const isIata = (s) => /^[A-Z]{3}$/.test(String(s || ""));
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };

async function readAllAirports(supabase, withIata) {
  const cols = `id,icao,name,country,state,lat,lon,source,visible${withIata ? ",iata" : ""}`;
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from("airports").select(cols).order("id").range(from, from + 999);
    if (error) throw new Error(`airports read: ${error.message}`);
    rows.push(...data);
    if (data.length < 1000) break;
  }
  return rows;
}

async function detectIataColumn(supabase) {
  const { error } = await supabase.from("airports").select("iata").limit(1);
  return !error;
}

async function main() {
  const env = loadEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL, key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  const apply = hasFlag("--apply");
  const iataOnly = hasFlag("--iata-only");
  const cacheDir = argValue("--cache-dir", join(ROOT, "data", ".tmp", "ourairports"));
  const reportPath = argValue("--report", null);
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const withIata = await detectIataColumn(supabase);
  console.log(`iata column: ${withIata ? "present" : "ABSENT (run docs/supabase-airports-iata.sql, then --apply --iata-only)"}`);

  const [airportsCsv, countriesCsv] = await Promise.all([
    fetchCsv(AIRPORTS_CSV_URL, cacheDir, "airports.csv"),
    fetchCsv(COUNTRIES_CSV_URL, cacheDir, "countries.csv"),
  ]);
  const countries = Object.fromEntries(parseCsv(countriesCsv).map((c) => [c.code, c.name]));
  const reference = parseCsv(airportsCsv)
    .filter((a) => a.type !== "closed" && a.iso_country && a.iso_country !== "ZZ")
    .map((a) => {
      const code = isIcao(a.icao_code) ? a.icao_code : isIcao(a.gps_code) ? a.gps_code : isIcao(a.ident) ? a.ident : null;
      return code ? {
        code, type: a.type, name: a.name.trim(), iso: a.iso_country, region: a.iso_region,
        lat: num(a.latitude_deg), lon: num(a.longitude_deg), scheduled: a.scheduled_service === "yes",
        iata: isIata(a.iata_code) ? a.iata_code : null,
      } : null;
    })
    .filter(Boolean);
  // Official icao_code wins over gps_code/ident when two rows claim one code.
  const byCode = new Map();
  for (const a of reference) if (!byCode.has(a.code) || a.type === "large_airport") byCode.set(a.code, a);

  const before = await readAllAirports(supabase, withIata);
  const have = new Map(before.map((r) => [String(r.icao).toUpperCase(), r]));

  // Territory coverage: DB rows → ISO via the reference; label per ISO = the
  // label the DB already uses most (keeps "Russia", "Tchad", "Uae" as-is).
  const labelVotes = {};
  for (const r of before) {
    const ref = byCode.get(String(r.icao).toUpperCase());
    if (!ref || !r.country) continue;
    labelVotes[ref.iso] ??= {};
    labelVotes[ref.iso][r.country] = (labelVotes[ref.iso][r.country] || 0) + 1;
  }
  // A territory counts as covered only when a label's rows resolve mostly to
  // it — one mislabelled stray (e.g. an Indonesian ICAO filed under
  // "Singapore") must not mark Indonesia as present or relabel its airports.
  const labelIsoVotes = {};
  for (const [iso, votes] of Object.entries(labelVotes)) {
    for (const [label, n] of Object.entries(votes)) {
      labelIsoVotes[label] ??= {};
      labelIsoVotes[label][iso] = (labelIsoVotes[label][iso] || 0) + n;
    }
  }
  const majorityIsoOf = (label) => Object.entries(labelIsoVotes[label]).sort((a, b) => b[1] - a[1])[0][0];
  const coveredIso = new Set();
  for (const [iso, votes] of Object.entries(labelVotes)) {
    if (Object.keys(votes).some((label) => majorityIsoOf(label) === iso)) coveredIso.add(iso);
  }
  const labelFor = (iso) => {
    const votes = labelVotes[iso];
    if (coveredIso.has(iso)) {
      return Object.entries(votes).filter(([label]) => majorityIsoOf(label) === iso).sort((a, b) => b[1] - a[1])[0][0];
    }
    return COUNTRY_LABEL_OVERRIDES[iso] || countries[iso] || iso;
  };
  const isoWithAirports = new Set(reference.map((a) => a.iso));
  const missingIso = Object.keys(countries).filter((iso) => !coveredIso.has(iso)).sort();
  const missingWithAirports = missingIso.filter((iso) => isoWithAirports.has(iso));
  const missingWithout = missingIso.filter((iso) => !isoWithAirports.has(iso));

  // Plan: inserts
  const policy = (a) => {
    if (a.type === "large_airport" || a.type === "medium_airport") return true;
    return !coveredIso.has(a.iso) && a.scheduled; // small-with-scheduled only for new territories
  };
  const inserts = [];
  for (const a of byCode.values()) {
    if (have.has(a.code) || BLOCKED_ICAOS.has(a.code) || !policy(a) || a.lat == null || a.lon == null) continue;
    inserts.push({
      icao: a.code, name: a.name, country: labelFor(a.iso), state: null, lat: a.lat, lon: a.lon,
      source: SOURCE_TAG, visible: true, ...(withIata ? { iata: a.iata } : {}),
    });
  }
  inserts.sort((a, b) => a.icao.localeCompare(b.icao));

  // Plan: repairs (placeholder names / zero coords) and iata fill
  const repairs = [], iataFills = [];
  for (const r of before) {
    const code = String(r.icao).toUpperCase();
    const ref = byCode.get(code);
    if (!ref) continue;
    const patch = {};
    const placeholder = new RegExp(`^${code}\\s+airport$`, "i").test(String(r.name || "").trim());
    if ((placeholder || !String(r.name || "").trim()) && ref.name) patch.name = ref.name;
    if ((!r.lat || !r.lon) && ref.lat != null && ref.lon != null) { patch.lat = ref.lat; patch.lon = ref.lon; }
    if (Object.keys(patch).length) repairs.push({ id: r.id, icao: code, patch });
    if (withIata && ref.iata && r.iata !== ref.iata) iataFills.push({ id: r.id, icao: code, iata: ref.iata });
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    iataColumn: withIata,
    before: { rows: before.length, isoTerritories: coveredIso.size, countryLabels: new Set(before.map((r) => r.country)).size },
    referenceTerritories: Object.keys(countries).length,
    referenceTerritoriesWithIcaoAirports: isoWithAirports.size,
    // "presentUnder": the territory has no label of its own but its airports
    // already sit under a neighbour's label (ELLX under Belgium, LYPG under
    // Serbia and Montenegro) — resolvable today, reported for honesty.
    missingTerritories: missingWithAirports.map((iso) => ({
      iso, name: countries[iso], label: labelFor(iso),
      inserts: inserts.filter((i) => i.country === labelFor(iso)).length,
      presentUnder: labelVotes[iso] ? Object.keys(labelVotes[iso]) : [],
    })),
    territoriesWithNoIcaoAirport: missingWithout.map((iso) => `${iso} ${countries[iso]}`),
    inserts: { total: inserts.length, newTerritories: inserts.filter((i) => !coveredIso.has(byCode.get(i.icao).iso)).length, existingTerritories: inserts.filter((i) => coveredIso.has(byCode.get(i.icao).iso)).length },
    repairs: repairs.length,
    iataFills: iataFills.length,
    after: { rows: before.length + inserts.length, isoTerritories: coveredIso.size + missingWithAirports.length },
  };
  console.log(JSON.stringify(summary, null, 2));

  if (reportPath) writeFileSync(reportPath, JSON.stringify({ summary, inserts, repairs, iataFills }, null, 2));
  if (!apply) { console.log("\nDry run. Re-run with --apply to write."); return; }

  let done = 0;
  if (!iataOnly) {
    for (let i = 0; i < inserts.length; i += BATCH) {
      const { error } = await supabase.from("airports").insert(inserts.slice(i, i + BATCH));
      if (error) throw new Error(`insert batch ${i}: ${error.message}`);
      done += Math.min(BATCH, inserts.length - i);
      process.stdout.write(`\rinserted ${done}/${inserts.length}`);
    }
    console.log();
    for (const r of repairs) {
      const { error } = await supabase.from("airports").update({ ...r.patch, updated_at: new Date().toISOString() }).eq("id", r.id);
      if (error) throw new Error(`repair ${r.icao}: ${error.message}`);
    }
    console.log(`repaired ${repairs.length}`);
  }
  if (withIata) {
    let n = 0;
    for (const f of iataFills) {
      const { error } = await supabase.from("airports").update({ iata: f.iata }).eq("id", f.id);
      if (error) throw new Error(`iata ${f.icao}: ${error.message}`);
      n += 1;
      if (n % 100 === 0) process.stdout.write(`\riata ${n}/${iataFills.length}`);
    }
    console.log(`\niata filled ${n}`);
  }
  const after = await readAllAirports(supabase, withIata);
  console.log(`after: ${after.length} rows`);
}

main().catch((e) => { console.error(e); process.exit(1); });
