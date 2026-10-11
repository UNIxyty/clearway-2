// Part B — pages that should not be there — in the browser, on the rig (sign-in ON behind the proxy :3989):
//   node --env-file=.env.rig rig/partB-check.mjs
//   · the nav, for every role with every group open: no Debug runner, no Component sheet, no Reports & Issues, no
//     Search statistics or Notification settings
//   · the debug runner (page, raw page, API) and the component sheet: the developer gets in, everyone else is refused
//   · bug reports: Help & support is where they are filed; Console reports is still in the wall console
//   · the deleted pages answer 404 and their old addresses no longer redirect; nothing links to them
//   · the permissions grid has no switch for a page that no longer exists; portal.debug.run is developer only
//   · docs/portal-inventory.md marks the two URL-only pages as intentional
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const BASE = process.env.RIG_SHELL_URL || "http://127.0.0.1:3989";
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL; const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(SB)) { console.error("refusing: not the rig's local Supabase"); process.exit(2); }
let failures = 0; const ok = (c, what, d = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${what}${d ? `  · ${String(d).slice(0, 240)}` : ""}`); if (!c) failures += 1; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cookieName = `sb-${new URL(SB).hostname.split(".")[0]}-auth-token`;
const sessions = {};
const session = async (who) => (sessions[who] ??= await (await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "content-type": "application/json" }, body: JSON.stringify({ email: `rig-access-${who}@rig.invalid`, password: "rig-access-check-only" }) })).json());
const cookie = async (who) => `${cookieName}=base64-${Buffer.from(JSON.stringify(await session(who))).toString("base64")}`;
const browser = await chromium.launch();
async function as(who) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await ctx.addCookies([{ name: cookieName, value: `base64-${Buffer.from(JSON.stringify(await session(who))).toString("base64")}`, url: BASE }]);
  return { ctx, page: await ctx.newPage() };
}
const GONE = /Debug runner|Component sheet|Reports & Issues|Search statistics|Notification settings/;

for (const who of ["user", "admin", "dev"]) {
  const { ctx, page } = await as(who);
  await page.goto(`${BASE}/dashboard`, { waitUntil: "load" }); await page.waitForSelector("[data-cw-sidebar]"); await sleep(2500);
  // Every group open.
  for (let i = 0; i < 12; i++) { const shut = page.locator('[data-cw-sidebar] button[aria-expanded="false"]'); if (!(await shut.count())) break; await shut.first().click(); await sleep(250); }
  const nav = await page.locator("[data-cw-sidebar]").innerText();
  ok(!GONE.test(nav), `${who}: the nav (every group open) has no Debug runner, Component sheet, Reports & Issues, Search statistics or Notification settings`, (nav.match(GONE) ?? [""])[0]);
  for (const [path, label] of [["/admin/debug", "debug runner"], ["/admin/debug/raw", "debug runner's raw stream"], ["/developer/components", "component sheet"]]) {
    await page.goto(`${BASE}${path}`, { waitUntil: "load" }); await sleep(1500);
    const refused = /\/forbidden/.test(page.url());
    if (who === "dev") {
      const body = await page.locator("body").innerText();
      const right = path === "/admin/debug/raw" ? /No run selected/.test(body) : path === "/admin/debug" ? /Debug Runner|Run a check/i.test(body) : /component|Buttons/i.test(body);
      ok(!refused && right, `developer: the ${label} works by URL`, page.url());
    } else ok(refused, `${who}: the ${label} is refused`, page.url());
  }
  const api = await fetch(`${BASE}/api/admin/debug/runs`, { headers: { cookie: await cookie(who), accept: "application/json" } });
  ok(who === "dev" ? api.status === 200 : api.status === 403 || api.status === 401, `${who}: the debug runner's API ${who === "dev" ? "answers" : "refuses"}`, api.status);
  await ctx.close();
}

{
  const { ctx, page } = await as("user");
  await page.goto(`${BASE}/dashboard`, { waitUntil: "load" }); await page.waitForSelector("[data-cw-sidebar]"); await sleep(2000);
  await page.locator("[data-cw-sidebar]").getByText("Help & support", { exact: true }).first().click(); await page.waitForURL(/\/help(\?|$)/, { timeout: 15000 }); await sleep(1000);
  await page.getByRole("button", { name: /Something is broken/ }).click(); await page.waitForURL(/\/help\/new\?type=bug/, { timeout: 15000 });
  ok(true, "bug reports: Help & support → Something is broken files a bug report (not the debug runner)");
  for (const path of ["/account/search-stats", "/account/notifications", "/stats", "/settings/notifications"]) {
    const r = await fetch(`${BASE}${path}`, { headers: { cookie: await cookie("user") }, redirect: "manual" });
    ok(r.status === 404, `${path} is gone (404, no redirect)`, `${r.status} ${r.headers.get("location") ?? ""}`);
  }
  await ctx.close();
}

// Console reports stays in the wall console; the console's account menu no longer links to the deleted pages.
const consoleApp = readFileSync("opsboard-react/src/ConsoleApp.jsx", "utf8");
ok(/reports/i.test(consoleApp) && !/account\/notifications|account\/search-stats/.test(consoleApp), "the wall console keeps Reports and no longer links to the deleted pages");
const navSrc = readFileSync("components/portal/nav.ts", "utf8");
ok(/digital-wall\/console\/reports/.test(navSrc), "Digital Wall → Reports (the console's reports) is still in the nav");

// The permissions grid.
const grid = await (await fetch(`${BASE}/api/admin/permissions`, { headers: { cookie: await cookie("dev"), accept: "application/json" } })).json();
const actions = (grid.groups ?? []).flatMap((g) => g.actions ?? []);
ok(actions.length > 0 && !actions.some((a) => /search.?stat|notification.?setting/i.test(`${a.key} ${a.label}`)), "the permissions grid has no switch for the deleted pages", `${actions.length} actions`);
const dbg = actions.find((a) => a.key === "portal.debug.run");
ok(dbg && JSON.stringify(dbg.default) === JSON.stringify(["developer"]), "portal.debug.run stays in the grid, developer only by default", JSON.stringify(dbg?.default));

// The old bug-report endpoint is gone, with its three switches; nothing on the airport pages sends browser
// notifications any more (the setting was deleted, so nobody could turn them off).
for (const [m, path] of [["GET", "/api/bug-reports"], ["POST", "/api/bug-reports"], ["PATCH", "/api/bug-reports/x"]]) {
  const r = await fetch(`${BASE}${path}`, { method: m, headers: { cookie: await cookie("admin"), "content-type": "application/json" }, body: m === "GET" ? undefined : "{}" });
  ok(r.status === 404 || r.status === 403, `${m} ${path} is gone`, r.status);
}
ok(!actions.some((a) => a.key.startsWith("portal.bugs.")), "the grid has no bug-report switches (portal.bugs.* retired)");
for (const f of ["components/portal/AirportView.tsx", "app/aip/page.tsx"]) ok(!/sendNotification|new Notification\(/.test(readFileSync(f, "utf8")), `${f} sends no browser notification`);
const inv = readFileSync("docs/portal-inventory.md", "utf8");
ok(/\*\*`\/admin\/debug`\*\*[^\n]*developer/i.test(inv) && /\*\*`\/developer\/components`\*\*[^\n]*component sheet/i.test(inv) && /Reachable by URL only, on purpose/.test(inv), "docs/portal-inventory.md marks both URL-only pages as intentional");

await browser.close();
console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
