// Every page in dark (Part A3): the colour check reads source for literal colours, so a page can pass it and still be
// painted with light-theme colours (a token that does not flip, a stylesheet of its own, an inline style built at run
// time). This opens every page the portal has — the list is app/**/page.tsx, so a new page is included — in the dark
// theme and flags what a dark page must not have:
//   · a surface painted a pale neutral (white, light grey) — the "light band" kind of fault
//   · a pale neutral border — the "border that belongs to the light theme"
//   · dark neutral text — text that would vanish on a dark surface
// Skipped, on purpose: theme previews (inside data-theme="light"), PDF pages and the document canvas, images, video,
// canvas; and pages that are not the portal's (listed below with the reason).
//   node --env-file=.env.rig rig/dark-audit.mjs [--who dev|admin|user]
import { chromium } from "playwright";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";

const BASE = process.env.RIG_SHELL_URL || "http://127.0.0.1:3989";
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL; const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(SB)) { console.error("refusing: not the rig's local Supabase"); process.exit(2); }
const who = process.argv.includes("--who") ? process.argv[process.argv.indexOf("--who") + 1] : "dev";
let failures = 0; const ok = (c, what, d = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${what}${d ? `  · ${String(d).slice(0, 400)}` : ""}`); if (!c) failures += 1; };

// Not the portal's pages: they keep their own look, by design.
const NOT_PORTAL = {
  "/telegram/support": "the Telegram mini app takes Telegram's theme",
  "/login": "sign-in sits on its own dark backdrop in either theme", "/signup": "the same backdrop as sign-in",
  "/auth/confirm": "the sign-in backdrop", "/auth/reset": "the sign-in backdrop",
  "/greece-hitl-auto-test/viewer": "a test harness for a scraper, not a product page", "/lithuania-hitl-auto-test/viewer": "the same", "/netherlands-hitl-auto-test/viewer": "the same",
  "/admin/debug/raw": "raw debug output (text/plain)", "/agent/panel": "the agent panel's embed for the extension", "/intake/answer": "needs a token from an intake email",
};

const pages = [];
const walk = (d) => { for (const f of readdirSync(d)) { const p = path.join(d, f); if (statSync(p).isDirectory()) walk(p); else if (f === "page.tsx") pages.push("/" + path.relative("app", d).split(path.sep).join("/")); } };
walk("app");
const srv = { apikey: KEY, authorization: `Bearer ${KEY}` };
const first = async (q) => (await (await fetch(`${SB}/rest/v1/${q}`, { headers: srv })).json())[0];
const thread = await first("help_threads?select=reference&limit=1").catch(() => null);
const conv = await first("agent_conversations?select=id&limit=1").catch(() => null);
const routes = pages.map((p) => p === "/" ? "/" : p).flatMap((p) => {
  if (p === "/aip/[icao]/[[...tab]]") return ["/aip/EVRA"];
  if (p === "/help/[ref]") return thread ? [`/help/${thread.reference}`] : [];
  if (p === "/agent/t/[id]") return conv ? [`/agent/t/${conv.id}`] : [];
  if (p === "/agent/doc") return [];
  return [p];
}).filter((p) => !NOT_PORTAL[p]);

const sess = await (await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "content-type": "application/json" }, body: JSON.stringify({ email: `rig-access-${who}@rig.invalid`, password: "rig-access-check-only" }) })).json();
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: "dark" });
await ctx.addCookies([{ name: `sb-${new URL(SB).hostname.split(".")[0]}-auth-token`, value: `base64-${Buffer.from(JSON.stringify(sess)).toString("base64")}`, url: BASE }]);
await ctx.addInitScript(() => { try { localStorage.setItem("cw-theme", "dark"); } catch { /* */ } });
const page = await ctx.newPage();

const report = [];
for (const route of routes) {
  await page.goto(`${BASE}${route}`, { waitUntil: "load" }).catch(() => {});
  await page.waitForTimeout(2500);
  const r = await page.evaluate(() => {
    const parse = (c) => { const m = c.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/); return m ? { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] } : null; };
    const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
    const neutral = (c) => Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b) < 28;
    // Ink (--cw-ink / --cw-on-ink) is the design's inverted pair: light in dark, on purpose (role badges, the selected
    // tab, the current page). A theme preview carries its own data-theme. Neither is a fault.
    const probe = document.createElement("span"); probe.style.cssText = "background:var(--cw-ink);color:var(--cw-on-ink)"; document.body.appendChild(probe);
    const INK = getComputedStyle(probe).backgroundColor, ON_INK = getComputedStyle(probe).color; probe.remove();
    const onInk = (e) => { for (let a = e; a && a !== document.body; a = a.parentElement) { if (getComputedStyle(a).backgroundColor === INK) return true; } return false; };
    const skip = (e) => e.closest('.cw-page, .cw-canvas, .cw-thumb-rail, img, video, canvas, svg, iframe, object') || (e.closest("[data-theme]") && e.closest("[data-theme]") !== document.documentElement) || onInk(e);
    const label = (e) => `<${e.tagName.toLowerCase()}${e.id ? `#${e.id}` : ""} class="${String(e.className).slice(0, 70)}"> “${(e.innerText || e.textContent || "").trim().replace(/\s+/g, " ").slice(0, 36)}”`;
    const theme = document.documentElement.getAttribute("data-theme");
    const found = { surfaces: [], borders: [], text: [] };
    for (const e of document.querySelectorAll("body *")) {
      if (skip(e)) continue;
      const s = getComputedStyle(e); if (s.visibility === "hidden" || s.display === "none" || +s.opacity === 0) continue;
      const b = e.getBoundingClientRect(); if (b.width < 2 || b.height < 2) continue;
      const bg = parse(s.backgroundColor);
      if (bg && bg.a > 0.5 && neutral(bg) && lum(bg) > 0.45 && b.width * b.height > 300) found.surfaces.push(`${s.backgroundColor} ${label(e)}`);
      for (const side of ["Top", "Right", "Bottom", "Left"]) {
        const w = parseFloat(s[`border${side}Width`]); const c = parse(s[`border${side}Color`]);
        if (w >= 1 && s[`border${side}Style`] !== "none" && c && c.a > 0.5 && neutral(c) && lum(c) > 0.45 && s[`border${side}Color`] !== INK) { found.borders.push(`${s[`border${side}Color`]} ${label(e)}`); break; }
      }
      const hasText = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      const fg = parse(s.color);
      if (hasText && fg && fg.a > 0.5 && neutral(fg) && lum(fg) < 0.06) found.text.push(`${s.color} ${label(e)}`);
    }
    return { theme, ...found };
  });
  const n = r.surfaces.length + r.borders.length + r.text.length;
  report.push({ route, theme: r.theme, n, r });
}
await browser.close();

const off = report.filter((x) => x.theme !== "dark");
const bad = report.filter((x) => x.n > 0);
for (const x of bad) console.log(`  ${x.route}: ${x.r.surfaces.length} light surfaces, ${x.r.borders.length} light borders, ${x.r.text.length} dark texts\n    ${[...x.r.surfaces, ...x.r.borders, ...x.r.text].slice(0, 4).join("\n    ")}`);
ok(off.length === 0, `every page renders in the dark theme (${report.length} pages)`, off.map((x) => `${x.route} (${x.theme})`).join(", "));
ok(bad.length === 0, `no light-theme colour on any of ${report.length} pages in dark (${pages.length} page files; ${Object.keys(NOT_PORTAL).length} not the portal's, listed in the script)`, bad.map((x) => `${x.route} ${x.n}`).join(", "));
console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
