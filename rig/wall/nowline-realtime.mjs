// Real time, deployed bundle: the production display runs on the real clock for 65 min; the line's error is
// sampled every 5 min, with a real 5-minute "blank" (hidden, rAF suspended) in the middle.
import { chromium } from "../../node_modules/playwright/index.mjs";
const URL_ = process.argv[2] || "https://clearway.verxyl.com/digital-wall/timeline/";
const OPS = { scale: 0.75, timeZoom: 0.6, acColScale: 1.1, autoFitRows: false };
const json = (o) => ({ status: 200, contentType: "application/json", body: JSON.stringify(o) });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
await page.route(/\/api\//, (route) => { const p = new URL(route.request().url()).pathname.replace(/^.*\/api\//, "/api/");
  if (p === "/api/user") return route.fulfill(json({ ok: true, user: { email: "ops@clearway.aero" }, authEnabled: true }));
  if (p === "/api/display/settings") return route.fulfill(json({ ok: true, account: "ops@clearway.aero", settings: OPS }));
  if (p === "/api/timeline/flights") return route.fulfill(json({ ok: true, aircraft: [] }));
  if (p === "/api/stream") return route.fulfill({ status: 200, headers: { "content-type": "text/event-stream" }, body: "retry: 5000\n: hb\n\n" });
  return route.fulfill(json({ ok: true, limitations: [], clocks: [] })); });
await page.goto(URL_, { waitUntil: "load" }); await sleep(8000);
const probe = () => page.evaluate(() => { const pin = document.querySelector("[data-now-pin]"); const header = document.querySelector(".timeline-scroll--header"); const tick = header?.firstElementChild?.firstElementChild;
  if (!pin || !header || !tick) return null; const r = pin.getBoundingClientRect(); const x = r.left + r.width / 2 - header.getBoundingClientRect().left + header.scrollLeft;
  const pph = tick.getBoundingClientRect().width; const at = Number(header.dataset.windowStart) + (x / pph) * 3600_000; return { t: new Date().toISOString().slice(11, 19), label: pin.textContent.trim().slice(0, 9), errMin: +((at - Date.now()) / 60000).toFixed(2) }; });
const out = [];
for (let i = 0; i <= 13; i += 1) {
  if (i === 7) { // blank for 5 real minutes
    await page.evaluate(() => { window.__raf = window.requestAnimationFrame; window.requestAnimationFrame = () => 0; Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" }); document.dispatchEvent(new Event("visibilitychange")); });
    await sleep(5 * 60_000);
    await page.evaluate(() => { window.requestAnimationFrame = window.__raf; Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" }); document.dispatchEvent(new Event("visibilitychange")); });
    await sleep(100); const w = await probe(); out.push({ what: "woke +100 ms", ...w }); console.log("woke +100 ms", JSON.stringify(w));
  }
  const s = await probe(); out.push({ what: `+${i * 5} min`, ...s }); console.log(`+${i * 5} min`, JSON.stringify(s));
  if (i < 13) await sleep(5 * 60_000);
}
console.log("worst |error| min:", Math.max(...out.filter((o) => o.errMin != null).map((o) => Math.abs(o.errMin))));
await b.close();
