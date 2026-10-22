// A temporary or not-yet-approved account reaches nothing, in all three services (2026-10-21). The portal's middleware
// always sent such an account to /access-blocked or /pending-approval; the wall and the agent are reached past that
// middleware (Cloudflare routes /digital-wall and /agent/api to their own services), and until today they answered any
// valid session — a temporary (retired Pick'em guest) account could read every operator's flights from the wall.
// On the sign-in rig, as the plain rig user given each label in app_metadata by the service key:
//   - portal: a page → 307 to the holding page, an API → 403;
//   - agent: 401, before the allowlist is asked (the rig user IS on the allowlist, so this proves the new gate);
//   - wall: 401 for every read, by cookie and by bearer token, and for a write.
// Restores the account at the end.
//   node --env-file=.env.rig rig/temporary-access-check.mjs
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL, ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(String(SB))) { console.error("Refused: the rig's local Supabase only."); process.exit(2); }
const B = "http://127.0.0.1:3989";
let failures = 0; const ok = (c, what, d = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${what}${d ? `  · ${String(d).slice(0, 160)}` : ""}`); if (!c) failures += 1; };
const EMAIL = "rig-access-user@rig.invalid", PASSWORD = "rig-access-check-only";
const grant = async () => (await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "content-type": "application/json" }, body: JSON.stringify({ email: EMAIL, password: PASSWORD }) })).json();
const cookieOf = (s) => `sb-${new URL(SB).hostname.split(".")[0]}-auth-token=base64-${Buffer.from(JSON.stringify(s)).toString("base64")}`;
const setApp = (uid, app_metadata) => fetch(`${SB}/auth/v1/admin/users/${uid}`, { method: "PUT", headers: { apikey: SVC, authorization: `Bearer ${SVC}`, "content-type": "application/json" }, body: JSON.stringify({ app_metadata }) });
const ask = async (s, path, init = {}) => { const r = await fetch(`${B}${path}`, { ...init, headers: { ...(init.headers ?? {}), cookie: cookieOf(s) }, redirect: "manual" }); return { status: r.status, location: r.headers.get("location") || "", body: await r.text() }; };

let s = await grant(); const uid = s.user?.id; if (!uid) { console.error("the rig user could not sign in"); process.exit(2); }
// The sign-in wall fills its timeline from the mock Leon after it starts: give a freshly restarted one up to 90 s.
let before = await ask(s, "/digital-wall/api/timeline/flights?allOperators=true");
for (let i = 0; i < 18 && before.status !== 200; i += 1) { await new Promise((r) => setTimeout(r, 5000)); before = await ask(s, "/digital-wall/api/timeline/flights?allOperators=true"); }
ok(before.status === 200, "before: the plain rig user reads the wall's timeline (200)", `${before.status} ${before.body.slice(0, 80)}`);

for (const [label, meta, holding] of [
  ["temporary", { role: "temporary", is_temporary: true, is_approved: true }, "/access-blocked"],
  ["not yet approved", { is_approved: false }, "/pending-approval"],
]) {
  await setApp(uid, meta); s = await grant();
  const page = await ask(s, "/dashboard");
  ok(page.status === 307 && page.location.includes(holding), `${label} · portal page → ${holding}`, `${page.status} ${page.location}`);
  const api = await ask(s, "/api/notams?icao=EVRA");
  ok(api.status === 403 || (api.status === 307 && api.location.includes(holding)), `${label} · portal API refused`, `${api.status}`);
  for (const p of ["/agent/api/intake/requests", "/agent/api/settings", "/agent/api/flights/artlw:1/passengers"]) {
    const r = await ask(s, p); ok(r.status === 401, `${label} · agent ${p} → 401`, `${r.status} ${r.body.slice(0, 80)}`);
  }
  for (const p of ["/digital-wall/api/timeline/flights?allOperators=true", "/digital-wall/api/flights/normalized", "/digital-wall/api/notam-check/today", "/digital-wall/api/timeline/limitations"]) {
    const r = await ask(s, p); ok(r.status === 401, `${label} · wall ${p.replace("/digital-wall/api", "")} → 401`, `${r.status} ${r.body.length}B`);
  }
  const bearer = await fetch(`${B}/digital-wall/api/timeline/flights?allOperators=true`, { headers: { authorization: `Bearer ${s.access_token}` } });
  ok(bearer.status === 401, `${label} · wall by bearer token, no cookie → 401`, bearer.status);
  const write = await ask(s, "/digital-wall/api/display/clocks", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ clocks: [] }) });
  ok(write.status === 401, `${label} · wall write → 401 (not 403: nobody, not a user without a grant)`, write.status);
}

await setApp(uid, { role: null, is_temporary: null, is_approved: null }); s = await grant();
const after = await ask(s, "/digital-wall/api/timeline/flights?allOperators=true");
ok(after.status === 200, "restored: the plain rig user reads the wall again (200)", after.status);
console.log(failures ? `${failures} FAILED` : "ALL PASSED");
process.exit(failures ? 1 : 0);
