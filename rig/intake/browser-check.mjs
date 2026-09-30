// Real-browser check of /agent/intake and /agent/mailbox on the rig (production build via the proxy).
//   node rig/intake/browser-check.mjs            screenshots → rig/.scratch/shots/
import { chromium } from "playwright";
const BASE = process.env.RIG_URL || "http://127.0.0.1:3999";
const OUT = "rig/.scratch/shots";
const PERSONAL = /XX0000\d{3}|01 Jan 1980|01 Jan 2030|\(46\)/;
let failures = 0; const ok = (c, what, d = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${what}${d ? `  · ${d}` : ""}`); if (!c) failures += 1; };
const browser = await chromium.launch();
async function open(path, { reduced = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: reduced ? "reduce" : "no-preference" });
  const page = await ctx.newPage(); const errors = [];
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errors.push(`${m.type()}: ${m.text().slice(0, 200)}`); });
  page.on("pageerror", (e) => errors.push(`pageerror: ${String(e.message).slice(0, 200)}`));
  await page.goto(`${BASE}${path}`, { waitUntil: "load" }); await page.waitForTimeout(2500);
  return { ctx, page, errors };
}
async function scanNative(page, label) {
  const bad = await page.evaluate(() => [...document.body.querySelectorAll('select, input[type=date], input[type=time], input[type=checkbox], input[type=radio], input[type=datetime-local], [title]')].filter((e) => !e.closest('[class*="bg-cw-sidebar"], [data-shell-chrome]')).map((e) => `${e.tagName.toLowerCase()}${e.getAttribute("type") ? `[${e.getAttribute("type")}]` : ""}${e.getAttribute("title") ? ` title="${e.getAttribute("title").slice(0, 30)}"` : ""}`));
  ok(bad.length === 0, `${label}: no native select/date/time/checkbox/radio and no title tooltips`, bad.slice(0, 5).join(", "));
}
async function scanPersonal(page, label) {
  const text = await page.evaluate(() => document.body.innerText);
  ok(!PERSONAL.test(text), `${label}: no passport number / date of birth / age in the page`, (text.match(PERSONAL) ?? [""])[0]);
}

// ── Flight intake ──
{
  const { ctx, page, errors } = await open("/agent/intake");
  await page.waitForSelector("text=Flight intake", { timeout: 20000 });
  await page.screenshot({ path: `${OUT}/intake-list.png`, fullPage: false });
  const rows = await page.locator('[data-intake-row], [role="row"], button:has-text("CIMOG1"), button:has-text("AMQ")').count();
  ok(rows > 0, "intake list renders rows", `${rows}`);
  await scanNative(page, "intake list");
  // Keyboard only: / focuses search, Esc leaves, j opens path to rows, Enter expands.
  await page.keyboard.press("/"); const inSearch = await page.evaluate(() => document.activeElement?.tagName === "INPUT"); ok(inSearch, "keyboard: / focuses search");
  await page.keyboard.press("Escape"); await page.keyboard.press("Escape");
  await page.keyboard.press("j"); await page.keyboard.press("Enter"); await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/intake-expanded-keyboard.png`, fullPage: true });
  const expanded = await page.locator("text=Pipeline").count(); ok(expanded > 0, "keyboard: j + Enter expands a request (pipeline visible)");
  await page.keyboard.press("o"); await page.waitForTimeout(800);
  const drawer = await page.locator('[role="dialog"]').count(); ok(drawer > 0, "keyboard: o opens the original-email drawer");
  await page.screenshot({ path: `${OUT}/intake-drawer.png` });
  await page.keyboard.press("Escape"); await page.waitForTimeout(400);
  ok((await page.locator('[role="dialog"]').count()) === 0, "keyboard: Esc closes the drawer");
  await scanNative(page, "intake expanded"); await scanPersonal(page, "intake expanded");
  ok(errors.length === 0, "intake console clean", errors.slice(0, 3).join(" | "));
  await ctx.close();
}
// Each request by deep link: screenshots of the states (duplicate, partial, loaded, tz).
{
  const reqs = await (await fetch(`http://127.0.0.1:5175/api/intake/requests`)).json();
  for (const r of reqs.rows.slice(0, 8)) {
    const { ctx, page, errors } = await open(`/agent/intake?r=${r.id}`, { reduced: true });
    await page.waitForTimeout(2500);
    const name = `intake-${r.reference}-${r.statusKey}-${r.id.slice(0, 4)}`.replace(/[^\w-]/g, "_");
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
    await scanPersonal(page, name); await scanNative(page, name);
    const anims = await page.evaluate(() => [...document.querySelectorAll(".cw-pulse, .cw-expand, .cw-fade")].map((e) => getComputedStyle(e).animationName).filter((n) => n && n !== "none").length);
    ok(anims === 0, `${name}: reduced motion → no running animations`, `${anims}`);
    ok(errors.length === 0, `${name}: console clean`, errors.slice(0, 3).join(" | "));
    await ctx.close();
  }
}
// ── Mailbox ──
{
  const { ctx, page, errors } = await open("/agent/mailbox?");
  await page.waitForSelector("text=Agent mailbox", { timeout: 20000 });
  await page.screenshot({ path: `${OUT}/mailbox-needs.png` });
  await scanNative(page, "mailbox");
  await page.keyboard.press("g"); await page.keyboard.press("a"); await page.waitForTimeout(1200);
  await page.keyboard.press("j"); await page.waitForTimeout(2500);
  const yu = (await (await fetch("http://127.0.0.1:5175/api/mailbox/messages?view=all&q=CIMOG1")).json()).rows.find((r) => r.direction === "inbound");
  await page.goto(`${BASE}/agent/mailbox?m=${yu.id}`, { waitUntil: "load" }); await page.waitForTimeout(4000);
  await page.screenshot({ path: `${OUT}/mailbox-reader.png`, fullPage: true });
  await scanPersonal(page, "mailbox reader");
  const frames = page.frames().filter((f) => f !== page.mainFrame());
  for (const f of frames) { const t = await f.evaluate(() => document.body?.innerText ?? "").catch(() => ""); ok(!PERSONAL.test(t), "mailbox body iframe is masked", (t.match(PERSONAL) ?? [""])[0]); }
  const sandbox = await page.evaluate(() => [...document.querySelectorAll("iframe")].map((i) => i.getAttribute("sandbox")));
  ok(sandbox.length > 0 && sandbox.every((s) => s === ""), "message body is in an iframe with an empty sandbox", JSON.stringify(sandbox));
  await page.keyboard.press("u"); await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/mailbox-raw.png`, fullPage: true });
  await scanPersonal(page, "mailbox raw source");
  // search for a passport-like value
  await page.keyboard.press("/"); await page.keyboard.type("XX0000001"); await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/mailbox-search-personal.png` });
  ok((await page.locator("text=Personal data isn't searchable").count()) > 0, "personal-data search shows the not-searchable state");
  ok(errors.length === 0, "mailbox console clean", errors.slice(0, 4).join(" | "));
  await ctx.close();
}
await browser.close();
console.log(failures ? `${failures} FAILED` : "ALL PASSED");
process.exit(failures ? 1 : 0);
