// The client allow-list and the client's menu (2026-11-04), through a real console build with sign-in on.
//   1. lib/clients/allow.mjs on its own: what an approved client reaches, by switch; everything else is not on the list
//   2. every page and API of the portal is enumerated from app/: the list names only addresses that exist, and every
//      other address is outside it (the count is printed — the walk of all of them as a client is step 5)
//   3. a client with only the required switches: the Flights page and their own standing, nothing else — staff pages
//      and APIs 404, Airports and Documents 404, no menu at all (one page is not a menu)
//   4. the same client with Airports and Documents on: those two open, and the menu holds exactly the three
//   5. the page source and EVERY script the client's page loads carry none of the staff menu's labels
// Starts its own portal (:3982, this checkout's rig build, sign-in ON) and proxy (:3979, to the sign-in rig's agent
// :5176 and wall :5198). The rig's own services are not touched. Needs rig/build-portal.sh first.
//   node --env-file=.env.rig rig/client-allow-check.mjs
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
let failures = 0; const ok = (c, what, d = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${what}${d ? `  · ${String(d).slice(0, 220)}` : ""}`); if (!c) failures += 1; };
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL, ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(String(SB))) { console.error("Refused: the rig's local Supabase only."); process.exit(2); }
if (!fs.existsSync(".next/standalone/server.js")) { console.error("no console build: run rig/build-portal.sh"); process.exit(2); }
const B = "http://127.0.0.1:3979";
const H = { apikey: SVC, authorization: `Bearer ${SVC}`, "content-type": "application/json" };
const svc = (p, init = {}) => fetch(`${SB}${p}`, { ...init, headers: { ...H, ...(init.headers ?? {}) } });

// ── 1. the list itself ──
const { clientMayReach, clientMenu, CLIENT_PAGES, CLIENT_APIS } = await import("../lib/clients/allow.mjs");
const few = new Set(["flight_board", "weather"]), all = new Set(["flight_board", "weather", "airport_search", "documents"]);
ok(clientMayReach("/client", "GET", few).ok && clientMayReach("/api/client/me", "GET", few).ok && !clientMayReach("/api/auth/password/reset", "POST", few).ok, "the front door and their own standing: every approved client (the public auth routes are not a client's)");
ok(!clientMayReach("/client/airports", "GET", few).ok && clientMayReach("/client/airports", "GET", all).ok && !clientMayReach("/client/documents", "GET", few).ok && clientMayReach("/client/documents", "GET", all).ok, "Airports and Documents: only with their switches");
ok(["/dashboard", "/aip", "/admin/users", "/api/search", "/api/admin/clients", "/api/client/me/../../admin", "/api/client/me/x", "/client/airports/x", "/clientx", "/client-requests", "/api/client/other", "/developer/inbox", "/files/x"].every((p) => !clientMayReach(p, "GET", all).ok) && !clientMayReach("/api/client/me", "POST", all).ok, "everything else is not on the list — staff pages, their APIs, look-alike addresses, other methods");
ok(JSON.stringify(clientMenu(few)) === JSON.stringify([{ path: "/client", label: "Flights", icon: "plane" }]) && clientMenu(all).length === 3 && clientMenu(new Set()).length === 1, "the menu: what the list allows them, nothing else");

// ── 2. the portal's addresses, from app/ ──
const routes = [];
(function walk(dir, url) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { const seg = e.name.startsWith("(") ? "" : `/${e.name.replace(/^\[\.\.\.(.+)\]$/, ":$1*").replace(/^\[(.+)\]$/, ":$1")}`; walk(path.join(dir, e.name), url + seg); }
    else if (/^(page|route)\.(tsx|ts|js)$/.test(e.name)) routes.push({ url: url || "/", kind: e.name.startsWith("page") ? "page" : "api" });
  }
})("app", "");
const listed = [...CLIENT_PAGES.map((e) => e.path), ...CLIENT_APIS.filter((e) => !e.prefix).map((e) => e.path)];
ok(listed.every((p) => routes.some((r) => r.url === p)), "every address on the list exists in the portal (no dead entries)", listed.filter((p) => !routes.some((r) => r.url === p)).join(", "));
const reachable = routes.filter((r) => clientMayReach(r.url.replace(/:[^/]+\*?/g, "x"), "GET", all).ok || clientMayReach(r.url.replace(/:[^/]+\*?/g, "x"), "POST", all).ok);
console.log(`      the portal has ${routes.length} pages and APIs (${routes.filter((r) => r.kind === "page").length} pages, ${routes.filter((r) => r.kind === "api").length} APIs); a client with every switch reaches ${reachable.length}: ${reachable.map((r) => r.url).join(", ")}`);

// ── the stack: this build's portal with sign-in on, behind its own proxy ──
const kids = [];
const run = (args, env, label) => { const c = spawn(args[0], args.slice(1), { env, stdio: ["ignore", "pipe", "pipe"] }); let out = ""; c.stdout.on("data", (d) => { out += d; }); c.stderr.on("data", (d) => { out += d; }); kids.push({ c, label, out: () => out }); return c; };
const waitFor = async (url, label) => { for (let i = 0; i < 120; i += 1) { try { const r = await fetch(url, { redirect: "manual" }); if (r.status < 500) return; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 500)); } throw new Error(`${label} did not start: ${kids.find((k) => k.label === label)?.out().slice(-300)}`); };
const cookieOf = (s) => `sb-${new URL(SB).hostname.split(".")[0]}-auth-token=base64-${Buffer.from(JSON.stringify(s)).toString("base64")}`;
const PASSWORD = "rig-access-check-only-client-allow";   // an invented rig-only password (the rig marker the secrets scan knows)
const EMAIL = "rig-client-allow@rig.invalid";
let uid = null, rowId = null;
try {
  fs.rmSync(".next/standalone/.next/static", { recursive: true, force: true }); fs.cpSync(".next/static", ".next/standalone/.next/static", { recursive: true });
  fs.rmSync(".next/standalone/public", { recursive: true, force: true }); fs.cpSync("public", ".next/standalone/public", { recursive: true });
  run(["node", "--env-file=.env.rig", ".next/standalone/server.js"], { PATH: process.env.PATH, HOME: process.env.HOME, PORT: "3982", HOSTNAME: "127.0.0.1", DISABLE_AUTH_FOR_TESTING: "false", ADMIN_EMAILS: "", DEVELOPER_EMAILS: "" }, "portal");
  run(["node", "rig/proxy.mjs"], { ...process.env, RIG_PROXY_PORT: "3979", RIG_PORTAL_PORT: "3982", RIG_AGENT_PORT: "5176", RIG_WALL_PORT: "5198" }, "proxy");
  await waitFor("http://127.0.0.1:3982/login", "portal"); await waitFor(`${B}/login`, "proxy");

  // an approved client on the sign-in rig's mock operator, with only the required switches
  let r = await svc("/auth/v1/admin/users", { method: "POST", body: JSON.stringify({ email: EMAIL, password: PASSWORD, email_confirm: true, user_metadata: { full_name: "Rig Allow Check" }, app_metadata: { role: "client", is_approved: true, client_status: "approved" } }) });
  let body = await r.json();
  if (!r.ok) { const list = await (await svc("/auth/v1/admin/users?page=1&per_page=200")).json(); body = (list.users ?? []).find((u) => u.email === EMAIL); await svc(`/auth/v1/admin/users/${body.id}`, { method: "PUT", body: JSON.stringify({ password: PASSWORD, app_metadata: { role: "client", is_approved: true, client_status: "approved" } }) }); }
  uid = body.id;
  await svc(`/rest/v1/clients?user_id=eq.${uid}`, { method: "DELETE" }).catch(() => {});
  const row = await (await svc("/rest/v1/clients", { method: "POST", headers: { prefer: "return=representation" }, body: JSON.stringify({ user_id: uid, email: EMAIL, person_name: "Rig Allow Check", company: "Rig Allow Co", kind: "operator", status: "approved", scope: [{ kind: "operator", value: "cwy-cwy" }], switches: ["flight_board", "weather"], passenger_level: "off", consent: false, decided_at: new Date().toISOString() }) })).json();
  rowId = row[0]?.id;
  const s = await (await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "content-type": "application/json" }, body: JSON.stringify({ email: EMAIL, password: PASSWORD }) })).json();
  const get = async (p, init = {}) => { const res = await fetch(`${B}${p}`, { ...init, headers: { ...(init.headers ?? {}), cookie: cookieOf(s) }, redirect: "manual" }); return { status: res.status, text: await res.text() }; };

  // ── 3. only the required switches ──
  const home = await get("/client");
  ok(home.status === 200 && /data-client-shell/.test(home.text) && /data-menu="\/client"/.test(home.text), "Flights: open, inside the client shell, with a menu of one (so none is drawn)", home.status);
  ok((await get("/api/client/me")).status === 200, "their own standing: 200");
  // the account page (2026-11-09): every approved client has it, apart from the menu; its password route is theirs too
  const acct = await get("/client/account");
  ok(acct.status === 200 && /data-tab="account"/.test(acct.text) && /data-account-link/.test(home.text), "Account: open to a client with only the required switches, linked from the shell, not a menu item", acct.status);
  const pwEmpty = await get("/api/client/account/password", { method: "POST", headers: { "content-type": "application/json", "x-rig-visitor": "10.254.0.7" }, body: "{}" });
  ok(pwEmpty.status === 400 && /current password/.test(pwEmpty.text), "the password route answers a client (400 for an empty form: nothing changed)", pwEmpty.status);
  ok((await get("/api/client/account/password")).status === 404 && (await get("/api/client/account")).status === 404 && (await get("/client/account/x")).status === 404, "…and only that: GET on it, its parent and a page under Account are 404");
  const closed = ["/client/airports", "/client/documents", "/dashboard", "/aip", "/admin/users", "/admin/clients", "/agent", "/developer/inbox", "/account/profile", "/docs"];
  const closedRes = await Promise.all(closed.map(async (p) => [p, (await get(p)).status]));
  ok(closedRes.every(([, st]) => st === 404), "Airports and Documents with their switches off, and the staff pages: all 404", closedRes.map(([p, st]) => `${p} ${st}`).join(" · "));
  const apis = ["/api/search?q=EVRA", "/api/admin/clients", "/api/admin/users", "/api/help/inbox", "/api/aip/resolve?icao=EVRA", "/api/notams?icao=EVRA", "/api/dashboard"];
  const apiRes = await Promise.all(apis.map(async (p) => [p, (await get(p)).status]));
  ok(apiRes.every(([, st]) => st === 404), "staff and reference APIs: all 404 to a client", apiRes.map(([p, st]) => `${p} ${st}`).join(" · "));

  // ── 5. the page source and every script it loads carry none of the staff menu ──
  const STAFF = ["Flight intake", "Hidden airports", "Knowledge base", "Activity log", "Agent sites", "Saved replies", "Agent access", "Service status editor", "Webhooks", "Mailbox", "Maintenance", "Ops Agent", "Digital Wall", "/admin/users", "/developer/inbox", "/agent/intake"];
  const inSource = STAFF.filter((w) => home.text.includes(w));
  ok(inSource.length === 0, "the page source of a client's page names none of the staff menu", inSource.join(", "));
  // in a script, the staff menu is its DEFINITION — components/portal/nav.ts's entries as the build writes them
  // (label:"Flight intake", href:"/admin/users"). Bare words would catch a colour token's description or the Supabase
  // library's own "/admin/users" URL, which are not the menu (the first run of this check, 2026-11-04).
  const navSrc = fs.readFileSync("components/portal/nav.ts", "utf8");
  const DEFS = [...navSrc.matchAll(/label: "([^"]+)"/g)].map((m) => `label:"${m[1]}"`).filter((d) => !/label:"(Flights|Airports|Documents|Settings|Limitations|Important|CAA details|Aircraft|Reports|Chat|History|Profile|Inbox)"/.test(d))
    .concat([...navSrc.matchAll(/href: "(\/(?:admin|developer|agent|aip|dashboard|account)[^"]*)"/g)].map((m) => `href:"${m[1]}"`));
  // EVERY script the browser downloads, the ones loaded at run time included — not only the page's <script> tags
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  const scriptsOf = async (cookie, url) => {
    const ctx = await browser.newContext(); await ctx.addCookies([{ name: cookie.split("=")[0], value: cookie.slice(cookie.indexOf("=") + 1), url: B }]);
    const page = await ctx.newPage(); const bodies = new Map();
    page.on("response", async (res) => { if (/\.js(\?|$)/.test(res.url())) { try { bodies.set(res.url(), await res.text()); } catch { /* gone */ } } });
    await page.goto(`${B}${url}`, { waitUntil: "load" }); await page.waitForTimeout(3000);
    await ctx.close(); return bodies;
  };
  const clientScripts = await scriptsOf(cookieOf(s), "/client");
  const leaks = []; for (const [u, js] of clientScripts) for (const w of DEFS) if (js.includes(w)) leaks.push(`${u.split("/").pop()}: ${w}`);
  ok(clientScripts.size > 0 && leaks.length === 0, `none of the ${clientScripts.size} scripts a client's browser downloads carries the staff menu (${DEFS.length} definitions looked for)`, leaks.slice(0, 6).join(" · "));
  // the control: a staff member's browser on a staff page downloads the menu, and the probe must see it there
  const staffPw = JSON.parse(fs.readFileSync("rig/dark-audit.mjs", "utf8").match(/token\?grant_type=password[^\n]*?password: ("[^"]+")/)[1]);
  const staff = await (await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "content-type": "application/json" }, body: JSON.stringify({ email: "rig-access-user@rig.invalid", password: staffPw }) })).json();
  const staffScripts = await scriptsOf(cookieOf(staff), "/dashboard");
  let found = 0; for (const [, js] of staffScripts) found += DEFS.filter((w) => js.includes(w)).length;
  ok(found > 10, "the control: the same probe finds the staff menu in a staff member's scripts, so the clean result means something", `${found} definitions in ${staffScripts.size} scripts`);
  await browser.close();

  // ── 6. the whole bundle, not only the menu (2026-11-04, rig/lib/bundle-sweep.mjs): source maps, our routes, internal
  //    hosts, permission names, server setting names, operators, registrations, airport lists, hashes, local paths,
  //    people, emails, privileged keys, comments — for a client and for a signed-out visitor. Only the anon key is allowed.
  {
    const { sweepAssets, downloadedAssets, permissionNamesFrom, ourRoutesFrom, readCatalogue } = await import("./lib/bundle-sweep.mjs");
    const permissionNames = permissionNamesFrom(readCatalogue()), ourRoutes = ourRoutesFrom("app");
    const publicHosts = [String(SB).replace(/\/+$/, "")];
    const operators = (await (await svc("/rest/v1/leon_operators?select=opr_id,name")).json()).flatMap((o) => [o.opr_id, o.name]).filter(Boolean);
    const fetchMap = async (u) => { try { return (await fetch(u)).status; } catch { return 0; } };
    const common = { permissionNames, operators, fetchMap, ourRoutes, publicHosts };
    const bad = (t) => Object.entries(t).filter(([k]) => k !== "jwtAnon").map(([k, n]) => `${k} ${n}`);
    const cl = await sweepAssets(await downloadedAssets({ base: B, pages: ["/client", "/client/account"], cookie: cookieOf(s) }), { ...common, allowedRoutes: /^\/(client(\/|$)|api\/client\/(me|account\/password)$|digital-wall\/api(\/|$)|agent\/api\/flights(\/|$))/ });
    ok(bad(cl.total).length === 0, `a client's bundle (${cl.rows.length} assets): nothing but the public anon key`, bad(cl.total).join(", ") || `jwtAnon ${cl.total.jwtAnon ?? 0}`);
    const so = await sweepAssets(await downloadedAssets({ base: B, pages: ["/login", "/request-access", "/welcome"] }), { ...common, allowedRoutes: /^\/(api\/(auth|client-requests|client-invite)\b)/ });
    ok(bad(so.total).length === 0, `a signed-out visitor's bundle (${so.rows.length} assets): nothing but the public anon key`, bad(so.total).join(", ") || `jwtAnon ${so.total.jwtAnon ?? 0}`);
    // controls: every detector fires on a planted asset, and a staff page swept as staff shows our routes
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const planted = ["//# sourceMappingURL=x.js.map", 'fetch("/admin/users")', "http://agent-service:5175", '"clients.manage"', "SUPABASE_SERVICE_ROLE_KEY", " LY-ABC ", "0123456789abcdef0123456789abcdef01234567", "/Users/someone/x", "dev@clearway.aero", `eyJ${b64({ alg: "HS256" }).slice(3)}.${b64({ role: "service_role", iss: "rig-planted" })}.plantedsignatureplanted`, "/* a block comment left in the shipped code, long enough */", "NEXT_PUBLIC_RIG_FLAG", "GIT_COMMIT"].join("\n");
    const pc = (await sweepAssets(new Map([["http://x/planted.js", planted]]), { permissionNames: ["clients.manage"], ourRoutes: ["/admin/users"] })).total;
    ok(["sourceMapRef", "staffRoutes", "internalHosts", "permissionNames", "serverEnvNames", "registrations", "hashes", "localPaths", "people", "jwtPrivileged", "comments", "featureFlags", "buildMeta"].every((k) => pc[k] >= 1), "control: every detector fires on a planted asset", JSON.stringify(pc));
    const staffPw2 = JSON.parse(fs.readFileSync("rig/dark-audit.mjs", "utf8").match(/token\?grant_type=password[^\n]*?password: ("[^"]+")/)[1]);
    const st2 = await (await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "content-type": "application/json" }, body: JSON.stringify({ email: "rig-access-user@rig.invalid", password: staffPw2 }) })).json();
    const sf = await sweepAssets(await downloadedAssets({ base: B, pages: ["/dashboard"], cookie: cookieOf(st2) }), common);
    ok((sf.total.staffRoutes ?? 0) > 20, "control: the same sweep finds our routes in a staff member's bundle", `staffRoutes ${sf.total.staffRoutes ?? 0}`);
  }

  // ── 7. step 3, the Flights page (the client wall, inside the client shell): what it may ask for ──
  {
    const { STARTING_SWITCHES, SWITCHES } = await import("../lib/clients/switches.mjs");
    ok(!STARTING_SWITCHES.includes("documents"), "Documents is off by default (not among the switches a new client starts with)", STARTING_SWITCHES.join(","));
    ok(!SWITCHES.some((w) => /passport|scan|raw|e-?mail|\.eml|attachment/i.test(`${w.key} ${w.label}`)), "no switch exists for passport scans or raw email downloads — they are not a client's at any setting");
    // every request the client's pages make, a flight opened: the wall's scoped reads, their passengers, their standing
    const { chromium } = await import("playwright");
    const br = await chromium.launch(); const ctx = await br.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.addCookies([{ name: cookieOf(s).split("=")[0], value: cookieOf(s).slice(cookieOf(s).indexOf("=") + 1), url: B }]);
    const pg = await ctx.newPage(); const asked = new Set();
    pg.on("request", (rq) => { const u = new URL(rq.url()); if (u.origin === B) asked.add(`${rq.method()} ${u.pathname}`); });
    for (const p of ["/client", "/client/airports", "/client/documents", "/client/account"]) { await pg.goto(`${B}${p}`, { waitUntil: "load" }); await pg.waitForTimeout(1500); if (p === "/client") { const f = pg.locator("[data-flight]").first(); if (await f.count()) { await f.click(); await pg.waitForTimeout(2000); } } }
    await br.close();
    const ALLOWED = /^(GET|HEAD) \/(client(\/(airports|documents|account))?$|_next\/|api\/client\/me$|digital-wall\/api\/(flights\/normalized|notam-check\/today|timeline\/sync-status|flight-info|airports\/search|aip-pdf|stream|weather)\b|agent\/api\/flights\/[^/]+\/passengers\b|favicon|PFP\.png$|icons\/)/;
    const other = [...asked].filter((a) => !ALLOWED.test(a) && !/^(GET|HEAD) \/[^/]+\.(png|svg|ico|woff2?)$/.test(a));
    ok(asked.size > 3 && other.length === 0, `the client's pages ask only for their own pages, their standing, the wall's scoped reads and their passengers (${asked.size} distinct requests)`, other.join(" · "));
    // passport scans and raw email: unreachable to a client, through the same path Cloudflare sends them (straight to the agent)
    const id = "00000000-0000-4000-8000-000000000001";
    const scan = await get(`/agent/api/intake/attachments/${id}`), raw = await get(`/agent/api/mailbox/messages/${id}/raw`);
    ok(scan.status === 404 && raw.status === 404, "a passport scan (intake attachment) and a raw email (.eml) answer 404 to a client at the agent", `${scan.status} ${raw.status}`);
  }

  // ── 4. with Airports and Documents on ──
  await svc(`/rest/v1/clients?id=eq.${rowId}`, { method: "PATCH", body: JSON.stringify({ switches: ["flight_board", "weather", "airport_search", "documents"] }) });
  await new Promise((r2) => setTimeout(r2, 11_000));   // the scope is cached ten seconds
  const home2 = await get("/client");
  ok(/data-menu="\/client \/client\/airports \/client\/documents"/.test(home2.text) && />Airports</.test(home2.text) && />Documents</.test(home2.text), "the menu now holds exactly Flights, Airports and Documents", /data-menu="([^"]*)"/.exec(home2.text)?.[1]);
  const a = await get("/client/airports"), d = await get("/client/documents");
  ok(a.status === 200 && /data-tab="airports"/.test(a.text) && d.status === 200, "Airports and Documents open with their switches on", `${a.status} ${d.status}`);
  ok((await get("/dashboard")).status === 404 && (await get("/api/search?q=EVRA")).status === 404, "…and nothing else opened with them");
} finally {
  if (rowId) await svc(`/rest/v1/clients?id=eq.${rowId}`, { method: "PATCH", body: JSON.stringify({ status: "removed", scope: [], switches: [], passenger_level: "off" }) }).catch(() => {});
  if (uid) await svc(`/auth/v1/admin/users/${uid}`, { method: "PUT", body: JSON.stringify({ app_metadata: { role: "client", is_approved: false, client_status: "removed" } }) }).catch(() => {});
  for (const k of kids) k.c.kill();
}
console.log(failures ? `${failures} FAILED` : "ALL PASSED"); process.exit(failures ? 1 : 0);
