#!/usr/bin/env node
/**
 * Creates the Help Centre tables in Supabase (migrations/20260917_create_help_centre.sql).
 * Run once: node scripts/tools/create-help-centre-tables.mjs
 *
 * Requires SUPABASE_PROJECT_REF and SUPABASE_ACCESS_TOKEN (personal access token)
 * OR DATABASE_URL / SUPABASE_DB_URL for direct pg access. Otherwise it prints
 * the SQL to paste into the Supabase SQL editor.
 */
import path from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadEnvFromProjectRoot } from "./_load-env.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
loadEnvFromProjectRoot(ROOT);

const DDL = readFileSync(path.join(ROOT, "migrations", "20260917_create_help_centre.sql"), "utf-8");

async function tryViaMgmtApi() {
  const ref = process.env.SUPABASE_PROJECT_REF;
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!ref || !token) return false;
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: DDL }),
  });
  if (res.ok) { console.log("Help Centre tables created via management API."); return true; }
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
  console.log("Help Centre tables created via direct pg connection.");
  return true;
}

async function main() {
  if (await tryViaMgmtApi()) return;
  if (await tryViaPg()) return;
  console.log(`
Could not auto-create tables (no management API credentials or DATABASE_URL).
Run migrations/20260917_create_help_centre.sql in your Supabase SQL editor:

${DDL}
`);
}

main().catch((err) => { console.error(err?.message || err); process.exit(1); });
