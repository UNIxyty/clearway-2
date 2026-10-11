// Portal redesign, stage 2 (components) — in the browser, on the rig (sign-in ON behind the proxy :3989, as stage 1):
//   node --env-file=.env.rig rig/stage2-check.mjs            → rig/.scratch/shots/stage2-*.png
// Checks the component sheet (/developer/components) and the pages:
//   1. The sheet renders both halves (data-theme light and dark) with no page error — hydration errors included.
//   2. Keyboard: select, multi-select, date, checkbox, radio, segmented, toggle, row menu — no mouse.
//   3. Modal: focus moves in, Tab stays in, Esc closes, focus returns to the opener.
//   4. Table: sort cycles asc → desc → off; 500 rows paginate 50 a page; rows-per-page; the header sticks under the
//      top bar and the PAGE scrolls (no scrolling box around the table); loading and error states; retry.
//   5. Filters: active chips, the "Showing N of M" strip, Clear all.
//   6. No native <select>, checkbox, radio or date input in the rendered DOM of the portal's pages, and no page error.
//   7. Contrast measured on the sheet, both halves (AA; disabled controls exempt).
//   8. Floating pieces stay in the window: a select, a multi-select, the date picker, the ⋯ menu and a tooltip opened
//      at the window's edge sit wholly inside it; in a window too short either way the list scrolls inside itself.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.RIG_SHELL_URL || "http://127.0.0.1:3989";
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL; const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const OUT = "rig/.scratch/shots"; mkdirSync(OUT, { recursive: true });
let failures = 0; const ok = (c, what, d = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${what}${d ? `  · ${String(d).slice(0, 220)}` : ""}`); if (!c) failures += 1; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch();
async function signedIn(who, opts = {}) {
  const sess = await (await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "content-type": "application/json" }, body: JSON.stringify({ email: `rig-access-${who}@rig.invalid`, password: "rig-access-check-only" }) })).json();
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, ...opts });
  await ctx.addCookies([{ name: `sb-${new URL(SB).hostname.split(".")[0]}-auth-token`, value: `base64-${Buffer.from(JSON.stringify(sess)).toString("base64")}`, url: BASE }]);
  return ctx;
}

// ── 1. The sheet ─────────────────────────────────────────────────────────────────────────────────────────────────────
const ctx = await signedIn("dev");
const page = await ctx.newPage();
const errors = []; page.on("pageerror", (e) => errors.push(String(e.message).slice(0, 120)));
await page.goto(`${BASE}/developer/components`, { waitUntil: "load" });
await page.waitForSelector('[data-theme="dark"] section[aria-label^="2.6"]', { timeout: 20000 }); await sleep(1500);
const halves = await page.evaluate(() => ["light", "dark"].map((t) => { const el = document.querySelector(`div[data-theme="${t}"]`); return { t, sections: el?.querySelectorAll("section[aria-label]").length ?? 0, bg: el ? getComputedStyle(el).backgroundColor : null }; }));
ok(halves[0].sections >= 7 && halves[1].sections >= 7 && halves[0].bg !== halves[1].bg, "the sheet renders every section in both themes, each half in its own theme", JSON.stringify(halves));
await page.screenshot({ path: `${OUT}/stage2-sheet.png`, fullPage: true });
const L = page.locator('div[data-theme="light"]');

// ── 2. Keyboard ──────────────────────────────────────────────────────────────────────────────────────────────────────
const sel = L.getByRole("combobox", { name: "Default model", exact: true });
await sel.focus(); await page.keyboard.press("ArrowDown");
ok(await page.getByRole("listbox", { name: "Default model", exact: true }).isVisible(), "select: ArrowDown opens the list");
await page.keyboard.press("Home"); await page.keyboard.press("Enter");
ok((await sel.innerText()).includes("Automatic") && !(await page.getByRole("listbox", { name: "Default model", exact: true }).count()), "select: Home, Enter chooses the first option and closes", await sel.innerText());
await sel.focus(); await page.keyboard.press("Enter"); await page.keyboard.type("st"); await page.keyboard.press("Enter");
ok((await sel.innerText()).includes("Standard"), "select: typing jumps to a match (type-ahead)", await sel.innerText());
await sel.focus(); await page.keyboard.press("Enter"); await page.keyboard.press("Escape");
ok(!(await page.getByRole("listbox", { name: "Default model", exact: true }).count()) && await sel.evaluate((el) => el === document.activeElement), "select: Esc closes and focus stays on the field");

const ms = L.getByRole("combobox", { name: "Roles" });
await ms.focus(); await page.keyboard.press("ArrowDown"); await page.keyboard.press("Home"); await page.keyboard.press(" ");
ok(/User/.test(await ms.innerText()), "multi-select: Space adds the highlighted option as a chip", (await ms.innerText()).replace(/\s+/g, " "));
await page.keyboard.press("Escape");

const dateBtn = L.getByRole("button", { name: /^Flight date/ });
const before = await dateBtn.innerText();
await dateBtn.focus(); await page.keyboard.press("Enter"); await page.keyboard.press("ArrowRight"); await page.keyboard.press("Enter");
const after = await dateBtn.innerText();
const d0 = new Date(`${before} UTC`), d1 = new Date(`${after} UTC`);
ok(d1 - d0 === 86400000, "date: Enter opens the month, → moves a day, Enter chooses it", `${before} → ${after}`);

const cbx = L.getByRole("checkbox", { name: "Include subdomains" });
const c0 = await cbx.getAttribute("aria-checked"); await cbx.focus(); await page.keyboard.press(" ");
ok(c0 !== (await cbx.getAttribute("aria-checked")), "checkbox: Space toggles it", `${c0} → ${await cbx.getAttribute("aria-checked")}`);
const radio = L.getByRole("radio", { name: "This site only", exact: true });
await radio.focus(); await page.keyboard.press("ArrowDown");
ok((await L.getByRole("radio", { name: "This site and subdomains", exact: true }).getAttribute("aria-checked")) === "true", "radio: ↓ moves the choice (and skips a disabled option)");
const seg = L.getByRole("radiogroup", { name: "Model tier" });
await seg.getByRole("radio", { name: "Automatic" }).focus(); await page.keyboard.press("ArrowRight");
ok((await seg.getByRole("radio", { name: "Fast · Haiku" }).getAttribute("aria-checked")) === "true", "segmented: → moves the choice");
const tg = L.getByRole("switch", { name: /Web search/ });
await tg.focus(); await page.keyboard.press(" ");
ok((await tg.getAttribute("aria-checked")) === "true", "toggle: Space switches it on");

const rowMenu = L.getByRole("button", { name: "Row actions" }).nth(1);
await rowMenu.focus(); await page.keyboard.press("Enter");
ok(await page.getByRole("menu", { name: "Row actions" }).isVisible(), "row menu: Enter opens it (the ⋯ is always there, so a keyboard reaches it)");
await page.keyboard.press("Home"); await page.keyboard.press("Enter");
await page.waitForSelector('[role="status"]:has-text("is now an Admin")', { timeout: 3000 }).catch(() => {});
ok(await page.locator('[role="status"]', { hasText: "is now an Admin" }).count() > 0, "…Enter runs the item: a toast says what happened, with Undo");

// ── 3. Modal ─────────────────────────────────────────────────────────────────────────────────────────────────────────
const opener = L.getByRole("button", { name: "Remove Admin…" });
await opener.focus(); await page.keyboard.press("Enter");
const dialog = page.getByRole("dialog", { name: /Remove Admin from/ });
ok(await dialog.isVisible(), "modal opens");
ok(await page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]'))), "…focus is inside it");
for (let i = 0; i < 5; i++) await page.keyboard.press("Tab");
ok(await page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]'))), "…Tab stays inside it");
await page.keyboard.press("Escape"); await sleep(200);
ok(!(await dialog.count()) && await opener.evaluate((el) => el === document.activeElement), "…Esc closes it and focus returns to the button that opened it");

// ── 4. Table ─────────────────────────────────────────────────────────────────────────────────────────────────────────
const dense = L.locator('table[aria-label^="Permission changes"]');
const actionTh = dense.locator("th", { hasText: "Action" });
const sorts = [];
for (let i = 0; i < 3; i++) { await actionTh.getByRole("button").click(); sorts.push(await actionTh.getAttribute("aria-sort")); }
ok(sorts.join(",") === "ascending,descending,none", "sort: a header click sorts ascending, again descending, a third clears", sorts.join(" → "));
const footer = L.locator("div", { hasText: /^1–50 of 500/ }).first();
ok(await L.getByText(/1–50/).first().isVisible() && (await dense.locator("tbody tr").count()) === 50, "500 rows paginate, 50 a page", `${await dense.locator("tbody tr").count()} rows shown`);
await L.getByRole("navigation", { name: "Pages" }).getByRole("button", { name: "Next page" }).click(); await sleep(200);
ok(await L.getByText(/51–100/).first().isVisible(), "…next page shows 51–100");
const rpp = L.getByRole("combobox", { name: "Rows per page" }).last();
await rpp.click(); await page.getByRole("option", { name: "100", exact: true }).click(); await sleep(200);
ok((await dense.locator("tbody tr").count()) === 100 && await L.getByText(/1–100/).first().isVisible(), "…rows per page: 100", `${await dense.locator("tbody tr").count()} rows`);
void footer;
// Sticky header and page scroll.
await dense.locator("tbody tr").nth(60).scrollIntoViewIfNeeded(); await sleep(300);
const stick = await dense.evaluate((t) => {
  const th = t.querySelector("thead th"); const r = th.getBoundingClientRect();
  let scroller = null; for (let e = t.parentElement; e && e !== document.body; e = e.parentElement) { const s = getComputedStyle(e); if (/(auto|scroll)/.test(s.overflowY) && e.scrollHeight > e.clientHeight) { scroller = e.tagName; break; } }
  return { top: Math.round(r.top), pageScrolled: window.scrollY > 0, scroller, shadow: getComputedStyle(th).boxShadow !== "none" };
});
ok(stick.top === 56 && stick.pageScrolled && stick.scroller === null && stick.shadow, "the header sticks under the top bar (56px), gains its shadow, and the PAGE scrolls — no scrolling box", JSON.stringify(stick));
await page.screenshot({ path: `${OUT}/stage2-sticky.png` });
const stateSeg = L.getByRole("radiogroup", { name: "Table state" });
await stateSeg.getByRole("radio", { name: "Loading" }).click(); await sleep(150);
ok(await dense.getAttribute("aria-busy") === "true" && await dense.locator('[role="status"][aria-busy="true"]').count() === 1, "loading draws skeleton rows (aria-busy), not \"Loading…\"");
await stateSeg.getByRole("radio", { name: "Error" }).click(); await sleep(150);
const alert = dense.locator('[role="alert"]');
ok(/Couldn't load the change log/.test(await alert.innerText()) && /502 · GET \/api\/admin\/permissions · \d\d:\d\d:\d\dZ/.test(await alert.innerText()), "error names what failed and keeps the status and time visible", (await alert.innerText()).replace(/\s+/g, " "));
await alert.getByRole("button", { name: "Try again" }).click(); await sleep(150);
ok((await dense.locator("tbody tr").count()) > 0 && !(await dense.locator('[role="alert"]').count()), "…Try again retries (back to rows)");

// ── 5. Filters ───────────────────────────────────────────────────────────────────────────────────────────────────────
const strip = L.locator('[role="status"]', { hasText: "Showing 4 of 231" });
ok(await strip.isVisible() && /3 filters and a search are hiding 227/.test(await strip.innerText()), "filtered: the strip says how many rows are hidden and why", (await strip.innerText()).replace(/\s+/g, " "));
ok(await L.getByRole("button", { name: "Clear Status" }).isVisible() && await L.getByRole("button", { name: "More filters" }).isVisible(), "…active filters are chips with an ✕; the rest wait behind More filters");
await strip.getByRole("button", { name: "Clear all" }).click(); await sleep(200);
ok(!(await L.locator('[role="status"]', { hasText: "Showing 4 of 231" }).count()), "…Clear all clears them and the strip goes");

// ── 7. Contrast on the sheet ─────────────────────────────────────────────────────────────────────────────────────────
await page.evaluate(() => window.scrollTo(0, 0)); await sleep(300);
const bad = await page.evaluate(() => {
  const parse = (c) => { const m = c.match(/[\d.]+/g); if (!m) return null; const n = m.map(Number); return /^color\(srgb/.test(c) ? [n[0] * 255, n[1] * 255, n[2] * 255, n[3] ?? 1] : n; };
  const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const bgOf = (el) => { const layers = []; for (let e = el; e; e = e.parentElement) { const s = getComputedStyle(e); if (s.backgroundImage !== "none") return null; const c = parse(s.backgroundColor); if (c && (c[3] ?? 1) > 0) { layers.push(c); if ((c[3] ?? 1) >= 1) break; } } let base = [255, 255, 255]; if (layers.length && (layers[layers.length - 1][3] ?? 1) >= 1) base = layers.pop().slice(0, 3); for (const l of layers.reverse()) { const a = l[3]; base = base.map((v, i) => l[i] * a + v * (1 - a)); } return base; };
  const out = []; const seen = new Set();
  const root = document.querySelector('div[data-theme="light"]').parentElement;
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    const el = n.parentElement; if (!el || seen.has(el) || !n.textContent.trim()) continue; seen.add(el);
    const s = getComputedStyle(el); if (s.visibility === "hidden" || Number(s.opacity) < 0.95) continue;
    if (el.closest("[disabled],[aria-disabled=true],.cw-shimmer,[aria-hidden=true],kbd")) continue;
    const fg = parse(s.color); const bg = bgOf(el); if (!fg || !bg) continue;
    const a = fg[3] ?? 1; const fgc = fg.slice(0, 3).map((v, i) => v * a + bg[i] * (1 - a));
    const size = parseFloat(s.fontSize), bold = Number(s.fontWeight) >= 700; const min = size >= 24 || (bold && size >= 18.66) ? 3 : 4.5;
    const r = ratio(fgc, bg); if (r < min) out.push(`${el.closest("[data-theme]")?.dataset.theme} "${n.textContent.trim().slice(0, 30)}" ${r.toFixed(2)}`);
  }
  return out;
});
ok(bad.length === 0, "contrast measured on the whole sheet, both themes: every visible text at AA", `${bad.length} below · ${bad.slice(0, 5).join("; ")}`);
ok(errors.length === 0, "no page error on the sheet (hydration included)", errors.slice(0, 3).join(" | "));
await ctx.close();

// ── 6. Pages: no native control in the DOM, no page error ────────────────────────────────────────────────────────────
const PAGES = [["admin", "/dashboard"], ["admin", "/admin/users"], ["admin", "/admin/permissions"], ["admin", "/admin/agent-sites"], ["admin", "/admin/airports/deleted"],
  ["admin", "/admin/service-status"], ["admin", "/admin/debug"], ["admin", "/account/notifications"], ["admin", "/aip"], ["admin", "/aip/service-status"], ["admin", "/help"],
  ["dev", "/agent/settings"], ["dev", "/agent/intake"], ["dev", "/agent/knowledge"], ["dev", "/developer/inbox"]];
for (const who of ["admin", "dev"]) {
  const c = await signedIn(who);
  for (const [as, path] of PAGES) {
    if (as !== who) continue;
    const p = await c.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(String(e.message).match(/#\d+/)?.[0] ?? String(e.message).slice(0, 60)));
    await p.goto(`${BASE}${path}`, { waitUntil: "load" }); await sleep(3000);
    const natives = await p.evaluate(() => [...document.querySelectorAll('select, input[type="checkbox"], input[type="radio"], input[type="date"], input[type="time"], input[type="datetime-local"]')].map((e) => e.outerHTML.slice(0, 80)));
    ok(natives.length === 0 && errs.length === 0, `${path}: no native select/checkbox/radio/date, no page error`, [...natives, ...errs].join(" | "));
    if (path === "/admin/users") {
      const boxed = await p.evaluate(() => [...document.querySelectorAll("main *, body *")].some((e) => { const s = getComputedStyle(e); return /(auto|scroll)/.test(s.overflowY) && e.scrollHeight > e.clientHeight + 4 && e.querySelectorAll("button").length > 3 && !e.closest("[data-cw-sidebar]") && !e.closest("[role=listbox]"); }));
      ok(!boxed, "/admin/users: the user list is not in a scrolling box (the page scrolls)");
    }
    await p.close();
  }
  await c.close();
}

// ── 8. Floating pieces stay in the window (A2) ───────────────────────────────────────────────────────────────────────
{
  const inside = (r, vh, vw) => r && r.top >= 0 && r.bottom <= vh && r.left >= 0 && r.right <= vw && r.height > 0;
  const rectOf = (p, sel) => p.evaluate((q) => { const e = document.querySelector(q); if (!e) return null; const b = e.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, left: b.left, right: b.right, height: b.height, scrolls: e.scrollHeight > e.clientHeight + 1 }; }, sel);
  // Put the element `gap` px from the bottom (or top) edge of the window by scrolling the page.
  const atEdge = (loc, edge, gap = 24) => loc.evaluate((el, [edge, gap]) => { const r = el.getBoundingClientRect(); window.scrollBy(0, edge === "bottom" ? r.bottom - (innerHeight - gap) : r.top - gap); }, [edge, gap]);
  for (const [w, h] of [[1600, 1000], [1280, 640]]) {
    const c = await signedIn("dev", { viewport: { width: w, height: h } });
    const p = await c.newPage();
    await p.goto(`${BASE}/developer/components`, { waitUntil: "load" }); await p.waitForSelector('[data-theme="light"] [role="combobox"][aria-label="Default model"]'); await sleep(800);
    const S = p.locator('div[data-theme="light"]');
    const checks = [
      ["select", S.getByRole("combobox", { name: "Default model", exact: true }), '[role="listbox"][aria-label="Default model"]'],
      ["multi-select", S.getByRole("combobox", { name: "Roles" }), '[role="listbox"][aria-label="Roles"]'],
      ["date picker", S.getByRole("button", { name: /^Flight date/ }), '[role="dialog"]'],
      ["⋯ row menu", S.getByRole("button", { name: "Row actions" }).nth(1), '[role="menu"]'],
    ];
    for (const [name, trigger, panel] of checks) {
      await atEdge(trigger, "bottom"); await sleep(150);
      await trigger.click(); await sleep(350);
      const r = await rectOf(p, panel);
      ok(inside(r, h, w), `${w}×${h}: a ${name} opened at the bottom of the window is wholly inside it`, JSON.stringify(r));
      await p.keyboard.press("Escape"); await sleep(150);
    }
    const tipBtn = S.getByRole("button", { name: "Open the agent" });
    await atEdge(tipBtn, "top", 60); await sleep(150); await tipBtn.hover(); await sleep(700);
    const tip = await rectOf(p, '[role="tooltip"]');
    ok(inside(tip, h, w), `${w}×${h}: a tooltip near the top of the window is wholly inside it`, JSON.stringify(tip));
    await c.close();
  }
  // Too short either way: the list takes the roomier side and scrolls inside itself.
  const c = await signedIn("dev", { viewport: { width: 1280, height: 230 } });
  const p = await c.newPage();
  await p.goto(`${BASE}/developer/components`, { waitUntil: "load" }); await p.waitForSelector('[data-theme="light"] [role="combobox"][aria-label="Default model"]'); await sleep(800);
  const sel2 = p.locator('div[data-theme="light"]').getByRole("combobox", { name: "Default model", exact: true });
  await sel2.evaluate((el) => { const r = el.getBoundingClientRect(); window.scrollBy(0, r.top - (innerHeight / 2 - r.height / 2)); }); await sleep(150);
  await sel2.click(); await sleep(350);
  const r = await rectOf(p, '[role="listbox"][aria-label="Default model"]');
  ok(inside(r, 230, 1280) && r.scrolls, "a window too short either way: the list stays inside it and scrolls inside itself", JSON.stringify(r));
  await p.keyboard.press("End"); await sleep(200);
  const last = await p.evaluate(() => { const l = document.querySelector('[role="listbox"][aria-label="Default model"]'); const o = [...l.querySelectorAll('[role="option"]')].pop(); const a = l.getBoundingClientRect(), b = o.getBoundingClientRect(); return b.top >= a.top - 1 && b.bottom <= a.bottom + 1; });
  ok(last, "…and the chosen option (here the last) is scrolled into view");
  await p.keyboard.press("Home"); await sleep(250);
  const firstIn = await p.evaluate(() => { const l = document.querySelector('[role="listbox"][aria-label="Default model"]'); const o = l.querySelector('[role="option"]'); const a = l.getBoundingClientRect(), b = o.getBoundingClientRect(); return b.top >= a.top - 1 && b.bottom <= a.bottom + 1; });
  ok(firstIn, "…and the arrow keys bring the option they reach into view (Home → the first)");
  await c.close();
}

await browser.close();
console.log(`\n${failures ? `${failures} FAILED` : "ALL PASSED"} · ${OUT}/stage2-*.png`);
process.exit(failures ? 1 : 0);
