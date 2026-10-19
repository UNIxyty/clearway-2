// Mobile Tier 1 (2026-10-18, mobile-portal-spec.md): every Tier 1 page of the phone shell at 390 × 844, in light and
// in dark, photographed at 2× (rig/.scratch/shots/m-*.png). On every page:
//   - no horizontal overflow: nothing reaches past the viewport unless an ancestor scrolls or clips it sideways;
//   - every touch target (link, button, switch, tab, field) is at least 44 px tall and wide;
//   - the page reports no uncaught error.
// Each page's loading, empty and error states are reached by holding, emptying or failing its own data route.
// Then the redirects (a 390 px viewport on /agent, /agent/intake, /aip, /aip/EVRA lands on /m; 1024 px stays; the
// ops-room display at /digital-wall/timeline sends a signed-in person on a phone-sized screen to /m/wall, upright or
// sideways, and leaves a registered screen on the display) and the facts: the phone's flight page shows the times and status that shared/wall-facts.mjs computes
// from the wall's own data — the same module the display's mapFlight is built from.
// Needs the rig (rig/start.sh: portal :3998, agent :5175, wall :5199 behind the proxy :3999) and the built wall
// dist (cd opsboard-react && npx vite build) for the display redirect:
//   node --env-file=.env.rig rig/mobile/tier1-check.mjs
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { flightTimes, openChecksOf, statusFromFlight, STATUS_LABEL } from "../../shared/wall-facts.mjs";

