// The way back from the server (docs/permissions.md): puts every role's permissions back to the defaults in
// lib/permissions/catalogue.mjs — exactly what each endpoint allowed when permissions became data. For the day the
// Permissions screen itself cannot be reached. Goes through public.permission_apply, so every change it makes is in
// the history, as "server-restore".
//
//   cd /root/clearway-2 && sh scripts/permissions-restore.sh            restore (says what it changed)
//   cd /root/clearway-2 && sh scripts/permissions-restore.sh --dry-run  only list what differs
//
// Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from the environment, or from the repo's .env.
// Plain Node (18+), no packages: it runs on the host even when every container is down.
import fs from "node:fs";
import path from "node:path";
import { ACTIONS, ROLES, defaultGrants } from "./catalogue.mjs";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
function fromDotEnv(name) {
  const file = path.join(root, ".env");
  if (!fs.existsSync(file)) return "";
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (m && m[1] === name) return m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
  return "";
}
const url = String(process.env.NEXT_PUBLIC_SUPABASE_URL || fromDotEnv("NEXT_PUBLIC_SUPABASE_URL")).trim().replace(/\/+$/, "");
const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || fromDotEnv("SUPABASE_SERVICE_ROLE_KEY")).trim();
if (!url || !key) { console.error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not found (environment or .env)."); process.exit(2); }
const dry = process.argv.includes("--dry-run");
const headers = { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" };

const r = await fetch(`${url}/rest/v1/permission_grants?select=role,action,allowed`, { headers });
if (!r.ok) { console.error(`Could not read permission_grants (${r.status}): ${(await r.text()).slice(0, 300)}`); process.exit(1); }
const rows = await r.json();
const d = defaultGrants();
const changes = [];
for (const action of ACTIONS.keys()) for (const role of ROLES) {
  const want = d[role].has(action);
  const row = rows.find((x) => x.role === role && x.action === action);
  if (!row || row.allowed !== want) changes.push({ role, action, allowed: want });
}
for (const c of changes) console.log(`  ${c.allowed ? "grant " : "remove"}  ${c.role.padEnd(9)} ${c.action}`);
if (!changes.length) { console.log("Permissions are exactly the defaults. Nothing to do."); process.exit(0); }
if (dry) { console.log(`\nDry run: ${changes.length} cell(s) differ from the defaults. Nothing was changed.`); process.exit(0); }

const a = await fetch(`${url}/rest/v1/rpc/permission_apply`, {
  method: "POST", headers,
  body: JSON.stringify({ p_changes: changes, p_actor_id: null, p_actor_email: "server: scripts/permissions-restore.sh", p_via: "server-restore" }),
});
if (!a.ok) { console.error(`Restore failed (${a.status}): ${(await a.text()).slice(0, 300)}`); process.exit(1); }
console.log(`\nRestored the defaults: ${await a.json()} change(s), each logged in the history. Services pick it up within 10 seconds.`);
