#!/usr/bin/env node
// Bug report 7 measuring harness. Serves the built SPA through `vite preview` (or any --base), intercepts every
// /api/* call with frozen fixtures, pins the clock, renders the wall and MEASURES:
//   - every pill's left edge against the hour ruler (expected = tick(hour).left + minutes × px/min) — the proof
//     that no horizontal knob moves a flight in time,
//   - how many flights are FULLY visible in the rows viewport (the "flights that fit" number),
//   - the rendered time label: CSS px, device px, and its glyph box height in device px,
//   - per-pill chip count and the pill body's box (chip toggles must not move or resize the pill),
//   - the bar's start/end instants and label text per flight (EET cases), and the unconfirmed ring per flight.
//
//   node tools/wall-verify.mjs --base http://localhost:5190 --set r7|busy|default [--settings '{"chipCaa":false}']
//        [--viewport 1920x1080] [--dpr 1] [--out dir] [--name shot] [--payload '{"windowCheck":{…}}']
// --payload merges into the /api/timeline/flights response (e.g. a flight-count disagreement for the status line).
// Prints one JSON line of results; writes <out>/<name>.png and <out>/<name>.json.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { FROZEN_NOW_MS, buildFixtures } from "./fixtures.mjs";
import { buildR7Fixtures } from "./fixtures-r7.mjs";

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const BASE = arg("base", "http://localhost:5190").replace(/\/$/, "");
const SET = arg("set", "r7");
const SETTINGS = JSON.parse(arg("settings", "{}"));
const [VW, VH] = arg("viewport", "1920x1080").split("x").map(Number);
const DPR = Number(arg("dpr", "1"));
const OUT = path.resolve(arg("out", "verify-out"));
const NAME = arg("name", `${SET}`);
const PAYLOAD = JSON.parse(arg("payload", "{}"));

mkdirSync(OUT, { recursive: true });
const fixtures = SET === "default" ? (() => { const f = buildFixtures(); f["/api/display/settings"].settings = { ...f["/api/display/settings"].settings, ...SETTINGS }; return f; })()
  : buildR7Fixtures({ busy: SET === "busy", settings: SETTINGS });
fixtures["/api/timeline/flights"] = { ...fixtures["/api/timeline/flights"], ...PAYLOAD };
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: DPR, reducedMotion: "reduce" });
await ctx.route("**://fonts.googleapis.com/**", (r) => r.abort());
await ctx.route("**://fonts.gstatic.com/**", (r) => r.abort());
await ctx.route("**/api/**", async (route) => {
  const url = new URL(route.request().url());
  const key = Object.keys(fixtures).find((k) => url.pathname.endsWith(k));
  if (key) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(fixtures[key]) });
  if (url.pathname.endsWith("/api/stream")) return new Promise(() => {});
  return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
});
const page = await ctx.newPage();
await page.clock.install({ time: FROZEN_NOW_MS });
await page.addInitScript(() => {
  const style = document.createElement("style");
  style.textContent = "*,*::before,*::after{animation-play-state:paused !important;animation-delay:0s !important;transition:none !important}";
  document.addEventListener("DOMContentLoaded", () => document.head.appendChild(style));
});
await page.goto(`${BASE}/timeline`, { waitUntil: "domcontentloaded" });
await page.clock.runFor(3000);
await page.waitForTimeout(900);
await page.evaluate(async () => { await document.fonts.ready; });

