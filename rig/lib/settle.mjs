// Waiting for a page to be ready, instead of sleeping (2026-11-01). The rig's suites used `goto(); sleep(2500)` and
// the like: dead time on every run when the page is ready sooner, and a flake when it is not. Prefer waiting for the
// element the next assertion reads (page.waitForSelector). Where no single element says "ready", `settled()` waits until
// the page has stopped working:
//   · no request in flight (live streams — text/event-stream, EventSource, WebSocket — do not count),
//   · no DOM mutation, and no skeleton or busy marker on screen,
//   · the document and its fonts loaded,
// all held for `quietMs`. It returns as soon as that holds, and gives up quietly after `timeout` (the assertion that
// follows decides). Call watch(page) right after creating the page so requests from the first navigation are seen.
//   import { watch, settled } from "./lib/settle.mjs";
//   const page = await ctx.newPage(); watch(page);
//   await page.goto(url, { waitUntil: "load" }); await settled(page);
const BUSY = '[aria-busy="true"], [data-skeleton], .cw-skel, .mw-skel, .bg-cw-skeleton, .skeleton, [data-loading="true"]';
const pages = new WeakMap();

export function watch(page) {
  if (pages.has(page)) return pages.get(page);
  const st = { inflight: new Map(), changed: Date.now() };   // request → when it started
  const done = (r) => { if (st.inflight.delete(r)) st.changed = Date.now(); };
  page.on("request", (r) => { const t = r.resourceType(); if (t === "eventsource" || t === "websocket") return; st.inflight.set(r, Date.now()); st.changed = Date.now(); });
  page.on("response", (res) => { if (/text\/event-stream/.test(res.headers()["content-type"] || "")) done(res.request()); });
  page.on("requestfinished", done);
  page.on("requestfailed", done);
  // A request from a document the page has since left never reports finishing: forget it on each navigation.
  page.on("framenavigated", (f) => {
    if (f !== page.mainFrame()) return;
    const now = Date.now();
    for (const [r, at] of st.inflight) if (!r.isNavigationRequest() && at < now) st.inflight.delete(r);
    st.changed = now;
  });
  pages.set(page, st);
  return st;
}

// Every page made after this module loads is watched from its first request (BrowserContext.newPage, Browser.newPage
// and pages a context opens itself, such as popups), so settled() also sees requests sent before it is first called.
try {
  const { BrowserContext } = await import("playwright-core/lib/client/browserContext.js");
  const { Browser } = await import("playwright-core/lib/client/browser.js");
  for (const C of [BrowserContext, Browser]) {
    const orig = C.prototype.newPage;
    C.prototype.newPage = async function (...a) { const p = await orig.apply(this, a); watch(p); return p; };
  }
  const origOn = BrowserContext.prototype._onPage;
  if (origOn) BrowserContext.prototype._onPage = function (page) { watch(page); return origOn.call(this, page); };
} catch { /* playwright not installed here: watch(page) by hand */ }

export async function settled(page, { selector = null, quietMs = 250, timeout = 10000 } = {}) {
  const st = watch(page);
  const t0 = Date.now();
  if (selector) await page.waitForSelector(selector, { timeout }).catch(() => {});
  // Quiet is counted from the later of the last change and this call: a page that was quiet BEFORE the action (a click
  // that starts a route transition a moment later) must still be watched for `quietMs` after it (found 2026-11-01).
  let since = null, doc = null;
  while (Date.now() - t0 < timeout) {
    const dom = await page.evaluate(({ BUSY, since, doc }) => {
      const w = window;
      if (!w.__rigDoc) w.__rigDoc = Math.random().toString(36).slice(2);
      if (doc !== w.__rigDoc) since = null;   // a new document: its clock starts again
      if (!w.__rigQuiet) {
        w.__rigQuiet = { last: performance.now() };
        new MutationObserver(() => { w.__rigQuiet.last = performance.now(); }).observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
      }
      const ready = document.readyState === "complete" && (!document.fonts || document.fonts.status === "loaded");
      const busy = !!document.querySelector(BUSY);
      const from = since === null ? performance.now() : since;
      return { ready, busy, from, doc: w.__rigDoc, quietFor: performance.now() - Math.max(w.__rigQuiet.last, from) };
    }, { BUSY, since, doc }).catch(() => ({ ready: false, busy: false, from: null, doc: null, quietFor: 0 }));   // mid-navigation: ask again
    if (dom.doc !== doc) { doc = dom.doc; since = dom.from; } else if (since === null) since = dom.from;
    // a request open for more than 15 s is a long poll or a stream, not a page loading
    const open = [...st.inflight.values()].filter((at) => Date.now() - at < 15000).length;
    const netQuietFor = open === 0 ? Date.now() - Math.max(st.changed, t0) : 0;
    // A busy marker blocks while the page is still working. One that stays with nothing in flight and nothing changing
    // for a full second is part of the page (the component sheet shows skeletons on purpose), not a load in progress.
    const busyBlocks = dom.busy && !(dom.quietFor >= 1000 && netQuietFor >= 1000);
    if (dom.ready && !busyBlocks && dom.quietFor >= quietMs && netQuietFor >= quietMs) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  // RIG_SETTLE_DEBUG=1: say why a page never settled (the slow pages are where a suite's time goes)
  if (process.env.RIG_SETTLE_DEBUG) console.error(`settle: gave up after ${timeout} ms on ${page.url()} · in flight: ${[...st.inflight.keys()].map((r) => r.url().replace(/^https?:\/\/[^/]+/, "")).slice(0, 4).join(" ") || "none (DOM kept changing or a busy marker stayed)"}`);
  return false;
}

/** Poll `fn` until it returns something truthy (returned), or null after `timeout` ms. For non-page signals. */
export async function until(fn, { timeout = 15000, every = 100 } = {}) {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > timeout) return null;
    await new Promise((r) => setTimeout(r, every));
  }
}
