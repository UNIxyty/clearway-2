// Mobile Tier 2 and 3 (2026-10-20, mobile-portal-spec.md › Tier 2 · Tier 3): every Tier 2 page of the phone shell at
// 390 × 844 in light and in dark, its first detail where the rig has one, and the three honest screens.
//   - no horizontal overflow, every touch target ≥ 44 px, no page error, photographed at 2× (rig/.scratch/shots/m-*.png);
//   - each page's loading, empty and error state by holding, emptying or failing its own data route, with the page's
//     own copy and a Try again;
//   - the honest screen: a way back, the link for a desk, and not one disabled button;
//   - the More sheet lists every Tier 2 page with its /m route and marks Permissions Desk;
//   - Help & support: asking a person from the phone creates a thread that then opens on the phone.
// Needs the rig (rig/start.sh: portal :3998, agent :5175, wall :5199 behind the proxy :3999).
//   node --env-file=.env.rig rig/mobile/tier2-check.mjs
import { chromium } from "playwright";
import { BASE, PHONE, audit, context, disabledButtons, makeOk, open, overflow, targets } from "./lib.mjs";

const { ok, state } = makeOk();
const W = "/digital-wall/api", A = "/agent/api";
const PAGES = [
  { name: "dashboard", path: "/m/dashboard", ready: "text=Today", route: /\/api\/user\/preferences/, error: /Couldn’t load your dashboard/ },
  { name: "service-status", path: "/m/service-status", ready: "[role=radiogroup]", route: /\/api\/country-service-status/, empty: { countries: [] }, emptyText: /No sources yet/, error: /Couldn’t load status/, detail: true },
  { name: "hidden-airports", path: "/m/hidden-airports", ready: "[data-phone-shell]", route: /\/api\/airports\/list/, empty: { results: [] }, emptyText: /No hidden airports/, error: /Couldn’t load the list/ },
  { name: "notam-check", path: "/m/notam-check", ready: "[data-phone-shell]", route: new RegExp(`${W}/notam-check/today`), empty: { ok: true, airports: [] }, emptyText: /Nothing to check/, error: /Couldn’t load the round/ },
  { name: "operators", path: "/m/operators", ready: "[role=radiogroup]", route: new RegExp(`${W}/operators`), empty: { operators: [] }, emptyText: /No operators yet/, error: /Couldn’t load operators/, detail: true },
  { name: "aircraft", path: "/m/aircraft", ready: "input", route: new RegExp(`${W}/aircraft/schedule`), empty: { aircraft: [] }, emptyText: /No aircraft/, error: /Couldn’t load aircraft/, detail: true },
  { name: "limitations", path: "/m/limitations", ready: "[data-phone-shell]", route: new RegExp(`${W}/timeline/limitations`), empty: { limitations: [] }, emptyText: /No limitations/, error: /Couldn’t load limitations/, detail: true },
  { name: "important", path: "/m/important", ready: "[data-phone-shell]", route: new RegExp(`${W}/important`), empty: { entries: [] }, emptyText: /No notices/, error: /Couldn’t load notices/, detail: true },
  { name: "caa", path: "/m/caa", ready: "input", route: new RegExp(`${W}/caa`), empty: { entries: [] }, emptyText: /No authorities yet/, error: /Couldn’t load contacts/, detail: true },
  { name: "webhooks", path: "/m/webhooks", ready: "[data-phone-shell]", route: new RegExp(`${W}/webhooks(\\?|$)`), empty: { tenants: {}, events: {} }, emptyText: /No webhooks/, error: /Couldn’t load webhooks/, detail: true },
  { name: "wall-settings", path: "/m/wall-settings", ready: "text=WALL DISPLAY", route: new RegExp(`${W}/display/settings(\\?|$)`), error: /Couldn’t load settings/ },
  { name: "reports", path: "/m/reports", ready: "[role=radiogroup]", route: new RegExp(`${W}/reports(\\?|$)`), empty: { reports: [], categories: [] }, emptyText: /No reports/, error: /Couldn’t load reports/, detail: true },
  { name: "reports-new", path: "/m/reports?new=1", ready: "textarea" },
  { name: "history", path: "/m/history", ready: "input", route: new RegExp(`${A}/history`), empty: { conversations: [], total: 0 }, emptyText: /No conversations yet/, error: /Couldn’t load history/ },
  { name: "knowledge", path: "/m/knowledge", ready: "[role=radiogroup]", route: new RegExp(`${A}/knowledge/documents(\\?|$)`), empty: { documents: [] }, emptyText: /No documents/, error: /Couldn’t load the knowledge base/, detail: true },
  { name: "activity", path: "/m/activity", ready: "[role=radiogroup]", route: new RegExp(`${A}/activity\\?`), empty: { rows: [], scope: "all" }, emptyText: /Nothing yet/, error: /Couldn’t load the log/ },
  { name: "agent-settings", path: "/m/agent-settings", ready: "text=YOURS", route: new RegExp(`${A}/settings/me`), error: /Couldn’t load settings/ },
  { name: "mailbox", path: "/m/mailbox", ready: "[data-phone-shell]", route: new RegExp(`${A}/mailbox/messages\\?`), pre: [[new RegExp(`${A}/mailbox/access`), { ok: true, allowed: true, readersCount: 1 }]], empty: { rows: [] }, emptyText: /Nothing needs you/, error: /Couldn’t load the mailbox/ },
  { name: "help", path: "/m/help", ready: "[data-phone-shell]", route: /\/api\/help\/threads(\?|$)/, empty: { threads: [] }, emptyText: /No questions yet/, error: /Couldn’t load your threads/ },
  { name: "help-new", path: "/m/help?new=1", ready: "textarea" },
  { name: "inbox", path: "/m/inbox", ready: "[data-phone-shell]", route: /\/api\/help\/inbox/, empty: { threads: [] }, emptyText: /Inbox is clear/, error: /Couldn’t load threads/ },
  { name: "users", path: "/m/users", ready: "[data-phone-shell]", route: /\/api\/admin\/users(\?|$)/, empty: { users: [], can: {} }, emptyText: /No users/, error: /Couldn’t load users/, detail: true },
  { name: "maintenance", path: "/m/maintenance", ready: "text=PORTAL", route: /\/api\/admin\/maintenance/, error: /Couldn’t read the portal’s state/ },
  { name: "agent-sites", path: "/m/agent-sites", ready: "[data-phone-shell]", route: new RegExp(`${A}/extension/sites/admin`), empty: { approved: [], requests: [] }, emptyText: /No sites/, error: /Couldn’t load sites/, detail: true },
  { name: "profile", path: "/m/profile", ready: "text=YOU", route: /\/api\/user\/preferences/, error: /Couldn’t load your profile/ },
  { name: "settings", path: "/m/settings", ready: "text=APPEARANCE" },
  { name: "desk-permissions", path: "/m/desk/permissions", ready: "text=needs a wider screen", honest: "Admin" },
  { name: "desk-debug", path: "/m/desk/debug", ready: "text=needs a wider screen", honest: "Developer" },
  { name: "desk-components", path: "/m/desk/components", ready: "text=needs a wider screen", honest: "Developer" },
];

