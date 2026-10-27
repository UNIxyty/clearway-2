// How fast is the sign-in page, and what does it download? (Sign In v2, 2026-10-28.)
//   node rig/signin-perf.mjs [label]            measure only (the numbers for the report)
//   node rig/signin-perf.mjs --check            measure and hold the page to the Sign In v2 budgets
// Real Chromium against the rig's production build (:3989, sign-in on), cache off, five loads per profile, the median:
//   desk  1440 × 900, 10 Mbit/s, 40 ms, no CPU slowdown
//   phone  390 × 844, 1.6 Mbit/s, 150 ms, CPU × 4 (Lighthouse's mobile profile)
// Reported: when the form is seen (below), first contentful paint, largest contentful paint, when the form can be typed into (hydrated: the email
// field takes a key and the Sign in button reacts), bytes on the wire (all / images / the panel's photograph), and every
// resource Chrome itself marks render-blocking (PerformanceResourceTiming.renderBlockingStatus).
// --check (Sign In v2's conditions): the photograph is AVIF where the browser takes AVIF, ≤ 200 KB at 1440 and nothing at
// 390 (below 900 px the panel is gone and so is its download); the photograph's request starts after the form is on
// screen; it fades in (opacity 0 → 1); no render-blocking resource is the photograph or its script.
import { chromium } from "playwright";

