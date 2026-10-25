// Nobody can promote or approve themselves (2026-10-20). Supabase lets a signed-in person edit their own user_metadata
// (auth.updateUser); the portal, the agent and the wall used to read roles and the approval flag from it. Now only
// app_metadata (service-key writes), DEVELOPER_EMAILS and user_preferences count. On the sign-in-on rig, as a plain user:
//   - write role: "developer", roles: ["admin"], is_admin, is_developer, is_approved: true into user_metadata, refresh
//     the session, and the portal still says user (admin status false, developer inbox 403), the agent refuses an
//     admin read (settings/permissions 403), the wall refuses an admin write (display/clocks 403);
//   - with app_metadata.is_approved = false set by the service key, the portal sends the person to /pending-approval even
//     while their own user_metadata says approved; set back to true, they are in again.
//   node --env-file=.env.rig rig/self-promotion-check.mjs
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL, ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(String(SB))) { console.error("Refused: the rig's local Supabase only."); process.exit(2); }
const B = "http://127.0.0.1:3989";
let failures = 0; const ok = (c, what, d = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${what}${d ? `  · ${String(d).slice(0, 200)}` : ""}`); if (!c) failures += 1; };
const EMAIL = "rig-access-user@rig.invalid", PASSWORD = "rig-access-check-only";
const grant = async (body) => (await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "content-type": "application/json" }, body: JSON.stringify(body) })).json();
const refresh = async (s) => (await fetch(`${SB}/auth/v1/token?grant_type=refresh_token`, { method: "POST", headers: { apikey: ANON, "content-type": "application/json" }, body: JSON.stringify({ refresh_token: s.refresh_token }) })).json();
const cookieOf = (s) => `sb-${new URL(SB).hostname.split(".")[0]}-auth-token=base64-${Buffer.from(JSON.stringify(s)).toString("base64")}`;
const asUser = (s, path, init = {}) => fetch(`${B}${path}`, { ...init, headers: { ...(init.headers ?? {}), cookie: cookieOf(s) }, redirect: "manual" });
const setOwnMeta = (s, data) => fetch(`${SB}/auth/v1/user`, { method: "PUT", headers: { apikey: ANON, authorization: `Bearer ${s.access_token}`, "content-type": "application/json" }, body: JSON.stringify({ data }) });
const setAppMeta = (uid, app_metadata) => fetch(`${SB}/auth/v1/admin/users/${uid}`, { method: "PUT", headers: { apikey: SVC, authorization: `Bearer ${SVC}`, "content-type": "application/json" }, body: JSON.stringify({ app_metadata }) });

let s = await grant({ email: EMAIL, password: PASSWORD });
const uid = s.user?.id; if (!uid) { console.error("the rig user could not sign in"); process.exit(2); }
const status = async (sess) => (await asUser(sess, "/api/admin/status")).json();
ok(JSON.stringify(await status(s)) === '{"isAdmin":false,"isDeveloper":false}', "before: the rig user is a user", JSON.stringify(await status(s)));

// 1. the person writes every role claim there is into their own metadata
const w = await setOwnMeta(s, { role: "developer", roles: ["admin", "developer"], is_admin: true, is_developer: true, is_approved: true, is_temporary: false });
ok(w.ok, "Supabase accepts the person's own user_metadata write (that is the hole; the services must not believe it)", String(w.status));
s = await refresh(s);
ok(JSON.stringify(await status(s)) === '{"isAdmin":false,"isDeveloper":false}', "portal: still a user after claiming developer in user_metadata", JSON.stringify(await status(s)));
ok((await asUser(s, "/api/help/inbox")).status === 403, "portal: the developer inbox refuses them (403)");
ok((await asUser(s, "/api/admin/users")).status === 403, "portal: Admin › Users refuses them (403)");
ok((await asUser(s, "/agent/api/settings/permissions")).status === 403, "agent: an admin read refuses them (403)");
ok((await asUser(s, "/digital-wall/api/display/clocks", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ clocks: [] }) })).status === 403, "wall: an admin write refuses them (403)");
ok((await asUser(s, "/agent/api/usage")).status === 403, "agent: usage (admin) refuses them (403)");

// 2. approval lives in app_metadata: the service key says pending, the person's own say-so does not lift it
await setAppMeta(uid, { is_approved: false });
s = await refresh(s);
const pend = await asUser(s, "/aip/EVRA");
ok(pend.status === 307 && /\/pending-approval/.test(pend.headers.get("location") || ""), "pending in app_metadata: a page sends them to /pending-approval", `${pend.status} ${pend.headers.get("location")}`);
await setOwnMeta(s, { is_approved: true }); s = await refresh(s);
const pend2 = await asUser(s, "/aip/EVRA");
ok(pend2.status === 307 && /\/pending-approval/.test(pend2.headers.get("location") || ""), "…and writing is_approved: true into their own user_metadata changes nothing", `${pend2.status} ${pend2.headers.get("location")}`);
await setAppMeta(uid, { is_approved: true }); s = await refresh(s);
const back = await asUser(s, "/aip/EVRA");
ok(back.status !== 307 || !/\/pending-approval/.test(back.headers.get("location") || ""), "approved by the service key: they are in again", `${back.status}`);

// put the account back as it was
await setOwnMeta(s, { role: null, roles: null, is_admin: null, is_developer: null, is_approved: null, is_temporary: null });
await setAppMeta(uid, { is_approved: true }); // approval is explicit now; a missing flag is not approved
s = await refresh(s);
ok(JSON.stringify(await status(s)) === '{"isAdmin":false,"isDeveloper":false}', "restored: a user again");
console.log(failures ? `${failures} FAILED` : "ALL PASSED");
process.exit(failures ? 1 : 0);