const who = await (await fetch(`${BASE}/api/admin/status`)).json().catch(() => ({}));
const isAdmin = Boolean(who.isAdmin), isDev = Boolean(who.isDeveloper);
console.log(`rig account: admin=${isAdmin} developer=${isDev}`);
// Rows for the detail audits: the rig wall keeps none of these, so the check seeds one of each and removes it after
// (the limitation is dated, not permanent: a permanent one cannot be deleted).
const seeded = [];
async function seed(path, body, idOf) { const r = await fetch(`${BASE}${W}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); const j = await r.json().catch(() => null); const id = j && idOf(j); if (id) seeded.push({ path, id }); return id; }
const have = async (path, key) => ((await (await fetch(`${BASE}${W}${path}`)).json().catch(() => ({})))[key] ?? []).length > 0;
if (!(await have("/timeline/limitations?withMatches=true", "limitations"))) await seed("/timeline/limitations", { title: "Rig check limitation (invented)", description: "PPR required. Invented for the phone check.", isPermanent: false, startDate: new Date().toISOString().slice(0, 10), endDate: new Date(Date.now() + 86_400_000).toISOString().slice(0, 10), isActive: true, match: { airportIcaos: ["EVRA"] } }, (j) => j.limitation?.id);
if (!(await have("/important?includeInactive=true", "entries"))) await seed("/important", { title: "Rig check notice (invented)", body: "Fuel farm closed tonight. Invented for the phone check.", isActive: true, match: { airportIcaos: ["EVRA"] } }, (j) => j.entry?.id);
if (!(await have("/caa", "entries"))) await seed("/caa", { country: "Rigland", authorityName: "Rig CAA (invented)", validity: "24 h", functionKind: "overflight_landing", functionText: "Overflight and landing permits", phones: ["+000 000 0000"], mail: ["caa@rig.invalid"], isActive: true, match: { countries: ["Rigland"] } }, (j) => j.entry?.id);
async function unseed() { for (const { path, id } of seeded) { await fetch(`${BASE}${W}${path}/${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => {}); if (!path.startsWith("/caa")) await fetch(`${BASE}${W}${path}/${encodeURIComponent(id)}/purge`, { method: "DELETE" }).catch(() => {}); } if (seeded.length) console.log(`removed ${seeded.length} seeded row(s)`); }

