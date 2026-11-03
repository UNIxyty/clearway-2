// The wall, before and after a change to its statuses (2026-11-03): screenshots of the TV, the phone and the console in
// each status scenario, side by side, and three assertions that must hold on the "after" side:
//   1. the boundary: the display (TV and phone) sets no data-theme, reads no --cw-* token, and paints the same pixels
//      with the portal in Light and in Dark;
//   2. a broken or slow health route never makes the display alarm: flights stay on screen and the chip says the feed
//      is unknown;
//   3. the after-wall's health answer carries the feed verdict (its wiring, not only the function).
// Two rig walls and two proxies, one per version (BEFORE_PROXY, AFTER_PROXY), each serving its own display build.
// Scenarios are set by answering the wall's status endpoints in the browser; the sign and verdict in each answer are
// computed by that version's own code (the before-wall had no verdict, so its answer follows its rule: healthy unless
// told otherwise). Flights, the stream and everything else are the wall's own.
//   BEFORE_ROOT=<checkout> AFTER_ROOT=<checkout> BEFORE_PROXY=http://127.0.0.1:3971 AFTER_PROXY=http://127.0.0.1:3972 \
//   BEFORE_DIST=<dir> AFTER_DIST=<dir> OUT=<dir> node rig/wall/before-after-shots.mjs
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const env = (k) => { const v = process.env[k]; if (!v) { console.error(`${k} is required`); process.exit(2); } return v; };
const V = {
  before: { root: env("BEFORE_ROOT"), proxy: env("BEFORE_PROXY"), dist: env("BEFORE_DIST") },
  after: { root: env("AFTER_ROOT"), proxy: env("AFTER_PROXY"), dist: env("AFTER_DIST") },
};
const OUT = env("OUT"); mkdirSync(OUT, { recursive: true });
let failures = 0; const ok = (c, what, d = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${what}${d ? `  · ${String(d).slice(0, 200)}` : ""}`); if (!c) failures += 1; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// each version's own rules
for (const k of ["before", "after"]) {
  V[k].notam = await import(path.join(V[k].root, "digital-wall/lib/notam-check.mjs"));
  V[k].leon = await import(path.join(V[k].root, "digital-wall/leon-sync.mjs"));
}
const classWith = (mod, method) => Object.values(mod).find((c) => typeof c === "function" && c.prototype && method in c.prototype);
function signFor(k, state, clock) {
  const o = Object.create(classWith(V[k].notam, "signState").prototype); o.state = state;
  return k === "after" ? o.signState(clock) : o.signState();
}
function feedFor(k, st) {
  if (k === "before") return { ...st, healthy: st.healthy !== false };   // its rule: good unless told otherwise
  const C = classWith(V.after.leon, "feedVerdict"); const o = Object.create(C.prototype); o.state = { configured: true, ...st }; o.pollMs = 120_000;
  return { ...st, verdict: o.feedVerdict() };
}

// the wall's real answers, as the base the scenarios change
const base = async (k, p) => (await fetch(`${V[k].proxy}/digital-wall/api${p}`)).json();
const now = Date.now(); const iso = (ms) => new Date(ms).toISOString();
const today = new Date().toISOString().slice(0, 10); const yday = new Date(now - 864e5).toISOString().slice(0, 10);

const SCEN = {
  normal: {},
  partial: { feed: { healthy: true, lastRunAt: iso(now - 60e3), operatorsOk: 2, operatorsTotal: 3, lastError: "1 operator failing: klj (invented for the rig)" }, operators: (ops) => ops.map((o, i) => (i === 2 ? { ...o, lastSyncStatus: "error", lastSyncError: "rig: refused" } : { ...o, lastSyncStatus: "success", lastSyncAt: iso(now - 60e3) })) },
  stale: { feed: { healthy: true, lastRunAt: iso(now - 40 * 60e3), operatorsOk: 3, operatorsTotal: 3 }, operators: (ops) => ops.map((o) => ({ ...o, lastSyncStatus: "success", lastSyncAt: iso(now - 40 * 60e3) })) },
  neverSynced: { feed: { healthy: true, lastRunAt: iso(now - 60e3), operatorsOk: 2, operatorsTotal: 2 }, operators: (ops) => ops.map((o, i) => (i === 2 ? { ...o, isActive: true, lastSyncStatus: "idle", lastSyncAt: null } : { ...o, lastSyncStatus: "success", lastSyncAt: iso(now - 60e3) })) },
};

async function context(browser, k, { theme = "light", viewport, scen = {} }) {
  const ctx = await browser.newContext({ viewport, colorScheme: theme, deviceScaleFactor: 1 });
  await ctx.addInitScript((t) => { try { localStorage.setItem("cw-theme", t); } catch { /* */ } }, theme);
  await ctx.route(/\/api\/user\/preferences/, (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ preferences: { theme } }) }));
  // the console's pages: the version's own build (its assets come from the proxy, under /digital-wall/timeline/)
  await ctx.route(/\/digital-wall\/console(\/|$)/, (r) => r.fulfill({ path: path.join(V[k].dist, "index.html") }));
  if (scen.feed) {
    const f = feedFor(k, scen.feed);
    await ctx.route(/\/digital-wall\/api\/timeline\/sync-status/, async (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...(await base(k, "/timeline/sync-status")), ...f }) }));
    await ctx.route(/\/digital-wall\/api\/health$/, async (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, service: "digital-wall", leon: { configured: true, ...f } }) }));
  }
  if (scen.operators) await ctx.route(/\/digital-wall\/api\/operators/, async (r) => { const j = await base(k, "/operators?includeInactive=true"); r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...j, operators: scen.operators(j.operators) }) }); });
  if (scen.notam) await ctx.route(/\/digital-wall\/api\/notam-check\/today/, async (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(scen.notam(k, await base(k, "/notam-check/today"))) }));
  if (scen.health) await ctx.route(/\/digital-wall\/api\/health$/, scen.health);
  // the phone wall runs only framed (ResponsiveWall: ?in=m and window.top !== self), as the portal's Wall tab frames it
  await ctx.route(/\/rig-phone-frame$/, (r) => r.fulfill({ status: 200, contentType: "text/html", body: `<!doctype html><html><body style="margin:0"><iframe src="/digital-wall/timeline/?in=m" style="border:0;width:100vw;height:100vh;display:block"></iframe></body></html>` }));
  return ctx;
}
async function shot(browser, k, name, url, opts) {
  const ctx = await context(browser, k, opts); const page = await ctx.newPage();
  await page.goto(`${V[k].proxy}${url}`, { waitUntil: "load" }); await sleep(opts.wait ?? 6000);
  const file = path.join(OUT, `${name}-${k}.jpg`); const buf = await page.screenshot({ path: file, type: "jpeg", quality: 72 });
  const target = url.includes("rig-phone-frame") ? (page.frames().find((f) => f !== page.mainFrame()) ?? page.mainFrame()) : page.mainFrame();
  const facts = await target.evaluate(() => {
    const css = [...document.styleSheets].map((s) => { try { return [...s.cssRules].map((r) => r.cssText).join("\n"); } catch { return ""; } }).join("\n");
    const sample = [...document.querySelectorAll("body, body *")].slice(0, 400).map((e) => { const s = getComputedStyle(e); return `${s.color}|${s.backgroundColor}|${s.fontFamily}`; }).join(";");
    return { sample, dataTheme: document.documentElement.getAttribute("data-theme"), readsCw: /var\(--cw-/.test(css) || /--cw-[a-z]/.test(document.documentElement.getAttribute("style") ?? ""), live: document.querySelector("[data-live]")?.textContent ?? null, liveState: document.querySelector("[data-live]")?.getAttribute("data-live") ?? null, pills: document.querySelectorAll("[data-pill]").length, text: document.body.innerText.slice(0, 4000) };
  });
  await ctx.close();
  return { file, buf, facts };
}

const TV = { width: 1920, height: 1080 }, PHONE = { width: 390, height: 844 }, DESK = { width: 1440, height: 900 };
const browser = await chromium.launch();
const shots = [];
const add = (group, name, k, r) => shots.push({ group, name, version: k, file: path.basename(r.file) });
try {
  // 3. wiring: the after-wall's health answer carries the verdict
  const h = await base("after", "/health");
  ok(typeof h.leon?.verdict === "string", "the after-wall's /api/health carries the Leon feed verdict (wiring, not only the function)", h.leon?.verdict);

  // TV: the normal board, and the NOTAM sign either side of midnight
  const sign = (state, clock) => (k, real) => ({ ...real, ...state, sign: signFor(k, state, clock) });
  const acked = (day) => ({ day, airports: [{ icao: "EVRA", name: "Riga", flights: [], error: null, checked: "rig-admin@rig.invalid", all: [], filtered: [] }] });
  const TVS = [
    ["tv-normal", {}],
    ["tv-sign-2350-today-acked", { notam: sign(acked(today), { day: today, hour: 23 }) }],
    ["tv-sign-0010-yesterday-acked", { notam: sign(acked(yday), { day: today, hour: 0 }) }],
    ["tv-sign-1005-no-run-today", { notam: sign(acked(yday), { day: today, hour: 10 }) }],
  ];
  for (const [name, scen] of TVS) for (const k of ["before", "after"]) add("TV", name, k, await shot(browser, k, name, "/digital-wall/timeline/", { viewport: TV, scen }));

  // 1. the boundary, on the after side: TV and phone, portal Light vs Dark
  for (const [name, url, vp] of [["tv", "/digital-wall/timeline/", TV], ["phone", "/rig-phone-frame", PHONE]]) {
    const L = await shot(browser, "after", `boundary-${name}-portal-light`, url, { viewport: vp, theme: "light" });
    const D = await shot(browser, "after", `boundary-${name}-portal-dark`, url, { viewport: vp, theme: "dark" });
    ok(L.facts.dataTheme === null && D.facts.dataTheme === null && !L.facts.readsCw && !D.facts.readsCw, `${name}: no data-theme and no --cw-* token, with the portal in Light and in Dark`, JSON.stringify({ L: [L.facts.dataTheme, L.facts.readsCw], D: [D.facts.dataTheme, D.facts.readsCw] }));
    ok(L.facts.sample === D.facts.sample && L.facts.sample.length > 0, `${name}: the same colours and fonts with the portal in Light and in Dark (first 400 elements)`, `${L.facts.sample.length} chars`);
  }

  // phone: normal, partial, stale
  for (const [name, scen] of [["phone-normal", {}], ["phone-leon-partial", SCEN.partial], ["phone-leon-stale", SCEN.stale]]) for (const k of ["before", "after"]) add("Phone", name, k, await shot(browser, k, name, "/rig-phone-frame", { viewport: PHONE, scen }));

  // 2. the health route broken (unreachable) and slow: flights stay, the chip says unknown, never an error
  for (const [name, handler] of [["phone-health-route-down", (r) => r.abort("failed")], ["phone-health-route-slow", async (r) => { await sleep(20_000); r.fulfill({ status: 200, contentType: "application/json", body: "{}" }); }]]) {
    const r = await shot(browser, "after", name, "/rig-phone-frame", { viewport: PHONE, scen: { health: handler }, wait: name.endsWith("slow") ? 12_000 : 6000 });
    add("Phone", name, "after", r);
    ok(r.facts.pills > 0 && /FEED UNKNOWN/.test(r.facts.live ?? "") && !/ERROR|STALE|PARTIAL/.test(r.facts.live ?? ""), `${name.replace("phone-", "")}: flights on screen (${r.facts.pills}) and the chip says the feed is unknown, not an error`, r.facts.live);
  }

  // console: Operators (Leon pill, sidebar dot, rows) in each feed scenario; NOTAM check with fresh and old data
  for (const theme of ["light", "dark"]) {
    for (const [name, scen] of [["console-operators-normal", {}], ["console-operators-partial", SCEN.partial], ["console-operators-stale", SCEN.stale], ["console-operators-never-synced", SCEN.neverSynced]]) for (const k of ["before", "after"]) add(`Console (${theme})`, name, k, await shot(browser, k, `${name}-${theme}`, "/digital-wall/console/operators", { viewport: DESK, theme, scen }));
    const clear = (asOfMs) => (k, real) => ({ ...real, day: today, airports: real.airports.map((a) => ({ ...a, error: null, filtered: [], ...(k === "after" ? { notamsAsOf: asOfMs ? iso(asOfMs) : null } : {}) })) });
    for (const [name, asOf] of [["console-notam-clear-fresh", now - 50 * 60e3], ["console-notam-clear-old", now - 30 * 3600e3]]) for (const k of ["before", "after"]) add(`Console (${theme})`, name, k, await shot(browser, k, `${name}-${theme}`, "/digital-wall/console/notam-check", { viewport: DESK, theme, scen: { notam: clear(asOf) } }));
  }
} finally { await browser.close(); }
writeFileSync(path.join(OUT, "shots.json"), JSON.stringify(shots, null, 2));
console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
