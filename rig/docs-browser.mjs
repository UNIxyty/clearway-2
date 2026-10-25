// The docs site in a real browser, on the rig (production build through the proxy :3999):
//   node --env-file=.env.rig rig/docs-browser.mjs        screenshots → rig/.scratch/shots/docs-*.png
import { chromium } from "playwright";
import fs, { mkdirSync } from "node:fs";
const BASE = process.env.RIG_URL || "http://127.0.0.1:3999";
const OUT = "rig/.scratch/shots"; mkdirSync(OUT, { recursive: true });
let failures = 0; const ok = (c, what, d = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${what}${d ? `  · ${String(d).slice(0, 300)}` : ""}`); if (!c) failures += 1; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch();
const errors = [];
async function open(path, { width = 1440, height = 900, theme = null, expect404 = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  if (theme) await ctx.addInitScript((t) => { try { localStorage.setItem("cw-theme", t); } catch { /* */ } }, theme);
  const page = await ctx.newPage();
  // On a page that should be 404, the browser logs the 404 of the page itself; that one is expected.
  page.on("console", (m) => { if (m.type() === "error" && !(expect404 && /status of 404/.test(m.text()))) errors.push(`${path}: ${m.text().slice(0, 160)}`); });
  page.on("pageerror", (e) => errors.push(`${path}: ${e.message.slice(0, 160)}`));
  const res = await page.goto(`${BASE}${path}`, { waitUntil: "load" });
  await sleep(800);
  return { ctx, page, status: res?.status() ?? 0 };
}
const LONG = "/docs/digital-wall/the-wall", SHORT = "/docs/digital-wall/operators";
// The long page's own numbers, from its source, so a rewrite of the page does not break the check.
const LONG_SRC = fs.readFileSync("content/docs/04-digital-wall/01-the-wall.md", "utf8").replace(/```[\s\S]*?```/g, "");
const N = (LONG_SRC.match(/^## /gm) ?? []).length, GROUPS = (LONG_SRC.match(/^# /gm) ?? []).length;
// Smooth scrolling on a long page takes a while: wait until the position stops moving.
const settle = async (page) => { let last = -1; for (let i = 0; i < 40; i++) { await sleep(150); const y = await page.evaluate(() => window.scrollY); if (y === last) break; last = y; } await sleep(250); };

// ── the shell: its own, not the portal's ──
{
  const { ctx, page, status } = await open(LONG);
  ok(status === 200, "the long page answers 200", status);
  ok(await page.locator("[data-cw-sidebar]").count() === 0, "no portal sidebar on a docs page (its own shell)");
  ok(await page.locator(".dx-nav").isVisible() && /Digital Wall/.test(await page.locator(".dx-nav").innerText()), "the left nav lists the sections from the content files");
  ok(await page.locator("h1").count() === 1, "one h1 per page");
  const fns = await page.locator("article[data-fn]").count();
  ok(fns === N, `the long page has its ${N} tasks`, fns);
  ok(await page.locator(".dx-index a").count() === N && /What you can do here/.test(await page.locator(".dx-index").innerText()), `it opens with 'What you can do here', all ${N} tasks linked`);
  ok(await page.locator(".dx-toc .dx-toc-item").count() === N && await page.locator(".dx-toc .dx-toc-head").count() === GROUPS, `'On this page' lists ${N} tasks under ${GROUPS} groups`);
  await page.screenshot({ path: `${OUT}/docs-long-top.png` });
  // The list follows the scroll: task 12's top passes 120px below the header → 12 is current.
  await page.evaluate(() => { const el = document.querySelector('article[data-fn="12"]'); window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 64 - 60); });
  await sleep(400);
  const cur = await page.locator(".dx-toc .dx-toc-item.on .num").innerText().catch(() => "");
  ok(cur === "12", "scrolling to a task makes it current in 'On this page'", cur);
  ok(new RegExp(`12 / ${N}`).test(await page.locator(".dx-toc-title").innerText()), `the counter reads 12 / ${N}`);
  // Click a task in the list: it scrolls there.
  await page.locator(".dx-toc .dx-toc-item").nth(2).click(); await sleep(300); await settle(page);
  const top3 = await page.evaluate(() => document.querySelector('article[data-fn="3"]').getBoundingClientRect().top);
  ok(top3 > 40 && top3 < 140, "clicking a task in the list scrolls to it", Math.round(top3));
  // At the very bottom the last task is current.
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await sleep(300); await settle(page);
  ok(Number(await page.locator(".dx-toc .dx-toc-item.on .num").innerText()) === N, "at the bottom of the page the last task is current");
  // Missing media show their empty state, never a broken image.
  const missing = await page.locator('[data-media-state="missing"]').count();
  // Since 2026-10-25 the pages carry their pictures (scripts/capture-docs-shots.mjs): every screenshot loads and is shown; only
  // the video is still "to come"; nothing is broken.
  const shotStates = await page.locator(".dx-media[data-media-state]").evaluateAll((els) => els.map((e) => e.getAttribute("data-media-state")));
  ok(missing >= 1 && shotStates.includes("ready") && !shotStates.includes("failed"), "every screenshot is shown and the video says 'to come'; no broken image", `${missing} to come · states ${[...new Set(shotStates)].join(",")}`);
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
  ok(await page.locator(".dx-example").count() === 1 && /sampleaviation/.test(await page.locator(".dx-example").innerText()), "the example uses an invented operator");
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
  ok(await page.locator(".dx-sheet").isVisible() && await page.locator(".dx-sheet .dx-toc-item").count() === N, "the bar opens a sheet with every task");
  const rowH = await page.locator(".dx-sheet .dx-toc-item").first().evaluate((e) => e.getBoundingClientRect().height);
  ok(rowH >= 44, "sheet rows are at least 44px (touch)", rowH);
  await page.screenshot({ path: `${OUT}/docs-390-sheet.png` });
  await page.locator(".dx-sheet .dx-toc-item").nth(5).click(); await sleep(300); await settle(page);
  ok(await page.locator(".dx-sheet").count() === 0 && /06/.test(await page.locator(".dx-tocbar .num").innerText()), "choosing a task closes the sheet and the bar shows it");
  await ctx.close();
}

// ── every link on the docs pages answers; unknown pages are 404 ──
{
  const { ctx, page } = await open("/docs");
  const hrefs = new Set();
  for (const p of ["/docs", "/docs/digital-wall", LONG, SHORT, "/docs/glossary", "/docs/search?q=zzqxv"]) {
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

// ── home: two ways in, who uses it, the map ──
{
  const { ctx, page, status } = await open("/docs");
  ok(status === 200 && /How to use/.test(await page.locator("h1").innerText()), "the home page answers, with its title from home.md");
  ok(await page.locator(".dx-home .map a").count() >= 1 && await page.locator(".dx-home .role").count() === 3, "home: the map of sections and the three kinds of reader");
  const start = await page.locator(".dx-home .dx-primary").getAttribute("href").catch(() => null);
  ok(start === "/docs/digital-wall", "home: 'Start with …' goes to the section home.md names", start);
  ok(/Start reading/.test(await page.locator(".dx-pn").innerText()), "home: previous/next reads 'Start reading'");
  await page.screenshot({ path: `${OUT}/docs-home.png`, fullPage: true });
  await ctx.close();
}

// ── search: ⌘K, "/", keys, empty, all results ──
{
  const idx = await fetch(`${BASE}/docs/search-index.json`);
  const rows = idx.ok ? await idx.json() : [];
  const kinds = [...new Set(rows.map((r) => r.kind))].sort().join(",");
  ok(idx.status === 200 && kinds === "page,section,task,term", "the search index is served, with sections, pages, tasks and terms", `${idx.status} ${rows.length} rows ${kinds}`);

  const { ctx, page } = await open(SHORT);
  ok(await page.locator(".dx-searchfield .dx-kbd").innerText() === "⌘K", "the header's search field shows ⌘K");
  await page.keyboard.press("Meta+k"); await sleep(300);
  ok(await page.locator(".dx-search").isVisible() && await page.evaluate(() => document.activeElement?.getAttribute("aria-label")) === "Search the docs", "⌘K opens search with the cursor in the box");
  ok(await page.locator(".dx-search-try button").count() >= 1, "before typing, it offers words to try");
  await page.keyboard.type("operator"); await sleep(500);
  const groups = await page.locator('.dx-search [role="group"]').count();
  const marks = await page.locator(".dx-search .dx-mark").count();
  ok(groups >= 1 && marks >= 1 && await page.locator(".dx-search-row.on").count() === 1, "results are grouped by section, the match is marked, the first is selected", `${groups} groups, ${marks} marks`);
  await page.keyboard.press("ArrowDown"); await sleep(100);
  const sel = await page.locator(".dx-search-row.on").getAttribute("href");
  ok(sel && (await page.locator(".dx-search-row").nth(1).getAttribute("href")) === sel, "↓ moves to the next result", sel);
  await page.keyboard.press("Enter"); await page.waitForLoadState("load"); await sleep(400);
  ok(page.url().endsWith(sel) && await page.locator(".dx-search").count() === 0, "↵ opens it, and search closes (even for a task on this page)", page.url());
  // "/" opens search, but not while typing in a field.
  await page.keyboard.press("/"); await sleep(300);
  ok(await page.locator(".dx-search").isVisible(), "'/' opens search when the focus is not in a field");
  await page.keyboard.type("x/y"); await sleep(200);
  ok(await page.locator(".dx-search input").inputValue() === "x/y", "'/' typed inside the search box is a character, not a shortcut");
  await page.keyboard.press("Escape"); await sleep(200);
  ok(await page.locator(".dx-search").count() === 0, "Esc closes search");
  await page.keyboard.press("Meta+k"); await page.keyboard.type("zzqxv"); await sleep(400);
  ok(/Nothing matches “zzqxv”/.test(await page.locator(".dx-search").innerText()) && await page.locator('.dx-search-empty a[href="/docs/glossary"]').count() === 1, "no match: says so, with the glossary and support");
  await page.locator(".dx-search input").fill("delete operator"); await sleep(400);
  ok(/Cannot be undone/.test(await page.locator(".dx-search-row").first().innerText()), "a task that cannot be undone is tagged in results");
  await page.locator(".dx-search input").fill("notam"); await sleep(300);
  await page.keyboard.press("Shift+Enter"); await page.waitForLoadState("load"); await sleep(800);
  ok(/\/docs\/search\?q=notam$/.test(page.url()) && /\d+ results?/.test(await page.locator("h1").innerText()), "⇧↵ opens every result on its own page", page.url());
  ok(await page.locator(".dx-chips button").count() >= 2 && await page.locator(".dx-results-row").count() >= 1, "the results page has a chip per section and the results");
  await page.screenshot({ path: `${OUT}/docs-search-page.png`, fullPage: true });
  // On the results page the box is a field: "/" types.
  await page.locator(".dx-results-field input").fill(""); await page.locator(".dx-results-field input").type("a/b"); await sleep(200);
  ok(await page.locator(".dx-results-field input").inputValue() === "a/b" && await page.locator(".dx-search").count() === 0, "'/' in the results page's field types, and does not open the dialog");
  await page.goto(`${BASE}/docs/search?q=zzqxv`, { waitUntil: "load" }); await sleep(800);
  ok(/Nothing matches/.test(await page.locator("h1").innerText()) && await page.locator(".dx-results-none .card a").count() >= 4, "results page with no match: common tasks and the glossary");
  await ctx.close();
}

// ── search at 390: an icon, full screen ──
{
  const { ctx, page } = await open(LONG, { width: 390, height: 844 });
  ok(!(await page.locator(".dx-searchfield").isVisible()) && await page.locator(".dx-searchicon").isVisible(), "at 390 search is an icon");
  await page.locator(".dx-searchicon").click(); await sleep(300);
  const box = await page.locator(".dx-search").boundingBox();
  ok(box && box.width >= 389 && box.y === 0, "at 390 search is full screen", JSON.stringify(box));
  await page.screenshot({ path: `${OUT}/docs-390-search.png` });
  await ctx.close();
}

// ── section landing, glossary, not found ──
{
  const { ctx, page, status } = await open("/docs/digital-wall");
  const files = (await import("node:fs")).readdirSync("content/docs/04-digital-wall").filter((f) => /^\d+-.*\.md$/.test(f)).length;
  ok(status === 200 && await page.locator(".dx-pagelist a").count() === files, "the section landing lists its pages, one per page file", `${await page.locator(".dx-pagelist a").count()} of ${files}`);
  const toc = await page.locator(".dx-toc .dx-toc-item").allInnerTexts();
  ok(toc.length >= 2 && /Overview/.test(toc[0]) && /Pages in this section/.test(toc[1]), "its task list covers the landing's parts", toc.join(" | "));
  await page.screenshot({ path: `${OUT}/docs-section.png`, fullPage: true });
  await ctx.close();
}
{
  const { ctx, page, status } = await open("/docs/glossary#term-notam");
  ok(status === 200 && await page.locator(".dx-glossary .term").count() >= 5 && await page.locator(".dx-letters a").count() >= 3, "the glossary answers, with its terms and a letter row");
  const top = await page.evaluate(() => document.getElementById("term-notam")?.getBoundingClientRect().top ?? -1);
  ok(top >= 0 && top < 200, "a link to a term lands on it", Math.round(top));
  ok(await page.locator(".dx-nav-row.on").innerText() === "Glossary", "the left nav marks Glossary");
  await page.screenshot({ path: `${OUT}/docs-glossary.png`, fullPage: true });
  await ctx.close();
}
for (const p of ["/docs/no-such-section", "/docs/digital-wall/no-such-page", "/docs/a/b/c"]) {
  const { ctx, page, status } = await open(p, { expect404: true });
  ok(status === 404 && /This page isn’t here/.test(await page.locator("h1:visible").first().innerText()) && await page.locator(".dx-nav").count() === 1, `${p} answers 404 with the docs' own not-found page`, status);
  if (p === "/docs/no-such-section") {
    await page.locator(".dx-searchopener").click(); await sleep(300);
    ok(await page.locator(".dx-search").isVisible(), "not found: its search field opens search");
    await page.screenshot({ path: `${OUT}/docs-404.png` });
  }
  await ctx.close();
}

