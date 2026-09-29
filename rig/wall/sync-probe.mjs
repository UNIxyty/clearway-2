// Does the hour header stay in step with the rows (and so with the flights and the now-line) across a blank?
// While "blank", animation frames are held; on wake they are either run (what Chrome normally does) or dropped
// (a frame that never comes — the kiosk case behind the earlier scroll latch). The rows move while blank, as
// the follow does. Prints header vs rows scroll before, after wake, and after a later scroll.
//   node rig/wall/sync-probe.mjs <display URL> [run|drop]
import { chromium } from "../../node_modules/playwright/index.mjs";
const URL_ = process.argv[2]; const MODE = process.argv[3] || "drop";
const json = (o) => ({ status: 200, contentType: "application/json", body: JSON.stringify(o) });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
await page.route(/\/api\//, (route) => { const p = new URL(route.request().url()).pathname.replace(/^.*\/api\//, "/api/");
  if (p === "/api/user") return route.fulfill(json({ ok: true, user: {}, authEnabled: true }));
  if (p === "/api/display/settings") return route.fulfill(json({ ok: true, account: "ops@clearway.aero", settings: { scale: 0.75, timeZoom: 0.6, acColScale: 1.1 } }));
  if (p === "/api/timeline/flights") return route.fulfill(json({ ok: true, aircraft: [] }));
  if (p === "/api/stream") return route.fulfill({ status: 200, headers: { "content-type": "text/event-stream" }, body: "retry: 5000\n: hb\n\n" });
  return route.fulfill(json({ ok: true })); });
await page.goto(URL_, { waitUntil: "load" }); await sleep(6000);
const st = () => page.evaluate(() => ({ header: Math.round(document.querySelector(".timeline-scroll--header").scrollLeft), rows: Math.round(document.querySelector(".timeline-scroll--body").scrollLeft) }));
console.log(`${MODE} · before blank          `, JSON.stringify(await st()));
await page.evaluate(() => { window.__raf = window.requestAnimationFrame; window.__held = []; window.requestAnimationFrame = (cb) => { window.__held.push(cb); return window.__held.length; };
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" }); document.dispatchEvent(new Event("visibilitychange"));
  document.querySelector(".timeline-scroll--body").scrollLeft += 300; });
await sleep(3000);
await page.evaluate((mode) => { window.requestAnimationFrame = window.__raf; const held = window.__held.splice(0);
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" }); document.dispatchEvent(new Event("visibilitychange"));
  if (mode === "run") held.forEach((cb) => window.__raf(cb)); }, MODE);
await sleep(2500);
console.log(`${MODE} · after wake (+2.5 s)     `, JSON.stringify(await st()));
await page.evaluate(() => { document.querySelector(".timeline-scroll--body").scrollLeft += 50; }); await sleep(2500);
console.log(`${MODE} · after a later rows move `, JSON.stringify(await st()));
await b.close();
