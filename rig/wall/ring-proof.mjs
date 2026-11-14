// The red ring, shown (bug report 8 item 2.1 follow-up, 2026-11-11): the rig's Leon holds one OPTION flight (TST203,
// rig/wall/mock-leon.mjs); the ops display draws the unconfirmed ring on its pill, and the phone app (/digital-wall/phone/) marks its pill.
// Screenshots of both, light and dark, and of the pill up close. The "with the MVT overdue flash" case needs an
// unconfirmed flight whose departure is overdue, which the rig's Leon does not hold (its flights are shared by many
// suites): that case is not proven here and the report says so.
//   node --env-file=.env.rig rig/wall/ring-proof.mjs
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const DISPLAY = process.env.RIG_SHELL_URL || "http://127.0.0.1:3999";   // the rig proxy serves the built display at /digital-wall/timeline/
const SHELL = process.env.RIG_SHELL_URL || "http://127.0.0.1:3999";
const OUT = "rig/.scratch/shots"; mkdirSync(OUT, { recursive: true });
let failures = 0; const ok = (c, what, d = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${what}${d ? `  · ${String(d).slice(0, 200)}` : ""}`); if (!c) failures += 1; };
const browser = await chromium.launch();

for (const theme of ["light", "dark"]) {
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, colorScheme: theme });
  await ctx.addInitScript((t) => { try { localStorage.setItem("cw-theme", t); } catch {} }, theme);
  const page = await ctx.newPage();
  await page.goto(`${DISPLAY}/digital-wall/timeline/`, { waitUntil: "load" });
  await page.waitForSelector("[data-unconfirmed-ring]", { timeout: 40000 }).catch(() => {});
  const rings = await page.evaluate(() => [...document.querySelectorAll("[data-unconfirmed-ring]")].map((el) => { let pill = el; for (let i = 0; i < 4 && pill && !/TST\d{3}/.test(pill.textContent || ""); i++) pill = pill.parentElement; const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); return { flight: ((pill?.textContent || "").match(/TST\d{3}/) || ["?"])[0], outline: cs.outline || cs.boxShadow || cs.borderColor, w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y) }; }));
  ok(rings.length >= 1 && rings.some((r) => /TST203/.test(r.flight)), `${theme}: the display draws the unconfirmed ring on the rig's OPTION flight TST203`, JSON.stringify(rings.slice(0, 3)));
  await page.screenshot({ path: `${OUT}/ring-display-${theme}.png` });
  const r = rings.find((x) => /TST203/.test(x.flight)) || rings[0];
  if (r) await page.screenshot({ path: `${OUT}/ring-pill-${theme}.png`, clip: { x: Math.max(0, r.x - 24), y: Math.max(0, r.y - 24), width: Math.min(1920, r.w + 48), height: Math.min(300, r.h + 48) } });
  await ctx.close();
}

for (const theme of ["light", "dark"]) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: theme, hasTouch: true, isMobile: true });
  await ctx.addInitScript((t) => { try { localStorage.setItem("cw-theme", t); } catch {} }, theme);
  const page = await ctx.newPage();
  await page.goto(`${SHELL}/digital-wall/phone/`, { waitUntil: "load" });   // the phone app (v3); /m/wall only redirects here
  await page.locator("[data-phone-app] [data-bottom-bar]").waitFor({ timeout: 30000 }).catch(() => {});
  await page.locator('[data-bottom-bar] [data-seg="DAY"]').click().catch(() => {});   // TST203 departs in 6 h: outside the 6H range
  await page.locator("[data-pill][data-unconfirmed]").first().waitFor({ timeout: 40000 }).catch(() => {});
  const marked = await page.locator("[data-pill][data-unconfirmed]").evaluateAll((els) => els.map((e) => e.getAttribute("data-pill"))).catch(() => []);
  ok(marked.includes("TST203"), `${theme}: the phone app marks the unconfirmed flight's pill (data-unconfirmed)`, `${marked.length} marked: ${marked.join(" ")}`);
  await page.screenshot({ path: `${OUT}/ring-phone-${theme}.png` });
  await ctx.close();
}
await browser.close();
console.log(failures ? `${failures} FAILED` : "ALL PASSED");
process.exit(failures ? 1 : 0);
