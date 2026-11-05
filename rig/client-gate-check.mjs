// A client, or a role nobody planned for, is refused AT THE ENDPOINT (2026-11-02, docs/permissions.md rules 8 and 9).
// Until then one middleware block was the whole client restriction, and beneath it a client was the User role.
//
// 1. The portal, every address in app/ — 135 handlers (the 19 public ones on UNGATED too) and 104 pages — as an approved
//    client with every switch and the documents level, and as two roles nobody planned for ("contractor"; "Client " in
//    another case with a space). Two layers (2026-11-04):
//    - middleware client block OFF (a second rig portal on :3981 started with RIG_CLIENT_MIDDLEWARE_OFF=1, which only
//      works against the rig's local Supabase): every HANDLER must refuse on its own (404, or 401/403/405);
//    - middleware ON (the proxy, as production): every handler AND page must refuse, except the client's allow-list.
//    A public address passes only if the session adds nothing: the same status and redirect a signed-out visitor gets.
//    Controls: staff pass the same gates, and 95 of 104 pages render for staff (refusing them means something).
//    An account with no role written is the User role by design, not unknown, so it is not one of the identities.
// 2. The wall and the agent, through the sign-in proxy the way Cloudflare routes /digital-wall/* and /agent/api/* past
//    the portal: the client gets only its own allow-lists; a role nobody planned for gets nothing. The agent's walk must
//    include the passport-scan and raw-email downloads.
// Every call has a time limit and drops the body once the status is in: a stream that answers never ends, and on
// 2026-11-04 one held this check for 35 minutes. About 80 seconds in all.
//   node --env-file=.env.rig rig/client-gate-check.mjs
// Invented accounts only; removed at the end.
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { UNGATED } from "../lib/permissions/route-gates.mjs";
import { SWITCH_KEYS } from "../lib/clients/switches.mjs";

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
// a run stopped half-way leaves its client row, which holds the account: clear it first
await svc(`/rest/v1/clients?email=eq.rig-gate-client%40rig.invalid`, { method: "DELETE" });
const clientUser = await account("rig-gate-client@rig.invalid", { role: "client", is_approved: true, client_status: "approved" });
await svc(`/rest/v1/clients?email=eq.rig-gate-client%40rig.invalid`, { method: "DELETE" });
const row = await (await svc("/rest/v1/clients", { method: "POST", headers: { prefer: "return=representation" }, body: JSON.stringify({ user_id: clientUser.id, email: "rig-gate-client@rig.invalid", person_name: "Rig Gate Client", company: "Rig Gate Charter (invented)", kind: "operator", status: "approved", scope: [{ kind: "operator", value: "cwy-cwy" }], switches: SWITCH_KEYS, passenger_level: "documents", decided_at: new Date().toISOString() }) })).json();
const staffPw = JSON.parse(readFileSync("rig/dark-audit.mjs", "utf8").match(/token\?grant_type=password[^\n]*?password: ("[^"]+")/)[1]);
const S = await session("rig-access-user@rig.invalid", staffPw);
ok(Boolean((await session("rig-gate-client@rig.invalid")).access_token && S.access_token), "a client and a staff user sign in");

// ── 1. every portal address — every handler of every route file (the public ones too) and every page — both layers ──
// Layer one, the middleware's client block OFF (BARE): each endpoint's own gate must refuse. Layer two, the block ON
// (the proxy, as production): the client allow-list must refuse everything not on it. A public address (UNGATED, or a
// page a signed-out visitor gets) passes only if the session adds nothing: the same status and the same redirect a
// signed-out visitor gets. Every address is called with every identity; nothing is skipped silently.
const { CLIENT_HOLDING_PAGES } = await import("../lib/clients/allow.mjs");
// the inventory (rig/lib/gate-inventory.mjs): the same list the production walk reads from its copy
const { inventory, COPY } = await import("./lib/gate-inventory.mjs");
const INV = inventory();
const addresses = INV.portal;
{
  const copy = (() => { try { return readFileSync(COPY, "utf8"); } catch { return ""; } })();
  const current = copy === JSON.stringify(INV, null, 1) + "\n";
  ok(current, `the production walk's copy of the inventory (${COPY}) is what the code says today`, current ? "" : `${copy ? "stale" : "missing"}: node rig/lib/gate-inventory.mjs --write`);
}
const handlers = addresses.filter((a) => a.kind === "api"), pages = addresses.filter((a) => a.kind === "page");
ok(handlers.length >= 135 && pages.length >= 100, `the portal: ${handlers.length} handlers in ${new Set(handlers.map((h) => h.file)).size} route files (${handlers.filter((h) => h.ungated).length} of them public by design, on UNGATED), and ${pages.length} pages`);
// the walk posts to every public form too; its own sender address keeps it off the rate limits other suites rely on
// (8 asks an hour per address on /api/client-requests: the onboarding suite got 429 after a few walks, 2026-11-04)
const WALK_FROM = { "x-rig-visitor": "10.255.0.1" };   // the rig proxy makes it cf-connecting-ip, as Cloudflare would
const call = (base, who, a) => fetch(`${base}${a.route}`, { method: a.method, redirect: "manual", headers: { ...(who ? { cookie: ck(who) } : {}), "content-type": "application/json", ...WALK_FROM }, body: ["GET", "HEAD"].includes(a.method) ? undefined : "{}", signal: AbortSignal.timeout(20000) })
  // the status is the answer; a stream that answered stays open forever, so the body is dropped, never read
  .then(async (r) => { await r.body?.cancel().catch(() => null); if (/event-stream/.test(r.headers.get("content-type") || "")) streams.push(`${a.method} ${a.route} ${r.status} (${who ? who.user?.app_metadata?.role ?? "no role" : "signed out"})`); return { st: r.status, to: (r.headers.get("location") || "").replace(/^https?:\/\/[^/]+/, "").replace(/\?.*$/, "") }; }, () => ({ st: 0, to: "" }));
const REFUSED = new Set([401, 403, 404, 405]);
const streams = [];
const t0 = Date.now(); const lap = (what) => console.log(`      ${what}: ${Math.round((Date.now() - t0) / 1000)} s`);
// where a refused page may send them: sign-in, the holding and refusal pages, their own front door
const REFUSED_TO = /^\/(login|forbidden|access-blocked|pending-approval|client(\/(refused|removed))?)$/;
// the same anonymous answer for every address on both portals, once
const anon = { BARE: new Map(), PROXY: new Map() };
for (const [name, base] of [["BARE", BARE], ["PROXY", PROXY]]) for (const a of addresses) anon[name].set(`${a.method} ${a.route}`, await call(base, null, a));
lap(`signed-out answers for ${addresses.length} addresses on both portals`);
const asAnon = (name, a, r) => { const x = anon[name].get(`${a.method} ${a.route}`); return x && x.st === r.st && x.to === r.to; };
const asStaff = []; for (const a of pages) { const r = await call(BARE, S, a); if (r.st !== 200) asStaff.push(`${a.route} ${r.st}${r.to ? `→${r.to}` : ""}`); }
ok(true, `control: ${pages.length - asStaff.length} of ${pages.length} pages render for staff (so refusing them means something)${asStaff.length ? `; not for staff either: ${asStaff.slice(0, 12).join(" | ")}` : ""}`);
lap("the staff control");
const roles = [
  ["client", { role: "client", is_approved: true, client_status: "approved" }, true],
  ["unknown role (contractor)", { role: "contractor", is_approved: true }, false],
  // not "no role written": an empty role is the User role by design (agent/lib/auth.mjs KNOWN_META_ROLES; the wall reads it as "user")
  ["unknown role (Client, another case)", { role: "Client ", is_approved: true, client_status: "approved" }, false],
];
const roleUsers = [];
for (const [label, meta, isClient] of roles) {
  const email = isClient ? "rig-gate-client@rig.invalid" : `rig-gate-unknown-${roleUsers.length}@rig.invalid`;
  if (!isClient) roleUsers.push(await account(email, meta));
  for (const [layer, name, base] of [["middleware client block off", "BARE", BARE], ["middleware on (production)", "PROXY", PROXY]]) {
    const who = await session(email);   // a fresh session per pass: the last call signs it out
    const leaks = []; let reached = 0, publicSame = 0;
    // layer one is the handlers' own gates; a page has none and needs none (2026-11-04, decided: the middleware is the
    // page's door, not gated 104 times), so pages are walked in layer two, through the middleware, as production runs
    const here = name === "BARE" ? handlers : addresses;
    for (const a of here) {
      const r = await call(base, who, a);
      const listed = isClient && a.onList;
      if (listed) { if (r.st === 200) reached += 1; else leaks.push(`${a.method} ${a.route} on the list → ${r.st}`); continue; }
      if (REFUSED.has(r.st) || (r.st >= 300 && r.st < 400 && REFUSED_TO.test(r.to))) continue;
      // the sign-in pages send anyone signed in to the root; the root is walked itself (a client → /client, others refused)
      if (/^\/(login|signup|request-access)$/.test(a.route) && r.st >= 300 && r.st < 400 && r.to === "/") continue;
      // their own front door: the root and the holding pages send an approved client to /client
      if (isClient && (a.route === "/" || CLIENT_HOLDING_PAGES.includes(a.route)) && r.st >= 300 && r.st < 400 && r.to === "/client") continue;
      // public by design (UNGATED, each with the check it makes itself, e.g. a signed token): with the middleware off a
      // signed-out visitor is still sent to sign-in, so there is nothing to compare with here; layer two holds them to it
      if (name === "BARE" && a.ungated) { publicSame += 1; continue; }
      if (asAnon(name, a, r)) { publicSame += 1; continue; }
      leaks.push(`${a.kind === "api" ? "API " : "page "}${a.method} ${a.route} → ${r.st}${r.to ? `→${r.to}` : ""}`);
    }
    leaks.sort((x, y) => x.startsWith("API") === y.startsWith("API") ? 0 : x.startsWith("API") ? -1 : 1);
    lap(`${label}, ${layer}`);
    ok(leaks.length === 0, `portal, ${layer}: all ${here.length} ${name === "BARE" ? "handlers" : "addresses (handlers and pages)"} refuse the ${label}${isClient ? `, except its ${reached} on the allow-list` : ""}; ${publicSame} public ones ${name === "BARE" ? "on UNGATED (their own checks)" : "answer as for a signed-out visitor"}`, leaks.length ? `${leaks.filter((x) => x.startsWith("API")).length} APIs, ${leaks.filter((x) => x.startsWith("page")).length} pages: ${leaks.slice(0, 14).join(" | ")}` : "");
  }
}
{
  const st = (await call(PROXY, await session("rig-gate-unknown-0@rig.invalid"), { method: "GET", route: "/api/client/me" })).st;
  ok(st === 404, "the client allow-list is for clients only: an unknown role gets 404 from GET /api/client/me", st);
  // what an unknown role sees instead: the refusal page, none of the portal's code, and a way out that works
  const unk = await session("rig-gate-unknown-0@rig.invalid");
  const page = await fetch(`${PROXY}/dashboard`, { redirect: "manual", headers: { cookie: ck(unk) }, signal: AbortSignal.timeout(20000) });
  const html = await page.text();
  ok(page.status === 404 && html.includes("data-unknown-role") && !/<script/i.test(html), "an unknown role gets the refusal page: 404, no script, nothing of the portal's code", page.status);
  const out = await fetch(`${PROXY}/auth/sign-out`, { method: "POST", redirect: "manual", headers: { cookie: ck(unk) }, signal: AbortSignal.timeout(20000) });
  ok(out.status === 303 && /\/login$/.test(out.headers.get("location") || "") && /Max-Age=0|expires=Thu, 01 Jan 1970/i.test(out.headers.get("set-cookie") || ""), "its Sign out button works: 303 to /login, the session cookie expired", out.status);
  const staffOk = [];
  for (const r of ["/api/regions", "/api/usa-states", "/api/user/preferences", "/api/dashboard/recents", "/docs/search-index.json"]) staffOk.push(`${r} ${(await call(BARE, S, { method: "GET", route: r })).st}`);
  ok(staffOk.every((x) => / 200$/.test(x)), "staff pass the same gates (the gate refuses by role, not everyone)", staffOk.join(" | "));
  const st2 = (await call(BARE, S, { method: "GET", route: "/api/client/me" })).st;
  ok(st2 === 404, "staff get 404 from the client's own route", st2);
}
// sessions for the wall and agent walk, made after the portal walk signed the earlier ones out
const C = await session("rig-gate-client@rig.invalid"), U = await session("rig-gate-unknown-0@rig.invalid");
const UNKNOWN = []; for (const [i, [label]] of roles.slice(1).entries()) UNKNOWN.push([label, await session(`rig-gate-unknown-${i}@rig.invalid`)]);

// ── 2. every wall and agent endpoint, reached past the portal (the proxy routes them as Cloudflare does) ──
// The endpoints are the permissions inventory's (lib/permissions/check.mjs › codeRouteBlocks), plus the wall routes it
// misses (no method test, or second in an `a || b`). A route with a parameter gets a made-up value that is checked
// against the route's own pattern; a route no path can be made for is named, never skipped silently.
const services = INV.services;
const via = (who, method, p) => fetch(`${PROXY}${p}`, { method, redirect: "manual", headers: { cookie: ck(who), "content-type": "application/json" }, body: ["GET", "HEAD"].includes(method) ? undefined : "{}" }).then((r) => r.status, () => 0);
for (const svc of services) {
  const { walk, unmade } = svc;
  ok(walk.length > 20, `${svc.name}: ${walk.length} endpoints to walk from the inventory${unmade.length ? `; ${unmade.length} with no path made: ${unmade.slice(0, 6).join(" | ")}` : ""}`);
  if (svc.name === "agent") {
    // the two the client must never reach, whatever a switch says: a passport scan and a raw email (.eml)
    const scan = walk.find((e) => e.method === "GET" && /^\/api\/intake\/attachments\/[^/]+$/.test(e.path)), eml = walk.find((e) => e.method === "GET" && /^\/api\/mailbox\/messages\/[^/]+\/raw$/.test(e.path));
    ok(Boolean(scan && eml), "agent: the walk includes the passport-scan download and the raw-email download", `${scan?.path ?? "missing"} | ${eml?.path ?? "missing"}`);
  }
  for (const [label, who] of [["client", C], ...UNKNOWN]) {
    const leaks = [];
    for (const e of walk) {
      if (e.public) continue;   // the health probe, and the wall's unpaired-screen pair (rig/lib/gate-inventory.mjs says why)
      if (label === "client" && e.clientMay) continue;   // the client's own allow-list (scoped by the service)
      const st = await via(who, e.method, `${svc.prefix}${e.path}`);
      if (!(st === 404 || st === 401 || st === 403 || st === 405)) leaks.push(`${e.method} ${e.path} → ${st}`);
    }
    lap(`${svc.name}, ${label}`);
    ok(leaks.length === 0, `${svc.name}, reached directly: every endpoint outside the ${label === "client" ? "client's allow-list" : "health probe"} refuses the ${label} (${walk.filter((e) => !e.public).length}${label === "client" ? " less the list" : ""})`, leaks.length ? `${leaks.length} answered: ${leaks.slice(0, 10).join(" | ")}` : "");
  }
}
const board = await via(C, "GET", "/digital-wall/api/timeline/flights?allOperators=true");
ok(board === 200, "wall: the client's own flight board still answers (scoped by the wall)", board);
const guide = await via(C, "GET", "/digital-wall/guide/");
ok(guide === 404, "wall: the staff guide refuses a client", guide);
const staffWall = await via(S, "GET", "/digital-wall/api/operators");
ok(staffWall === 200, "wall: staff still reach their endpoints", staffWall);

// ── 3. every address we put in an email, fetched with no session at all (2026-11-05) ──
// An email link that needs a session is a broken link. A link for someone outside (a token link, the sign-in page) must
// reach its page signed out: never the middleware's sign-in redirect. A link to a staff page must go through sign-in
// and keep the deep link (/login?next=<that page>). The list is checked against the code that builds the emails: a link
// built there and missing here fails. (rig/client-onboarding-check.mjs opens the real ones, with real tokens.)
{
  const EMAIL_LINKS = [
    { at: "/welcome?token=rig-gate-invalid", for: "outside", built: "lib/clients/onboarding.ts › the set-password link" },
    { at: "/auth/reset?token_hash=rig-gate-invalid&type=recovery", for: "outside", built: "lib/mail/auth-links.ts › password reset" },
    { at: "/auth/callback?signup_token=rig-gate-invalid&continue=%2F&token_hash=rig-gate-invalid&type=invite", for: "outside", built: "sign-up confirmation" },
    { at: "/auth/callback?type=email_change&email=rig-gate%40rig.invalid&otp=000000&next=%2Faccount%2Fprofile", for: "outside", built: "lib/mail/auth-links.ts › email change" },
    { at: "/login", for: "outside", built: "lib/clients/mail.ts › approved, refused, access ended" },
    { at: "/maintenance", for: "outside", built: "(no email; the page a signed-out visitor is sent to during maintenance)" },
    { at: "/api/maintenance", for: "outside", built: "(what /maintenance reads, signed out)" },
    { at: "/admin/clients", for: "staff", built: "lib/clients/onboarding.ts › the ops email" },
    { at: "/digital-wall/console/notam-check", for: "staff", built: "digital-wall/lib/notam-check.mjs › the NOTAM digest" },
    { at: "/digital-wall/console/reports?report=rig-gate-invalid", for: "staff", built: "digital-wall/server.mjs › a wall report" },
  ];
  // the paths the email code builds, read from the code: `${appUrl…}/x`, `${base}/x`, and the wall's links
  const built = new Set();
  for (const file of ["lib/clients/onboarding.ts", "lib/clients/mail.ts", "lib/mail/auth-links.ts", "lib/mail/send.ts", "app/api/auth/email/request-confirmation/route.ts"]) {
    for (const m of readFileSync(file, "utf8").matchAll(/\$\{(?:appUrl(?:\(\))?|requestUrl\.origin|base)\}(\/[a-z][\w\-/]*)/g)) built.add(m[1]);
  }
  for (const m of readFileSync("digital-wall/lib/notam-check.mjs", "utf8").matchAll(/const link = `\$\{base\}(\/[\w\-/]+)/g)) built.add(`/digital-wall${m[1]}`);
  for (const m of readFileSync("digital-wall/server.mjs", "utf8").matchAll(/link: `\$\{base\}(\/[\w\-/]+)/g)) built.add(`/digital-wall${m[1]}`);
  const listed = EMAIL_LINKS.map((l) => l.at.split("?")[0]);
  const missing = [...built].filter((b) => !listed.includes(b));
  ok(built.size >= 6 && missing.length === 0, `every link the email code builds is on the list (${built.size} found in the code)`, missing.length ? `not on the list: ${missing.join(" | ")}` : [...built].join(" "));
  const wrong = [];
  for (const l of EMAIL_LINKS) {
    const r = await fetch(`${PROXY}${l.at}`, { redirect: "manual", headers: WALK_FROM, signal: AbortSignal.timeout(20000) }).catch(() => null);
    await r?.body?.cancel().catch(() => null);
    const to = r?.headers.get("location") || "";
    const toUrl = to ? new URL(to, PROXY) : null;
    // the middleware's sign-in wall: /login?next=<this very link>, no error. A handler's own answer to an invalid token
    // (/login?error=…) is the link working: with a real token it goes on (rig/client-onboarding-check.mjs proves that)
    const toSignIn = toUrl?.pathname === "/login" && toUrl.searchParams.get("next") === l.at && !toUrl.searchParams.has("error");
    if (l.for === "outside" ? (!r || r.status >= 500 || toSignIn) : !(r && r.status >= 300 && r.status < 400 && toSignIn && toUrl.searchParams.get("next") === l.at)) wrong.push(`${l.at} → ${r?.status ?? "no answer"}${to ? ` ${toUrl.pathname}${toUrl.search}` : ""}`);
  }
  ok(wrong.length === 0, `every address we email, with no session: ${EMAIL_LINKS.filter((l) => l.for === "outside").length} for people outside reach their page, ${EMAIL_LINKS.filter((l) => l.for === "staff").length} staff links go through sign-in and keep the deep link`, wrong.join(" | "));
}

// ── 4. the signed-out limiters key on what a caller cannot write (2026-11-05) ──
// They keyed on the FIRST x-forwarded-for value, which a visitor writes and Cloudflare only appends to: a fresh bucket
// per request. Now cf-connecting-ip only (set by Cloudflare; here by the rig proxy, the same way), else refused. Ten asks from one visitor, each with a different invented x-forwarded-for: the ninth
// is refused. Malformed bodies, so nothing is written and nobody is emailed (the limit counts before the body is read).
{
  const visitor = `10.255.${Math.floor(Math.random() * 200) + 1}.${Math.floor(Math.random() * 200) + 1}`;
  const got = [];
  for (let i = 1; i <= 10; i += 1) {
    const r = await fetch(`${PROXY}/api/client-requests`, { method: "POST", headers: { "content-type": "application/json", "x-rig-visitor": visitor, "x-forwarded-for": `203.0.113.${i}` }, body: "{}", signal: AbortSignal.timeout(20000) });
    await r.body?.cancel().catch(() => null); got.push(r.status);
  }
  ok(got.slice(0, 8).every((s) => s !== 429) && got[8] === 429 && got[9] === 429, "ask for access: ten requests with ten invented x-forwarded-for values from one visitor — the ninth is refused", got.join(" "));
  const forgot = [];
  for (let i = 1; i <= 11; i += 1) {
    const r = await fetch(`${PROXY}/api/auth/password/forgot`, { method: "POST", headers: { "content-type": "application/json", "x-rig-visitor": visitor, "x-forwarded-for": `203.0.113.${i}` }, body: "{}", signal: AbortSignal.timeout(20000) });
    await r.body?.cancel().catch(() => null); forgot.push(r.status);
  }
  ok(forgot.slice(0, 10).every((s) => s !== 429) && forgot[10] === 429, "forgot password: the eleventh from one visitor is refused, whatever x-forwarded-for says", forgot.join(" "));
  const signup = [];
  for (let i = 1; i <= 11; i += 1) {
    const r = await fetch(`${PROXY}/api/auth/email/request-confirmation`, { method: "POST", headers: { "content-type": "application/json", "x-rig-visitor": visitor, "x-forwarded-for": `203.0.113.${i}` }, body: "{}", signal: AbortSignal.timeout(20000) });
    await r.body?.cancel().catch(() => null); signup.push(r.status);
  }
  ok(signup.slice(0, 10).every((s) => s !== 429) && signup[10] === 429, "sign-up confirmation (no limit until today): the eleventh from one visitor is refused", signup.join(" "));
  // no address of ours on it at all (the portal reached past every proxy): refused, not let through
  const bare = [];
  for (const xff of [null, "198.51.100.7", "198.51.100.8, 198.51.100.9"]) {
    const r = await fetch(`${BARE}/api/client-requests`, { method: "POST", headers: { "content-type": "application/json", ...(xff ? { "x-forwarded-for": xff } : {}) }, body: "{}", signal: AbortSignal.timeout(20000) });
    await r.body?.cancel().catch(() => null); bare.push(r.status);
  }
  ok(bare.every((s) => s === 403), "a request without Cloudflare's address is refused, whatever x-forwarded-for it writes (none, one, two)", bare.join(" "));
  // …and a refusal that piles up says so (2026-11-05): a gate that fails closed still has to say it has closed
  const { noAddressRefused, resetNoAddressAlarm, NO_ADDRESS_ALARM_AT } = await import("../lib/caller-address.mjs");
  resetNoAddressAlarm();
  const sent = []; const send = async (t) => { sent.push(t); return true; };
  const t0 = Date.parse("2026-11-05T00:00:00Z");
  const steps = [];
  for (let i = 0; i < NO_ADDRESS_ALARM_AT + 1; i += 1) { const r = noAddressRefused(i % 2 ? "/api/auth/password/forgot" : "/api/client-requests", { now: t0 + i * 60e3, send }); steps.push(r.alarm ? await r.alarm : null); }
  const later = noAddressRefused("/api/client-requests", { now: t0 + 6.1 * 3600e3, send }); await later.alarm;
  const late2 = [noAddressRefused("/api/client-requests", { now: t0 + 6.2 * 3600e3, send }), noAddressRefused("/api/client-requests", { now: t0 + 6.3 * 3600e3, send })];
  ok(steps.slice(0, NO_ADDRESS_ALARM_AT - 1).every((x) => x === null) && steps[NO_ADDRESS_ALARM_AT - 1] === true && steps[NO_ADDRESS_ALARM_AT] === null && sent.length >= 1 && /without Cloudflare's address/.test(sent[0]) && /\/api\/client-requests/.test(sent[0]) && /password\/forgot/.test(sent[0]),
    `the alarm: ${NO_ADDRESS_ALARM_AT} refusals in an hour tell the developers on Telegram (naming the forms), once, not again within six hours`, `${sent.length} alarm(s) · ${steps.map((x) => (x === null ? "-" : x)).join(" ")}`);
  ok(late2[1].alarm !== null && sent.length === 2, "…and again after six hours if it is still happening", `${sent.length} alarm(s)`);
  resetNoAddressAlarm();
}

// cleanup: the invented client row is append-only-logged only if a decision was written; none was
await svc(`/rest/v1/clients?id=eq.${row?.[0]?.id}`, { method: "DELETE" });
for (const u of [clientUser, ...roleUsers]) await svc(`/auth/v1/admin/users/${u.id}`, { method: "DELETE" });
ok(streams.length === 0 || streams.every((x) => / (401|403|404|405)/.test(x)), `no event stream opened for anyone the walk called as (${streams.length} stream answers seen)`, streams.join(" | "));
lap("whole check");
console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