const browser = await chromium.launch();
async function ready(page, spec) {
  try { await page.locator(spec.ready).first().waitFor({ timeout: 10_000 }); await page.waitForFunction(() => !document.querySelector("[role=status][aria-busy='true']"), null, { timeout: 10_000 }); return true; }
  catch { ok(false, `${spec.name}: ready (${spec.ready})`, (await page.locator("body").innerText()).slice(0, 160).replace(/\s+/g, " ")); return false; }
}

// ── every page, both themes, and its first detail ──
for (const theme of ["light", "dark"]) {
  const ctx = await context(browser, { theme });
  for (const spec of PAGES) {
    const { page, errors } = await open(ctx, spec.path);
    await ready(page, spec);
    await audit(ok, spec.name, theme, page, errors);
    if (spec.honest) {
      const dis = await disabledButtons(page);
      ok(dis.length === 0, `${spec.name} · ${theme}: not one disabled button`, dis.join(" | "));
      ok((await page.getByRole("link", { name: new RegExp(`^Back to ${spec.honest}`) }).count()) === 1, `${spec.name} · ${theme}: a way back (Back to ${spec.honest})`);
      const mail = await page.locator("a[href^='mailto:']").getAttribute("href");
      ok(Boolean(mail && /needs%20a%20wider%20screen/.test(mail) && /%2F(admin|developer)%2F/.test(mail)), `${spec.name} · ${theme}: Email me the link carries the desk's address`, (mail ?? "").slice(0, 80));
    }
    if (spec.detail && theme === "light") {
      const first = page.locator(`[data-phone-shell] a[href^='${spec.path}?']`).first();
      if (await first.count()) {
        await first.click(); await page.waitForTimeout(1500);
        const errs2 = []; page.on("pageerror", (e) => errs2.push(String(e)));
        await audit(ok, `${spec.name}-detail`, theme, page, errs2);
        ok((await page.getByRole("button", { name: "Back" }).count()) === 1, `${spec.name}-detail: the app bar has Back`);
      } else console.log(`skip  ${spec.name}: the rig has no row to open`);
    }
    await page.close();
  }
  await ctx.close();
}

// ── loading, empty, error — each page's own route ──
{
  const ctx = await context(browser, { theme: "light" });
  for (const s of PAGES.filter((p) => p.route)) {
    const pre = async (page) => { for (const [re, body] of s.pre ?? []) await page.route(re, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) })); };
    { const page = await ctx.newPage(); await pre(page); let release;
      await page.route(s.route, (route) => { release = () => route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ ok: false, error: "held" }) }); });
      await page.goto(`${BASE}${s.path}`, { waitUntil: "load" }); await page.waitForTimeout(900);
      const busy = await page.locator("[role=status][aria-busy='true']").count();
      ok(busy > 0, `${s.name} · loading: a skeleton while the data is held`, `role=status×${busy}`);
      const o = await overflow(page); ok(o.n === 0 && o.pageScroll <= 0, `${s.name} · loading: no horizontal overflow`, o.out.join(" | "));
      release?.(); await page.close(); }
    if (s.empty) { const page = await ctx.newPage(); await pre(page);
      await page.route(s.route, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, ...s.empty }) }));
      await page.goto(`${BASE}${s.path}`, { waitUntil: "load" }); await page.waitForTimeout(1800);
      const text = (await page.locator("[data-phone-shell]").innerText()).replace(/\s+/g, " ");
      ok(s.emptyText.test(text), `${s.name} · empty: says so, in its own words`, text.slice(0, 160));
      const t = await targets(page); ok(t.length === 0, `${s.name} · empty: targets ≥ 44 px`, t.slice(0, 4).join(" | "));
      await page.screenshot({ path: `rig/.scratch/shots/m-${s.name}-empty.png` }); await page.close(); }
    { const page = await ctx.newPage(); await pre(page);
      await page.route(s.route, (route) => route.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ ok: false, error: "The rig failed this on purpose." }) }));
      await page.goto(`${BASE}${s.path}`, { waitUntil: "load" }); await page.waitForTimeout(2000);
      const alerts = await page.locator("[role=alert]").allInnerTexts();
      const text = (alerts.join(" ") + " " + (await page.locator("[data-phone-shell]").innerText())).replace(/\s+/g, " ");
      ok(alerts.length > 0 && s.error.test(text), `${s.name} · error: an alert in the page's own words`, text.slice(0, 200));
      ok((await page.getByRole("button", { name: /Try again/ }).count()) > 0, `${s.name} · error: offers Try again`);
      await page.screenshot({ path: `rig/.scratch/shots/m-${s.name}-error.png` }); await page.close(); }
  }
  await ctx.close();
}

