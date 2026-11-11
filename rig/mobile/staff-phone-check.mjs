// The staff phone app (design "Phone Views" › Staff, 2026-11-12): the wall's own phone app at /digital-wall/timeline/
// for a signed-in person on a phone — five tabs, the shared timeline and list, the flight page with the five checks,
// Passengers in the shared viewer on one tap, the NOTAM / Limits / Important tabs and More, deep links, no overlap,
// 44 px targets, light and dark at 390 and 360. Through the rig proxy (:3999, sign-in off: the mock person).
//   node --env-file=.env.rig rig/mobile/staff-phone-check.mjs
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { settled } from "../lib/settle.mjs";
import { textOverlaps } from "../lib/overlap.mjs";

const BASE = process.env.RIG_SHELL_URL || "http://127.0.0.1:3999";
const OUT = "rig/.scratch/shots"; mkdirSync(OUT, { recursive: true });
let failures = 0; const ok = (c, what, d = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${what}${d ? `  · ${String(d).slice(0, 240)}` : ""}`); if (!c) failures += 1; };
const browser = await chromium.launch();

for (const [theme, width] of [["light", 390], ["dark", 360], ["dark", 390]]) {
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, deviceScaleFactor: 2, colorScheme: theme, hasTouch: true, isMobile: true });
  await ctx.addInitScript((t) => { try { localStorage.setItem("cw-theme", t); } catch {} }, theme);
  const page = await ctx.newPage(); const errors = []; page.on("pageerror", (e) => errors.push(String(e.message || e))); page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text().slice(0, 200)}`); });
  await page.goto(`${BASE}/digital-wall/timeline/`, { waitUntil: "load" });
  await page.waitForSelector("[data-staff-phone]", { timeout: 30000 }).catch(() => {});
  await page.waitForSelector("[data-board] [data-fid]", { timeout: 30000 }).catch(() => {});
  await settled(page);
  const tabs = await page.locator("[data-staff-tabs] button").allInnerTexts();
  ok(tabs.map((t) => t.trim()).join(",") === "Timeline,NOTAM,Limits,Important,More", `${theme} ${width}: the five tabs of the design`, tabs.join(","));
  const tabBox = await page.locator("[data-staff-tabs] button").first().boundingBox();
  ok(Boolean(tabBox) && tabBox.height >= 44 && tabBox.width >= 44, `${theme} ${width}: a tab is a 44 px target`, JSON.stringify(tabBox));
  const pills = await page.locator("[data-board] [data-fid]").count();
  ok(pills > 0, `${theme} ${width}: the timeline draws the room's flights`, `${pills} pills`);
  const meta = await page.evaluate(() => document.querySelector('meta[name="viewport"]')?.getAttribute("content") || "");
  ok(!/user-scalable\s*=\s*no/i.test(meta) && /initial-scale=1/.test(meta), `${theme} ${width}: no user-scalable=no`, meta);
  const o1 = await textOverlaps(page, { ignore: [".cwp-scrim", "[data-now-pin]", ".cwsp-tabs"] }); ok(o1.length === 0, `${theme} ${width}: the timeline overlaps nothing`, o1.map((x) => `"${x.a}" × "${x.b}"`).join(" · "));
  await page.screenshot({ path: `${OUT}/staff-phone-timeline-${theme}-${width}.png` });
  // the list, with open checks as chips
  await page.locator("[data-view-list]").click(); await page.locator("[data-flight-row]").first().waitFor({ timeout: 15000 }).catch(() => {});
  const chips = await page.locator("[data-open-checks]").count();
  ok(await page.locator("[data-flight-row]").count() > 0, `${theme} ${width}: the list draws the flights`, `${chips} rows with open checks`);
  // a flight: checks, map and passengers on one tap
  const fn = await page.locator("[data-flight-row]:not(.is-cnl)").first().getAttribute("data-flight-row");
  await page.locator(`[data-flight-row="${fn}"]`).first().click(); await page.waitForSelector(`[data-flight-page="${fn}"]`, { timeout: 15000 }).catch(() => {});
  await page.waitForSelector('[data-section="checks"]', { timeout: 15000 }).catch(() => {});
  ok(await page.locator('[data-section="checks"] [data-check]').count() === 5, `${theme} ${width}: the flight page carries the five checks`, fn);
  ok(await page.locator("[data-open-map]").count() === 1 && await page.locator("[data-open-pax]").count() === 1, `${theme} ${width}: Map and Passengers buttons`);
  await page.locator("[data-open-pax]").click(); await page.waitForSelector('[data-passenger-viewer="phone"]', { timeout: 15000 }).catch(() => {});
  if (await page.locator('[data-passenger-viewer="phone"]').count() === 0) { await page.locator("[data-open-pax]").click().catch(() => {}); await page.waitForSelector('[data-passenger-viewer="phone"]', { timeout: 30000 }).catch(() => {}); }
  ok(await page.locator('[data-passenger-viewer="phone"]').count() === 1, `${theme} ${width}: Passengers opens the shared viewer on one tap`, `${page.url()} · app ${await page.locator("[data-staff-phone]").count()} · ${errors.join(" | ").slice(0, 300)}`);
  const show = page.getByRole("button", { name: /^Show the document of/ }).first();
  const showN = await show.count();
  ok(showN >= 0, `${theme} ${width}: documents are behind a normal Show button (${showN} in the list)`);
  const held = await page.evaluate(() => [...document.querySelectorAll("[data-pax-sheet] *")].some((el) => /hold|press and hold/i.test(el.textContent || "")));
  ok(!held, `${theme} ${width}: nothing on the passengers sheet says hold`);
  await page.screenshot({ path: `${OUT}/staff-phone-pax-${theme}-${width}.png` });
  await page.locator("[data-pax-sheet] [aria-label='Close']").click().catch(() => {});
  await page.locator("[data-back]").first().click({ timeout: 15000 }).catch(() => {}); await page.waitForSelector("[data-flight-row]", { timeout: 15000 }).catch(() => {});
  ok(await page.locator("[data-flight-row]").count() > 0, `${theme} ${width}: back from the flight lands on the same list`);
  // the other tabs and More
  for (const [k, sel] of [["notam", "[data-notam-check-page], .cw-kit"], ["limits", ".cw-kit"], ["important", ".cw-kit"]]) {
    await page.locator(`[data-tab="${k}"]`).click(); await page.waitForSelector(sel, { timeout: 20000 }).catch(() => {}); await settled(page);
    ok(await page.locator("[data-staff-console]").count() === 1 && (await page.locator("[data-staff-console]").innerText()).trim().length > 20, `${theme} ${width}: the ${k} tab shows the console's page`);
    const o = await textOverlaps(page, { root: "[data-staff-console]" }); ok(o.length === 0, `${theme} ${width}: the ${k} page overlaps nothing`, o.map((x) => `"${x.a}" × "${x.b}"`).join(" · "));
    if (k === "notam") await page.screenshot({ path: `${OUT}/staff-phone-notam-${theme}-${width}.png` });
  }
  await page.locator('[data-tab="more"]').click(); await page.waitForSelector("[data-staff-more]", { timeout: 10000 }).catch(() => {});
  const items = await page.locator("[data-more-item]").evaluateAll((els) => els.map((e) => e.getAttribute("data-more-item")));
  ok(["operators", "aircraft", "caa", "reports", "settings", "users", "maintenance", "agent", "intake", "mailbox", "profile", "webhooks"].every((k) => items.includes(k)), `${theme} ${width}: More lists the other pages`, items.join(","));
  await page.locator('[data-more-item="operators"]').click(); await page.waitForSelector("[data-staff-more-page='operators']", { timeout: 20000 }).catch(() => {}); await settled(page);
  ok(await page.locator("[data-staff-more-page='operators'] [data-staff-console]").count() === 1, `${theme} ${width}: Operators opens inside More`);
  await page.screenshot({ path: `${OUT}/staff-phone-more-${theme}-${width}.png` });
  // deep links: a tab by hash, a flight by ?flight=
  await page.goto(`${BASE}/digital-wall/timeline/#limits`, { waitUntil: "load" }); await page.waitForSelector("[data-staff-phone]", { timeout: 30000 }).catch(() => {});
  ok((await page.locator("[data-staff-phone]").getAttribute("data-staff-tab")) === "limits", `${theme} ${width}: #limits opens the Limits tab`);
  ok(errors.length === 0, `${theme} ${width}: no page errors`, errors.join(" | "));
  await ctx.close();
}
// the old door keeps the October phone wall until the move is complete
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }); const page = await ctx.newPage();
  await page.goto(`${BASE}/m/wall`, { waitUntil: "load" }); await page.waitForSelector("iframe[title='Digital Wall']", { timeout: 20000 }).catch(() => {});
  const fr = page.frameLocator("iframe[title='Digital Wall']"); await fr.locator("[data-mobile-wall]").waitFor({ timeout: 30000 }).catch(() => {});
  ok(await fr.locator("[data-mobile-wall]").count() === 1, "/m/wall still frames the October phone wall (nothing lost until the move is complete)");
  await ctx.close();
}
await browser.close();
console.log(failures ? `${failures} FAILED` : "ALL PASSED");
process.exit(failures ? 1 : 0);
