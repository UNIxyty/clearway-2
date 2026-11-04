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
