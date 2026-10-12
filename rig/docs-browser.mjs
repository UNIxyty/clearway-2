// The docs site in a real browser, on the rig (production build through the proxy :3999):
//   node --env-file=.env.rig rig/docs-browser.mjs        screenshots → rig/.scratch/shots/docs-*.png
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
const BASE = process.env.RIG_URL || "http://127.0.0.1:3999";
const OUT = "rig/.scratch/shots"; mkdirSync(OUT, { recursive: true });
let failures = 0; const ok = (c, what, d = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${what}${d ? `  · ${String(d).slice(0, 300)}` : ""}`); if (!c) failures += 1; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch();
const errors = [];
async function open(path, { width = 1440, height = 900, theme = null } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  if (theme) await ctx.addInitScript((t) => { try { localStorage.setItem("cw-theme", t); } catch { /* */ } }, theme);
  const page = await ctx.newPage();
  page.on("console", (m) => { if (m.type() === "error") errors.push(`${path}: ${m.text().slice(0, 160)}`); });
  page.on("pageerror", (e) => errors.push(`${path}: ${e.message.slice(0, 160)}`));
  const res = await page.goto(`${BASE}${path}`, { waitUntil: "load" });
  await sleep(800);
  return { ctx, page, status: res?.status() ?? 0 };
}
const LONG = "/docs/digital-wall/the-wall", SHORT = "/docs/digital-wall/operators";

// ── the shell: its own, not the portal's ──
{
  const { ctx, page, status } = await open(LONG);
  ok(status === 200, "the long page answers 200", status);
  ok(await page.locator("[data-cw-sidebar]").count() === 0, "no portal sidebar on a docs page (its own shell)");
  ok(await page.locator(".dx-nav").isVisible() && /Digital Wall/.test(await page.locator(".dx-nav").innerText()), "the left nav lists the sections from the content files");
  ok(await page.locator("h1").count() === 1, "one h1 per page");
  const fns = await page.locator("article[data-fn]").count();
  ok(fns === 20, "the long page has its 20 tasks", fns);
  ok(await page.locator(".dx-index a").count() === 20 && /What you can do here/.test(await page.locator(".dx-index").innerText()), "it opens with 'What you can do here', all 20 tasks linked");
  ok(await page.locator(".dx-toc .dx-toc-item").count() === 20 && await page.locator(".dx-toc .dx-toc-head").count() === 3, "'On this page' lists 20 tasks under 3 groups");
  await page.screenshot({ path: `${OUT}/docs-long-top.png` });
  // The list follows the scroll: task 12's top passes 120px below the header → 12 is current.
  await page.evaluate(() => { const el = document.querySelector('article[data-fn="12"]'); window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 64 - 60); });
  await sleep(400);
  const cur = await page.locator(".dx-toc .dx-toc-item.on .num").innerText().catch(() => "");
  ok(cur === "12", "scrolling to a task makes it current in 'On this page'", cur);
  ok(/12 \/ 20/.test(await page.locator(".dx-toc-title").innerText()), "the counter reads 12 / 20");
  // Click a task in the list: it scrolls there.
  await page.locator(".dx-toc .dx-toc-item").nth(2).click(); await sleep(900);
  const top3 = await page.evaluate(() => document.querySelector('article[data-fn="3"]').getBoundingClientRect().top);
  ok(top3 > 40 && top3 < 140, "clicking a task in the list scrolls to it", Math.round(top3));
  // At the very bottom the last task is current.
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await sleep(400);
  ok(await page.locator(".dx-toc .dx-toc-item.on .num").innerText() === "20", "at the bottom of the page the last task is current");
  // Missing media show their empty state, never a broken image.
  const missing = await page.locator('[data-media-state="missing"]').count();
  ok(missing >= 4 && await page.locator(".dx-media img").count() === 0, "every screenshot and the video show 'to come', no broken image", `${missing} empty states`);
  ok(/Video to come · about 30 seconds/.test(await page.locator("body").innerText()), "the missing video says 'Video to come · about 30 seconds'");
  // Previous / next resolve.
  const pn = await page.locator(".dx-pn a").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
  ok(pn.length >= 1, "previous / next are shown", pn.join(", "));
  await ctx.close();
}

// ── the short page: the cannot-be-undone band, roles, copy a link ──
{
  const { ctx, page, status } = await open(SHORT);
  ok(status === 200, "the short page answers 200", status);
  ok(await page.locator("article[data-fn]").count() === 5, "Operators has its 5 tasks");
  ok(await page.locator("#fn-delete-an-operator .dx-irrev .band").innerText().then((t) => /cannot be undone/i.test(t)), "'Delete an operator' carries the cannot-be-undone band, before its steps");
  const order = await page.evaluate(() => { const fn = document.getElementById("fn-delete-an-operator"); const band = fn.querySelector(".dx-irrev"); const steps = fn.querySelector(".dx-steps"); return band.compareDocumentPosition(steps) & Node.DOCUMENT_POSITION_FOLLOWING; });
  ok(order > 0, "the warning comes before the steps");
  ok(await page.locator(".dx-toc .dx-toc-item .dx-danger-ic").count() === 1, "the task list marks the one task that cannot be undone");
  ok(await page.locator(".dx-example").count() === 1 && /exampleair/.test(await page.locator(".dx-example").innerText()), "the example uses an invented operator");
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE });
  await page.locator("#fn-edit-an-operator .dx-copylink").click(); await sleep(200);
  const clip = await page.evaluate(() => navigator.clipboard.readText()).catch(() => "");
  ok(/\/docs\/digital-wall\/operators#fn-edit-an-operator$/.test(clip) && /Copied/.test(await page.locator("#fn-edit-an-operator .dx-copylink").innerText()), "the link button copies the task's address and says Copied", clip);
  const foot = await page.locator(".dx-foot").innerText();
  ok(/Tell us in Help & support/.test(foot) && await page.locator('.dx-foot a[href="/help"]').count() === 1, "with no support email, the footer sends people to Help & support");
  await page.screenshot({ path: `${OUT}/docs-short.png`, fullPage: true });
  await ctx.close();
}

// ── theme: shared with the portal, set before the first paint ──
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/dashboard`, { waitUntil: "load" }); await sleep(1500);
  await page.evaluate(() => localStorage.setItem("cw-theme", "dark"));   // what the portal's theme menu saves
  let firstPaint = null;
  page.on("domcontentloaded", async () => { firstPaint = await page.evaluate(() => document.documentElement.getAttribute("data-theme")).catch(() => null); });
  await page.goto(`${BASE}${SHORT}`, { waitUntil: "commit" });
  const atCommit = await page.evaluate(() => document.documentElement.getAttribute("data-theme")).catch(() => null);
  await page.waitForLoadState("load"); await sleep(500);
  ok((atCommit === "dark" || atCommit === null) && firstPaint === "dark", "dark chosen in the portal → the docs open dark, set before the first paint", `commit ${atCommit}, DOMContentLoaded ${firstPaint}`);
  const bg = await page.evaluate(() => getComputedStyle(document.querySelector(".dx")).backgroundColor);
  ok(bg !== "rgb(255, 255, 255)", "the docs page itself is dark", bg);
  await page.screenshot({ path: `${OUT}/docs-short-dark.png` });
  await ctx.close();
}