// ── the component sheet: every block, both themes, the states held still ──
{
  // Developer only, checked by the server: a real developer session on the sign-in-on rig (as stage2-check does).
  const SHELL = process.env.RIG_SHELL_URL || "http://127.0.0.1:3989";
  const SB = process.env.NEXT_PUBLIC_SUPABASE_URL; const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const sess = await (await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "content-type": "application/json" }, body: JSON.stringify({ email: "rig-access-dev@rig.invalid", password: "rig-access-check-only" }) })).json();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
  await ctx.addCookies([{ name: `sb-${new URL(SB).hostname.split(".")[0]}-auth-token`, value: `base64-${Buffer.from(JSON.stringify(sess)).toString("base64")}`, url: SHELL }]);
  const page = await ctx.newPage();
  page.on("console", (m) => { if (m.type() === "error") errors.push(`sheet: ${m.text().slice(0, 160)}`); });
  page.on("pageerror", (e) => errors.push(`sheet: ${e.message.slice(0, 160)}`));
  const res = await page.goto(`${SHELL}/developer/docs-components`, { waitUntil: "load" }); await sleep(2500);
  const status = new URL(page.url()).pathname === "/developer/docs-components" ? res?.status() : `${res?.status()} at ${new URL(page.url()).pathname}`;
  ok(status === 200, "the docs component sheet answers 200 for a developer", status);
  const themes = await page.locator("[data-sheet-theme]").evaluateAll((els) => els.map((e) => [e.getAttribute("data-sheet-theme"), getComputedStyle(e).backgroundColor]));
  ok(themes.length === 2 && themes[0][1] !== themes[1][1], "it renders twice, light and dark, from the same markup", JSON.stringify(themes));
  const dark = page.locator('[data-sheet-theme="dark"]');
  const count = async (sel) => dark.locator(sel).count();
  const have = { tasks: await count("article[data-fn]"), steps: await count(".dx-steps"), notes: await count(".dx-callout.note"), warnings: await count(".dx-callout.warning"),
    irrev: await count(".dx-irrev"), example: await count(".dx-example"), how: await count(".dx-how"), code: await count(".dx-codeblock"), table: await count(".dx-table:not(.dx-statuses)"),
    statuses: await count(".dx-statuses .dx-badge"), news: await count(".dx-news .dx-tag"), history: await count(".dx-history .row"), crumb: await count(".dx-crumb"), related: await count(".dx-related a"), pn: await count(".dx-pn a"), written: await count('[data-docs-state="being-written"]') };
  ok(Object.values(have).every((n) => n > 0) && have.statuses === 5 && have.news === 3 && have.history === 3 && have.written === 2, "every block from the design's sheet is there", JSON.stringify(have));
  const states = await dark.locator("[data-media-state]").evaluateAll((els) => els.map((e) => e.getAttribute("data-media-state")));
  ok(["missing", "loading", "failed"].every((s) => states.includes(s)) && await dark.locator(".dx-video-poster").count() === 1 && await dark.locator(".dx-media-failed.video").count() === 1,
    "screenshot and video: there, to come, loading and failed, each shown", states.join(","));
  const pics = await page.locator(".dx-media img").evaluateAll((els) => [...new Set(els.map((e) => new URL(e.src).pathname))]);
  ok(pics.length <= 1 && pics.every((p) => p.startsWith("/docs-media/sheet/")), "the one stand-in picture, from the sheet's own folder", pics.join(", "));
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: SHELL });
  await dark.locator(".dx-codecopy").first().click(); await sleep(200);
  const clip = await page.evaluate(() => navigator.clipboard.readText()).catch(() => "");
  ok(clip === "SCHED EXA123 EVRA-EGLF 14OCT 1420Z" && /Copied/.test(await dark.locator(".dx-codecopy").first().innerText()), "Copy on a code block copies the text without its # explanation lines", JSON.stringify(clip));
  const muted = await dark.locator(".dx-codeblock pre .note").evaluate((e) => [getComputedStyle(e).color, getComputedStyle(e.closest("pre")).color]);
  ok(muted[0] !== muted[1], "the # line is muted", muted.join(" vs "));
  ok(await page.locator(".dx-sheet-problems").count() === 0, "sheet.md parses with no problems");
  await page.screenshot({ path: `${OUT}/docs-sheet.png`, fullPage: true });
  await ctx.close();
}

// The portal loads none of the docs' styles (the brief: the docs must not slow down or change the portal).
{
  const html = await (await fetch(`${BASE}/dashboard`)).text();
  const css = [...new Set(html.match(/\/_next\/static\/css\/[a-z0-9]+\.css/g) ?? [])];
  let dx = 0; for (const c of css) dx += ((await (await fetch(`${BASE}${c}`)).text()).match(/\.dx-[a-z]/g) ?? []).length;
  ok(css.length > 0 && dx === 0, "a portal page loads none of the docs' styles", `${css.length} stylesheets, ${dx} docs rules`);
}

ok(errors.length === 0, "no browser console errors on any docs page", errors.slice(0, 4).join(" | "));
await browser.close();
console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED · screenshots in rig/.scratch/shots/docs-*.png");
process.exit(failures ? 1 : 0);
