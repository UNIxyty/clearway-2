// Role permissions (docs/permissions.md), end to end on the rig, with sign-in ON in all three services:
//   portal  :3992  (rig/build-portal.sh; env -i … PORT=3992 DISABLE_AUTH_FOR_TESTING=false ADMIN_EMAILS= DEVELOPER_EMAILS= node --env-file=.env.rig .next/standalone/server.js)
//   wall    :5198  (rig/wall/access-check.mjs header)
//   agent   :5176  (cd agent && env -i … PORT=5176 DISABLE_AUTH_FOR_TESTING=false AGENT_TEST_ROLE= INTAKE_PIPELINE=off ADMIN_EMAILS= DEVELOPER_EMAILS= node --env-file=../.env.rig server.mjs)
// Three local accounts (made here): an ordinary user, an admin and a developer (user_preferences flags).
//   node --env-file=.env.rig rig/permissions-check.mjs
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ACTIONS, ENDPOINTS, ROLES, defaultGrants } from "../lib/permissions/catalogue.mjs";
import { checkCodeRoutes, checkPortal } from "../lib/permissions/check.mjs";

const PORTAL = "http://127.0.0.1:3992"; const WALL = "http://127.0.0.1:5198"; const AGENT = "http://127.0.0.1:5176";
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL; const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY; const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(String(SB))) { console.error("Refused: the rig's local Supabase only."); process.exit(2); }
let failures = 0;
const ok = (c, what, d = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${what}${d ? `  · ${String(d).slice(0, 180)}` : ""}`); if (!c) failures += 1; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sb = (p, init = {}) => fetch(`${SB}${p}`, { ...init, headers: { apikey: KEY, authorization: `Bearer ${KEY}`, "content-type": "application/json", ...(init.headers ?? {}) } });
const psql = (sql) => execFileSync("docker", ["exec", "-i", "supabase_db_rig", "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-tAq"], { input: sql }).toString().trim();

async function account(email, flags) {
  const password = "rig-access-check-only";
  const made = await (await sb("/auth/v1/admin/users", { method: "POST", body: JSON.stringify({ email, password, email_confirm: true }) })).json();
  let id = made.id;
  if (!id) id = (await (await sb("/auth/v1/admin/users?per_page=200")).json()).users.find((u) => u.email === email)?.id;
  await sb("/rest/v1/user_preferences?on_conflict=user_id", { method: "POST", headers: { prefer: "resolution=merge-duplicates" }, body: JSON.stringify({ user_id: id, is_admin: false, is_developer: false, ...flags }) });
  psql(`insert into agent_access (id, user_id, user_email, note) select (select coalesce(max(id), 0) + 1 from agent_access), '${id}', '${email}', 'rig permissions check' where not exists (select 1 from agent_access where user_id = '${id}' and revoked_at is null);`);
  const s = await (await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "content-type": "application/json" }, body: JSON.stringify({ email, password }) })).json();
  const ref = new URL(SB).hostname.split(".")[0];
  return { id, email, token: s.access_token, cookie: `sb-${ref}-auth-token=base64-${Buffer.from(JSON.stringify(s)).toString("base64")}` };
}
const call = async (base, who, method, p, body) => {
  const headers = { "content-type": "application/json", ...(who ? (base === PORTAL ? { cookie: who.cookie } : { authorization: `Bearer ${who.token}` }) : {}) };
  const r = await fetch(`${base}${p}`, { method, headers, redirect: "manual", ...(method === "GET" ? {} : { body: JSON.stringify(body ?? {}) }) });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
const grid = (who, changes) => call(PORTAL, who, "POST", "/api/admin/permissions", { changes });
const grants = () => JSON.parse(psql("select coalesce(json_agg(json_build_object('role', role, 'action', action, 'allowed', allowed)), '[]') from permission_grants"));
const logRows = (since) => JSON.parse(psql(`select coalesce(json_agg(json_build_object('actor', actor_email, 'role', role, 'action', action, 'allowed', allowed, 'via', via) order by id), '[]') from permission_changes where at >= '${since}'`));
const restore = () => {
  // From a copy whose .env is the rig's (the repo's .env is never read by a rig run).
  const dir = "rig/.scratch/perm-restore/lib/permissions"; fs.mkdirSync(dir, { recursive: true });
  for (const f of ["catalogue.mjs", "restore.mjs"]) fs.copyFileSync(`lib/permissions/${f}`, `${dir}/${f}`);
  fs.writeFileSync("rig/.scratch/perm-restore/.env", `NEXT_PUBLIC_SUPABASE_URL=${SB}\nSUPABASE_SERVICE_ROLE_KEY=${KEY}\n`);
  return execFileSync("node", [`${dir}/restore.mjs`], { env: { PATH: process.env.PATH } }).toString();
};

const user = await account("rig-access-user@rig.invalid", {});
const admin = await account("rig-access-admin@rig.invalid", { is_admin: true });
const dev = await account("rig-access-dev@rig.invalid", { is_developer: true });

console.log("\n=== 6. A fresh deploy changes nothing: the seed is exactly the defaults, the defaults exactly Group 1 ===");
psql("alter table permission_changes disable trigger permission_changes_append_only; delete from permission_grants; alter table permission_changes enable trigger permission_changes_append_only;");
psql(fs.readFileSync("docs/supabase-permissions.sql", "utf8"));
const d = defaultGrants();
const g = grants();
ok(g.length === ACTIONS.size * ROLES.length && g.every((r) => r.allowed === d[r.role].has(r.action)), `the SQL seed gives every role exactly its defaults (${g.length} cells)`);
// Group 1 per portal endpoint, read from the code BEFORE this change: requireDeveloper → developer; requireAdmin (or
// the preference-only admin check) → admin + developer; a session alone → everyone.
const BEFORE = "0c64a15";
// (A handler that falls back to requireAuthenticatedUser after requireAdmin — "an admin, or your own" — was open to everyone.)
const expectFor = (src) => /requireDeveloper\(\)/.test(src) ? ["developer"] : /requireAuthenticatedUser\(\)/.test(src) ? ["user", "admin", "developer"] : /requireAdmin\(\)|is_admin/.test(src) ? ["admin", "developer"] : ["user", "admin", "developer"];
let portalSame = 0; const portalDiff = [];
for (const e of ENDPOINTS.portal.filter((x) => !x.public && x.route !== "/api/admin/permissions")) {
  const old = execFileSync("git", ["show", `${BEFORE}:app${e.route}/route.ts`]).toString();
  const m = new RegExp(String.raw`export\s+(?:async\s+)?function\s+${e.method}\b`).exec(old);
  const rest = old.slice(m.index + 10); const end = rest.search(/\nexport\s/);
  const body = end < 0 ? rest : rest.slice(0, end);
  const want = expectFor(body).sort().join(",");
  const acts = e.any ?? [e.action];
  const have = [...new Set(acts.flatMap((a) => ACTIONS.get(a).default))].sort().join(",");
  if (want === have) portalSame += 1; else portalDiff.push(`${e.method} ${e.route}: before ${want}, now ${have}`);
}
ok(portalDiff.length === 0, `portal: every write endpoint's default roles equal what its code allowed before (${portalSame} endpoints)`, portalDiff.join(" | "));
const g1 = execFileSync("node", ["--env-file=.env.rig", "rig/wall/access-check.mjs"]).toString();
ok(/ALL PASSED/.test(g1), "wall: Group 1's own check passes unchanged against the seeded defaults (every write as user and admin)", g1.split("\n").filter((l) => l.startsWith("FAIL")).join(" | "));

const t0 = new Date().toISOString();
console.log("\n=== 1–2. An ops user granted 'delete aircraft' can delete an aircraft, still not operators; removed → refused ===");
// The auth-on rig wall has no live Leon flights, so the delete purges none; it still runs in full and hides the tail
// from every later sync (a row in the rig's aircraft visibility), which the test reads back and then undoes.
const tail = { oprId: "cwy-cwy", registration: "RIG-PERM" };
let r = await call(WALL, user, "DELETE", "/api/aircraft", { oprId: tail?.oprId ?? tail?.opr_id, registration: tail?.registration });
ok(r.status === 403 && r.body.permission === "wall.aircraft.delete", "before: the ops user is refused deleting an aircraft (default)", `${r.status}`);
r = await grid(admin, [{ role: "user", action: "wall.aircraft.delete", allowed: true }]);
ok(r.status === 200 && r.body.changed === 1, "an admin grants User 'Delete an aircraft' on the Permissions screen", `${r.status} ${r.body.error ?? ""}`);
await sleep(10_500);
r = await call(WALL, user, "DELETE", "/api/aircraft", { oprId: tail?.oprId ?? tail?.opr_id, registration: tail?.registration });
ok(r.status === 200 && r.body.ok === true, "the ops user deletes the aircraft (the server runs the delete)", `${r.status} purged ${r.body.purged}`);
const vis = (await call(WALL, admin, "GET", "/api/aircraft/visibility")).body;
ok(JSON.stringify(vis).includes("RIG-PERM"), "…the tail is now hidden from the wall (read back)");
await call(WALL, admin, "PUT", "/api/aircraft/visibility", { oprId: tail.oprId, registration: tail.registration, enabled: true });
for (const [m, p, b] of [["DELETE", "/api/operators/rig-none"], ["POST", "/api/operators", {}], ["PATCH", "/api/operators/rig-none", {}]]) {
  r = await call(WALL, user, m, p, b);
  ok(r.status === 403 && /^wall\.operators\./.test(r.body.permission ?? ""), `…and still cannot touch operators: ${m} ${p}`, `${r.status} ${r.body.permission}`);
}
r = await grid(admin, [{ role: "user", action: "wall.aircraft.delete", allowed: false }]);
ok(r.status === 200, "the admin takes the permission away again");
await sleep(10_500);
r = await call(WALL, user, "DELETE", "/api/aircraft", { oprId: tail?.oprId ?? tail?.opr_id, registration: tail?.registration });
ok(r.status === 403 && r.body.permission === "wall.aircraft.delete", "…and the SERVER refuses the ops user (a direct request, no console involved)", `${r.status}`);

console.log("\n=== 3. A brand-new endpoint with no entry is refused, and the checks catch it ===");
r = await call(WALL, admin, "POST", "/api/an-endpoint-added-later", {});
ok(r.status === 403 && /not in the permissions list/.test(r.body.error ?? ""), "wall: an unlisted write is refused, even for an admin", `${r.status}`);
r = await call(PORTAL, dev, "POST", "/api/an-endpoint-added-later", {});
ok(r.status === 403 && /not in the permissions list/.test(r.body.error ?? ""), "portal: an unlisted write is refused, even for a developer", `${r.status}`);
r = await call(AGENT, dev, "POST", "/api/an-endpoint-added-later", {});
ok(r.status === 403 && /not in the permissions list/.test(r.body.message ?? ""), "agent: an unlisted write is refused, even for a developer", `${r.status}`);
const wallSrc = fs.readFileSync("digital-wall/server.mjs", "utf8").replace('if (pathname === "/api/operators" && req.method === "POST")', 'if (pathname === "/api/new-thing" && req.method === "POST") { return; }\n    if (pathname === "/api/operators" && req.method === "POST")');
const wallProblems = checkCodeRoutes("wall", [wallSrc]);
ok(wallProblems.some((p) => p.includes("POST /api/new-thing has no entry")), "wall startup check: a new route with no entry fails it", wallProblems[0]);
const tmp = "rig/.scratch/perm-portal"; fs.rmSync(tmp, { recursive: true, force: true });
fs.cpSync("app", `${tmp}/app`, { recursive: true });
fs.mkdirSync(`${tmp}/app/api/new-thing`, { recursive: true });
fs.writeFileSync(`${tmp}/app/api/new-thing/route.ts`, "export async function POST() { return new Response('hi'); }\n");
const portalProblems = checkPortal(tmp);
ok(portalProblems.some((p) => p.includes("POST /api/new-thing")), "portal build check: a new route with no entry fails it", portalProblems[0]);
const cli = (() => { try { execFileSync("node", ["lib/permissions/check.mjs", "--code"], { stdio: "pipe" }); return "ok"; } catch (e) { return String(e.stdout ?? e.message); } })();
ok(cli === "ok", "…and the real code passes the same check (what the Dockerfile runs)");

console.log("\n=== 4. 'Manage permissions' cannot be taken from the developer role, by any route ===");
for (const [who, name] of [[admin, "an admin"], [dev, "a developer"]]) {
  r = await grid(who, [{ role: "developer", action: "permissions.manage", allowed: false }]);
  ok(r.status === 409, `the API refuses ${name}`, `${r.status} ${r.body.error ?? ""}`);
}
r = await sb("/rest/v1/rpc/permission_apply", { method: "POST", body: JSON.stringify({ p_changes: [{ role: "developer", action: "permissions.manage", allowed: false }], p_actor_id: null, p_actor_email: "rig", p_via: "rig" }) });
ok(!r.ok && /cannot be taken from the developer role/.test(await r.text()), "the database function refuses it even with the service key", `${r.status}`);
r = await fetch(`${SB}/rest/v1/permission_grants?role=eq.developer&action=eq.permissions.manage`, { method: "PATCH", headers: { apikey: ANON, authorization: `Bearer ${dev.token}`, "content-type": "application/json", prefer: "return=representation" }, body: JSON.stringify({ allowed: false }) });
ok(r.status === 401 || r.status === 403, "a signed-in session cannot write the grants table directly (no client access)", `${r.status}`);
ok(grants().find((x) => x.role === "developer" && x.action === "permissions.manage")?.allowed === true, "…and the developer role still holds it");

console.log("\n=== 5. Nobody removes their own; the last holder cannot be switched off ===");
r = await grid(admin, [{ role: "admin", action: "permissions.manage", allowed: false }]);
ok(r.status === 409 && /own role/.test(r.body.error ?? ""), "an admin cannot take it from their own role", `${r.status} ${r.body.error ?? ""}`);
r = await grid(dev, [{ role: "admin", action: "permissions.manage", allowed: false }]);
ok(r.status === 200, "a developer may take it from Admin (Developer still holds it)", `${r.status}`);
r = await grid(dev, [{ role: "developer", action: "permissions.manage", allowed: false }]);
ok(r.status === 409, "…but not from Developer, now the last role holding it", `${r.status} ${r.body.error ?? ""}`);
r = await sb("/rest/v1/rpc/permission_apply", { method: "POST", body: JSON.stringify({ p_changes: [{ role: "user", action: "permissions.manage", allowed: false }], p_actor_id: null, p_actor_email: "rig", p_via: "rig" }) });
ok(r.ok, "(sanity) the database function applies an ordinary change");
await sleep(10_500);
r = await call(PORTAL, admin, "GET", "/api/admin/permissions");
ok(r.status === 403, "Admin, without the permission, can no longer open the screen", `${r.status}`);
r = await grid(dev, [{ role: "admin", action: "permissions.manage", allowed: true }]);
ok(r.status === 200, "the developer gives it back");

console.log("\n=== No escalation ===");
r = await call(PORTAL, user, "GET", "/api/admin/permissions");
ok(r.status === 403, "an ops user cannot open the grid", `${r.status}`);
r = await grid(user, [{ role: "user", action: "wall.operators.delete", allowed: true }]);
ok(r.status === 403, "an ops user cannot grant themselves anything (refused by the middleware and the handler)", `${r.status}`);
await grid(admin, [{ role: "user", action: "portal.users.set-admin", allowed: true }]);
await sleep(10_500);
r = await call(PORTAL, user, "POST", "/api/admin/users", { userId: dev.id, isAdmin: true });
ok(r.status === 403, "an ops role given 'make someone an admin' still cannot (it needs Manage permissions too)", `${r.status} ${r.body.error ?? ""}`);
r = await call(PORTAL, admin, "POST", "/api/admin/users", { userId: admin.id, isAdmin: false });
ok(r.status === 400 && /own role/.test(r.body.error ?? ""), "nobody changes their own role", `${r.status} ${r.body.error ?? ""}`);

console.log("\n=== Intake reveal and knowledge-base uploads are permissions ===");
const reqId = psql("select id from intake_requests where reference = 'RIGPAX19' limit 1");
r = await call(AGENT, user, "POST", `/api/intake/requests/${reqId}/people/reveal`, {});
ok(r.status === 403 && r.body.permission === "intake.people.reveal", "a User cannot reveal a passenger's personal data (default off)", `${r.status}`);
r = await call(AGENT, user, "GET", `/api/intake/requests/${reqId}/people`);
ok(r.body.canReveal === false, "…and the review screen is told so (no Show personal data button)");
r = await call(AGENT, admin, "POST", `/api/intake/requests/${reqId}/people/reveal`, {});
ok(r.status === 200 && r.body.masked === false, "an Admin can (default on), and it is logged as before", `${r.status}`);
const docs = JSON.parse(psql("select coalesce(json_agg(json_build_object('status', status, 'by', uploaded_by_email)), '[]') from agent_documents"));
const hidden = docs.filter((x) => x.status !== "indexed" && x.status !== "approved").length;
const uDocs = (await call(AGENT, user, "GET", "/api/knowledge/documents")).body.documents ?? [];
const dDocs = (await call(AGENT, dev, "GET", "/api/knowledge/documents")).body.documents ?? [];
ok(uDocs.every((x) => x.status === "indexed" || x.status === "approved") && uDocs.every((x) => !x.uploaded_by_email), `a User sees approved documents only, without who uploaded them (${uDocs.length} shown, ${hidden} not approved in the rig)`);
ok(dDocs.length >= uDocs.length && (hidden === 0 || dDocs.some((x) => x.status !== "indexed" && x.status !== "approved")), `a Developer sees the others' pending/rejected uploads too (${dDocs.length})`);

console.log("\n=== Every change in the grid is a log row naming the person ===");
const rows = logRows(t0);
const screen = rows.filter((x) => x.via === "screen");
ok(screen.length >= 5 && screen.every((x) => [admin.email, dev.email].includes(x.actor)), `${screen.length} grid changes, each naming who made it`, screen.map((x) => `${x.actor}: ${x.allowed ? "+" : "-"}${x.role} ${x.action}`).slice(0, 4).join(" | "));
r = await sb(`/rest/v1/permission_changes?id=gt.0`, { method: "DELETE" });
ok(!r.ok, "the history cannot be deleted, even with the service key", `${r.status}`);

console.log("\n=== 7. The server-side restore command ===");
await grid(admin, [{ role: "user", action: "wall.caa.delete", allowed: true }, { role: "admin", action: "wall.imp.purge", allowed: false }]);
const out = restore();
const after = grants();
ok(/Restored the defaults: \d+ change/.test(out) && after.every((x) => !ACTIONS.has(x.action) || x.allowed === d[x.role].has(x.action)), "scripts/permissions-restore.sh puts every role back to the defaults", out.trim().split("\n").pop());
ok(logRows(t0).some((x) => x.via === "server-restore" && x.actor === "server: scripts/permissions-restore.sh"), "…and its changes are in the history as server-restore");
ok(/exactly the defaults/.test(restore()), "run again, it has nothing to do");

console.log(`\n${failures ? `${failures} FAILED` : "ALL PASSED"}`);
process.exit(failures ? 1 : 0);
