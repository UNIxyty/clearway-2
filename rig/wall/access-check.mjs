// Portal foundations 1.1: who may write on the wall. Runs against a SECOND rig wall started with sign-in ON (the rig's
// normal wall runs with DISABLE_AUTH_FOR_TESTING, where everyone is the mock admin). Two local accounts are made on the
// rig's own Supabase — an admin (user_preferences.is_admin) and an ordinary user — and every write endpoint is called
// as each. Bodies are empty or point at ids that do not exist, so nothing real changes; only the gate is checked.
//
//   mkdir -p rig/.scratch/wall-auth && (cd rig/.scratch/wall-auth && env -i PATH="$PATH" HOME="$HOME" PORT=5198 \
//     DISABLE_AUTH_FOR_TESTING=false ADMIN_EMAILS= DEVELOPER_EMAILS= node --env-file=../../../.env.rig ../../../digital-wall/server.mjs &)
//   node --env-file=.env.rig rig/wall/access-check.mjs
const WALL = process.env.RIG_WALL_AUTH_URL || "http://127.0.0.1:5198";
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(String(SB))) { console.error("Refused: the rig's local Supabase only."); process.exit(2); }

let failures = 0;
const ok = (c, what, d = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${what}${d ? `  · ${String(d).slice(0, 160)}` : ""}`); if (!c) failures += 1; };
const sb = (p, init = {}) => fetch(`${SB}${p}`, { ...init, headers: { apikey: KEY, authorization: `Bearer ${KEY}`, "content-type": "application/json", ...(init.headers ?? {}) } });

async function account(email, isAdmin) {
  const password = "rig-access-check-only";
  const made = await sb("/auth/v1/admin/users", { method: "POST", body: JSON.stringify({ email, password, email_confirm: true }) });
  let id = (await made.json()).id;
  if (!id) {
    const list = await (await sb("/auth/v1/admin/users?per_page=200")).json();
    id = list.users.find((u) => u.email === email)?.id;
  }
  await sb("/rest/v1/user_preferences?on_conflict=user_id", { method: "POST", headers: { prefer: "resolution=merge-duplicates" }, body: JSON.stringify({ user_id: id, is_admin: isAdmin, is_developer: false }) });
  const s = await (await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: KEY, "content-type": "application/json" }, body: JSON.stringify({ email, password }) })).json();
  if (!s.access_token) throw new Error(`could not sign in ${email}`);
  return s.access_token;
}

const call = async (token, method, path, body) => {
  const r = await fetch(`${WALL}${path}`, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, ...(method === "GET" ? {} : { body: JSON.stringify(body ?? {}) }) });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};

const ADMIN_ONLY = [
  ["POST", "/api/device/approve"], ["POST", "/api/device/revoke"],
  ["PATCH", "/api/display/devices/rig-none"], ["DELETE", "/api/display/devices/rig-none"],
  ["PUT", "/api/display/clocks"],
  ["POST", "/api/operators"], ["PATCH", "/api/operators/rig-none"], ["DELETE", "/api/operators/rig-none"],
  ["PUT", "/api/aircraft/visibility"], ["DELETE", "/api/aircraft"],
  ["POST", "/api/webhooks/toggle"], ["POST", "/api/webhooks/reregister"], ["DELETE", "/api/webhooks/rig-none"],
  ["PUT", "/api/alerts/rules"], ["POST", "/api/alerts/scan"],
  ["PUT", "/api/notam-check/digest-config"], ["POST", "/api/notam-check/run"],
  ["POST", "/api/admin/refresh-flight-weather"], ["POST", "/api/admin/clear-flight-cache"], ["POST", "/api/admin/reset-important-reviews"],
  ["POST", "/api/important"], ["PATCH", "/api/important/rig-none"], ["DELETE", "/api/important/rig-none"],
  ["POST", "/api/important/rig-none/restore"], ["DELETE", "/api/important/rig-none/purge"],
  ["POST", "/api/important/rig-none/attachments"], ["DELETE", "/api/important/rig-none/attachments/rig-none"],
  ["POST", "/api/caa"], ["PATCH", "/api/caa/rig-none"], ["DELETE", "/api/caa/rig-none"],
  ["POST", "/api/timeline/limitations"], ["PATCH", "/api/timeline/limitations/rig-none"], ["DELETE", "/api/timeline/limitations/rig-none"],
  ["POST", "/api/timeline/limitations/rig-none/restore"], ["DELETE", "/api/timeline/limitations/rig-none/purge"],
  ["PUT", "/api/reports/config"], ["DELETE", "/api/reports/rig-none"], ["POST", "/api/reports/rig-none/restore"], ["DELETE", "/api/reports/rig-none/purge"],
  ["POST", "/api/an-endpoint-added-later"], // default deny: an unlisted write is admin-only
];
// Open to any signed-in user. Bodies make them fail validation (or touch only the caller's own view).
const USER_OK = [
  ["POST", "/api/display/env", {}],
  ["PUT", "/api/display/settings", { settings: { scale: 1.2 } }],
  ["DELETE", "/api/display/settings/profile/me"],
  ["POST", "/api/display/overlay", { action: "close" }],
  ["POST", "/api/flight-checks", {}],
  ["POST", "/api/notam-check/ack", {}],
  ["POST", "/api/aip/send", { flightNid: "rig-none" }],
  ["POST", "/api/reports", {}],
  ["PATCH", "/api/reports/rig-none", { status: "done" }],
  ["POST", "/api/reports/rig-none/send", { to: [] }],
];

const user = await account("rig-access-user@rig.invalid", false);
const admin = await account("rig-access-admin@rig.invalid", true);

const me = await call(user, "GET", "/api/user");
const meA = await call(admin, "GET", "/api/user");
ok(me.status === 200 && me.body.user?.permRole === "user" && me.body.user?.can?.["wall.operators.delete"] === false && me.body.user?.can?.["wall.myview"] === true && !("claims" in me.body.user), "an ordinary user's /api/user: role user, and what they may do (no raw claims)");
ok(meA.body.user?.permRole === "admin" && meA.body.user?.can?.["wall.operators.delete"] === true, "the admin's /api/user: role admin (from user_preferences.is_admin), with the admin actions");
const authMe = await call(user, "GET", "/api/auth/me");
ok(authMe.body.user?.permRole === "user" && authMe.body.user?.can?.["wall.aircraft.delete"] === false, "/api/auth/* reports the role and permissions to the console", JSON.stringify(authMe.body.user ?? {}).slice(0, 120));

for (const [m, p] of ADMIN_ONLY) {
  const r = await call(user, m, p);
  // Refused by the permissions check: names the action it needs, or says the endpoint is not listed at all.
  ok(r.status === 403 && (Boolean(r.body.permission) || /not in the permissions list/.test(r.body.error ?? "")), `ordinary user refused: ${m} ${p}`, `${r.status} ${r.body.error ?? ""}`);
}
for (const [m, p, b] of USER_OK) {
  const r = await call(user, m, p, b);
  ok(r.status !== 403 && r.status !== 401, `ordinary user allowed: ${m} ${p}`, `${r.status}`);
}

// The big screen and the global window: the gate inside the settings handler.
const big = await call(user, "PUT", "/api/display/settings", { account: "ops@clearway.aero", settings: { scale: 1.1 } });
ok(big.status === 403, "ordinary user cannot change the big screen's profile", `${big.status}`);
const bigReset = await call(user, "DELETE", "/api/display/settings/profile/ops%40clearway.aero");
ok(bigReset.status === 403, "ordinary user cannot reset the big screen's profile", `${bigReset.status}`);
const cur = (await call(user, "GET", "/api/display/settings")).body.settings ?? {};
const win = await call(user, "PUT", "/api/display/settings", { settings: { upcomingHorizonHours: (cur.upcomingHorizonHours ?? 17) === 20 ? 21 : 20 } });
ok(win.status === 403, "ordinary user cannot change the visibility window (it applies to every wall)", `${win.status}`);
const same = await call(user, "PUT", "/api/display/settings", { settings: { ...cur, scale: 1.25 } });
ok(same.status === 200, "…but may save their own view carrying the window back unchanged", `${same.status} ${same.body.error ?? ""}`);

// Admin passes the gate (handlers then refuse the empty bodies / unknown ids; nothing changes).
for (const [m, p] of [["PUT", "/api/display/clocks"], ["DELETE", "/api/operators/rig-none"], ["POST", "/api/device/approve"], ["PATCH", "/api/caa/rig-none"], ["DELETE", "/api/important/rig-none"], ["PUT", "/api/reports/config"]]) {
  const r = await call(admin, m, p);
  ok(r.status !== 403 && r.status !== 401, `admin allowed: ${m} ${p}`, `${r.status}`);
}
const aBig = await call(admin, "PUT", "/api/display/settings", { account: "ops@clearway.aero", settings: {} });
ok(aBig.status === 200, "admin may save the big screen's profile", `${aBig.status}`);

const anon = await call(null, "POST", "/api/operators");
ok(anon.status === 401, "no session: 401", `${anon.status}`);

console.log(`\n${failures ? `${failures} FAILED` : "ALL PASSED"}`);
process.exit(failures ? 1 : 0);
