// Measures where the wall's now-line actually sits on the timeline, against real time, using only the page:
// the time under the line = window start + (line x in timeline content) / (px per hour). Works on any build.
// The page's API is answered with stand-ins (signed-in user, the ops wall's real settings, no flights), the SSE
// stream is driven from here (config.changed), and the page clock is controlled so hours, a blanked screen and
// midnight UTC can be run deliberately.
//   node rig/wall/nowline-probe.mjs <display URL> <label>
import { chromium } from "../../node_modules/playwright/index.mjs";
const URL_ = process.argv[2] || "https://clearway.verxyl.com/digital-wall/timeline/";
const LABEL = process.argv[3] || "run";
const OPS = { scale: 0.75, timeZoom: 0.6, acColScale: 1.1, autoFitRows: false };   // production ops wall profile
let settings = { ...OPS }; let sseQueue = []; const envReports = [];
const json = (o) => ({ status: 200, contentType: "application/json", body: JSON.stringify(o) });
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await ctx.newPage();
const errors = []; page.on("pageerror", (e) => errors.push(e.message));
await page.route(/\/api\//, async (route) => {
  const u = new URL(route.request().url()); const p = u.pathname.replace(/^.*\/api\//, "/api/");
  if (p === "/api/user") return route.fulfill(json({ ok: true, user: { email: "ops@clearway.aero", name: "Ops wall" }, authEnabled: true }));
  if (p === "/api/display/settings") return route.fulfill(json({ ok: true, account: "ops@clearway.aero", settings }));
  if (p === "/api/timeline/flights") return route.fulfill(json({ ok: true, source: "probe", aircraft: [] }));
  if (p === "/api/stream") { const body = sseQueue.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("") + ": hb\n\n"; sseQueue = []; return route.fulfill({ status: 200, headers: { "content-type": "text/event-stream", "cache-control": "no-cache" }, body: "retry: 500\n" + body }); }
  if (p === "/api/display/env") { try { const b = JSON.parse(route.request().postData() || "{}"); if (b.clock) envReports.push(b.clock); } catch {} return route.fulfill(json({ ok: true })); }
  if (p === "/api/display/clocks") return route.fulfill(json({ ok: true, clocks: [{ label: "UTC", tz: "UTC" }] }));
  return route.fulfill(json({ ok: true, limitations: [], clocks: [], items: [], flights: [] }));
});
// Start 21:00 UTC so the run crosses midnight.
const T0 = Date.UTC(2026, 8, 28, 21, 0, 0);
await page.clock.install({ time: T0 });
await page.goto(URL_, { waitUntil: "load" });
await page.clock.runFor(8000);
const probe = () => page.evaluate(() => {
  const label = [...document.querySelectorAll("div")].find((d) => d.children.length === 0 && /^\d\d:\d\d UTC$/.test(d.textContent || ""));
  const header = document.querySelector(".timeline-scroll--header"); const tick = header?.firstElementChild?.firstElementChild;
  if (!label || !header || !tick) return { ok: false, why: `label ${!!label} header ${!!header} tick ${!!tick}` };
  const pin = label.parentElement.getBoundingClientRect(); const lineX = pin.left + pin.width / 2;
  const contentX = lineX - header.getBoundingClientRect().left + header.scrollLeft;
  const pxPerHour = tick.getBoundingClientRect().width;
  const now = Date.now(); const d = new Date(now);
  const windowStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - 1);
  const firstTick = tick.textContent.trim();
  const atLine = windowStart + (contentX / pxPerHour) * 3600_000;
  return { ok: true, clock: d.toISOString().slice(11, 16), label: label.textContent, firstTick, pxPerHour: +pxPerHour.toFixed(1), errorMin: +((atLine - now) / 60000).toFixed(1) };
});
const rows = []; const log = (what, r) => { rows.push({ what, ...r }); console.log(`${LABEL} · ${what.padEnd(34)} ${r.ok === false ? r.why : `${r.clock}Z label ${r.label} · first tick ${r.firstTick} · ${r.pxPerHour} px/h · line error ${r.errorMin >= 0 ? "+" : ""}${r.errorMin} min`}`); };
log("loaded", await probe());
// 1. Two hours running, visible, sampled every 10 min (timers fire every second as on the wall).
for (let i = 1; i <= 12; i += 1) { await page.clock.runFor(10 * 60_000); log(`running +${i * 10} min`, await probe()); }
// 2. Blank the display 45 min: hidden, rAF suspended, timers not firing, then wake and measure IMMEDIATELY.
await page.evaluate(() => { Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" }); Object.defineProperty(document, "hidden", { configurable: true, get: () => true }); document.dispatchEvent(new Event("visibilitychange")); });
await page.clock.fastForward(45 * 60_000);
await page.evaluate(() => { Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" }); Object.defineProperty(document, "hidden", { configurable: true, get: () => false }); document.dispatchEvent(new Event("visibilitychange")); });
await page.clock.runFor(50);
log("woke after 45 min blank (+50 ms)", await probe());
await page.clock.runFor(5000); log("woke +5 s", await probe());
// 3. Scale change in the console → config.changed over SSE, no reload.
settings = { ...OPS, scale: 1, timeZoom: 1 }; sseQueue.push({ type: "config.changed", section: "settings", account: "ops@clearway.aero" });
await page.clock.runFor(4000); log("after scale change (+4 s)", await probe());
await page.clock.runFor(20_000); log("after scale change (+24 s)", await probe());
// 4. Past midnight and on.
for (let i = 0; i < 4; i += 1) { await page.clock.runFor(15 * 60_000); log("running", await probe()); }
const errs = rows.filter((r) => r.ok !== false && r.what !== "loaded").map((r) => Math.abs(r.errorMin));
console.log(`${LABEL} · worst line error ${Math.max(...errs).toFixed(1)} min over ${rows.length} samples${errors.length ? ` · page errors: ${errors.slice(0, 2).join(" | ")}` : ""}`);
if (envReports.length) console.log(`${LABEL} · display clock reports: ${envReports.length}; last ${JSON.stringify(envReports.at(-1))}; line errors reported (min): ${[...new Set(envReports.map((r) => r.lineErrorMin))].slice(0, 8).join(", ")}`);
await b.close();
