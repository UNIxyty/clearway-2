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
const PROXY = process.env.RIG_SHELL_URL || (process.env.RIG_SIGNIN_BASE || "http://127.0.0.1:3989");
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

// ── 2. every wall and agent endpoint, reached past the portal (the proxy routes them as Cloudflare does) ──
// The endpoints are the permissions inventory's (lib/permissions/check.mjs › codeRouteBlocks), plus the wall routes it
// misses (no method test, or second in an `a || b`). A route with a parameter gets a made-up value that is checked
// against the route's own pattern; a route no path can be made for is named, never skipped silently.
const { codeRouteBlocks } = await import("../lib/permissions/check.mjs");
const { CLIENT_READS } = await import("../digital-wall/lib/client-scope.mjs");
const sample = (route) => {
  if (!route.startsWith("re:")) return route.endsWith("*") ? `${route.slice(0, -1)}rig-gate-probe` : route;
  const src = route.slice(3);
  let p = src.replace(/^\^/, "").replace(/\$$/, "").replace(/\(\?:\\\/[^()]*(?:\([^()]*\)[^()]*)*\)\?/g, "").replace(/\[0-9\]\+/g, "1").replace(/\\\//g, "/")
    .replace(/\(\[0-9a-f-\]\{36\}\)/g, "00000000-0000-4000-8000-000000000000")
    .replace(/\(\\d\+\)|\(\\d\{1,\d+\}\)/g, "1")
    .replace(/\((?:\?:)?([a-z0-9_-]+(?:\|[a-z0-9_-]+)+)\)/gi, (_m, alts) => alts.split("|")[0])
    .replace(/\(\[\^\/\]\+\)|\(\.\+\)|\(\.\*\)|\[\^\/\]\+/g, "rigx").replace(/\(\[[a-z0-9_\-]+\]\+\)/gi, "rigx").replace(/\(\?:\/\)\?|\/\?$/g, "").replace(/\\\./g, ".");
  try { return new RegExp(src).test(p) ? p : null; } catch { return null; }
};
const routesOf = (service, files) => { const out = []; for (const b of codeRouteBlocks(files.map((f) => readFileSync(f, "utf8")).join("\n"))) for (const m of b.methods) out.push({ method: m, route: b.route }); return out; };
const WALL_EXTRA = ["/api/timeline/flights", "/api/timeline/aircraft", "/api/timeline/sync-status", "/api/flights/data", "/api/limitations", "/api/users/me", "/api/geo/airports", "/api/geo/countries"].map((route) => ({ method: "GET", route }));
const services = [
  { name: "wall", prefix: "/digital-wall", routes: [...routesOf("wall", ["digital-wall/server.mjs"]), ...WALL_EXTRA], clientMay: (m, p) => m === "GET" && p in CLIENT_READS,
    // answered before the wall's session gate, on purpose (digital-wall/server.mjs › Device registration): an unpaired
    // ops-room screen has no session; it may announce itself and poll its own approval, nothing more
    public: { "/api/device/announce": "an unpaired screen announces itself", "/api/device/state": "an unpaired screen polls its own approval" } },
  { name: "agent", prefix: "/agent", routes: routesOf("agent", ["agent/server.mjs", "agent/lib/intake/api.mjs", "agent/lib/passengers/api.mjs"]), clientMay: (m, p) => /^\/api\/flights\/[^/]+\/passengers/.test(p) },
];
const via = (who, method, p) => fetch(`${PROXY}${p}`, { method, redirect: "manual", headers: { cookie: ck(who), "content-type": "application/json" }, body: ["GET", "HEAD"].includes(method) ? undefined : "{}" }).then((r) => r.status, () => 0);
for (const svc of services) {
  const seen = new Set(), walk = [], unmade = [];
  for (const r of svc.routes) { const p = sample(r.route); if (!p) { unmade.push(`${r.method} ${r.route}`); continue; } const k = `${r.method} ${p}`; if (!seen.has(k)) { seen.add(k); walk.push({ method: r.method, path: p }); } }
  ok(walk.length > 20, `${svc.name}: ${walk.length} endpoints to walk from the inventory${unmade.length ? `; ${unmade.length} with no path made: ${unmade.slice(0, 6).join(" | ")}` : ""}`);
  for (const [label, who] of [["client", C], ["unknown role", U]]) {
    const leaks = [];
    for (const e of walk) {
      if (e.path === "/api/health") continue;   // the public health probe
      if (svc.public?.[e.path]) continue;        // public by design, each with its reason (below)
      if (label === "client" && svc.clientMay(e.method, e.path)) continue;   // the client's own allow-list (scoped by the service)
      const st = await via(who, e.method, `${svc.prefix}${e.path}`);
      if (!(st === 404 || st === 401 || st === 403 || st === 405)) leaks.push(`${e.method} ${e.path} → ${st}`);
    }
    ok(leaks.length === 0, `${svc.name}, reached directly: every endpoint outside the ${label === "client" ? "client's allow-list" : "health probe"} refuses the ${label}`, leaks.length ? `${leaks.length} answered: ${leaks.slice(0, 10).join(" | ")}` : "");
  }
}
const board = await via(C, "GET", "/digital-wall/api/timeline/flights?allOperators=true");
ok(board === 200, "wall: the client's own flight board still answers (scoped by the wall)", board);
const guide = await via(C, "GET", "/digital-wall/guide/");
ok(guide === 404, "wall: the staff guide refuses a client", guide);
const staffWall = await via(S, "GET", "/digital-wall/api/operators");
ok(staffWall === 200, "wall: staff still reach their endpoints", staffWall);

// cleanup: the invented client row is append-only-logged only if a decision was written; none was
await svc(`/rest/v1/clients?id=eq.${row?.[0]?.id}`, { method: "DELETE" });
for (const u of [clientUser, unknownUser]) await svc(`/auth/v1/admin/users/${u.id}`, { method: "DELETE" });
console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
