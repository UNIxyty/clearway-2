// Portal foundations, Group 1 on the portal side: 1.2 maintenance lockout, 1.3 the dashboard changelog's scope, 1.5
// what is served without sign-in. Runs against a rig portal build started with sign-in ON, and the two local accounts
// rig/wall/access-check.mjs makes (an admin by user_preferences.is_admin, and an ordinary user):
//   rig/build-portal.sh
//   (env -i PATH="$PATH" HOME="$HOME" PORT=3992 HOSTNAME=127.0.0.1 DISABLE_AUTH_FOR_TESTING=false ADMIN_EMAILS= DEVELOPER_EMAILS= \
//     node --env-file=.env.rig .next/standalone/server.js &)
//   node --env-file=.env.rig rig/portal-foundations-check.mjs
// Optional: RIG_PORTAL_FORCE_OFF_URL — a second instance started with MAINTENANCE_FORCE_OFF=true.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, copyFileSync } from "node:fs";
const BASE = process.env.RIG_PORTAL_AUTH_URL || "http://127.0.0.1:3992";
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(String(SB))) { console.error("Refused: the rig's local Supabase only."); process.exit(2); }

let failures = 0;
const ok = (c, what, d = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${what}${d ? `  · ${String(d).slice(0, 160)}` : ""}`); if (!c) failures += 1; };
const sb = (p, init = {}) => fetch(`${SB}${p}`, { ...init, headers: { apikey: KEY, authorization: `Bearer ${KEY}`, "content-type": "application/json", ...(init.headers ?? {}) } });

async function session(email) {
  const s = await (await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "content-type": "application/json" }, body: JSON.stringify({ email, password: "rig-access-check-only" }) })).json();
  if (!s.access_token) throw new Error(`sign in ${email} (run rig/wall/access-check.mjs first)`);
  const ref = new URL(SB).hostname.split(".")[0];
  return { token: s.access_token, user: s.user, cookie: `sb-${ref}-auth-token=base64-${Buffer.from(JSON.stringify(s)).toString("base64")}` };
}
const get = async (path, who, base = BASE) => {
  const r = await fetch(`${base}${path}`, { redirect: "manual", headers: who ? { cookie: who.cookie } : {} });
  const loc = r.headers.get("location"); return { status: r.status, to: loc ? new URL(loc, base).pathname + new URL(loc, base).search : null, r };
};
const post = async (path, who, body) => {
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers: { cookie: who.cookie, "content-type": "application/json" }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
const setMaintenance = async (enabled) => sb("/rest/v1/maintenance", { method: "POST", headers: { prefer: "return=minimal" }, body: JSON.stringify({ enabled, message: "rig check", updated_at: new Date().toISOString() }) });

const user = await session("rig-access-user@rig.invalid");
const admin = await session("rig-access-admin@rig.invalid");

// ── 1.5 What is served without sign-in ──
for (const p of ["/bug-report.html", "/country-scraper-tracker.html", "/ead-countries-web-aip.html", "/wc2026-match-check.html", "/wc2026-hardcoded-matches.json", "/ead-country-icaos.json", "/aip/X.json", "/.DS_Store"]) {
  const r = await get(p);
  ok(r.status === 307 && r.to?.startsWith("/login"), `no session: ${p} → sign-in`, `${r.status} ${r.to ?? ""}`);
}
for (const p of ["/PFP.png", "/pdf.worker.min.mjs", "/voice-worklet.js"]) {
  const r = await get(p);
  ok(r.status === 200, `no session: static asset ${p} still served`, `${r.status}`);
}
const tool = await get("/country-scraper-tracker.html", user);
ok(tool.status === 200, "signed in: the internal tools still open", `${tool.status}`);
ok((await get("/wc2026-match-check.html", user)).status === 404, "the World Cup check page is deleted");

// ── 1.2 Maintenance ──
await setMaintenance(true);
let r = await get("/");
ok(r.to === "/maintenance", "maintenance on, no session: / → /maintenance", r.to);
r = await get("/login");
ok(r.status === 200, "maintenance on: /login is reachable", `${r.status} ${r.to ?? ""}`);
r = await get("/maintenance");
const page = await r.r.text();
ok(r.status === 200 && page.includes("/login?next=%2Fadmin%2Fmaintenance"), "the maintenance page links admins to sign-in → the off switch");
r = await get("/admin/maintenance");
ok(r.to?.startsWith("/login") && r.to.includes("next=%2Fadmin%2Fmaintenance"), "no session: /admin/maintenance → sign-in, then back", r.to);
r = await get("/", user);
ok(r.to === "/maintenance", "ordinary user: / → /maintenance", r.to);
r = await get("/admin/maintenance", user);
ok(r.to === "/maintenance", "ordinary user: the off switch → /maintenance", r.to);
r = await get("/", admin);
ok(r.to === "/admin/maintenance", "admin who signs in: / → /admin/maintenance (the page that turns it off)", r.to);
r = await get("/login?next=%2F", admin);
ok(r.status === 307, "admin on /login: bounced on (and the gate then sends them to the off switch)", `${r.status} ${r.to}`);
r = await get("/admin/maintenance", admin);
ok(r.status === 200, "admin: /admin/maintenance renders", `${r.status} ${r.to ?? ""}`);
let w = await post("/api/admin/maintenance", user, { enabled: false });
ok(w.status === 403, "ordinary user cannot turn it off through the API", `${w.status}`);
w = await post("/api/admin/maintenance", admin, { enabled: true });
ok(w.status === 403, "an admin (not developer) cannot turn it ON", `${w.status} ${w.body.error ?? ""}`);
const direct = await fetch(`${SB}/rest/v1/maintenance`, { method: "POST", headers: { apikey: ANON, authorization: `Bearer ${user.token}`, "content-type": "application/json", prefer: "return=minimal" }, body: JSON.stringify({ enabled: false }) });
ok(direct.status === 401 || direct.status === 403, "a signed-in user can no longer write the maintenance table straight through Supabase", `${direct.status}`);
w = await post("/api/admin/maintenance", admin, { enabled: false });
ok(w.status === 200, "admin turns it off", `${w.status} ${w.body.error ?? ""}`);
r = await get("/", user);
ok(r.to !== "/maintenance", "…and ordinary users are back in", r.to ?? String(r.status));

// The server-side way out: scripts/maintenance-off.sh, run from a copy whose .env is the rig's (never the repo's .env).
await setMaintenance(true);
const dir = "rig/.scratch/maint-off"; mkdirSync(`${dir}/scripts`, { recursive: true });
copyFileSync("scripts/maintenance-off.sh", `${dir}/scripts/maintenance-off.sh`);
writeFileSync(`${dir}/.env`, `NEXT_PUBLIC_SUPABASE_URL=${SB}\nSUPABASE_SERVICE_ROLE_KEY=${KEY}\n`);
const out = execFileSync("sh", [`${dir}/scripts/maintenance-off.sh`]).toString();
r = await get("/", user);
ok(/Maintenance is off/.test(out) && r.to !== "/maintenance", "scripts/maintenance-off.sh turns it off from the server", out.trim());
if (process.env.RIG_PORTAL_FORCE_OFF_URL) {
  await setMaintenance(true);
  r = await get("/", user, process.env.RIG_PORTAL_FORCE_OFF_URL);
  ok(r.to !== "/maintenance", "MAINTENANCE_FORCE_OFF=true ignores the flag", r.to ?? String(r.status));
  await setMaintenance(false);
}

// ── 1.3 The dashboard changelog ──
const stamp = new Date().toISOString();
for (const [who, label] of [[user, "rig-user-change"], [admin, "rig-admin-change"]]) {
  await sb("/rest/v1/agent_actions", { method: "POST", headers: { prefer: "return=minimal" }, body: JSON.stringify({ user_id: who.user.id, user_email: who.user.email, tool_name: "update_limitation", target_kind: "limitation", target_label: label, created_at: stamp }) });
}
const feed = async (who) => (await fetch(`${BASE}/api/dashboard/changelog`, { headers: { cookie: who.cookie } })).json();
const fu = await feed(user); const fa = await feed(admin);
const labels = (f) => (f.entries ?? []).map((e) => e.summary).join(" | ");
ok(fu.scope === "mine" && /rig-user-change/.test(labels(fu)) && !/rig-admin-change/.test(labels(fu)), "ordinary user: only their own activity (scope mine)", labels(fu));
ok(fa.scope === "everyone" && /rig-user-change/.test(labels(fa)) && /rig-admin-change/.test(labels(fa)), "admin: everyone's activity (scope everyone)");
// agent_actions is append-only (a trigger refuses deletes): the two labelled rows stay in the rig's database.

console.log(`\n${failures ? `${failures} FAILED` : "ALL PASSED"}`);
process.exit(failures ? 1 : 0);
