// Shared by the phone checks (rig/mobile/*-check.mjs): a 390 × 844 context in a theme, opening a page with its errors
// collected, and the two audits every phone page must pass — nothing past the right edge unless an ancestor scrolls
// or clips sideways, and every touch target at least 44 × 44.
import { mkdirSync } from "node:fs";

export const BASE = process.env.RIG_SHELL_URL || "http://127.0.0.1:3999";
export const OUT = "rig/.scratch/shots"; mkdirSync(OUT, { recursive: true });
export const PHONE = { width: 390, height: 844 };

export function makeOk() {
  const state = { failures: 0 };
  const ok = (c, what, d = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${what}${d ? `  · ${String(d).slice(0, 220)}` : ""}`); if (!c) state.failures += 1; };
  return { ok, state };
}

export async function context(browser, { theme = "light", viewport = PHONE } = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, colorScheme: theme, hasTouch: true, isMobile: true });
  await ctx.addInitScript((t) => { try { localStorage.setItem("cw-theme", t); } catch {} }, theme);
  return ctx;
}

export async function open(ctx, path, { settle = 1800 } = {}) {
  const page = await ctx.newPage();
  const errors = []; page.on("pageerror", (e) => errors.push(String(e.message || e)));
  await page.goto(`${BASE}${path}`, { waitUntil: "load" });
  await page.waitForTimeout(settle);
  return { page, errors };
}

/** Nothing may reach past the right edge unless some ancestor scrolls or clips sideways (a chip row, a <pre>). */
export const overflow = (page) => page.evaluate(() => {
  const W = window.innerWidth; const out = [];
  const clips = (el) => { for (let p = el.parentElement; p; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o === "auto" || o === "scroll" || o === "hidden" || o === "clip") return true; } return false; };
  for (const el of document.body.querySelectorAll("*")) {
    const r = el.getBoundingClientRect(); if (r.width === 0 || r.height === 0) continue;
    if ((r.right > W + 1 || r.left < -1) && !clips(el)) out.push(`${el.tagName.toLowerCase()}${el.className && typeof el.className === "string" ? "." + el.className.split(" ").slice(0, 2).join(".") : ""} ${Math.round(r.left)}..${Math.round(r.right)}`);
  }
  return { pageScroll: document.scrollingElement.scrollWidth - W, out: out.slice(0, 6), n: out.length };
});

/** Every visible target at least 44 × 44 (a field counts with the label or wrapper around it). */
export const targets = (page) => page.evaluate(() => {
  const sel = "a[href], button, input, textarea, select, [role=button], [role=switch], [role=tab], [role=radio], [role=checkbox]";
  const out = [];
  for (const el of document.body.querySelectorAll(sel)) {
    if (el.closest("[aria-hidden='true'], [hidden]")) continue;
    const cs = getComputedStyle(el); if (cs.display === "none" || cs.visibility === "hidden") continue;
    let box = el.getBoundingClientRect(); if (box.width === 0 || box.height === 0) continue;
    if (/^(input|textarea|select)$/i.test(el.tagName)) { const wrap = el.closest("label") || el.parentElement; const b = wrap.getBoundingClientRect(); if (b.height > box.height) box = b; }
    if (box.height < 43.5 || box.width < 43.5) out.push(`${el.tagName.toLowerCase()}[${(el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 24)}] ${Math.round(box.width)}×${Math.round(box.height)}`);
  }
  return out;
});

/** Not a disabled button in sight: the honest screen's rule, and a good one for every page's main action. */
export const disabledButtons = (page) => page.evaluate(() => [...document.querySelectorAll("button:disabled, a[aria-disabled='true']")].filter((b) => b.getBoundingClientRect().height > 0).map((b) => (b.getAttribute("aria-label") || b.textContent || "").trim().slice(0, 30)));

export async function audit(ok, name, theme, page, errors, { shot = `m-${name}-${theme}` } = {}) {
  const o = await overflow(page); const t = await targets(page);
  const dt = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
  ok(dt === theme, `${name} · ${theme}: the page is in ${theme}`, `data-theme=${dt}`);
  ok(o.pageScroll <= 0 && o.n === 0, `${name} · ${theme}: no horizontal overflow`, o.n ? `${o.n} past the edge: ${o.out.join(" | ")}` : `scrollWidth−innerWidth=${o.pageScroll}`);
  ok(t.length === 0, `${name} · ${theme}: every touch target ≥ 44 px`, t.length ? `${t.length} small: ${t.slice(0, 5).join(" | ")}` : "");
  ok(errors.length === 0, `${name} · ${theme}: no page error`, errors[0] ?? "");
  await page.screenshot({ path: `${OUT}/${shot}.png`, fullPage: false });
}