const BASE = process.env.RIG_SHELL_URL || "http://127.0.0.1:3999";
const OUT = "rig/.scratch/shots"; mkdirSync(OUT, { recursive: true });
let failures = 0; const ok = (c, what, d = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${what}${d ? `  · ${String(d).slice(0, 220)}` : ""}`); if (!c) failures += 1; };
const PHONE = { width: 390, height: 844 };

// ── what is on the rig ──
const normalized = await (await fetch(`${BASE}/digital-wall/api/flights/normalized`)).json();
const flights = normalized.flights ?? [];
// A flight the board shows: the wall's window reaches 2 h behind and 17 h ahead; outside it the flight page rightly says "not on the wall".
const onBoard = flights.filter((f) => !f.flight.isCnl && Date.parse(f.flight.startTimeUTC) > Date.now() - 115 * 60e3 && Date.parse(f.flight.startTimeUTC) < Date.now() + 16 * 3600e3).sort((a, b) => Date.parse(a.flight.startTimeUTC) - Date.parse(b.flight.startTimeUTC));
// prefer one with an open Weather check, so the marking step has something to mark
const pick = onBoard.find((f) => openChecksOf(f.flight).includes("wx")) ?? onBoard.find((f) => f.flight.movementState === "ctot") ?? onBoard[0] ?? null;
if (!pick) { console.error("The rig's board is empty right now (every seeded flight is outside the wall's window): restart the wall's mock Leon (rig/start.sh) and run again."); process.exit(2); }
if (!pick) { console.error("no flights on the rig wall"); process.exit(2); }
const flightId = `${pick.oprId}:${pick.flightNid}`;
const intake = await (await fetch(`${BASE}/agent/api/intake/requests?tab=all`)).json();
const req = (intake.rows ?? []).find((r) => r.statusKey === "needs_you") ?? (intake.rows ?? []).find((r) => r.statusKey === "needs_review") ?? (intake.rows ?? [])[0];
if (!req) { console.error("no intake requests on the rig"); process.exit(2); }
const ICAO = pick.flight.adep?.icao || "EVRA";
const notams = await (await fetch(`${BASE}/api/notams?icao=${ICAO}`)).json();
const firstNotam = notams.notams?.[0]?.number ?? null;

const browser = await chromium.launch();
async function context({ theme = "light", viewport = PHONE } = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, colorScheme: theme, hasTouch: true, isMobile: true });
  await ctx.addInitScript((t) => { try { localStorage.setItem("cw-theme", t); } catch {} }, theme);
  return ctx;
}
async function open(ctx, path, { settle = 1800 } = {}) {
  const page = await ctx.newPage();
  const errors = []; page.on("pageerror", (e) => errors.push(String(e.message || e)));
  await page.goto(`${BASE}${path}`, { waitUntil: "load" });
  await page.waitForTimeout(settle);
  return { page, errors };
}
// Nothing may reach past the right edge unless some ancestor scrolls or clips sideways (a chip row, a <pre>).
const overflow = (page) => page.evaluate(() => {
  const W = window.innerWidth; const out = [];
  const clips = (el) => { for (let p = el.parentElement; p; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o === "auto" || o === "scroll" || o === "hidden" || o === "clip") return true; } return false; };
  for (const el of document.body.querySelectorAll("*")) {
    const r = el.getBoundingClientRect(); if (r.width === 0 || r.height === 0) continue;
    if ((r.right > W + 1 || r.left < -1) && !clips(el)) out.push(`${el.tagName.toLowerCase()}${el.className && typeof el.className === "string" ? "." + el.className.split(" ").slice(0, 2).join(".") : ""} ${Math.round(r.left)}..${Math.round(r.right)}`);
  }
  return { pageScroll: document.scrollingElement.scrollWidth - W, out: out.slice(0, 6), n: out.length };
});
// Every visible target at least 44 × 44 (a field counts with the label or wrapper around it).
const targets = (page) => page.evaluate(() => {
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
async function audit(name, theme, page, errors) {
  const o = await overflow(page); const t = await targets(page);
  const dt = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
  ok(dt === theme, `${name} · ${theme}: the page is in ${theme}`, `data-theme=${dt}`);
  ok(o.pageScroll <= 0 && o.n === 0, `${name} · ${theme}: no horizontal overflow`, o.n ? `${o.n} past the edge: ${o.out.join(" | ")}` : `scrollWidth−innerWidth=${o.pageScroll}`);
  ok(t.length === 0, `${name} · ${theme}: every touch target ≥ 44 px`, t.length ? `${t.length} small: ${t.slice(0, 5).join(" | ")}` : "");
  ok(errors.length === 0, `${name} · ${theme}: no page error`, errors[0] ?? "");
  await page.screenshot({ path: `${OUT}/m-${name}-${theme}.png`, fullPage: false });
}

// ── the Tier 1 pages, both themes ──
const enc = encodeURIComponent;
const PAGES = [
  { name: "wall", path: "/m/wall", readyText: /Nothing open|No flights in the next|→/ },
  { name: "wall-flight", path: `/m/wall/${enc(flightId)}`, ready: "text=Checks" },
  { name: "wall-check", path: `/m/wall/${enc(flightId)}?check=wx`, ready: "[role=dialog]" },
  { name: "flights", path: "/m/flights", ready: "a[href^='/m/flights/']" },
  { name: "flight", path: `/m/flights/${enc(flightId)}`, ready: "text=UTC" },
  { name: "intake", path: "/m/intake", ready: "a[href^='/m/intake/']" },
  { name: "intake-request", path: `/m/intake/${req.id}`, ready: "text=Legs" },
  { name: "intake-leg", path: `/m/intake/${req.id}/leg/1`, ready: "main, [data-phone-shell]" },
  { name: "intake-confirm", path: `/m/intake/${req.id}/confirm`, ready: "[data-phone-shell]" },
  { name: "agent", path: "/m/agent", ready: "textarea, [contenteditable]" },
  { name: "agent-history", path: "/m/agent", ready: "textarea, [contenteditable]", then: async (p) => { await p.getByRole("button", { name: "Recent threads" }).click(); await p.waitForTimeout(800); } },
  { name: "airport", path: "/m/airport", ready: "input" },
  { name: "airport-search", path: "/m/airport", ready: "input", then: async (p) => { await p.fill("input", ICAO.slice(0, 3)); await p.waitForTimeout(1200); } },
  { name: "airport-notams", path: `/m/airport/${ICAO}`, ready: "[role=radiogroup]" },
  { name: "airport-notam", path: firstNotam ? `/m/airport/${ICAO}?notam=${enc(firstNotam)}` : null, ready: "text=AS PUBLISHED" },
  { name: "airport-weather", path: `/m/airport/${ICAO}?tab=weather`, ready: "[data-phone-shell]" },
  { name: "airport-docs", path: `/m/airport/${ICAO}?tab=docs`, ready: "text=AD 2" },
  { name: "airport-doc", path: `/m/airport/${ICAO}?doc=ad2`, ready: "[aria-label='Next page']", settle: 4000 },
  { name: "more", path: "/m/wall", readyText: /Nothing open|No flights in the next|→/, then: async (p) => { await p.getByRole("button", { name: "More", exact: true }).click(); await p.waitForTimeout(600); } },
].filter((p) => p.path);
for (const theme of ["light", "dark"]) {
  const ctx = await context({ theme });
  for (const spec of PAGES) {
    const { page, errors } = await open(ctx, spec.path, { settle: spec.settle ?? 1800 });
    try {
      if (spec.readyText) await page.waitForFunction((re) => new RegExp(re).test(document.body.innerText) && !document.querySelector("[role=status][aria-busy='true']"), spec.readyText.source, { timeout: 8000 });
      else await page.locator(spec.ready).first().waitFor({ timeout: 8000 });
    } catch { ok(false, `${spec.name} · ${theme}: ready (${spec.ready ?? spec.readyText})`, (await page.locator("body").innerText()).slice(0, 160).replace(/\s+/g, " ")); }
    if (spec.then) await spec.then(page);
    await audit(spec.name, theme, page, errors);
    await page.close();
  }
  await ctx.close();
}

// ── loading, empty, error — by holding, emptying or failing the page's own data ──
const STATES = [
  { name: "wall", path: "/m/wall", route: /\/digital-wall\/api\/timeline\/flights/, empty: { ok: true, aircraft: [] }, emptyText: /No flights|Nothing open/, errorText: /Couldn’t load the board|Not updating/ },
  { name: "flights", path: "/m/flights", route: /\/digital-wall\/api\/flights\/normalized/, empty: { ok: true, flights: [] }, emptyText: /No flights/, errorText: /Couldn’t load the flights/ },
  { name: "intake", path: "/m/intake", route: /\/agent\/api\/intake\/requests(\?|$)/, empty: { ok: true, rows: [] }, emptyText: /Nothing needs you/, errorText: /Couldn’t load intake/ },
  { name: "wall-flight", path: `/m/wall/${enc(flightId)}`, route: /\/digital-wall\/api\/timeline\/flights/, empty: { ok: true, aircraft: [] }, emptyText: /not on the wall/, errorText: /Couldn’t load the flight/ },
  { name: "intake-request", path: `/m/intake/${req.id}`, route: new RegExp(`/agent/api/intake/requests/${req.id}(\\?|$)`), empty: null, errorText: /Couldn’t load the request/ },
  { name: "airport-notams", path: `/m/airport/${ICAO}`, route: /\/api\/notams\?/, empty: { icao: ICAO, notams: [], updatedAt: new Date().toISOString() }, emptyText: /No NOTAMs/, errorText: /isn’t answering/ },
  { name: "airport-weather", path: `/m/airport/${ICAO}?tab=weather`, route: /\/api\/weather\?/, empty: { weather: "", updatedAt: null }, emptyText: /No weather held/, errorText: /Couldn’t get the weather/ },
];
{
  const ctx = await context({ theme: "light" });
  for (const s of STATES) {
    // loading: the route is held open; the page must show a skeleton (role=status, aria-busy) and nothing else wrong
    {
      const page = await ctx.newPage(); let release;
      await page.route(s.route, (route) => { release = () => route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ ok: false, error: "held" }) }); });
      await page.goto(`${BASE}${s.path}`, { waitUntil: "load" }); await page.waitForTimeout(900);
      const busy = await page.locator("[role=status][aria-busy='true']").count();
      ok(busy > 0, `${s.name} · loading: a skeleton while the data is held`, `role=status×${busy}`);
      const o = await overflow(page); ok(o.n === 0 && o.pageScroll <= 0, `${s.name} · loading: no horizontal overflow`, o.out.join(" | "));
      await page.screenshot({ path: `${OUT}/m-${s.name}-loading.png` });
      release?.(); await page.close();
    }
    if (s.empty) {
      const page = await ctx.newPage();
      await page.route(s.route, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(s.empty) }));
      await page.goto(`${BASE}${s.path}`, { waitUntil: "load" }); await page.waitForTimeout(1500);
      const text = await page.locator("[data-phone-shell]").innerText();
      ok(s.emptyText.test(text), `${s.name} · empty: says so`, text.replace(/\s+/g, " ").slice(0, 160));
      const t = await targets(page); ok(t.length === 0, `${s.name} · empty: targets ≥ 44 px`, t.slice(0, 4).join(" | "));
      await page.screenshot({ path: `${OUT}/m-${s.name}-empty.png` }); await page.close();
    }
    {
      const page = await ctx.newPage();
      await page.route(s.route, (route) => route.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ ok: false, error: "The rig failed this on purpose." }) }));
      await page.goto(`${BASE}${s.path}`, { waitUntil: "load" }); await page.waitForTimeout(1800);
      const alerts = await page.locator("[role=alert]").allInnerTexts();
      const text = alerts.join(" ") + " " + (await page.locator("[data-phone-shell]").innerText());
      ok(alerts.length > 0 && s.errorText.test(text), `${s.name} · error: an alert that says what happened and what still works`, text.replace(/\s+/g, " ").slice(0, 200));
      const t = await targets(page); ok(t.length === 0, `${s.name} · error: targets ≥ 44 px`, t.slice(0, 4).join(" | "));
      await page.screenshot({ path: `${OUT}/m-${s.name}-error.png` }); await page.close();
    }
  }
  // the agent: a reply that cannot be sent is said so, in the thread, and the composer stays
  {
    const page = await ctx.newPage();
    await page.route(/\/agent\/api\/chat/, (route) => route.abort("connectionfailed"));
    await page.goto(`${BASE}/m/agent`, { waitUntil: "load" }); await page.waitForTimeout(1500);
    const box = page.locator("textarea, [contenteditable]").first();
    await box.fill("Which flights are open tonight?"); await page.keyboard.press("Enter"); await page.waitForTimeout(2500);
    const text = (await page.locator("[data-phone-shell]").innerText()).replace(/\s+/g, " ");
    ok(/offline|not sent|couldn|try again|failed/i.test(text), "agent · error: the failed send is said in the thread", text.slice(-220));
    ok((await page.locator("textarea, [contenteditable]").count()) > 0, "agent · error: the composer stays");
    await page.screenshot({ path: `${OUT}/m-agent-error.png` }); await page.close();
  }
  await ctx.close();
}

// ── redirects ──
{
  const ctx = await context({ theme: "light" });
  for (const [from, to] of [["/agent", "/m/agent"], ["/agent/intake", "/m/intake"], ["/aip", "/m/airport"], [`/aip/${ICAO}`, `/m/airport/${ICAO}`]]) {
    const page = await ctx.newPage(); await page.goto(`${BASE}${from}`, { waitUntil: "load" });
    try { await page.waitForURL((u) => u.pathname === to, { timeout: 8000 }); } catch {}
    ok(new URL(page.url()).pathname === to, `390 px: ${from} → ${to}`, page.url()); await page.close();
  }
  await ctx.close();
  const wide = await browser.newContext({ viewport: { width: 1024, height: 800 } });
  for (const from of ["/agent", "/aip"]) { const page = await wide.newPage(); await page.goto(`${BASE}${from}`, { waitUntil: "load" }); await page.waitForTimeout(1500); ok(new URL(page.url()).pathname === from, `1024 px: ${from} stays`, page.url()); await page.close(); }
  await wide.close();
  // the ops-room display: the built dist fulfilled on the portal's origin (the proxy forwards only the wall's API)
  // The local dist (plain vite build) calls /api/…; production builds it with VITE_API_BASE_URL=/digital-wall. On the
  // rig proxy, send those calls to the wall's path so the display learns who is asking (its session or its token).
  const dist = async (ctx) => { await ctx.route(/^https?:\/\/[^/]+\/api\//, (route) => route.continue({ url: route.request().url().replace("/api/", "/digital-wall/api/") })); return ctx.route(/\/(digital-wall\/(?!api)|assets\/|fonts\/)/, async (route) => {
    const u = new URL(route.request().url());
    const file = u.pathname.startsWith("/digital-wall/") && !/\.[a-z0-9]+$/i.test(u.pathname) ? "opsboard-react/dist/index.html" : `opsboard-react/dist${u.pathname.replace(/^\/digital-wall/, "")}`;
    try { await route.fulfill({ path: file }); } catch { await route.fulfill({ status: 404, body: "" }); }
  }); };
  // who is asking decides, not the orientation: a signed-in person on a phone-sized screen leaves for /m/wall, upright
  // or sideways; a registered screen (device token, approved) stays on the display at the same sizes
  const LANDSCAPE = { width: 844, height: 390 };
  for (const [vp, who, expect, what] of [
    [PHONE, "person", "/m/wall", "a signed-in person on an upright phone at /digital-wall/timeline lands on /m/wall"],
    [LANDSCAPE, "person", "/m/wall", "…and sideways too"],
    [PHONE, "screen", "/digital-wall/timeline", "a registered screen the size of an upright phone stays on the display"],
    [LANDSCAPE, "screen", "/digital-wall/timeline", "…and sideways (a small screen mounted sideways is a wall, not a phone)"],
  ]) {
    const ctx = await browser.newContext({ viewport: vp, isMobile: true, hasTouch: true }); await dist(ctx);
    if (who === "screen") {
      await ctx.addInitScript(() => { try { localStorage.setItem("dw-device-token", "rig-registered-screen"); } catch {} });
      await ctx.route(/\/api\/device\/state/, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, status: "approved" }) }));
      await ctx.route(/\/api\/user(\?|$)/, (route) => route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ ok: false, error: "Sign in" }) }));
    }
    const page = await ctx.newPage(); await page.goto(`${BASE}/digital-wall/timeline`, { waitUntil: "load" });
    try { await page.waitForURL((u) => u.pathname === expect, { timeout: 6000 }); } catch {} await page.waitForTimeout(1500);
    const shown = who === "screen" ? await page.locator("[data-wall-display], canvas, [class*=timeline], [data-count-line]").count() : 0;
    ok(new URL(page.url()).pathname === expect, what, `${page.url()}${who === "screen" ? ` · display elements ${shown}` : ""}`);
    await ctx.close();
  }
}

// ── the facts: the phone shows what shared/wall-facts.mjs computes from the wall's data ──
{
  const t = flightTimes(pick.flight); const status = statusFromFlight(pick.flight);
  const ctx = await context({ theme: "light" }); const page = await ctx.newPage();
  await page.goto(`${BASE}/m/wall/${enc(flightId)}`, { waitUntil: "load" }); await page.waitForTimeout(1800);
  const text = (await page.locator("[data-phone-shell]").innerText()).replace(/\s+/g, " ");
  ok(text.includes(t.depHm) && text.includes(t.arrHm), `facts: ${pick.flight.flightNo} shows the shared module's departure ${t.depHm} and arrival ${t.arrHm}`, text.slice(0, 200));
  ok(new RegExp(STATUS_LABEL[status], "i").test(text), `facts: the status reads "${STATUS_LABEL[status]}" (${status})`, text.slice(0, 120));
  await page.goto(`${BASE}/m/flights/${enc(flightId)}`, { waitUntil: "load" }); await page.waitForTimeout(1500);
  const text2 = (await page.locator("[data-phone-shell]").innerText()).replace(/\s+/g, " ");
  ok(text2.includes(t.stdHm) && text2.includes(t.staHm), `facts: the flight record shows STD ${t.stdHm} and STA ${t.staHm} from the same module`, text2.slice(0, 200));
  await ctx.close();
}