const result = await page.evaluate((dpr) => {
  const ticks = [...document.querySelectorAll("[data-hour-ms]")].map((t) => ({ ms: Number(t.dataset.hourMs), left: t.getBoundingClientRect().left, width: t.getBoundingClientRect().width }));
  const pxPerHour = ticks.length ? ticks[0].width : null;
  const viewport = document.querySelector(".timeline-scroll--body")?.getBoundingClientRect();
  const pills = [...document.querySelectorAll("[data-fid]")].map((el) => {
    const r = el.getBoundingClientRect();
    const start = Number(el.dataset.start);
    const tick = ticks.filter((t) => t.ms <= start).sort((a, b) => b.ms - a.ms)[0];
    const expected = tick ? tick.left + ((start - tick.ms) / 3600_000) * pxPerHour : null;
    const body = [...el.querySelectorAll("div")].find((d) => getComputedStyle(d).borderRadius === "99px" && getComputedStyle(d).overflow === "hidden");
    const br = body?.getBoundingClientRect();
    const ring = [...el.querySelectorAll("div")].some((d) => /2px solid/.test(d.style.border) && d.style.pointerEvents === "none" && !d.style.animation);
    const texts = [...el.querySelectorAll("span")].filter((s) => s.children.length === 0).map((s) => s.textContent.trim()).filter(Boolean);
    const times = texts.filter((t) => /^\d{2}:\d{2}/.test(t) || /\d{2}:\d{2}\s*[–-]\s*\d{2}:\d{2}/.test(t));
    const chips = [...el.querySelectorAll("span[title]")].filter((s) => /Important|CAA|NOTAM|WX|Weather/.test(s.title)).map((s) => s.title.split(" ")[0]);
    const fullyVisible = viewport ? (r.left >= viewport.left - 0.5 && r.right <= viewport.right + 0.5 && r.top >= viewport.top - 0.5 && r.bottom <= viewport.bottom + 0.5) : null;
    return { fid: el.dataset.fid, start, leftPx: Math.round(r.left * 100) / 100, expectedPx: expected == null ? null : Math.round(expected * 100) / 100, deltaPx: expected == null ? null : Math.round((r.left - expected) * 100) / 100,
      widthPx: Math.round(r.width * 100) / 100, body: br ? { left: Math.round(br.left * 100) / 100, top: Math.round(br.top * 100) / 100, w: Math.round(br.width * 100) / 100, h: Math.round(br.height * 100) / 100 } : null,
      ring, times, chips, fullyVisible, italic: [...el.querySelectorAll("span")].some((s) => s.style.fontStyle === "italic") };
  });
  // The time label under a pill: font-size and its rendered height, CSS px and device px.
  const tl = [...document.querySelectorAll("[data-fid] span")].find((s) => s.children.length === 0 && /^\d{2}:\d{2}/.test(s.textContent.trim()));
  let timeLabel = null;
  if (tl) {
    const cs = getComputedStyle(tl); const rr = tl.getBoundingClientRect();
    const range = document.createRange(); range.selectNodeContents(tl); const gr = range.getBoundingClientRect();
    timeLabel = { text: tl.textContent.trim(), fontFamily: cs.fontFamily.split(",")[0], fontSizeCss: parseFloat(cs.fontSize), fontSizeDevice: Math.round(parseFloat(cs.fontSize) * dpr * 100) / 100, lineBoxDevice: Math.round(rr.height * dpr * 100) / 100, glyphRunHeightDevice: Math.round(gr.height * dpr * 100) / 100 };
  }
  const hfit = document.querySelector("[data-hfit]")?.dataset.hfit;
  const countEl = document.querySelector("[data-count-line]");
  const countLine = countEl ? { level: countEl.dataset.countLine, text: countEl.textContent, fontSizeCss: parseFloat(getComputedStyle(countEl).fontSize) } : null;
  return { pxPerHour, ticks: ticks.length, pills, fullyVisibleCount: pills.filter((p) => p.fullyVisible).length, totalPills: pills.length, maxAbsDeltaPx: Math.max(0, ...pills.filter((p) => p.deltaPx != null).map((p) => Math.abs(p.deltaPx))), timeLabel, countLine, hfit: hfit ? JSON.parse(hfit) : null, devicePixelRatio: window.devicePixelRatio, inner: [innerWidth, innerHeight] };
}, DPR);
await page.screenshot({ path: path.join(OUT, `${NAME}.png`) });
writeFileSync(path.join(OUT, `${NAME}.json`), JSON.stringify(result, null, 1));
const { pills, ...summary } = result;
console.log(JSON.stringify({ name: NAME, ...summary }));
await browser.close();