// ── the More sheet lists every Tier 2 page with its phone route, and marks Permissions Desk ──
{
  const ctx = await context(browser, { theme: "light" }); const page = await ctx.newPage();
  await page.goto(`${BASE}/m/wall`, { waitUntil: "load" }); await page.waitForTimeout(1500);
  await page.getByRole("button", { name: "More", exact: true }).click(); await page.waitForTimeout(700);
  const links = await page.locator("[role=dialog][aria-label='Every page'] a[href]").evaluateAll((as) => as.map((a) => ({ href: a.getAttribute("href"), text: a.textContent.replace(/\s+/g, " ").trim() })));
  const want = ["/m/dashboard", "/m/service-status", "/m/hidden-airports", "/m/notam-check", "/m/operators", "/m/aircraft", "/m/limitations", "/m/important", "/m/caa", "/m/webhooks", "/m/reports", "/m/wall-settings", "/m/history", "/m/knowledge", "/m/activity", "/m/agent-settings", "/m/profile", "/m/settings", "/m/help",
    ...(isAdmin || isDev ? ["/m/users", "/m/maintenance", "/m/agent-sites", "/m/desk/permissions"] : []), ...(isDev ? ["/m/inbox"] : [])];
  const missing = want.filter((h) => !links.some((l) => l.href === h));
  ok(missing.length === 0, `More lists every phone page for this role (${links.length} links)`, missing.length ? `missing ${missing.join(" ")}` : "");
  const stray = links.filter((l) => !l.href.startsWith("/m/") && !/^\/(digital-wall|account\/guide|login|developer|admin\/debug)/.test(l.href));
  ok(stray.length === 0, "every other entry is a desk page that has no phone version yet", stray.map((l) => l.href).join(" "));
  if (isAdmin || isDev) ok(links.some((l) => l.href === "/m/desk/permissions" && /Desk/.test(l.text)), "Permissions carries the Desk tag");
  else ok(!links.some((l) => /\/admin|\/m\/users|\/m\/desk/.test(l.href)), "a user sees no Admin pages in More (the Desk tag is checked with an admin account)");
  await page.screenshot({ path: "rig/.scratch/shots/m-more-tier2.png" }); await ctx.close();
}

// ── asking a person from the phone creates a thread, which then opens on the phone ──
{
  const ctx = await context(browser, { theme: "light" }); const page = await ctx.newPage();
  await page.goto(`${BASE}/m/help?new=1`, { waitUntil: "load" }); await page.waitForTimeout(1200);
  await page.getByRole("radio", { name: "A question" }).click();
  await page.locator("input").first().fill("Phone check: does the Wall tab show tomorrow’s flights?");
  await page.locator("textarea").fill("Asked from the Tier 2 check on the rig. Invented, no action needed.");
  await page.getByRole("button", { name: /^Send$/ }).click();
  try { await page.waitForURL((u) => /^\/m\/help\/[^/]+$/.test(u.pathname), { timeout: 10_000 }); } catch {}
  ok(/^\/m\/help\/[^/]+$/.test(new URL(page.url()).pathname), "Ask a person creates a thread and opens it on the phone", page.url());
  await page.waitForTimeout(1500);
  const text = (await page.locator("[data-phone-shell]").innerText()).replace(/\s+/g, " ");
  ok(/Phone check: does the Wall tab/.test(text) && /Asked from the Tier 2 check/.test(text), "the thread shows the title and the message", text.slice(0, 160));
  const errs = []; page.on("pageerror", (e) => errs.push(String(e)));
  await audit(ok, "help-thread", "light", page, errs);
  await ctx.close();
}

await unseed();
await browser.close();
console.log(state.failures ? `${state.failures} FAILED` : "ALL PASS");
process.exit(state.failures ? 1 : 0);