// ── marking from the phone: Weather on the picked flight is marked from the sheet, then put back by the API ──
{
  const ctx = await context({ theme: "light" }); const page = await ctx.newPage();
  await page.goto(`${BASE}/m/wall/${enc(flightId)}?check=wx`, { waitUntil: "load" }); await page.waitForTimeout(1800);
  const btn = page.getByRole("button", { name: /^Mark Weather checked$/ });
  if ((await btn.count()) === 1 && (await btn.isEnabled())) {
    ok(true, "marking: the Weather sheet offers 'Mark Weather checked' (the rig account may)");
    await btn.click(); await page.waitForTimeout(2000);
    const row = page.getByRole("button", { name: /^Weather: checked$/ });
    ok((await row.count()) === 1, "marking: after the tap the Weather row reads checked, with who did it", (await page.locator("[data-phone-shell]").innerText()).replace(/\s+/g, " ").slice(0, 200));
    const r = await fetch(`${BASE}/digital-wall/api/flight-checks`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ oprId: pick.oprId, flightNid: pick.flightNid, types: ["wx"], checked: false }) });
    ok(r.ok, "marking: put back (unchecked by the API) so the rig is as it was", String(r.status));
  } else ok(!openChecksOf(pick.flight).includes("wx"), "marking: no flight on the board has an open Weather check right now, so the sheet rightly offers nothing to mark", (await page.locator("[role=dialog]").innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 160));
  await ctx.close();
}

// ── intake from the phone: "Looks right" on a flagged field sends the desktop's op and the agent accepts it ──
{
  const flagged = (intake.rows ?? []).find((r) => r.statusKey === "needs_review") ?? req;
  const ctx = await context({ theme: "light" }); const page = await ctx.newPage();
  await page.goto(`${BASE}/m/intake/${flagged.id}/leg/1`, { waitUntil: "load" }); await page.waitForTimeout(1800);
  const btn = page.getByRole("button", { name: /^Looks right$/ }).first();
  if (await btn.count()) {
    await btn.click(); await page.waitForTimeout(2500);
    const alerts = await page.locator("[role=alert]").allInnerTexts();
    ok(alerts.length === 0, "intake: Looks right is accepted by the agent (no alert)", alerts.join(" | ").slice(0, 200));
  } else console.log("skip  intake: no field to mark Looks right on the rig's flagged request");
  await ctx.close();
}

await browser.close();
console.log(failures ? `${failures} FAILED` : "ALL PASS");
process.exit(failures ? 1 : 0);