const BASE = process.env.RIG_SIGNIN_URL || "http://127.0.0.1:3989";
const CHECK = process.argv.includes("--check");
const LABEL = process.argv.slice(2).find((a) => !a.startsWith("--")) || "";
const RUNS = Number(process.env.SIGNIN_PERF_RUNS || 5);
const PROFILES = [
  { name: "desk", viewport: { width: 1440, height: 900 }, net: { latency: 40, downloadThroughput: (10e6 / 8), uploadThroughput: (5e6 / 8) }, cpu: 1 },
  { name: "phone", viewport: { width: 390, height: 844 }, net: { latency: 150, downloadThroughput: (1.6e6 / 8), uploadThroughput: (750e3 / 8) }, cpu: 4, mobile: true },
];
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
let failures = 0; const ok = (c, what, d = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${what}${d ? `  · ${String(d).slice(0, 240)}` : ""}`); if (!c) failures += 1; };

const browser = await chromium.launch();
async function once(p, theme) {
  const ctx = await browser.newContext({ viewport: p.viewport, deviceScaleFactor: p.mobile ? 3 : 2, isMobile: !!p.mobile, hasTouch: !!p.mobile, colorScheme: theme });
  await ctx.addInitScript((t) => {
    try { localStorage.setItem("cw-theme", t); } catch {}
    window.__lcp = 0; window.__photoOpacity = [];
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lcp = e.startTime; }).observe({ type: "largest-contentful-paint", buffered: true });
    // "form seen": the first frame in which the email field is laid out and fully opaque (every ancestor's opacity
    // multiplied). Chromium reports no first-contentful-paint at all for a page whose content fades in from opacity 0
    // on a slow profile, so this is the number that says when a person sees the form.
    window.__formSeen = NaN;
    const look = () => {
      const i = document.querySelector("input#email, input[type=email]");
      if (i && i.getBoundingClientRect().width > 0) { let o = 1; for (let e = i; e && e.nodeType === 1; e = e.parentElement) o *= Number(getComputedStyle(e).opacity); if (o > 0.99) { window.__formSeen = performance.now(); return; } }
      requestAnimationFrame(look);
    };
    requestAnimationFrame(look);
  }, theme);
  const page = await ctx.newPage();
  const errors = []; page.on("pageerror", (e) => errors.push(String(e.message || e).slice(0, 160)));
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Network.enable"); await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  await cdp.send("Network.emulateNetworkConditions", { offline: false, ...p.net });
  if (p.cpu > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: p.cpu });
  const reqs = new Map();
  cdp.on("Network.requestWillBeSent", (e) => reqs.set(e.requestId, { url: e.request.url, type: e.type, bytes: 0, mime: "" }));
  cdp.on("Network.responseReceived", (e) => { const r = reqs.get(e.requestId); if (r) r.mime = e.response.mimeType; });
  cdp.on("Network.loadingFinished", (e) => { const r = reqs.get(e.requestId); if (r) r.bytes = e.encodedDataLength; });
  const t0 = Date.now();
  await page.goto(`${BASE}/login`, { waitUntil: "load" });
  // when can a person type and press Sign in? the field must take a key and React must be attached to it
  await page.waitForFunction(() => { const i = document.querySelector("input#email, input[type=email]"); return !!i && Object.keys(i).some((k) => k.startsWith("__reactProps")); }, null, { timeout: 30000 });
  const typeable = Date.now() - t0;
  await page.waitForTimeout(3500);   // let a late image arrive and fade
  const m = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0];
    const fcp = performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? NaN;
    const res = performance.getEntriesByType("resource");
    const blocking = res.filter((r) => r.renderBlockingStatus === "blocking").map((r) => r.name.replace(location.origin, ""));
    const photo = res.find((r) => /\/signin\/[a-z-]+-\d+\.(avif|webp)/.test(r.name));
    const img = document.querySelector("[data-signin-photo] img");
    return { fcp, lcp: window.__lcp, formSeen: window.__formSeen, dcl: nav.domContentLoadedEventEnd, load: nav.loadEventEnd, blocking,
      photo: photo ? { url: photo.name.replace(location.origin, ""), start: photo.startTime, end: photo.responseEnd } : null,
      photoOpacity: img ? getComputedStyle(img).opacity : null, photoTransition: img ? getComputedStyle(img).transitionProperty + " " + getComputedStyle(img).transitionDuration : null,
      panel: !!document.querySelector("[data-signin-photo]"), panelShown: (() => { const e = document.querySelector("[data-signin-photo]"); return !!e && e.getBoundingClientRect().width > 0; })() };
  });
  const all = [...reqs.values()];
  const bytes = all.reduce((s, r) => s + r.bytes, 0);
  const images = all.filter((r) => /^image\//.test(r.mime) || r.type === "Image");
  const photoReq = all.find((r) => /\/signin\/[a-z-]+-\d+\.(avif|webp)/.test(r.url));
  await ctx.close();
  return { ...m, errors, typeable, bytes, imageBytes: images.reduce((s, r) => s + r.bytes, 0), images: images.map((r) => `${r.url.replace(/^https?:\/\/[^/]+/, "")} ${(r.bytes / 1024).toFixed(1)}K`), photoBytes: photoReq?.bytes ?? 0, photoMime: photoReq?.mime ?? null };
}

const K = (b) => `${(b / 1024).toFixed(1)} KB`;
for (const p of PROFILES) for (const theme of ["light", "dark"]) {
  const runs = []; for (let i = 0; i < RUNS; i += 1) runs.push(await once(p, theme));
  const r = runs[runs.length - 1];
  const row = { formSeen: median(runs.map((x) => x.formSeen)), fcp: median(runs.map((x) => x.fcp)), lcp: median(runs.map((x) => x.lcp)), typeable: median(runs.map((x) => x.typeable)), load: median(runs.map((x) => x.load)), bytes: median(runs.map((x) => x.bytes)), imageBytes: median(runs.map((x) => x.imageBytes)), photoBytes: median(runs.map((x) => x.photoBytes)) };
  console.log(`${LABEL ? LABEL + " · " : ""}${p.name} ${p.viewport.width} ${theme}: form seen ${row.formSeen.toFixed(0)} ms · FCP ${Number.isNaN(row.fcp) ? "not reported" : row.fcp.toFixed(0) + " ms"} · LCP ${row.lcp ? row.lcp.toFixed(0) + " ms" : "not reported"} · typeable ${row.typeable} ms · load ${row.load.toFixed(0)} ms · ${K(row.bytes)} on the wire · images ${K(row.imageBytes)} · photograph ${K(row.photoBytes)} ${r.photoMime ?? ""}`);
  console.log(`   render-blocking (${r.blocking.length}): ${r.blocking.join(", ") || "none"}`);
  console.log(`   images: ${r.images.join(" · ") || "none"}`);
  if (CHECK) {
    ok(runs.every((x) => x.errors.length === 0), `${p.name} ${theme}: no page error, every run (a hydration mismatch is one: React #425/#422)`, runs.flatMap((x) => x.errors).join(" · "));
    if (p.name === "desk") {
      ok(!!r.photo && r.panelShown, `${p.name} ${theme}: the photograph panel is there`, r.photo?.url);
      ok(row.photoBytes > 0 && row.photoBytes <= 200 * 1024, `${p.name} ${theme}: the photograph is ≤ 200 KB`, K(row.photoBytes));
      ok(r.photoMime === "image/avif", `${p.name} ${theme}: Chromium is given the AVIF`, r.photoMime);
      ok(runs.every((x) => x.photo && x.photo.start >= x.formSeen), `${p.name} ${theme}: the photograph is asked for only after the form is on screen, every run`, runs.map((x) => `${x.photo?.start.toFixed(0)}≥${x.formSeen.toFixed(0)}`).join(" "));
      ok(r.photoOpacity === "1" && /opacity/.test(r.photoTransition ?? ""), `${p.name} ${theme}: it fades in (opacity transition, ends at 1)`, `${r.photoOpacity} · ${r.photoTransition}`);
      ok(!r.blocking.some((u) => /signin/.test(u)), `${p.name} ${theme}: nothing of the photograph blocks rendering`, r.blocking.join(", "));
    } else {
      ok(!r.panelShown && row.photoBytes === 0 && !r.photo, `${p.name} ${theme}: no panel and no photograph downloaded below 900 px`, `${K(row.photoBytes)} ${r.photo?.url ?? ""}`);
    }
  }
}
// Which photograph: by day it follows the theme, by night (20:00–06:00 Riga) it is the runway in both. The page's clock
// is set, not the machine's.
if (CHECK) for (const [iso, theme, want] of [["2026-10-28T09:00:00Z", "light", "blue-dawn"], ["2026-10-28T09:00:00Z", "dark", "blue-night"], ["2026-10-28T19:30:00Z", "light", "runway-night"], ["2026-10-28T02:00:00Z", "dark", "runway-night"]]) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: theme });
  await ctx.addInitScript((t) => { try { localStorage.setItem("cw-theme", t); } catch {} }, theme);
  const page = await ctx.newPage();
  await page.clock.setFixedTime(new Date(iso));
  await page.goto(`${BASE}/login`, { waitUntil: "load" });
  const got = await page.waitForFunction(() => document.querySelector("[data-signin-photo]")?.getAttribute("data-signin-photo") || null, null, { timeout: 15000 }).then((h) => h.jsonValue()).catch(() => null);
  ok(got === want, `at ${iso.slice(11, 16)} UTC in ${theme}: ${want}`, got);
  if (theme === "light" && want === "blue-dawn") {
    await page.evaluate(() => { document.documentElement.setAttribute("data-theme", "dark"); });
    const after = await page.waitForFunction(() => document.querySelector("[data-signin-photo]")?.getAttribute("data-signin-photo") === "blue-night", null, { timeout: 10000 }).then(() => "blue-night").catch(() => null);
    ok(after === "blue-night", "switching the theme on the page re-chooses (blue dawn → blue night)", String(after));
  }
  await ctx.close();
}
await browser.close();
if (CHECK) { console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED"); process.exit(failures ? 1 : 0); }
