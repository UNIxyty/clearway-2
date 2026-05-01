#!/usr/bin/env node
/**
 * Reads a debug_run_*.md log file and seeds the debug_run_failures table
 * so the run is recoverable in the UI even after a server restart.
 *
 * Usage: node scripts/tools/seed-debug-run-failures-from-log.mjs [path-to-log]
 * Default log: app/debug_run_1.md
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvFromProjectRoot } from "./_load-env.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
loadEnvFromProjectRoot(ROOT);

const logPath = process.argv[2] || path.join(ROOT, "app", "debug_run_1.md");
const text = fs.readFileSync(logPath, "utf8");

// Extract run ID from the log header
const runMatch = text.match(/Run:\s+([a-f0-9-]{36})/);
const runId = runMatch ? runMatch[1] : `legacy-${Date.now()}`;

// Also pull airport info from the DB to fill in country/name — we'll look it up by ICAO later.
// For now collect: icao, step, state, detail from [error] lines.
const lines = text.split("\n");
const seen = new Map();

for (const line of lines) {
  const m = line.match(/\d{4}-\d{2}-\d{2}T[\d:.Z]+\s+\[error\]\s+([A-Z][A-Z0-9]{3})\s+(.*)/);
  if (!m) continue;
  const icao = m[1];
  const detail = m[2].slice(0, 400);

  let step = "aip";
  if (/GEN sync|GEN PDF|GEN 1\.2|No GEN/i.test(detail)) step = "gen";
  else if (/PDF HTTP|downloaded bytes|not a PDF/i.test(detail)) step = "pdf";
  else if (/NOTAM/i.test(detail)) step = "notam";
  else if (/weather/i.test(detail)) step = "weather";

  const state = /timeout/i.test(detail) ? "timeout" : "failed";
  const key = `${icao}|${step}`;
  if (!seen.has(key)) {
    seen.set(key, { run_id: runId, icao, country: "Unknown", name: "Unknown", step, state, detail, created_at: new Date().toISOString() });
  }
}

const rows = [...seen.values()];
console.log(`[seed] Run ID: ${runId}`);
console.log(`[seed] Rows to insert: ${rows.length}`);

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRole) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");

const { createClient } = await import("@supabase/supabase-js");
const supabase = createClient(supabaseUrl, serviceRole, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Try to enrich country/name from airports table
const uniqueIcaos = [...new Set(rows.map((r) => r.icao))];
const { data: airports } = await supabase.from("airports").select("icao,country,name").in("icao", uniqueIcaos);
const airportMap = new Map((airports ?? []).map((a) => [a.icao, a]));
for (const row of rows) {
  const ap = airportMap.get(row.icao);
  if (ap) { row.country = ap.country || "Unknown"; row.name = ap.name || "Unknown"; }
}

const BATCH = 200;
for (let i = 0; i < rows.length; i += BATCH) {
  const batch = rows.slice(i, i + BATCH);
  const { error } = await supabase.from("debug_run_failures").upsert(batch, { onConflict: "run_id,icao,step" });
  if (error) {
    if (/does not exist/i.test(error.message)) {
      console.error("[seed] ERROR: Table debug_run_failures does not exist.");
      console.error("Run this SQL in your Supabase SQL editor first:");
      console.error(`
create table if not exists debug_run_failures (
  run_id text not null, icao text not null, country text not null,
  name text not null default '', step text not null, state text not null,
  detail text, created_at timestamptz not null default now(),
  primary key (run_id, icao, step)
);
create index if not exists debug_run_failures_run_id_idx on debug_run_failures (run_id);
`);
      process.exit(1);
    }
    throw new Error(error.message);
  }
  console.log(`[seed] Inserted batch ${Math.floor(i / BATCH) + 1}/${Math.ceil(rows.length / BATCH)}`);
}

console.log(`[seed] Done. Run ID: ${runId}`);
console.log(`[seed] Unique failed ICAOs (${uniqueIcaos.length}):`);
console.log(uniqueIcaos.join(","));