// ── 1024: the nav is a drawer ──
{
  const { ctx, page } = await open(LONG, { width: 1024, height: 800 });
  ok(!(await page.locator(".dx-nav").isVisible()) && await page.locator(".dx-menu-btn").isVisible(), "at 1024 the left nav moves behind the menu button");
  ok(await page.locator(".dx-toc").isVisible(), "at 1024 the task list stays");
  await page.locator(".dx-menu-btn").click(); await sleep(300);
  ok(await page.locator(".dx-drawer").isVisible() && /Digital Wall/.test(await page.locator(".dx-drawer").innerText()), "the drawer opens with the sections");
  await page.screenshot({ path: `${OUT}/docs-1024-drawer.png` });
  await page.keyboard.press("Escape"); await sleep(200);
  ok(await page.locator(".dx-drawer").count() === 0, "Esc closes the drawer");
  await ctx.close();
}

// ── 390: the task list is a bar and a sheet ──
{
  const { ctx, page } = await open(LONG, { width: 390, height: 844 });
  ok(!(await page.locator(".dx-toc").isVisible()) && await page.locator(".dx-tocbar").isVisible(), "at 390 the task list becomes a bar under the header");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok(overflow <= 0, "no sideways scroll at 390", overflow);
  await page.locator(".dx-tocbar").click(); await sleep(300);
  ok(await page.locator(".dx-sheet").isVisible() && await page.locator(".dx-sheet .dx-toc-item").count() === 20, "the bar opens a sheet with every task");
  const rowH = await page.locator(".dx-sheet .dx-toc-item").first().evaluate((e) => e.getBoundingClientRect().height);
  ok(rowH >= 44, "sheet rows are at least 44px (touch)", rowH);
  await page.screenshot({ path: `${OUT}/docs-390-sheet.png` });
  await page.locator(".dx-sheet .dx-toc-item").nth(5).click(); await sleep(900);
  ok(await page.locator(".dx-sheet").count() === 0 && /06/.test(await page.locator(".dx-tocbar .num").innerText()), "choosing a task closes the sheet and the bar shows it");
  await ctx.close();
}

// ── every link on the docs pages answers; unknown pages are 404 ──
{
  const { ctx, page } = await open("/docs");
  const hrefs = new Set();
  for (const p of ["/docs", "/docs/digital-wall", LONG, SHORT]) {
    await page.goto(`${BASE}${p}`, { waitUntil: "load" });
    for (const h of await page.locator("a[href^='/']").evaluateAll((as) => as.map((a) => a.getAttribute("href")))) hrefs.add(h.split("#")[0]);
  }
  const bad = [];
  for (const h of hrefs) { const r = await fetch(`${BASE}${h}`, { redirect: "manual" }); if (r.status >= 400) bad.push(`${h} ${r.status}`); }
  ok(bad.length === 0, `every link on the docs pages answers (${hrefs.size} addresses)`, bad.join(", "));
  const nf = await fetch(`${BASE}/docs/no-such-section/no-such-page`);
  ok(nf.status === 404, "a page that does not exist answers 404", nf.status);
  await page.goto(`${BASE}/help`, { waitUntil: "load" }); await sleep(1500);
  ok(await page.locator('a[href="/docs"]').filter({ hasText: "Read the docs" }).count() === 1, "Help & support (where ? and the sidebar link go) leads into the docs");
  await ctx.close();
}

ok(errors.length === 0, "no browser console errors on any docs page", errors.slice(0, 4).join(" | "));
await browser.close();
console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED · screenshots in rig/.scratch/shots/docs-*.png");
process.exit(failures ? 1 : 0);
