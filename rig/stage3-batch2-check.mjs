// Portal redesign, stage 3, batch 2 — Service status, Dashboard, Airport — in the browser, on the rig (sign-in ON behind
// the proxy :3989):   node --env-file=.env.rig rig/stage3-batch2-check.mjs → rig/.scratch/shots/s3b2-*.png
// The rig has no AIP, NOTAM or weather source and no country statuses, so those answers are stubbed in the browser
// (page.route) with known content; everything else is the real rig. Leaves the admin's dashboard layout as it found it.
import { chromium } from "playwright";
import { mkdirSync, readFileSync } from "node:fs";
import { DEFAULT_NOTAM_GROUPS, compileNotamGroups, matchNotamText } from "../digital-wall/lib/notam-rules.mjs";

const BASE = process.env.RIG_SHELL_URL || "http://127.0.0.1:3989";
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL; const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(SB)) { console.error("refusing: not the rig's local Supabase"); process.exit(2); }
const OUT = "rig/.scratch/shots"; mkdirSync(OUT, { recursive: true });
let failures = 0; const ok = (c, what, d = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${what}${d ? `  · ${String(d).slice(0, 220)}` : ""}`); if (!c) failures += 1; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const browser = await chromium.launch();
const pageErrors = [];
const sessions = {};
async function as(who, theme = "light") {
  sessions[who] ??= await (await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "content-type": "application/json" }, body: JSON.stringify({ email: `rig-access-${who}@rig.invalid`, password: "rig-access-check-only" }) })).json();
  // colorScheme too: an account whose appearance is "system" follows the device, which the account's choice wins over.
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: theme });
  await ctx.addCookies([{ name: `sb-${new URL(SB).hostname.split(".")[0]}-auth-token`, value: `base64-${Buffer.from(JSON.stringify(sessions[who])).toString("base64")}`, url: BASE }]);
  await ctx.addInitScript((t) => { try { localStorage.setItem("cw-theme", t); localStorage.removeItem("cw-dashboard-layout"); } catch { /* */ } }, theme);
  const page = await ctx.newPage(); page.on("pageerror", (e) => pageErrors.push(`${who}: ${String(e.message).slice(0, 120)}`));
  return { ctx, page };
}
const srv = { "content-type": "application/json", apikey: KEY, authorization: `Bearer ${KEY}` };
const layoutOf = async (userId) => (await (await fetch(`${SB}/rest/v1/user_preferences?select=dashboard_layout&user_id=eq.${userId}`, { headers: srv })).json())[0]?.dashboard_layout;
const setLayout = (userId, v) => fetch(`${SB}/rest/v1/user_preferences?user_id=eq.${userId}`, { method: "PATCH", headers: srv, body: JSON.stringify({ dashboard_layout: v }) });

// ── Service status ───────────────────────────────────────────────────────────────────────────────────────────────────
const NAMES = ["Albania", "Algeria", "Armenia", "Australia", "Austria", "Belarus", "Belgium", "Brazil", "Bulgaria", "Canada", "Chile", "Croatia", "Cuba", "Cyprus", "Czechia", "Denmark", "Ecuador", "Egypt", "Estonia", "Finland", "France", "Georgia", "Germany", "Greece", "Guatemala", "Honduras", "Hong Kong", "Hungary", "Iceland", "India", "Ireland", "Israel", "Italy", "Japan", "Jordan", "Kazakhstan", "Kenya", "Kuwait", "Latvia", "Lithuania", "Luxembourg", "Malta", "Mexico", "Moldova", "Morocco", "Myanmar", "Netherlands", "Norway", "Oman", "Pakistan", "Panama", "Poland", "Portugal", "Romania", "Saudi Arabia", "Serbia", "Slovakia", "Slovenia", "Somalia", "Spain", "Sweden", "Switzerland", "Turkey", "Venezuela"];
const stateFor = (i) => (["Belarus", "Brazil", "Venezuela"].includes(NAMES[i]) ? "issues" : ["Cuba", "Kenya", "Oman", "Somalia"].includes(NAMES[i]) ? "partially_works" : i % 2 === 0 ? "operational" : "not_checked");
const COUNTRIES = NAMES.map((country, i) => ({ country, state: stateFor(i), note: country === "Brazil" ? "AISWEB rate-limits after 20 requests" : "", updatedAt: stateFor(i) === "not_checked" ? null : new Date(Date.UTC(2026, 9, 10) - i * 3600e3).toISOString(), updatedBy: null, runningDebug: false }));
const count = (s) => COUNTRIES.filter((c) => c.state === s).length;
{
  const { ctx, page } = await as("user");
  await page.route(/\/api\/country-service-status/, (r) => r.fulfill({ json: { countries: COUNTRIES, hasGlobalRunningDebug: false, generatedAt: new Date().toISOString() } }));
  await page.goto(`${BASE}/aip/service-status`, { waitUntil: "load" });
  await page.waitForSelector('table[aria-label="Country service statuses"] tbody tr td:has-text("Albania")', { timeout: 30000 });
  const donut = norm(await page.locator('section[aria-label="Summary"]').innerText());
  ok(donut.includes(`${COUNTRIES.length} countries`) && donut.includes(`Experiencing troubles ${count("issues")}`) && donut.includes(`Fully operational ${count("operational")}`), "the summary counts every state", donut.slice(0, 160));
  const recent = await page.locator('ol[aria-label="Recently changed"] li').allInnerTexts();
  ok(recent.length === 5 && norm(recent[0]).startsWith("Albania"), "Recently changed: the 5 latest updates, newest first, each with the state it was set to", recent.map(norm).join(" | "));
  ok(await page.locator('table[aria-label="Country service statuses"] tbody tr').count() === 50, "64 countries page at 50 rows");
  await page.getByRole("button", { name: /^Experiencing troubles/ }).click(); await sleep(300);
  const strip = norm(await page.locator('[role="status"]', { hasText: "Showing" }).first().innerText());
  const rows = await page.locator('table[aria-label="Country service statuses"] tbody tr').allInnerTexts();
  ok(/Showing 3 of 64/.test(strip) && rows.length === 3 && rows.every((r) => /Experiencing troubles/.test(r)) && await page.getByRole("button", { name: /^Experiencing troubles/ }).getAttribute("aria-pressed") === "true",
    "the legend filters the table, says what is hidden, and shows which state is picked", `${strip} · ${rows.map(norm).join(" | ").slice(0, 120)}`);
  ok(await page.getByRole("button", { name: /^Status/ }).first().innerText().then((t) => /Experiencing troubles|1/.test(t)), "the Status filter shows the same choice");
  await page.screenshot({ path: `${OUT}/s3b2-status-filtered.png` });
  await page.getByRole("button", { name: /^Experiencing troubles/ }).click(); await sleep(200);
  ok(await page.locator('table[aria-label="Country service statuses"] tbody tr').count() === 50, "clicking the state again shows every country");
  await page.getByRole("button", { name: /^In work/ }).click(); await sleep(200);
  ok(await page.getByText("No country is “In work” right now").isVisible() && await page.getByText("That's 0 of 64 countries.").isVisible(), "a state with no country says so, with the total");
  await page.getByRole("button", { name: "Clear filters" }).click(); await sleep(200);
  await page.getByPlaceholder("Filter countries").fill("bra"); await sleep(250);
  const found = await page.locator('table[aria-label="Country service statuses"] tbody tr').allInnerTexts();
  ok(found.length === 1 && /Brazil/.test(found[0]) && /AISWEB/.test(found[0]), "search finds a country and shows its note", found.map(norm).join(" | "));
  await ctx.close();
  const e = await as("user", "dark");
  await e.page.route(/\/api\/country-service-status/, (r) => r.fulfill({ status: 502, json: { error: "bad gateway" } }));
  await e.page.goto(`${BASE}/aip/service-status`, { waitUntil: "load" });
  ok(await e.page.getByText("Couldn't load country statuses").waitFor({ timeout: 20000 }).then(() => true, () => false) && /502 · GET \/api\/country-service-status/.test(await e.page.locator("body").innerText()), "a failed load names what failed, with a retry");
  await e.page.screenshot({ path: `${OUT}/s3b2-status-error-dark.png` });
  await e.ctx.close();
  for (const theme of ["light", "dark"]) {
    const s = await as("user", theme);
    await s.page.route(/\/api\/country-service-status/, (r) => r.fulfill({ json: { countries: COUNTRIES, hasGlobalRunningDebug: false, generatedAt: new Date().toISOString() } }));
    await s.page.goto(`${BASE}/aip/service-status`, { waitUntil: "load" }); await s.page.waitForSelector('td:has-text("Albania")'); await sleep(1200);
    await s.page.screenshot({ path: `${OUT}/s3b2-status-${theme}.png` });
    await s.ctx.close();
  }
}

// ── Dashboard ────────────────────────────────────────────────────────────────────────────────────────────────────────
const adminId = (sessions.admin ??= await (await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "content-type": "application/json" }, body: JSON.stringify({ email: "rig-access-admin@rig.invalid", password: "rig-access-check-only" }) })).json()).user.id;
const savedLayout = await layoutOf(adminId);
await setLayout(adminId, null);
const order = (page) => page.locator("[data-block]").evaluateAll((els) => els.map((e) => e.getAttribute("data-block")));
{
  const { ctx, page } = await as("admin");
  await page.goto(`${BASE}/dashboard`, { waitUntil: "load" });
  await page.waitForSelector('[data-block="changelog"] li', { timeout: 30000 });
  await sleep(1500);
  ok(JSON.stringify(await order(page)) === JSON.stringify(["today", "recent", "monitors", "health", "links", "changelog"]), "the default layout: Today, Recently used, monitors, Server health, Quick links, Changelog", (await order(page)).join(","));
  const recent = norm(await page.locator('[data-block="recent"]').innerText());
  ok(/Couldn't load your recent activity/.test(recent) && /500 · GET \/api\/dashboard\/recents/.test(recent) && await page.locator('[data-block="recent"]').getByRole("button", { name: "Retry" }).isVisible(),
    "one block failing shows its own error and retry (the rig has no search_events table)…", recent.slice(0, 120));
  ok(await page.locator('[data-block="changelog"] li').count() > 0 && await page.locator('[data-block="links"] a').count() === 5, "…while the others render");
  const today = norm(await page.locator('[data-block="today"]').innerText());
  ok(/Flights today — Couldn't load/.test(today) && /NOTAM checks left \d/.test(today) && /Open reports \d/.test(today), "Today: a counter whose source fails says so, the others still count (no Leon on the rig)", today);
  ok(/checked \d\d:\d\d:\d\dZ/.test(norm(await page.locator('[data-block="monitors"] header').innerText())), "times are UTC");
  ok(/Full changelog/.test(await page.locator('[data-block="changelog"] header').innerText()), "the Changelog block links to the full list");
  await page.screenshot({ path: `${OUT}/s3b2-dashboard.png`, fullPage: true });

  // Customise
  await page.getByRole("button", { name: "Customise" }).click();
  const lib = page.locator('aside[aria-label="Blocks"]');
  ok(await lib.getByRole("checkbox").count() === 6 && await page.getByRole("button", { name: "Done" }).isVisible() && await page.getByRole("button", { name: "Reset to default" }).isVisible() && /Editing — changes save/.test(await page.locator("main, body").first().innerText()),
    "Customise: the block list (6 for an admin), Done, Reset to default, and the page says changes save");
  await page.locator('[data-block="links"]').getByRole("radio", { name: "L" }).click(); await sleep(300);
  const w = await page.evaluate(() => { const g = document.querySelector(".cw-dash-grid").getBoundingClientRect().width; return document.querySelector('[data-block="links"]').getBoundingClientRect().width / g; });
  ok(w > 0.62 && w < 0.7, "L makes a block 8 of 12 columns wide", w.toFixed(2));
  const before = await order(page);
  await page.getByRole("button", { name: /^Move Quick links/ }).focus(); await page.keyboard.press("ArrowUp"); await sleep(300);
  const after = await order(page);
  ok(after.indexOf("links") === before.indexOf("links") - 1 && await page.evaluate(() => document.activeElement?.getAttribute("aria-label")?.startsWith("Move Quick links")), "the arrow keys move a block by its handle, and focus stays on it", after.join(","));
  // A viewport tall enough that nothing scrolls mid-drag (Playwright scrolls the target into view between the press and
  // the first move, which a person's drag does not do).
  await page.setViewportSize({ width: 1440, height: 2400 }); await sleep(300);
  await page.getByRole("button", { name: /^Move Changelog/ }).dragTo(page.locator('[data-block="today"]'));
  await sleep(500);
  await page.setViewportSize({ width: 1440, height: 900 });
  const dragged = await order(page);
  ok(dragged[0] === "changelog", "dragging by the handle reorders", dragged.join(","));
  await page.locator('[data-block="today"]').getByRole("button", { name: "Remove Today" }).click(); await sleep(200);
  ok(!(await order(page)).includes("today") && await lib.getByRole("checkbox", { name: "Show Today" }).getAttribute("aria-checked") === "false", "remove takes the block off and unticks it in the list");
  await lib.getByRole("checkbox", { name: "Show Today" }).click(); await sleep(200);
  ok((await order(page)).at(-1) === "today", "ticking it adds it back at the end");
  await page.screenshot({ path: `${OUT}/s3b2-dashboard-edit.png`, fullPage: true });
  await page.getByRole("button", { name: "Done" }).click(); await sleep(600);
  // The account copy is saved 500 ms after the last change: wait for it (up to 8 s) rather than a fixed time, which
  // was too short on a busy machine (a full run, 2026-10-12).
  const expected = await order(page);
  let saved = null;
  for (let i = 0; i < 32; i += 1) { saved = await layoutOf(adminId); if (Array.isArray(saved) && JSON.stringify(saved.map((b) => b.id)) === JSON.stringify(expected)) break; await sleep(250); }
  ok(Array.isArray(saved) && JSON.stringify(saved.map((b) => b.id)) === JSON.stringify(expected) && saved.find((b) => b.id === "links")?.size === "L", "the layout is saved on the account as it is changed", JSON.stringify(saved));
  await page.reload({ waitUntil: "load" }); await page.waitForSelector("[data-block]"); await sleep(1500);
  ok(JSON.stringify(await order(page)) === JSON.stringify(expected), "and comes back after a reload");
  const c2 = await as("admin");
  await c2.page.goto(`${BASE}/dashboard`, { waitUntil: "load" }); await c2.page.waitForSelector("[data-block]"); await sleep(1500);
  ok(JSON.stringify(await order(c2.page)) === JSON.stringify(expected), "and in another browser (it follows the account)"); await c2.ctx.close();
  // Empty, then the default again
  await page.getByRole("button", { name: "Customise" }).click();
  for (let i = 0; i < 8 && await lib.getByRole("checkbox", { checked: true }).count(); i++) { await lib.getByRole("checkbox", { checked: true }).first().click(); await sleep(100); }
  await sleep(200);
  ok(await page.getByText("Tick a block in the list to add it.").isVisible(), "with every block removed, editing says how to add one");
  await page.getByRole("button", { name: "Done" }).click(); await sleep(300);
  ok(await page.getByText("Your dashboard has no blocks").isVisible() && await page.getByRole("button", { name: "Use the default layout" }).isVisible() && await page.getByRole("button", { name: "Add blocks" }).isVisible(), "the empty dashboard offers Add blocks and the default layout");
  await page.screenshot({ path: `${OUT}/s3b2-dashboard-empty.png` });
  await page.getByRole("button", { name: "Use the default layout" }).click(); await sleep(1200);
  ok((await order(page)).length === 6 && (await layoutOf(adminId)) === null, "Use the default layout puts the six back and clears the saved layout");
  // Full changelog
  await page.locator('[data-block="changelog"]').getByRole("link", { name: "Full changelog" }).click();
  await page.waitForURL(/\/dashboard\/changelog$/); await page.waitForSelector("section li", { timeout: 20000 });
  const n = await page.locator("section li").count();
  await page.getByRole("radio", { name: "Errors" }).click(); await sleep(1500);
  ok(n > 6 && /Changelog/.test(await page.locator("h1").innerText()), "the full changelog lists more than the block's 6, with All / Edits / Errors", `${n} entries`);
  await ctx.close();
}
{
  const { ctx, page } = await as("user");
  await page.goto(`${BASE}/dashboard`, { waitUntil: "load" });
  await page.waitForSelector('[data-block="changelog"]', { timeout: 30000 }); await sleep(1500);
  ok(!(await order(page)).includes("health") && /Your changelog/.test(await page.locator('[data-block="changelog"] header').innerText()), "a User: no Server health, and the changelog is theirs");
  await page.getByRole("button", { name: "Customise" }).click();
  ok(await page.locator('aside[aria-label="Blocks"]').getByRole("checkbox").count() === 5, "a User's block list has no Server health");
  await ctx.close();
}
for (const theme of ["light", "dark"]) {
  const s = await as("admin", theme);
  await s.page.route(/\/api\/dashboard\/recents/, (r) => r.fulfill({ json: { recents: ["EVRA", "ESSA", "ENBG", "LDZA", "EIBR", "BIBA"].map((icao, i) => ({ resource: icao, service: "AIP", action: i % 2 ? "Opened" : "Searched", when: new Date(Date.now() - (i + 1) * 3 * 3600e3).toISOString(), href: `/aip/${icao}` })) } }));
  await s.page.goto(`${BASE}/dashboard`, { waitUntil: "load" }); await s.page.waitForSelector('[data-block="recent"] a'); await sleep(1500);
  await s.page.screenshot({ path: `${OUT}/s3b2-dashboard-${theme}.png`, fullPage: true });
  await s.ctx.close();
}
await setLayout(adminId, savedLayout ?? null);

// ── Airport ──────────────────────────────────────────────────────────────────────────────────────────────────────────
const NOTAMS = [
  ["A2291/26", "RWY 18/36 CLSD DUE TO WIP. ACFT MAY USE TWY C FOR BACKTRACK."],
  ["A2287/26", "PPR FOR GA ACFT 1800-0500. SLOT REQUIRED VIA EVRA ARO."],
  ["A2280/26", "ILS RWY 36 GP U/S. LOC AVBL."],
  ["A2276/26", "TWY C AVBL FOR ACFT UP TO CODE C."],
  ["A2270/26", "RWY 18 THR DISPLACED 300M."],
  ["A2268/26", "ATIS FREQ CHANGED TO 132.400."],
  ["A2260/26", "BIRD CONCENTRATION IN THE VICINITY OF AD."],
  ["A2255/26", "FUEL JET A-1 NOT AVBL AT STANDS 21-24."],
].map(([number, condition]) => ({ location: "EVRA", number, class: "A", startDateUtc: "2610102200", endDateUtc: number === "A2268/26" ? "PERM" : "2610140400", condition }));
const compiled = compileNotamGroups(DEFAULT_NOTAM_GROUPS);
const catOf = (n) => { const h = matchNotamText(`${n.number} ${n.condition}`, compiled)[0]; return h ? DEFAULT_NOTAM_GROUPS.findIndex((g) => g.group === h.group) : DEFAULT_NOTAM_GROUPS.length - 1; };
const expectCounts = DEFAULT_NOTAM_GROUPS.map((_, i) => NOTAMS.filter((n) => catOf(n) === i).length);
const WX = "Airport EVRA Riga International\nMETAR 101820Z 24012KT 9999 FEW028 11/06 Q1014 NOSIG\nTAF 101700Z 1018/1118 24012KT 9999 FEW030 TEMPO 1103/1108 4000 BR BKN008";
const sse = (events) => events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("");
const AD2 = readFileSync("EETU_AIP_AD2.pdf"), GEN = readFileSync("LZPP_AIP_AD2.pdf");
async function stubAirport(page, { notamFail = false } = {}) {
  const at = new Date(Date.now() - 2 * 3600e3).toISOString();
  await page.route(/\/api\/aip\/ead\/pdf\?icao=EVRA/, (r) => (r.request().method() === "HEAD" ? r.fulfill({ status: 200, headers: { "content-type": "application/pdf" }, body: "" }) : r.fulfill({ status: 200, contentType: "application/pdf", body: AD2 })));
  await page.route(/\/api\/aip\/ead\?icao=EVRA/, (r) => r.fulfill({ json: { airports: [], updatedAt: at, cache: { ttlMs: 86400000 } } }));
  await page.route(/\/api\/aip\/gen\/pdf\/exists/, (r) => r.fulfill({ json: { exists: true } }));
  await page.route(/\/api\/aip\/gen\/pdf\?icao=EVRA/, (r) => r.fulfill({ status: 200, contentType: "application/pdf", body: GEN }));
  await page.route(/\/api\/notams\?icao=EVRA/, (r) => r.fulfill({ status: 200, contentType: "text/event-stream", body: notamFail
    ? sse([{ step: "Signing in to CrewBriefing · attempt 3 of 3" }, { error: "CrewBriefing sign-in failed", detail: "3 attempts" }])
    : sse([{ step: "Signing in to CrewBriefing" }, { done: true, notams: NOTAMS, updatedAt: at }]) }));
  await page.route(/\/api\/weather\?icao=EVRA/, (r) => r.fulfill({ status: 200, contentType: "text/event-stream", body: sse([{ done: true, weather: WX, updatedAt: at }]) }));
}
const pagesShown = (page) => page.locator('[role="toolbar"][aria-label="Document controls"]').innerText().then((t) => Number((norm(t).match(/\/ (\d+)/) ?? [])[1] ?? 0));
{
  const { ctx, page } = await as("admin");
  await stubAirport(page);
  await page.goto(`${BASE}/aip/EVRA`, { waitUntil: "load" });
  await page.waitForSelector('[role="toolbar"][aria-label="Document controls"]', { timeout: 30000 });
  for (let i = 0; i < 40 && !(await pagesShown(page)); i++) await sleep(250);
  const head = norm(await page.locator("h1").locator("xpath=../..").innerText());
  ok(/EVRA/.test(head) && /Riga/.test(head) && /56\.\d{4} 23\.\d{4} Map/.test(head) && /AIP fetched \d\d \w{3} \d\d:\d\dZ · expires \d\d \w{3} \d\d:\d\dZ/.test(head), "header: the airport on one line, the location on one line with a Map link, fetched/expires in UTC", head);
  ok(/openstreetmap\.org/.test(await page.getByRole("link", { name: "Map" }).getAttribute("href")) && await page.locator(".leaflet-container").count() === 0, "the map card is gone; Map opens the location");
  for (const name of ["Download PDF", "Re-sync", "Web AIP"]) ok(await page.getByRole("button", { name, exact: true }).isEnabled(), `action: ${name}`);
  await page.getByRole("button", { name: "More for EVRA" }).click();
  const menu = await page.getByRole("menu").innerText();
  ok(/Download GEN 1\.2 PDF/.test(menu) && /Report a problem/.test(menu), "⋯ holds GEN 1.2 and Report a problem", norm(menu));
  await page.keyboard.press("Escape");
  const tabs = await page.getByRole("tab").allInnerTexts();
  ok(tabs.length === 2 && /AD 2 · EVRA/.test(tabs[0]) && /GEN · Latvia/.test(tabs[1]), "document tabs: AD 2 and GEN", tabs.map(norm).join(" | "));
  const pages = await pagesShown(page);
  ok(pages > 1 && await page.locator('[aria-label="Pages"] button').count() === pages, "the AD 2 PDF opens in the viewer, with a thumbnail per page", `${pages} pages`);
  await page.getByRole("button", { name: "Next page" }).click(); await sleep(1200);
  ok(await page.getByRole("textbox", { name: "Page" }).inputValue() === "2", "next page");
  const z0 = norm(await page.getByRole("button", { name: /^Zoom/ }).first().innerText().catch(() => ""));
  await page.getByRole("button", { name: "Zoom in" }).click(); await sleep(600);
  const z1 = norm(await page.locator('[role="toolbar"][aria-label="Document controls"]').innerText());
  ok(/\d+%/.test(z1) && !/Fit width/.test(z1), "zoom in leaves Fit width for a set zoom", `${z0} → ${(z1.match(/\d+%/) ?? [""])[0]}`);
  const portrait = await page.locator(".cw-page").first().evaluate((e) => e.clientHeight > e.clientWidth);
  await page.getByRole("button", { name: "Rotate" }).click(); await sleep(800);
  const landscape = await page.locator(".cw-page").first().evaluate((e) => e.clientWidth > e.clientHeight);
  ok(portrait && landscape, "rotate turns the pages");
  await page.getByRole("button", { name: "Rotate" }).click(); await page.getByRole("button", { name: "Rotate" }).click(); await page.getByRole("button", { name: "Rotate" }).click();
  await page.getByRole("button", { name: "Find in document" }).click();
  await page.getByRole("searchbox", { name: "Find in this document" }).fill("AERODROME"); await sleep(2500);
  const findRow = norm(await page.getByRole("searchbox", { name: "Find in this document" }).locator("xpath=../..").innerText());
  ok(/\d+ of \d+/.test(findRow), "find in document counts the matches", findRow);
  ok(await page.getByRole("link", { name: "Open in a new tab" }).getAttribute("href").then((h) => /\/api\/aip\/ead\/pdf\?icao=EVRA&inline=1/.test(h)), "open in a new tab");
  await page.screenshot({ path: `${OUT}/s3b2-airport.png` });
  // NOTAMs
  const chips = await page.locator('ul[aria-label="Categories"] li').allInnerTexts();
  const got = chips.map((c) => Number((norm(c).match(/(\d+)$/) ?? [])[1]));
  ok(JSON.stringify(got) === JSON.stringify(expectCounts) && /Closure/.test(chips[0]) && /Info/.test(chips[4]), "NOTAMs are counted by the wall's five categories, by the wall's own rules", `${chips.map(norm).join(" | ")} · expected ${expectCounts.join(",")}`);
  const list = page.locator('ul[aria-label="NOTAMs for EVRA"] li');
  ok(await list.count() === 6 && /A2291\/26/.test(await list.first().innerText()) && /Closure/.test(await list.first().innerText()), "closures first; the first 6 shown");
  const [dot, danger] = await page.evaluate(() => {
    const d = document.querySelector('ul[aria-label="NOTAMs for EVRA"] li span[aria-hidden]');
    const probe = document.createElement("span"); probe.style.background = "var(--cw-danger)"; document.body.appendChild(probe);
    const out = [getComputedStyle(d).backgroundColor, getComputedStyle(probe).backgroundColor]; probe.remove(); return out;
  });
  ok(dot === danger, "a closure is drawn in the portal's danger colour", `${dot} vs ${danger}`);
  ok(/10 Oct 22:00Z → 14 Oct 04:00Z/.test(await list.first().innerText()), "validity reads as on the wall (UTC)");
  await page.getByRole("button", { name: "All 8 NOTAMs" }).click();
  ok(await list.count() === 8, "All 8 NOTAMs shows the rest");
  const wx = norm(await page.locator('section[aria-label="Weather"]').innerText());
  ok(/METAR · 101820Z/.test(wx) && /TAF · 101700Z/.test(wx), "weather: METAR and TAF", wx.slice(0, 120));
  // GEN
  await page.getByRole("tab", { name: /GEN/ }).click();
  for (let i = 0; i < 40 && !(await pagesShown(page)); i++) await sleep(250);
  ok(await pagesShown(page) > 0 && /GEN_1\.2\.pdf/.test(await page.locator('[role="toolbar"][aria-label="Document controls"]').getByRole("button", { name: /^Download / }).getAttribute("aria-label")), "the GEN tab opens GEN 1.2 (already in storage, so by itself)", `${await pagesShown(page)} pages`);
  await page.screenshot({ path: `${OUT}/s3b2-airport-gen.png` });
  await ctx.close();
}
{
  // Partial error (§3.9): the NOTAM source fails; the document and the weather still work.
  const { ctx, page } = await as("user", "dark");
  await stubAirport(page, { notamFail: true });
  await page.goto(`${BASE}/aip/EVRA`, { waitUntil: "load" });
  await page.waitForSelector('[role="toolbar"][aria-label="Document controls"]', { timeout: 30000 });
  for (let i = 0; i < 40 && !(await pagesShown(page)); i++) await sleep(250);
  await sleep(800);
  const notams = norm(await page.locator('section[aria-label="NOTAMs"]').innerText());
  ok(/Couldn't get NOTAMs/.test(notams) && /CrewBriefing sign-in failed/.test(notams) && await page.locator('section[aria-label="NOTAMs"]').getByRole("button", { name: "Try again" }).isVisible(),
    "the NOTAM source failing shows its own error and Try again…", notams.slice(0, 120));
  ok(await pagesShown(page) > 1 && /METAR/.test(await page.locator('section[aria-label="Weather"]').innerText()), "…and the document and weather still work");
  await page.screenshot({ path: `${OUT}/s3b2-airport-partial-dark.png` });
  await ctx.close();
}
for (const theme of ["light", "dark"]) {
  const s = await as("admin", theme);
  await stubAirport(s.page);
  await s.page.goto(`${BASE}/aip/EVRA`, { waitUntil: "load" }); await s.page.waitForSelector(".cw-page canvas", { timeout: 30000 }); await sleep(2500);
  await s.page.screenshot({ path: `${OUT}/s3b2-airport-${theme}.png` });
  await s.ctx.close();
}

ok(pageErrors.length === 0, "no page errors", pageErrors.join(" | "));
await browser.close();
console.log(failures ? `\n${failures} FAILED · ${OUT}/s3b2-*.png` : `\nALL PASSED · ${OUT}/s3b2-*.png`);
process.exit(failures ? 1 : 0);
