#!/usr/bin/env node
/**
 * Creates the debug_run_failures table in Supabase via the management API.
 * Run once: node scripts/tools/create-debug-run-failures-table.mjs
 *
 * Requires SUPABASE_PROJECT_REF and SUPABASE_ACCESS_TOKEN (personal access token)
 * OR NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY and DATABASE_URL for direct pg access.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvFromProjectRoot } from "./_load-env.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
loadEnvFromProjectRoot(ROOT);

const DDL = `
create table if not exists debug_run_failures (
  run_id     text        not null,
  icao       text        not null,
  country    text        not null,
  name       text        not null default '',
  step       text        not null,
  state      text        not null,
  detail     text,
  created_at timestamptz not null default now(),
  primary key (run_id, icao, step)
);
create index if not exists debug_run_failures_run_id_idx on debug_run_failures (run_id);
create index if not exists debug_run_failures_created_at_idx on debug_run_failures (created_at desc);
`;

async function tryViaMgmtApi() {
  const ref = process.env.SUPABASE_PROJECT_REF;
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!ref || !token) return false;
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: DDL }),
  });
  if (res.ok) { console.log("Table created via management API."); return true; }
  const body = await res.text();
  console.warn("Management API attempt failed:", res.status, body.slice(0, 200));
  return false;
}

async function tryViaPg() {
  const url = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  if (!url) return false;
  let Client;
  try { ({ Client } = await import("pg")); } catch { return false; }
  const client = new Client({ connectionString: url });
  await client.connect();
  await client.query(DDL);
  await client.end();
  console.log("Table created via direct pg connection.");
  return true;
}

async function main() {
  if (await tryViaMgmtApi()) return;
  if (await tryViaPg()) return;
  console.log(`
Could not auto-create table (no management API credentials or DATABASE_URL).
Run this SQL in your Supabase SQL editor:

${DDL}
`);
}

main().catch((err) => { console.error(err?.message || err); process.exit(1); });
