// A client, or a role nobody planned for, is refused AT THE ENDPOINT (2026-11-02, docs/permissions.md rules 8 and 9).
// Until then one middleware block was the whole client restriction, and beneath it a client was the User role.
//
// 1. The portal with its middleware's client block and write gate OFF (a second rig portal on :3981 started with
//    RIG_CLIENT_MIDDLEWARE_OFF=1, which only works against the rig's local Supabase): every handler of every route file
//    is called as an approved client and as an account whose role marker nobody planned for. Each must refuse (404, or
//    401/403/405), except the client allow-list (GET /api/client/me, for the client only) and the files on UNGATED.
//    A staff account passes the same gates (sanity: the gate refuses by role, not everyone).
// 2. The wall and the agent, through the sign-in proxy (:3989) the way Cloudflare routes /digital-wall/* and
//    /agent/api/* past the portal: the client gets only its wall read allow-list; the unknown role gets nothing.
//   node --env-file=.env.rig rig/client-gate-check.mjs
// Invented accounts only; removed at the end.
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { UNGATED } from "../lib/permissions/route-gates.mjs";

const SB = process.env.NEXT_PUBLIC_SUPABASE_URL, ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(String(SB))) { console.error("Refused: the rig's local Supabase only."); process.exit(2); }
const BARE = process.env.RIG_GATELESS_URL || "http://127.0.0.1:3981";   // the portal with the client block off
const PROXY = process.env.RIG_SHELL_URL || "http://127.0.0.1:3989";
let failures = 0; const ok = (c, what, d = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${what}${d ? `  · ${String(d).slice(0, 400)}` : ""}`); if (!c) failures += 1; };
const H = { apikey: SVC, authorization: `Bearer ${SVC}`, "content-type": "application/json" };
const svc = (p, init = {}) => fetch(`${SB}${p}`, { ...init, headers: { ...H, ...(init.headers ?? {}) } });
const PW = "rig-client-gate-only-1";
const session = async (email, password = PW) => (await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "content-type": "application/json" }, body: JSON.stringify({ email, password }) })).json();
const ck = (s) => `sb-${new URL(SB).hostname.split(".")[0]}-auth-token=base64-${Buffer.from(JSON.stringify(s)).toString("base64")}`;

// the gateless portal must be up, and must really be gateless (or the walk proves only the middleware)
const up = await fetch(`${BARE}/login`).then((r) => r.status, () => 0);
if (up !== 200) { console.error(`CANNOT TELL: no gateless rig portal on ${BARE} (start it with RIG_CLIENT_MIDDLEWARE_OFF=1)`); process.exit(2); }

async function account(email, appMeta) {
  const l = await (await svc(`/auth/v1/admin/users?page=1&per_page=1000`)).json();
  for (const u of (l.users ?? []).filter((x) => x.email === email)) await svc(`/auth/v1/admin/users/${u.id}`, { method: "DELETE" });
  const u = await (await svc("/auth/v1/admin/users", { method: "POST", body: JSON.stringify({ email, password: PW, email_confirm: true, app_metadata: appMeta }) })).json();
  if (!u.id) throw new Error(`no account for ${email}`);
  return u;
}
const clientUser = await account("rig-gate-client@rig.invalid", { role: "client", is_approved: true, client_status: "approved" });
await svc(`/rest/v1/clients?email=eq.rig-gate-client%40rig.invalid`, { method: "DELETE" });
const row = await (await svc("/rest/v1/clients", { method: "POST", headers: { prefer: "return=representation" }, body: JSON.stringify({ user_id: clientUser.id, email: "rig-gate-client@rig.invalid", person_name: "Rig Gate Client", company: "Rig Gate Charter (invented)", kind: "operator", status: "approved", scope: [{ kind: "operator", value: "cwy-cwy" }], switches: ["flight_board"], passenger_level: "off", decided_at: new Date().toISOString() }) })).json();
const unknownUser = await account("rig-gate-unknown@rig.invalid", { role: "contractor", is_approved: true });
const C = await session("rig-gate-client@rig.invalid"), U = await session("rig-gate-unknown@rig.invalid");
const staffPw = JSON.parse(readFileSync("rig/dark-audit.mjs", "utf8").match(/token\?grant_type=password[^\n]*?password: ("[^"]+")/)[1]);
const S = await session("rig-access-user@rig.invalid", staffPw);
ok(Boolean(C.access_token && U.access_token && S.access_token), "a client, an unknown role and a staff user sign in");

// ── 1. every portal handler, middleware client block off ──
const files = []; const walk = (d) => { for (const n of readdirSync(d)) { const p = path.join(d, n); if (statSync(p).isDirectory()) walk(p); else if (n === "route.ts") files.push(p); } };
walk("app");
const handlers = [];
for (const f of files) {
  const rel = f.split(path.sep).join("/");
  if (UNGATED[rel]) continue;   // public by design, each with its reason (lib/permissions/route-gates.mjs)
  const src = readFileSync(f, "utf8");
  const route = "/" + path.dirname(rel).replace(/^app\/?/, "").split("/").filter((x) => !/^\(.+\)$/.test(x)).map((x) => x.startsWith("[...") ? "aip/ead-pdf/RIGX.pdf" : x.startsWith("[") ? "00000000-0000-4000-8000-000000000000" : x).join("/");
  for (const m of src.matchAll(/^export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD)\b|^export\s+const\s+(GET|POST|PUT|PATCH|DELETE|HEAD)\s*=/gm)) handlers.push({ method: m[1] ?? m[2], route, file: rel });
}
ok(handlers.length > 100, `${handlers.length} gated handlers to walk (route files on UNGATED are public by design: ${Object.keys(UNGATED).length})`);
const call = (who, h) => fetch(`${BARE}${h.route}`, { method: h.method, redirect: "manual", headers: { cookie: ck(who), "content-type": "application/json" }, body: ["GET", "HEAD"].includes(h.method) ? undefined : "{}" }).then((r) => r.status, () => 0);
const refused = (st) => st === 404 || st === 401 || st === 403 || st === 405;
for (const [label, who] of [["client", C], ["unknown role", U]]) {
  const leaks = [];
  for (const h of handlers) {
    const st = await call(who, h);
    const allowed = label === "client" && h.method === "GET" && h.route === "/api/client/me";
    if (allowed ? st !== 200 : !refused(st)) leaks.push(`${h.method} ${h.route} → ${st}`);
  }
  ok(leaks.length === 0, `portal, middleware client block off: every handler refuses the ${label}${label === "client" ? " except GET /api/client/me" : ""}`, leaks.length ? `${leaks.length} of ${handlers.length} answered: ${leaks.slice(0, 12).join(" | ")}` : "");
}
{
  const st = await call(U, { method: "GET", route: "/api/client/me" });
  ok(st === 404, "the client allow-list is for clients only: the unknown role gets 404 from GET /api/client/me", st);
  const staffOk = [];
  for (const r of ["/api/regions", "/api/usa-states", "/api/user/preferences", "/api/dashboard/recents"]) staffOk.push(`${r} ${await call(S, { method: "GET", route: r })}`);
  ok(staffOk.every((x) => / 200$/.test(x)), "staff pass the same gates (the gate refuses by role, not everyone)", staffOk.join(" | "));
  const st2 = await call(S, { method: "GET", route: "/api/client/me" });
  ok(st2 === 404, "staff get 404 from the client's own route", st2);
}

// ── 2. the wall and the agent, reached past the portal (the proxy routes them as Cloudflare does) ──
const via = (who, p) => fetch(`${PROXY}${p}`, { redirect: "manual", headers: { cookie: ck(who) } }).then((r) => r.status, () => 0);
const WALL_NOT_FOR_CLIENTS = ["/digital-wall/api/operators", "/digital-wall/api/display/settings", "/digital-wall/api/reports", "/digital-wall/api/webhooks", "/digital-wall/api/aircraft/visibility", "/digital-wall/guide/"];
const AGENT = ["/agent/api/conversations", "/agent/api/intake/requests", "/agent/api/mailbox/overview", "/agent/api/knowledge/stats", "/agent/api/activity"];
const wallClient = []; for (const p of WALL_NOT_FOR_CLIENTS) wallClient.push(`${p} ${await via(C, p)}`);
ok(wallClient.every((x) => / 404$/.test(x)), "wall, reached directly: a client gets 404 outside its read allow-list (the staff guide included)", wallClient.join(" | "));
const board = await via(C, "/digital-wall/api/timeline/flights?allOperators=true");
ok(board === 200, "wall: the client's own flight board still answers (scoped by the wall)", board);
const wallUnknown = []; for (const p of ["/digital-wall/api/timeline/flights?allOperators=true", "/digital-wall/api/users/me", "/digital-wall/guide/", ...WALL_NOT_FOR_CLIENTS]) wallUnknown.push(`${p} ${await via(U, p)}`);
ok(wallUnknown.every((x) => / 404$/.test(x)), "wall, reached directly: the unknown role gets 404 everywhere", wallUnknown.join(" | "));
for (const [label, who] of [["client", C], ["unknown role", U]]) {
  const got = []; for (const p of AGENT) got.push(`${p} ${await via(who, p)}`);
  ok(got.every((x) => / 404$/.test(x)), `agent, reached directly: the ${label} gets 404`, got.join(" | "));
}
const pax = await via(U, "/agent/api/flights/cwy-cwy:880001/passengers");
ok(pax === 404, "agent: the unknown role gets 404 from the passenger route too", pax);
const staffWall = await via(S, "/digital-wall/api/operators");
ok(staffWall === 200, "wall: staff still reach their endpoints", staffWall);

// cleanup: the invented client row is append-only-logged only if a decision was written; none was
await svc(`/rest/v1/clients?id=eq.${row?.[0]?.id}`, { method: "DELETE" });
for (const u of [clientUser, unknownUser]) await svc(`/auth/v1/admin/users/${u.id}`, { method: "DELETE" });
console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
