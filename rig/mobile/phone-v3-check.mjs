// The phone app (v3) as STAFF: /digital-wall/phone/ on the rig (sign-in off: the rig person, every permission).
// What it proves: the old addresses lead here (one direction, no loop, a registered screen stays); the timeline and
// the flight view behave as the old phone wall did (T1–T9, F1–F11, D1–D2); nothing of the old phone apps is lost
// (every page and sheet is reached by taps and checked); and every screen passes the phone rules (no zoom, one tap,
// nothing overlapping or under a bar, 44 px targets, it scrolls, 390 and 360 px, light and dark).
//   node --env-file=.env.rig rig/mobile/phone-v3-check.mjs            (ONLY=timeline,flight runs some parts)
// Needs rig/up.sh (flights on the wall) and the built wall pages. The client's side is phone-v3-client-check.mjs.
import { chromium } from "playwright";
import { settled, until } from "../lib/settle.mjs";
import {
  APP, OUT, COMBOS, makeOk, phoneContext, openApp, tap, gone, count, firePoll, auditLayer, viewportMeta, metaIsFine, sourceChecks,
  feedControl, shiftTimes, steady, denseFeed, editFlight, FIVE, LONG_OPERATOR, notamStandIn, listsStandIn, infoStandIn, textOf, boxOf, parts,
} from "./phone-v3-lib.mjs";

const BASE = process.env.RIG_SHELL_URL || "http://127.0.0.1:3999";
const WHO = "rig-test@rig.invalid";
const T0 = Math.floor(Date.now() / 60_000) * 60_000;
const { ok, state } = makeOk();
const part = parts(ok);
const browser = await chromium.launch();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const near = (b) => steady(b, T0);
const pathOf = (page) => { const u = new URL(page.url()); return `${u.pathname}${u.search}${u.hash}`; };
const shot = (page, name) => page.screenshot({ path: `${OUT}/phone-v3-${name}.png` }).catch(() => {});
const closeFlight = async (page) => { await tap(page, '[data-flight-sheet] button[aria-label="Close flight"]'); return gone(page, "[data-open-flight]"); };
const closeSheet = async (page, name) => { await tap(page, `[data-sheet="${name}"] [role=dialog] button[aria-label="Close"]`); return gone(page, `[data-sheet="${name}"]`); };

/** A phone, the feed under the suite's hand, and the app open. */
async function start({ theme = "light", width = 390, storage = null, path = APP, feed = near, before = null, wait } = {}) {
  const ctx = await phoneContext(browser, { theme, width, storage });
  const fc = await feedControl(ctx);
  fc.change = feed;
  if (before) await before(ctx, fc);
  const { page, errors } = await openApp(ctx, BASE, path, wait === undefined ? {} : { wait });
  return { ctx, fc, page, errors };
}

// the rig's own flights, read once: the suite names them by what the feed says, not by a list kept here
const feed = await fetch(`${BASE}/digital-wall/api/timeline/flights?allOperators=true&refresh=false`).then((r) => r.json()).catch(() => null);
const rigFlights = (feed?.aircraft || []).flatMap((a) => (a.flights || []).map((f) => ({ ...f, reg: a.registration, id: `${a.oprId}:${f.flightNid}` }))).filter((f) => !f.isCnl);
ok(rigFlights.length >= 4, "the rig's wall has flights (rig/up.sh)", `${rigFlights.length} flights on ${(feed?.aircraft || []).length} aircraft`);
if (rigFlights.length < 4) { await browser.close(); console.log("\n1 FAILED"); process.exit(1); }
const byState = (st) => rigFlights.find((f) => f.movementState === st);
const AIR = byState("airborne") || rigFlights[0];                                  // a flight in the air
const PLAIN = rigFlights.find((f) => f !== AIR && !["airborne", "arrived"].includes(f.movementState) && f.isConfirmed !== false) || rigFlights[1];
const OTHER = rigFlights.find((f) => f !== AIR && f !== PLAIN && !["airborne", "arrived"].includes(f.movementState)) || rigFlights[2];
const PAX_NID = 880001;                                                            // the one flight the rig's agent has invented passengers for
const withPax = (b) => { const a0 = b.aircraft[0]; const from = a0.flights[0]; const f = shiftTimes(from, T0 + 50 * 60_000 - Date.parse(from.startTimeUTC)); return { ...b, aircraft: [{ ...a0, flights: [...a0.flights, { ...f, flightNid: PAX_NID, flightNo: "TST880", movementState: "scheduled", isAirborne: false, hasArrived: false, checks: {}, limitations: [], limitationIds: [] }] }, ...b.aircraft.slice(1)] }; };
const five = (b) => editFlight(b, PLAIN.flightNid, (f) => ({ ...f, ...FIVE }));

// ════════════════════════════════════════════════════════════════════════════ the source (no browser)
await part("source", async () => { sourceChecks(ok); });

// ════════════════════════════════════════════════════════════════════════════ the old addresses
await part("redirects", async () => {
  const ctx = await phoneContext(browser, {});
  const visit = async (path, wait = "[data-phone-app] [data-pill], [data-phone-app] [data-flight-row]") => {
    const page = await ctx.newPage(); const navs = [];
    page.on("framenavigated", (f) => { if (f === page.mainFrame()) navs.push(pathOf(page)); });
    await page.goto(`${BASE}${path}`, { waitUntil: "load" }).catch(() => {});
    await page.waitForSelector(wait, { timeout: 30000 }).catch(() => {});
    await settled(page);
    return { page, navs };
  };
  // one direction: once a navigation reached the phone app, none after it is anywhere else (the app's own tidy-up of its address counts as a navigation here)
  const oneWay = (navs) => { const k = navs.findIndex((n) => /^\/digital-wall\/phone/.test(n)); return k >= 0 && navs.slice(k).every((n) => /^\/digital-wall\/phone/.test(n)) && navs.length <= 6; };
  const atPhone = (page) => new URL(page.url()).pathname.replace(/\/$/, "") === "/digital-wall/phone";
  const role = (page) => page.locator("[data-phone-app]").first().getAttribute("data-role").catch(() => null);

  let v = await visit("/m/wall");
  ok(atPhone(v.page) && await role(v.page) === "staff" && v.page.frames().length === 1, "/m/wall leads to the phone app, in the top window (no frame)", `${pathOf(v.page)} · role ${await role(v.page)} · ${v.page.frames().length} frame(s)`);
  const before = v.navs.length; await sleep(1500);
  ok(v.navs.length === before && oneWay(v.navs), "/m/wall → phone app is one direction: it settles and never goes back", v.navs.join(" → "));
  ok(await count(v.page, "[data-open-flight]") === 0, "/m/wall without a flight opens no flight");
  await v.page.close();

  v = await visit(`/m/wall?flight=${encodeURIComponent(AIR.id)}`, "[data-flight-callsign]");
  ok(atPhone(v.page) && (await textOf(v.page, "[data-flight-callsign]")) === AIR.flightNo, `/m/wall?flight=<id> opens that flight in the phone app (${AIR.flightNo})`, `${pathOf(v.page)} · ${await textOf(v.page, "[data-flight-callsign]")}`);
  await v.page.close();

  v = await visit(`/m/wall/${encodeURIComponent(PLAIN.id)}`, "[data-flight-callsign]");
  ok(atPhone(v.page) && (await textOf(v.page, "[data-flight-callsign]")) === PLAIN.flightNo, `/m/wall/<id> opens that flight in the phone app (${PLAIN.flightNo})`, `${pathOf(v.page)} · ${await textOf(v.page, "[data-flight-callsign]")}`);
  await v.page.close();

  v = await visit("/m");
  ok(atPhone(v.page), "/m (the old phone start) leads to the phone app", pathOf(v.page));
  await v.page.close();

  v = await visit("/digital-wall/timeline/");
  ok(atPhone(v.page) && await role(v.page) === "staff", "a person on a phone at /digital-wall/timeline/ is sent to the phone app", pathOf(v.page));
  const n2 = v.navs.length; await sleep(1500);
  ok(v.navs.length === n2 && oneWay(v.navs), "/digital-wall/timeline/ → phone app settles (no loop)", v.navs.join(" → "));
  await v.page.close();

  v = await visit(`/digital-wall/timeline/?flight=${encodeURIComponent(AIR.id)}`, "[data-flight-callsign]");
  ok(atPhone(v.page) && (await textOf(v.page, "[data-flight-callsign]")) === AIR.flightNo, "…/timeline/?flight=<id> keeps the flight", `${pathOf(v.page)} · ${await textOf(v.page, "[data-flight-callsign]")}`);
  await v.page.close();

  for (const tab of ["notam", "limits", "important", "more"]) {
    v = await visit(`/digital-wall/timeline/#${tab}`, `[data-page="${tab}"]`);
    ok(atPhone(v.page) && await count(v.page, `[data-page="${tab}"]`) === 1, `…/timeline/#${tab} (an old tab address) opens the ${tab} page of the phone app`, pathOf(v.page));
    await v.page.close();
  }

  // framed, as the old /m/wall held it: the TOP window goes to the phone app
  await ctx.route(`${BASE}/rig-old-frame`, (route) => route.fulfill({ status: 200, contentType: "text/html", body: `<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><title>old frame</title><iframe title="Digital Wall" src="/digital-wall/timeline/?in=m&flight=${encodeURIComponent(AIR.id)}" style="border:0;width:100%;height:700px"></iframe>` }));
  v = await visit("/rig-old-frame", "[data-flight-callsign]");
  ok(atPhone(v.page) && v.page.frames().length === 1 && (await textOf(v.page, "[data-flight-callsign]")) === AIR.flightNo, "framed with ?in=m: the top window is replaced by the phone app, the flight kept", `${pathOf(v.page)} · ${v.page.frames().length} frame(s)`);
  await v.page.close();

  // the phone app itself goes nowhere
  v = await visit(APP);
  const n3 = v.navs.length; await sleep(1200);
  ok(atPhone(v.page) && v.navs.length === n3 && oneWay(v.navs) && v.navs.length <= 3, "the phone app's own address stays where it is", v.navs.join(" → "));
  const meta = await viewportMeta(v.page);
  ok(metaIsFine(meta), "the page's viewport lets a person zoom and never zooms by itself (no user-scalable=no, no maximum-scale)", meta);
  await v.page.close();

  // the portal's own phone pages point at the new address
  const m = await ctx.newPage();
  await m.goto(`${BASE}/m/profile`, { waitUntil: "load" }).catch(() => {}); await settled(m);
  const links = await m.evaluate(() => [...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")));
  ok(links.some((h) => /^\/digital-wall\/phone\/?/.test(h)) && !links.some((h) => /^\/m\/wall(\/|\?|$)/.test(h)), "the portal's phone pages link the Wall to /digital-wall/phone/ and nothing links /m/wall", links.filter((h) => /wall/.test(h)).join(" "));
  await m.close();
  await ctx.close();

  // a wide screen: the desk wall stays the desk wall, and the phone app is a centred column
  const desk = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const d1 = await desk.newPage();
  await d1.goto(`${BASE}/digital-wall/timeline/`, { waitUntil: "load" }); await settled(d1); await sleep(800);
  ok(new URL(d1.url()).pathname.startsWith("/digital-wall/timeline") && await count(d1, "[data-phone-app]") === 0, "on a wide screen /digital-wall/timeline/ is not sent to the phone app", pathOf(d1));
  await d1.goto(`${BASE}${APP}`, { waitUntil: "load" }); await d1.waitForSelector("[data-pill], [data-flight-row]", { timeout: 30000 }).catch(() => {}); await settled(d1);
  const col = await boxOf(d1, "[data-phone-column]");
  ok(col && col.width <= 481 && Math.abs(col.x + col.width / 2 - 640) <= 2, "on a wide screen the phone app is one centred column of at most 480 px", JSON.stringify(col));
  await shot(d1, "wide-staff");
  await desk.close();

  // a registered screen is never sent anywhere
  const scr = await phoneContext(browser, {});
  await scr.addInitScript(() => { try { localStorage.setItem("dw-device-token", "rig-registered-screen"); } catch { /* the check below says so */ } });
  await scr.route(/\/api\/device\/state/, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, status: "approved" }) }));
  await scr.route(/\/api\/user(\?|$)/, (route) => route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ ok: false, error: "Sign in" }) }));
  for (const path of ["/digital-wall/timeline/", "/digital-wall/timeline/?in=m", "/digital-wall/timeline/#more"]) {
    const p = await scr.newPage();
    await p.goto(`${BASE}${path}`, { waitUntil: "load" }); await settled(p); await sleep(1200);
    ok(new URL(p.url()).pathname.startsWith("/digital-wall/timeline") && await count(p, "[data-phone-app]") === 0, `a registered screen at phone size stays on the display at ${path}`, pathOf(p));
    await p.close();
  }
  await scr.close();
});

// ════════════════════════════════════════════════════════════════════════════ the timeline (old behaviour T1–T9)
const spanOf = (words) => { const m = /(\d\d):(\d\d)\s*–\s*(\d\d):(\d\d)/.exec(words || ""); return m ? ((((+m[3] * 60 + +m[4]) - (+m[1] * 60 + +m[2])) / 60) + 24) % 24 : null; };
const rowFacts = (page) => page.evaluate(() => {
  const sc = document.querySelector("[data-timeline-scroll]"); const track = sc?.firstElementChild?.getBoundingClientRect();
  const line = document.querySelector("[data-now-line]")?.getBoundingClientRect();
  const rows = [...document.querySelectorAll("[data-row]")].map((r) => {
    const b = r.getBoundingClientRect(); const tick = r.querySelector("span[aria-hidden]")?.getBoundingClientRect(); const pill = r.querySelector("[data-pill]")?.getBoundingClientRect();
    return { h: Math.round(b.height), tick: tick ? Math.round(tick.left) : null, left: pill ? Math.round(pill.left) : null, right: pill ? Math.round(pill.right) : null, ph: pill ? Math.round(pill.height) : null, cs: r.querySelector("[data-pill]")?.getAttribute("data-pill") };
  });
  return { track: track ? { left: track.left, right: track.right, width: track.width } : null, line: line ? line.left + line.width / 2 : null, rows, scrollW: sc?.scrollWidth, clientW: sc?.clientWidth, docW: document.documentElement.scrollWidth, winW: window.innerWidth };
});

await part("timeline", async () => {
  // ── T1, T2: rows, pills, the now line, no sideways movement
  let s = await start({});
  let { page, fc } = s;
  let f = await rowFacts(page);
  ok(f.rows.length === rigFlights.length && f.rows.every((r) => r.h === 56 && r.ph === 44), "T1 one row of 56 px per flight, each with a 44 px pill", `${f.rows.length} rows · heights ${[...new Set(f.rows.map((r) => r.h))]} · pills ${[...new Set(f.rows.map((r) => r.ph))]}`);
  ok(f.rows.every((r, i) => i === 0 || r.tick >= f.rows[i - 1].tick), "T1 the rows are in departure order (each departure mark is at or right of the one above)", f.rows.map((r) => r.tick).join(" "));
  ok(f.rows.every((r) => Math.abs(r.left - r.tick) <= 2 || (r.left < r.tick && Math.abs(r.right - f.track.right) <= 2)), "T1 a pill starts at its departure time, or is pushed left only as far as the edge needs", f.rows.map((r) => `${r.cs}:${r.left}/${r.tick}`).join(" "));
  ok(f.line != null && Math.abs((f.line - f.track.left) / f.track.width - 1 / 6) < 0.01, "T1 the now line stands at one sixth of the width", f.line == null ? "no line" : ((f.line - f.track.left) / f.track.width).toFixed(3));
  const pushed = await page.evaluate(() => { const sc = document.querySelector("[data-timeline-scroll]"); sc.scrollLeft = 80; window.scrollTo(80, 0); return { sl: sc.scrollLeft, wx: window.scrollX, ox: getComputedStyle(sc).overflowX }; });
  ok(f.scrollW <= f.clientW + 1 && f.docW <= f.winW && pushed.sl === 0 && pushed.wx === 0, "T2 the timeline moves up and down only: nothing to pan sideways", `scroll ${f.scrollW}/${f.clientW} · page ${f.docW}/${f.winW} · pushed to ${pushed.sl},${pushed.wx} (${pushed.ox})`);

  // ── T8: the header (clocks, live)
  const clocks = await page.evaluate(() => ({ n: Number(document.querySelector("[data-clocks]")?.getAttribute("data-clocks")), cells: document.querySelectorAll("[data-clocks] [data-city]").length, cut: [...document.querySelectorAll("[data-clocks] [data-city]")].filter((x) => x.scrollWidth > x.clientWidth + 1).length }));
  ok(clocks.cells >= 2 && clocks.cells <= 5 && clocks.cut === 0 && await count(page, "[data-utc-clock]") === 0, "T8 the header shows the room's clocks (two to five), none cut", JSON.stringify(clocks));
  const live = await page.locator("[data-live]").first().getAttribute("data-live");
  ok(["live", "liveUnknown", "partial"].includes(live), "T8 the live mark says the wall is live", `${live} · “${await textOf(page, "[data-live]")}”`);
  ok(/^\d\d:\d\d – \d\d:\d\d UTC$/.test(await textOf(page, "[data-window]")) && / UTC$/.test(await textOf(page, "[data-now]")), "the window and the now mark say UTC", `${await textOf(page, "[data-window]")} · ${await textOf(page, "[data-now]")}`);
  await shot(page, "timeline-staff-390-light");

  // ── T3: the range
  ok(await count(page, '[data-range="6H"]') === 1 && spanOf(await textOf(page, "[data-window]")) === 6, "T3 a first visit starts on 6H", await textOf(page, "[data-window]"));
  await tap(page, '[data-bottom-bar] [data-seg="12H"]', '[data-range="12H"]');
  ok(spanOf(await textOf(page, "[data-window]")) === 12 && await page.locator('[data-seg="12H"]').getAttribute("aria-checked") === "true", "T3 one tap on 12H shows twelve hours", await textOf(page, "[data-window]"));
  // ── T4, F3 (short form): one tap on a pill opens the flight; closing keeps the range
  await tap(page, `[data-pill="${PLAIN.flightNo}"]`, "[data-open-flight]");
  ok((await textOf(page, "[data-flight-callsign]")) === PLAIN.flightNo && await page.locator("[data-open-flight]").getAttribute("data-open-flight") === PLAIN.id, "T4 one tap on a pill opens that flight", `${await textOf(page, "[data-flight-callsign]")} · ${await page.locator("[data-open-flight]").getAttribute("data-open-flight")}`);
  await closeFlight(page);
  ok(await count(page, '[data-range="12H"]') === 1, "T3 the range holds after a flight was open");
  await tap(page, '[data-bottom-bar] [data-seg="DAY"]', '[data-range="DAY"]');
  ok(spanOf(await textOf(page, "[data-window]")) === 0, "T3 DAY shows twenty-four hours", await textOf(page, "[data-window]"));
  await page.reload({ waitUntil: "load" }); await page.waitForSelector("[data-pill]", { timeout: 30000 }).catch(() => {}); await settled(page);
  ok(await count(page, '[data-range="DAY"]') === 1, "T3 (v3) the range a person chose last is the one the next visit starts on", await page.locator("[data-range]").first().getAttribute("data-range").catch(() => "none"));
  await tap(page, '[data-bottom-bar] [data-seg="6H"]', '[data-range="6H"]');

  // ── T5: the rail
  await tap(page, '[data-rail-btn="flights"]', '[data-view="flights"]');
  ok(await count(page, "[data-flight-row]") >= rigFlights.length && await page.locator('[data-rail-btn="flights"]').getAttribute("aria-current") === "page" && await count(page, "[data-pill]") === 0, "T5 one tap on the rail opens the flights list", `${await count(page, "[data-flight-row]")} rows`);
  await shot(page, "list-staff-390-light");
  await tap(page, `[data-flight-row="${PLAIN.id}"]`, "[data-open-flight]");
  ok((await textOf(page, "[data-flight-callsign]")) === PLAIN.flightNo, "one tap on a row of the list opens that flight", await textOf(page, "[data-flight-callsign]"));
  await closeFlight(page);
  ok(await count(page, '[data-view="flights"]') === 1, "closing the flight lands on the same list");
  await page.fill("[data-search]", PLAIN.flightNo.toLowerCase()); await settled(page);
  ok(await count(page, "[data-flight-row]") === 1 && await count(page, `[data-flight-row="${PLAIN.id}"]`) === 1, "the list's search finds a flight by its callsign", `${await count(page, "[data-flight-row]")} row(s)`);
  await page.fill("[data-search]", "zzzz-not-a-flight"); await settled(page);
  ok(await count(page, '[data-empty="search"]') === 1 && await count(page, "[data-flight-row]") === 0, "a search with no match says so and offers to clear", await textOf(page, '[data-empty="search"]'));
  await tap(page, '[data-empty="search"] button', "[data-flight-row]");
  ok(await count(page, "[data-flight-row]") >= rigFlights.length && await page.inputValue("[data-search]") === "", "Clear search brings the list back");
  await tap(page, '[data-rail-btn="timeline"]', '[data-view="timeline"]');
  ok(await count(page, "[data-pill]") === rigFlights.length, "T5 one tap on the rail goes back to the timeline");
  await tap(page, '[data-rail-btn="menu"]', '[data-sheet="menu"]');
  const menu = await page.evaluate(() => [...document.querySelectorAll("[data-menu-row]")].map((r) => r.getAttribute("data-menu-row")));
  ok(["notam", "limits", "important", "more"].every((k) => menu.includes(k)), "T5 the rail's Menu holds NOTAM check, Limits, Important and More", menu.join(" "));
  await shot(page, "menu-sheet-staff-390-light");
  await tap(page, '[data-menu-row="more"]', '[data-page="more"]');
  await tap(page, '[data-more-item="settings"]', '[data-page="settings"]');
  ok(await count(page, '[data-page="settings"] [data-settings-row]') >= 5, "T5 (v3) Phone settings is under Menu → More (three taps, the old rail had it in one)", `${await count(page, '[data-page="settings"] [data-settings-row]')} rows`);
  await page.goBack(); await gone(page, '[data-page="settings"]'); await page.goBack(); await gone(page, '[data-page="more"]');
  ok(await count(page, "[data-page]") === 0 && await count(page, "[data-pill]") === rigFlights.length, "the browser's Back closes a page, one at a time, down to the timeline");

  // ── T6: the filter
  await tap(page, "[data-filter-btn]", '[data-sheet="filter"]');
  const regs = await page.evaluate(() => [...document.querySelectorAll("[data-filter-aircraft]")].map((r) => r.getAttribute("data-filter-aircraft")));
  ok(regs.length === (feed.aircraft || []).length && /Showing all \d+ aircraft/.test(await textOf(page, '[data-sheet="filter"]')), "T6 the filter button opens the aircraft sheet with a switch for each aircraft", `${regs.join(" ")}`);
  await shot(page, "filter-sheet-staff-390-light");
  const hideFids = rigFlights.filter((x) => x.reg === PLAIN.reg).map((x) => x.id);
  await tap(page, `[data-filter-aircraft="${PLAIN.reg}"] [role=switch]`);
  await until(async () => await page.locator(`[data-filter-aircraft="${PLAIN.reg}"] [role=switch]`).getAttribute("aria-checked") === "false", { timeout: 4000 }).catch(() => {});
  ok(/1 aircraft hidden of/.test(await textOf(page, '[data-sheet="filter"]')) && /Show \d+ aircraft/.test(await textOf(page, "[data-filter-done]")), "T6 one tap on a switch hides that aircraft, and the sheet says how many", await textOf(page, "[data-filter-done]"));
  await tap(page, "[data-filter-done]"); await gone(page, '[data-sheet="filter"]');
  const left = await page.evaluate(() => [...document.querySelectorAll("[data-pill]")].map((p) => p.getAttribute("data-fid")));
  ok(hideFids.every((id) => !left.includes(id)) && left.length === rigFlights.length - hideFids.length, "T6 the hidden aircraft's flights leave the timeline", `${left.length} left of ${rigFlights.length}`);
  ok(await count(page, "[data-filter-banner]") === 1 && /1 aircraft hidden/.test(await textOf(page, "[data-filter-banner]")) && await count(page, "[data-filter-btn] [data-badge]") === 1, "T6 a banner and a mark on the button say a filter is on", await textOf(page, "[data-filter-banner]"));
  await shot(page, "filter-on-staff-390-light");
  await tap(page, "[data-filter-banner] button"); await gone(page, "[data-filter-banner]");
  ok(await count(page, "[data-pill]") === rigFlights.length, "T6 Show all on the banner brings every flight back");
  // every aircraft off: the filtered-empty state
  await tap(page, "[data-filter-btn]", '[data-sheet="filter"]');
  for (const sw of await page.locator('[data-filter-switch="operator"]').all()) { await sw.click(); await settled(page); }
  await tap(page, "[data-filter-done]"); await gone(page, '[data-sheet="filter"]');
  ok(await count(page, '[data-empty="filtered"]') === 1 && await count(page, "[data-pill]") === 0, "T7 every aircraft hidden: words say so, with one button", await textOf(page, '[data-empty="filtered"]'));
  await shot(page, "filtered-empty-staff-390-light");
  await tap(page, '[data-empty="filtered"] button', "[data-pill]");
  ok(await count(page, "[data-pill]") === rigFlights.length && await count(page, "[data-filter-banner]") === 0, "T7 Show all aircraft brings the flights back");
  // staff: the filter is for this visit only
  await tap(page, "[data-filter-btn]", '[data-sheet="filter"]');
  await tap(page, `[data-filter-aircraft="${PLAIN.reg}"] [role=switch]`); await settled(page);
  await tap(page, "[data-filter-done]"); await gone(page, '[data-sheet="filter"]');
  await page.reload({ waitUntil: "load" }); await page.waitForSelector("[data-pill]", { timeout: 30000 }).catch(() => {}); await settled(page);
  ok(await count(page, "[data-pill]") === rigFlights.length && await count(page, "[data-filter-banner]") === 0, "T6 a staff filter lasts for the visit only: a reload shows every aircraft");

  // ── T6: the bell
  await tap(page, "[data-bell]", '[data-sheet="notifications"]');
  ok(await count(page, "[data-notif-empty]") === 1 && await count(page, "[data-notif]") === 0, "T6 the bell opens the notifications; with no news it says so", await textOf(page, "[data-notif-empty]"));
  await closeSheet(page, "notifications");
  fc.change = (b) => editFlight(near(b), OTHER.flightNid, (x) => ({ ...x, movementState: "airborne", isAirborne: true }));
  await firePoll(page);
  await page.waitForSelector("[data-bell] [data-badge]", { timeout: 15000 }).catch(() => {});
  ok(await count(page, "[data-bell] [data-badge]") === 1, "T6 a flight that departs between two updates puts a mark on the bell", await page.locator("[data-bell]").getAttribute("aria-label").catch(() => ""));
  await tap(page, "[data-bell]", '[data-sheet="notifications"]');
  const dep = page.locator('[data-notif="DEP"][data-unread]');
  ok(await dep.count() === 1 && new RegExp(`${OTHER.flightNo} departed`).test(await textOf(page, '[data-notif="DEP"]')), "T6 the notification names the flight and what happened", await textOf(page, '[data-notif="DEP"]'));
  await shot(page, "notifications-staff-390-light");
  await dep.first().click(); await page.waitForSelector("[data-open-flight]", { timeout: 8000 }).catch(() => {});
  ok(await count(page, '[data-sheet="notifications"]') === 0 && (await textOf(page, "[data-flight-callsign]")) === OTHER.flightNo, "T6 one tap on a notification closes the sheet and opens that flight", await textOf(page, "[data-flight-callsign]"));
  await closeFlight(page);
  await tap(page, "[data-bell]", '[data-sheet="notifications"]');
  ok(await count(page, '[data-notif="DEP"]') === 1 && await count(page, '[data-notif="DEP"][data-unread]') === 0 && await count(page, "[data-bell] [data-badge]") === 0, "T6 the tapped notification is read afterwards, and the mark is gone");
  await closeSheet(page, "notifications");

  // ── T7: not live (the wall stops answering after a good load)
  fc.mode = "fail"; await firePoll(page);
  await page.waitForSelector("[data-stale-banner]", { timeout: 20000 }).catch(() => {});
  const dim = await page.evaluate(() => getComputedStyle(document.querySelector("[data-timeline-scroll]")).opacity);
  ok(await count(page, "[data-stale-banner]") === 1 && /Not live\. Last update \d\d:\d\dZ/.test(await textOf(page, "[data-stale-banner]")) && dim === "0.55" && await count(page, "[data-pill]") === rigFlights.length, "T7 not live: a banner says since when, the flights stay, dimmed", `${await textOf(page, "[data-stale-banner]")} · opacity ${dim}`);
  ok(await page.locator("[data-live]").first().getAttribute("data-live") === "stale", "T7 not live: the live mark says so too", await textOf(page, "[data-live]"));
  await shot(page, "stale-staff-390-light");
  fc.mode = "pass"; await tap(page, "[data-stale-banner] [data-banner-action]"); await gone(page, "[data-stale-banner]", 20000);
  ok(await count(page, "[data-stale-banner]") === 0 && await page.evaluate(() => getComputedStyle(document.querySelector("[data-timeline-scroll]")).opacity) === "1", "T7 Try again on the banner brings the wall back live");
  ok(s.errors.length === 0, "no page error on the timeline through all of this", s.errors.slice(0, 2).join(" | "));
  await s.ctx.close();

  // ── T7: loading, failed
  s = await start({ before: (_c, c2) => { c2.delay = 2500; }, wait: '[data-view="timeline"] [data-skeleton]' }); page = s.page;
  ok(await count(page, '[data-view="timeline"][data-state="loading"] [data-skeleton]') === 1 && await count(page, "[data-pill]") === 0, "T7 while the flights load, grey rows stand in for them");
  await shot(page, "loading-staff-390-light");
  await page.waitForSelector("[data-pill]", { timeout: 30000 }).catch(() => {});
  ok(await count(page, "[data-skeleton]") === 0 && await count(page, "[data-pill]") === rigFlights.length, "T7 the grey rows give way to the flights");
  await s.ctx.close();
  s = await start({ before: (_c, c2) => { c2.mode = "fail"; } }); page = s.page; fc = s.fc;
  ok(await count(page, "[data-feed-failed]") === 1 && await count(page, "[data-pill]") === 0 && await count(page, '[data-view="timeline"][data-state="failed"]') === 1 && /Couldn.t load flights/.test(await textOf(page, "[data-feed-failed]")), "T7 the wall does not answer: plain words and one button, no flights drawn", await textOf(page, "[data-feed-failed]"));
  await shot(page, "failed-staff-390-light");
  fc.mode = "pass"; await tap(page, "[data-feed-failed] button", "[data-pill]");
  ok(await count(page, "[data-pill]") === rigFlights.length && await count(page, "[data-feed-failed]") === 0, "T7 Try again loads the flights");
  await s.ctx.close();

  // ── T7: nothing in the window
  s = await start({ feed: (b) => { const n = near(b); return { ...n, aircraft: n.aircraft.map((a) => ({ ...a, flights: a.flights.map((x) => shiftTimes(x, 8 * 3600_000)) })) }; } }); page = s.page;
  ok(await count(page, '[data-empty="window"]') === 1 && /No flights between \d\d:\d\d and \d\d:\d\d UTC/.test(await textOf(page, '[data-empty="window"]')) && await count(page, "[data-pill]") === 0, "T7 no flight in the window: words say which hours", await textOf(page, '[data-empty="window"]'));
  await shot(page, "empty-window-staff-390-light");
  await tap(page, '[data-empty="window"] button', "[data-pill]");
  ok(await count(page, '[data-range="DAY"]') === 1 && await count(page, "[data-pill]") === rigFlights.length, "T7 Show the whole day sets DAY and the flights show");
  await s.ctx.close();
  // the rig's own times, untouched (whatever the hour): every flight of the day is a row, in order
  s = await start({ feed: null, storage: { [`cw3-phone-prefs:${WHO}`]: JSON.stringify({ range: "DAY" }) }, wait: "[data-pill], [data-empty]" }); page = s.page;
  f = await rowFacts(page);
  ok(f.rows.every((r, i) => r.h === 56 && (i === 0 || r.tick >= f.rows[i - 1].tick)), "T1 with the rig's own times (DAY): the rows that show are 56 px and in departure order", `${f.rows.length} rows`);
  await shot(page, "timeline-real-day-staff-390-light");
  await s.ctx.close();

  // ── T9: keep the screen awake
  const wake = () => { window.__wake = []; try { Object.defineProperty(navigator, "wakeLock", { configurable: true, value: { request: async (t) => { window.__wake.push(t); return { released: false, release: async () => { window.__wake.push("released"); }, addEventListener() {}, removeEventListener() {} }; } } }); } catch { window.__wake.push("no stub"); } };
  s = await start({ before: (c1) => c1.addInitScript(wake) }); page = s.page;
  await sleep(500);
  ok((await page.evaluate(() => window.__wake.join(","))) === "", "T9 keep awake off: the screen lock is not asked for", await page.evaluate(() => window.__wake.join(",")));
  await tap(page, '[data-rail-btn="menu"]', '[data-sheet="menu"]'); await tap(page, '[data-menu-row="more"]', '[data-page="more"]'); await tap(page, '[data-more-item="settings"]', '[data-page="settings"]');
  await tap(page, '[data-settings-control="awake"]');
  await until(async () => (await page.evaluate(() => window.__wake.includes("screen"))), { timeout: 5000 }).catch(() => {});
  ok((await page.evaluate(() => window.__wake[0])) === "screen" && await page.locator('[data-settings-control="awake"]').getAttribute("aria-checked") === "true", "T9 the Keep screen awake switch asks the phone to stay on", await page.evaluate(() => window.__wake.join(",")));
  await page.reload({ waitUntil: "load" }); await page.waitForSelector("[data-pill]", { timeout: 30000 }).catch(() => {}); await sleep(500);
  ok((await page.evaluate(() => window.__wake.includes("screen"))), "T9 the switch is kept: the next visit asks again by itself", await page.evaluate(() => window.__wake.join(",")));
  await s.ctx.close();
});

// ════════════════════════════════════════════════════════════════════════════ the flight (old behaviour F1–F11, D1–D2)
const TYPES = ["imp", "ntm", "wx", "caa", "lim"];
const putBack = (f) => fetch(`${BASE}/digital-wall/api/flight-checks`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ oprId: f.oprId, flightNid: f.flightNid, types: TYPES, checked: false }) }).then((r) => r.status).catch(() => 0);
const checksNow = async (f) => { const b = await fetch(`${BASE}/digital-wall/api/timeline/flights?allOperators=true&refresh=false`).then((r) => r.json()).catch(() => null); const x = (b?.aircraft || []).flatMap((a) => a.flights || []).find((y) => Number(y.flightNid) === Number(f.flightNid)); return Object.keys(x?.checks || {}).filter((k) => x.checks[k]).sort(); };
const flightFeed = (b) => withPax(five(near(b)));
const PAX_ID = `${rigFlights[0].oprId}:${PAX_NID}`;
const N_ALL = rigFlights.length + 1;

await part("flight", async () => {
  await putBack(PLAIN);
  let ns = null;
  let s = await start({ feed: flightFeed, before: async (c1) => { ns = await notamStandIn(c1, { todo: AIR.adep.icao, done: AIR.ades.icao }); } });
  let { page, fc } = s;
  ok(await count(page, "[data-pill]") === N_ALL, "the timeline shows the rig's flights and the one with passengers", `${await count(page, "[data-pill]")} of ${N_ALL}`);

  // ── F1, F2: the flight lies over the timeline; X or the strip closes it; no history entry
  const h0 = await page.evaluate(() => history.length);
  await tap(page, `[data-pill="${AIR.flightNo}"]`, "[data-open-flight]");
  const strip = await boxOf(page, "[data-flight-strip]"); const sheet = await boxOf(page, "[data-flight-sheet]");
  ok(await count(page, '[data-view="timeline"]') === 1 && await count(page, "[data-pill]") === N_ALL, "F1 the timeline stays under the open flight (not taken away)");
  ok(strip && sheet && Math.round(strip.y) === 0 && Math.round(strip.height) === 56 && Math.round(sheet.y) === 56, "F1 56 px of the list show above the flight", `strip ${JSON.stringify(strip)} · sheet y ${sheet?.y}`);
  ok(await page.evaluate(() => history.length) === h0 && pathOf(page) === "/digital-wall/phone", "F2 opening a flight makes no history entry and leaves the address alone", `${h0} → ${await page.evaluate(() => history.length)} · ${pathOf(page)}`);
  ok(await page.locator("[data-open-flight]").getAttribute("data-flight-state") === "ok" && await count(page, "[data-flight-times] [data-time]") >= 2 && await page.locator("[data-flight-status]").getAttribute("data-flight-status") === "airborne", "the flight shows its callsign, status and times", `${await textOf(page, "[data-flight-callsign]")} · ${await textOf(page, "[data-flight-status]")} · ${await textOf(page, "[data-flight-times]")}`);
  ok(/Z/.test(await textOf(page, "[data-flight-times]")), "the flight's times are UTC, marked Z");
  await shot(page, "flight-staff-390-light");
  await closeFlight(page);
  ok(await count(page, "[data-open-flight]") === 0 && await page.evaluate(() => history.length) === h0 && !/flight=/.test(page.url()), "F2 the X closes the flight: same history, the address drops the flight", pathOf(page));
  await tap(page, `[data-pill="${AIR.flightNo}"]`, "[data-open-flight]");
  await tap(page, "[data-flight-strip]"); await gone(page, "[data-open-flight]");
  ok(await count(page, "[data-open-flight]") === 0, "F2 one tap on the strip of list above the flight closes it too");

  // ── F4: the body scrolls inside the sheet
  await tap(page, `[data-pill="${PLAIN.flightNo}"]`, "[data-checks-grid]");
  const sc = await page.evaluate(() => { const b = document.querySelector("[data-flight-body]"); const before = b.scrollTop; b.scrollTop = 240; const r = { sh: b.scrollHeight, ch: b.clientHeight, moved: b.scrollTop - before, oy: getComputedStyle(b).overflowY, win: window.scrollY, strip: Math.round(document.querySelector("[data-flight-strip]").getBoundingClientRect().height) }; b.scrollTop = 0; return r; });
  ok((sc.sh > sc.ch ? sc.moved > 0 : /auto|scroll/.test(sc.oy)) && sc.win === 0 && sc.strip === 56, "F4 the flight's body scrolls inside its sheet; the page behind does not move", JSON.stringify(sc));

  // ── F9: the five checks
  const grid = async () => page.evaluate(() => ({ done: document.querySelector("[data-checks-grid]")?.getAttribute("data-done"), cells: [...document.querySelectorAll("[data-check]")].map((x) => `${x.getAttribute("data-check")}${x.getAttribute("data-done")}${x.hasAttribute("data-none") ? "n" : ""}`).join(" ") }));
  let g = await grid();
  ok(g.cells === "IMP0 NTM0 WX0 CAA0 LIM0" && g.done === "0", "F9 the five checks (IMP NTM WX CAA LIM) stand in a grid, all to check", JSON.stringify(g));
  const mark = page.locator("button[data-mark-checked]");
  ok(await mark.count() === 1 && await mark.getAttribute("data-open-checks") === "IMP NTM WX CAA LIM" && await mark.isEnabled() && /Mark checked/.test(await mark.innerText()), "F9 (v3) one Mark checked button at the foot covers every open check", await mark.getAttribute("data-open-checks").catch(() => ""));
  await shot(page, "flight-checks-staff-390-light");
  await tap(page, '[data-check="CAA"]', '[data-sheet="checks"]');
  const rowsC = await page.evaluate(() => [...document.querySelectorAll('[data-sheet="checks"] [data-check-row]')].map((r) => `${r.getAttribute("data-check-row")}:${/Not checked/.test(r.textContent) ? "open" : "other"}`).join(" "));
  ok(rowsC === "IMP:open NTM:open WX:open CAA:open LIM:open" && /Read only/.test(await textOf(page, '[data-sheet="checks"]')) && await count(page, '[data-sheet="checks"] [data-mark-checked]') === 0, "F9 one tap on a cell opens the read-only sheet: five rows, what each is about, nothing to mark there", rowsC);
  ok(/Invented CAA entry/.test(await textOf(page, '[data-check-row="CAA"]')) && /Invented important note/.test(await textOf(page, '[data-check-row="IMP"]')), "the checks sheet says what each check is about", (await textOf(page, '[data-check-row="CAA"]')).slice(0, 90));
  await shot(page, "sheet-checks-staff-390-light");
  // ── F10: a sheet closes by Close, by a tap outside, by Escape
  await closeSheet(page, "checks");
  ok(await count(page, '[data-sheet="checks"]') === 0 && await count(page, "[data-open-flight]") === 1, "F10 Close closes a sheet and the flight stays");
  await tap(page, "[data-open-checks-sheet]", '[data-sheet="checks"]');
  await page.locator('[data-sheet="checks"] [data-scrim]').tap({ position: { x: 24, y: 24 }, timeout: 5000 }).catch(() => {}); await gone(page, '[data-sheet="checks"]');
  ok(await count(page, '[data-sheet="checks"]') === 0 && await count(page, "[data-open-flight]") === 1, "F10 a tap outside a sheet closes it (View › opened it)");
  await tap(page, '[data-check="IMP"]', '[data-sheet="checks"]');
  await page.keyboard.press("Escape"); await gone(page, '[data-sheet="checks"]');
  ok(await count(page, '[data-sheet="checks"]') === 0 && await count(page, "[data-open-flight]") === 1, "F10 Escape closes a sheet, not the flight under it");

  // ── F6: limitations on the flight
  ok(await count(page, "[data-open-limits]") === 1 && await page.locator("[data-open-limits]").getAttribute("aria-label") === "Limitations, 1", "F6 a flight with a limitation has the Limitations button, with the number", await page.locator("[data-open-limits]").getAttribute("aria-label").catch(() => "none"));
  await tap(page, "[data-open-limits]", '[data-sheet="limitations"]');
  ok(await count(page, '[data-sheet="limitations"] [data-limitation]') === 1 && /no landing after dark/.test(await textOf(page, "[data-limitation]")), "F6 one tap shows the limitation, whole", (await textOf(page, "[data-limitation]")).slice(0, 100));
  await shot(page, "sheet-limitations-staff-390-light");
  await closeSheet(page, "limitations");

  // ── F8: service status
  ok(await count(page, "[data-open-services]") === 1, "F8 the flight has the Service status row", await textOf(page, "[data-open-services]"));
  await tap(page, "[data-open-services]", '[data-sheet="services"] [data-service], [data-services-none], [data-services-failed]');
  ok(await count(page, '[data-sheet="services"] [data-service]') >= 1 && await count(page, "[data-services-failed]") === 0, "F8 one tap opens the services with what was asked and what was answered", `${await count(page, '[data-sheet="services"] [data-service]')} rows · ${(await textOf(page, '[data-sheet="services"] [data-service]')).slice(0, 80)}`);
  await shot(page, "sheet-services-staff-390-light");
  await closeSheet(page, "services");

  // ── F9: marking waits while the wall is not live, then marks, read back from the wall
  fc.mode = "fail"; await firePoll(page);
  await page.waitForSelector("[data-mark-note]", { timeout: 20000 }).catch(() => {});
  ok(/Not live\. Marking waits/.test(await textOf(page, "[data-mark-note]")) && await mark.isDisabled(), "F9 while the wall is not live the button is off, and words say why", await textOf(page, "[data-mark-note]"));
  await shot(page, "flight-stale-staff-390-light");
  fc.mode = "pass"; await firePoll(page);
  await until(async () => (await mark.isEnabled().catch(() => false)), { timeout: 20000 }).catch(() => {});
  ok(await mark.isEnabled().catch(() => false) && await count(page, "[data-mark-note]") === 0, "F9 live again: the button is on");
  await tap(page, "button[data-mark-checked]", "[data-all-checked]", { timeout: 25000 });
  g = await grid();
  ok(await count(page, "[data-all-checked]") === 1 && g.done === "5" && g.cells === "IMP1 NTM1 WX1 CAA1 LIM1", "F9 one tap on Mark checked: all five read checked (after the wall said so)", `${JSON.stringify(g)} · ${await textOf(page, "[data-mark-checked]")} · note “${await textOf(page, "[data-mark-note]")}”`);
  const saved = await checksNow(PLAIN);
  ok(TYPES.every((t) => saved.includes(t)), "F9 the wall itself holds the five marks", saved.join(" "));
  await tap(page, '[data-check="WX"]', '[data-sheet="checks"]');
  ok(/✓ [A-Z?]{1,3} \d\d:\d\d/.test(await textOf(page, '[data-check-row="WX"]')), "F9 the sheet says who checked and when", (await textOf(page, '[data-check-row="WX"]')).slice(0, 80));
  await shot(page, "sheet-checks-done-staff-390-light");
  await closeSheet(page, "checks");
  ok(await putBack(PLAIN) === 200 && (await checksNow(PLAIN)).length === 0, "the marks are put back (unchecked by the API), so the rig is as it was", (await checksNow(PLAIN)).join(" "));

  // another person took the marks off (that is what the put-back was): the flight reads ‘to check’ again, and this
  // phone does not call its own save a failure
  await until(async () => { await firePoll(page); return (await grid()).done === "0"; }, { timeout: 20000, every: 1500 }).catch(() => {});
  ok((await grid()).done === "0" && await count(page, "button[data-mark-checked]") === 1 && !/did not save/.test(await textOf(page, "[data-flight-foot]")), "marks another person takes off later show as ‘to check’ again, without calling this phone's save a failure", (await textOf(page, "[data-flight-foot]")).slice(0, 120));

  // ── F11: the open flight leaves the schedule
  fc.change = (b) => { const n = flightFeed(b); return { ...n, aircraft: n.aircraft.map((a) => ({ ...a, flights: a.flights.filter((x) => Number(x.flightNid) !== Number(PLAIN.flightNid)) })) }; };
  // (a read already under way is not started twice, so ask until the flight is gone)
  await until(async () => { await firePoll(page); return (await count(page, "[data-flight-gone]")) === 1; }, { timeout: 20000, every: 1500 }).catch(() => {});
  ok(await count(page, "[data-flight-gone]") === 1 && new RegExp(`${PLAIN.flightNo} is no longer on the schedule`).test(await textOf(page, "[data-flight-gone]")) && /left the schedule at \d\d:\d\dZ/.test(await textOf(page, "[data-flight-gone]")), "F11 the open flight leaves the schedule: words say so, with the time", await textOf(page, "[data-flight-gone]"));
  await shot(page, "flight-gone-staff-390-light");
  await tap(page, "[data-flight-gone] button"); await gone(page, "[data-open-flight]");
  ok(await count(page, "[data-open-flight]") === 0 && await count(page, "[data-pill]") === N_ALL - 1, "F11 Back to flights closes it; the timeline shows the flights that are left");
  fc.change = flightFeed; await until(async () => { await firePoll(page); return (await count(page, `[data-pill="${PLAIN.flightNo}"]`)) === 1; }, { timeout: 20000, every: 1500 }).catch(() => {});

  // ── F5: an airport, weather and NOTAMs
  await tap(page, `[data-pill="${AIR.flightNo}"]`, "[data-open-flight]");
  ok(await count(page, "[data-open-limits]") === 0, "F6 a flight without limitations has no Limitations button");
  const depBtn = page.locator('button[data-airport][data-side="dep"]');
  ok(await depBtn.count() === 1 && /Weather and NOTAM/.test(await depBtn.getAttribute("aria-label")), "F5 each airport of the flight is one button for weather and NOTAMs", await depBtn.getAttribute("aria-label").catch(() => "none"));
  await tap(page, depBtn, `[data-airport-sheet="${AIR.adep.icao}"] [data-notam], [data-airport-sheet] [data-notams-none], [data-airport-sheet] [data-weather], [data-airport-sheet] [data-weather-none]`);
  ok(await page.locator('[data-airport-tabs] [data-seg="notams"]').getAttribute("aria-checked") === "true" && await count(page, "[data-airport-sheet] [data-notam]") >= 1, "F5 an airport with NOTAMs not yet checked today opens on its NOTAMs", `${await count(page, "[data-airport-sheet] [data-notam]")} NOTAMs at ${AIR.adep.icao}`);
  await shot(page, "sheet-airport-notams-staff-390-light");
  await tap(page, '[data-airport-tabs] [data-seg="wx"]', "[data-weather], [data-weather-none]");
  ok(await count(page, "[data-weather], [data-weather-none]") === 1 && await count(page, "[data-airport-failed]") === 0, "F5 the other tab is the weather (the rig has none on file: it says so)", (await textOf(page, "[data-weather], [data-weather-none]")).slice(0, 90));
  await closeSheet(page, "airport");
  await tap(page, '[data-airport][data-side="arr"]', "[data-airport-sheet]");
  ok(await page.locator("[data-airport-sheet]").getAttribute("data-airport-sheet") === AIR.ades.icao && await page.locator('[data-airport-tabs] [data-seg="wx"]').getAttribute("aria-checked") === "true", "F5 an airport already checked today opens on the weather", await page.locator("[data-airport-sheet]").getAttribute("data-airport-sheet").catch(() => "none"));
  await page.keyboard.press("Escape"); await gone(page, '[data-sheet="airport"]');

  // ── F7: the map
  ok(await count(page, "[data-open-map]") === 1 && /No live position/.test(await textOf(page, "[data-map-words]")), "F7 the flight has the Map button; in the air it says no live position", await textOf(page, "[data-map-words]"));
  await tap(page, "[data-open-map]", "[data-flight-map] [data-map-state]");
  ok(await page.locator("[data-flight-map] [data-map-state]").getAttribute("data-map-state") === "nopos" && /No live position/.test(await textOf(page, "[data-flight-map]")), "F7 one tap opens the full map, in its ‘no live position’ state", (await textOf(page, "[data-flight-map]")).slice(0, 120));
  await shot(page, "map-staff-390-light");
  await tap(page, "[data-map-back]"); await gone(page, "[data-flight-map]");
  ok(await count(page, "[data-flight-map]") === 0 && await count(page, "[data-open-flight]") === 1, "F7 the map's Flight button goes back to the flight");
  await closeFlight(page);

  // ── F6: passengers (names first; a document on one tap)
  await tap(page, `[data-fid="${PAX_ID}"]`, "[data-open-flight]");
  ok(await count(page, "[data-open-pax]") === 1 && /^Passengers/.test(await page.locator("[data-open-pax]").getAttribute("aria-label")), "F6 the flight has the passengers button", await page.locator("[data-open-pax]").getAttribute("aria-label").catch(() => "none"));
  await tap(page, "[data-open-pax]", '[data-passenger-viewer="phone"] [data-pax-list]');
  const show = page.locator('[data-sheet="passengers"] button[aria-label^="Show the document of"]');
  ok(await count(page, '[data-sheet="passengers"] [data-passenger-viewer="phone"]') === 1 && await show.count() >= 1 && await count(page, "[data-pax-doc]") === 0, "F6 one tap opens the passengers: names first, no document shown", `${await show.count()} passengers`);
  ok(!/hold/i.test(await textOf(page, '[data-sheet="passengers"]')), "nothing on the passengers sheet says hold");
  await tap(page, show.first(), "[data-pax-doc]");
  ok(await count(page, "[data-pax-doc]") >= 1, "F6 one normal tap on Show brings one passenger's document");
  await page.locator("[data-pax-doc] button").filter({ hasText: /hide|close|done/i }).first().tap({ timeout: 4000 }).catch(() => {}); await gone(page, "[data-pax-doc]", 6000);
  ok(await count(page, "[data-pax-doc]") === 0, "the document closes again on one tap");
  await closeSheet(page, "passengers"); await closeFlight(page);
  ok(s.errors.length === 0, "no page error through the whole flight", s.errors.slice(0, 2).join(" | "));
  await s.ctx.close();

  // ── F3: closing a flight lands on the same place and range (a busy day, so the timeline is long)
  s = await start({ feed: (b) => denseFeed(near(b), T0) }); page = s.page;
  await tap(page, '[data-bottom-bar] [data-seg="12H"]', '[data-range="12H"]');
  const place = await page.evaluate(() => { const el = document.querySelector("[data-timeline-scroll]"); el.scrollTop = 420; const top = el.getBoundingClientRect().top; const pill = [...document.querySelectorAll("[data-pill]")].find((x) => x.getBoundingClientRect().top > top + 120); return { top: el.scrollTop, max: el.scrollHeight - el.clientHeight, fid: pill?.getAttribute("data-fid") }; });
  await tap(page, `[data-fid="${place.fid}"]`, "[data-open-flight]"); await closeFlight(page);
  const after = await page.evaluate(() => document.querySelector("[data-timeline-scroll]").scrollTop);
  ok(place.top > 100 && after === place.top && await count(page, '[data-range="12H"]') === 1, "F3 closing a flight lands on the same place of the timeline, in the same range", `scrolled to ${place.top} of ${place.max} → ${after}`);
  await tap(page, '[data-rail-btn="flights"]', "[data-flight-row]");
  const place2 = await page.evaluate(() => { const el = document.querySelector("[data-list-scroll]"); el.scrollTop = 500; const top = el.getBoundingClientRect().top; const row = [...document.querySelectorAll("[data-flight-row]")].find((x) => x.getBoundingClientRect().top > top + 100); return { top: el.scrollTop, id: row?.getAttribute("data-flight-row") }; });
  await tap(page, `[data-flight-row="${place2.id}"]`, "[data-open-flight]"); await closeFlight(page);
  ok(place2.top > 100 && await page.evaluate(() => document.querySelector("[data-list-scroll]").scrollTop) === place2.top, "F3 the same for the flights list", `scrolled to ${place2.top}`);
  await s.ctx.close();

  // ── D1, D2: a link to a flight
  s = await start({ path: `${APP}?flight=${encodeURIComponent(AIR.id)}`, before: (_c, c2) => { c2.delay = 2000; }, wait: "[data-open-flight]" }); page = s.page;
  ok(await page.locator("[data-open-flight]").getAttribute("data-flight-state") === "loading" && await count(page, "[data-open-flight] [data-skeleton]") >= 1 && await count(page, "[data-flight-gone]") === 0, "D1 a link to a flight: while the flights load the flight shows grey rows, not ‘gone’", await page.locator("[data-open-flight]").getAttribute("data-flight-state").catch(() => "none"));
  await page.waitForSelector('[data-open-flight][data-flight-state="ok"]', { timeout: 30000 }).catch(() => {});
  ok((await textOf(page, "[data-flight-callsign]")) === AIR.flightNo, "D1 the flight opens once the flights are loaded", await textOf(page, "[data-flight-callsign]"));
  await s.ctx.close();
  s = await start({ path: `${APP}?flight=${encodeURIComponent(`${AIR.oprId}:1`)}`, wait: "[data-flight-gone]" }); page = s.page;
  ok(await count(page, "[data-flight-gone]") === 1 && /This flight is no longer on the schedule/.test(await textOf(page, "[data-flight-gone]")), "D2 a link to a flight that is not there says so", await textOf(page, "[data-flight-gone]"));
  await shot(page, "flight-gone-link-staff-390-light");
  await tap(page, "[data-flight-gone] button"); await gone(page, "[data-open-flight]");
  ok(await count(page, "[data-open-flight]") === 0 && !/flight=/.test(page.url()) && await count(page, "[data-pill]") === rigFlights.length, "D2 Back to flights shows the timeline; the address drops the flight", pathOf(page));
  await s.ctx.close();
});

// ════════════════════════════════════════════════════════════════════════════ the pages (nothing lost)
const MORE_WALL = ["operators", "aircraft", "caa", "reports", "wall-settings", "service-status", "notifications", "settings"];
const PORTAL = { users: "/m/users", maintenance: "/m/maintenance", agent: "/m/agent", intake: "/m/intake", mailbox: "/m/mailbox", airport: "/m/airport", profile: "/m/profile" };
const WALL_SECTIONS = ["scale", "hour", "vertical", "horizontal", "chips", "colours", "font"];
const backTo = async (page, from) => { await tap(page, `[data-page="${from}"] [data-back]`); return gone(page, `[data-page="${from}"]`); };
const toMore = async (page) => { await tap(page, '[data-rail-btn="menu"]', '[data-sheet="menu"]'); await tap(page, '[data-menu-row="more"]', '[data-page="more"] [data-more-item]'); };

await part("pages", async () => {
  // ── the rig's own wire first (its NOTAM round, Limits and Important are empty: the empty words are checked)
  let s = await start({});
  let { page } = s;
  await tap(page, '[data-rail-btn="menu"]', '[data-sheet="menu"]');
  for (const k of ["notam", "limits", "important"]) {
    await tap(page, `[data-menu-row="${k}"]`, `[data-page="${k}"]`);
    await settled(page);
    const words = await textOf(page, `[data-page="${k}"]`);
    ok(await count(page, `[data-page="${k}"]`) === 1 && await count(page, `[data-page="${k}"] [data-part-failed]`) === 0 && words.length > 20, `Menu → ${k}: the page opens on the rig's own data and says what it has`, words.slice(0, 110));
    await backTo(page, k);
    ok(await count(page, "[data-page]") === 0 && await count(page, "[data-pill]") === rigFlights.length, `${k}: Back lands on the timeline`);
    await tap(page, '[data-rail-btn="menu"]', '[data-sheet="menu"]');
  }
  await tap(page, '[data-menu-row="more"]', '[data-page="more"] [data-more-item]');
  const more = await page.evaluate(() => ({ wall: [...document.querySelectorAll('[data-more-group="wall"] [data-more-item]')].map((x) => x.getAttribute("data-more-item")), portal: Object.fromEntries([...document.querySelectorAll('[data-more-group="portal"] a[data-more-item]')].map((x) => [x.getAttribute("data-more-item"), x.getAttribute("href")])) }));
  ok(MORE_WALL.every((k) => more.wall.includes(k)), "More holds Operators, Aircraft, CAA details, Reports, Wall settings, Service status, Notifications and Phone settings", more.wall.join(" "));
  ok(Object.entries(PORTAL).every(([k, h]) => more.portal[k] === h), "More links to Users, Maintenance, Agent, Flight intake, Mailbox, Airport search and Profile in the portal", JSON.stringify(more.portal));
  ok(/\d/.test(await textOf(page, '[data-more-item="aircraft"]')) && /\d/.test(await textOf(page, '[data-more-item="operators"]')), "More shows how many operators and aircraft there are", `${await textOf(page, '[data-more-item="operators"]')} · ${await textOf(page, '[data-more-item="aircraft"]')}`);
  await shot(page, "more-staff-390-light");
  // one of the portal links really leads to a page of the portal
  const portalPage = await s.ctx.newPage();
  const resp = await portalPage.goto(`${BASE}${PORTAL.airport}`, { waitUntil: "load" }).catch(() => null);
  ok(resp && resp.status() < 400 && new URL(portalPage.url()).pathname.startsWith("/m/"), "a portal link from More leads to a page that answers", `${resp?.status()} ${pathOf(portalPage)}`);
  await portalPage.close();

  // the console's pages, inside the phone
  const expect = { operators: /Clearway/i, aircraft: new RegExp(rigFlights[0].reg), caa: /./, reports: /./ };
  for (const k of ["operators", "aircraft", "caa", "reports"]) {
    await tap(page, `[data-more-item="${k}"]`, `[data-page="${k}"] [data-staff-console]`);
    await settled(page, { timeout: 12000 });
    await page.waitForFunction(({ k, re }) => new RegExp(re, "i").test(document.querySelector(`[data-page="${k}"] [data-staff-console]`)?.innerText || ""), { k, re: expect[k].source }, { timeout: 10000 }).catch(() => {});
    const words = await textOf(page, `[data-page="${k}"] [data-staff-console]`);
    ok(await count(page, `[data-page="${k}"] [data-staff-console]`) === 1 && expect[k].test(words) && words.length > 15 && await count(page, `[data-page="${k}"] [data-part-failed]`) === 0, `More → ${k}: the console's page is drawn inside the phone, with its data`, words.slice(0, 100));
    await shot(page, `page-${k}-staff-390-light`);
    ok(/More/.test(await textOf(page, `[data-page="${k}"] [data-back]`)), `${k}: its bar has Back to More`);
    await backTo(page, k);
    ok(await count(page, '[data-page="more"]') === 1, `${k}: Back lands on More`);
  }

  // wall settings: the real seven sections
  await tap(page, '[data-more-item="wall-settings"]', '[data-page="wall-settings"] [data-wall-section]');
  const secs = await page.evaluate(() => [...document.querySelectorAll("[data-wall-section]")].map((x) => x.getAttribute("data-wall-section")));
  ok(JSON.stringify(secs) === JSON.stringify(WALL_SECTIONS), "Wall settings has the console's seven sections", secs.join(" "));
  const sums = await page.evaluate(() => [...document.querySelectorAll('[data-wall-section][data-open="false"] [data-wall-summary]')].filter((x) => x.textContent.trim()).length);
  ok(sums >= 5, "each closed section says its present value", `${sums} with a value`);
  await tap(page, '[data-wall-section="hour"] [data-wall-head]');
  ok(await page.locator('[data-wall-section="hour"]').getAttribute("data-open") === "true" && await page.locator('[data-wall-section="hour"] [data-wall-body]').isVisible(), "one tap opens a section with its controls", (await textOf(page, '[data-wall-section="hour"] [data-wall-body]')).slice(0, 80));
  await shot(page, "page-wall-settings-staff-390-light");
  await backTo(page, "wall-settings");

  // service status → the flight
  await tap(page, '[data-more-item="service-status"]', '[data-page="service-status"] [data-service-row]');
  const svcRows = await count(page, "[data-service-row]");
  ok(svcRows >= 1 && await count(page, "[data-service-group]") >= 1, "More → Service status lists the next flights with what is awaiting", `${svcRows} flights · ${(await textOf(page, "[data-service-row]")).slice(0, 80)}`);
  await shot(page, "page-service-status-staff-390-light");
  const svcId = await page.locator("[data-service-row]").first().getAttribute("data-service-row");
  await tap(page, page.locator("[data-service-row]").first(), "[data-open-flight]");
  ok(await page.locator("[data-open-flight]").getAttribute("data-open-flight") === svcId && await count(page, "[data-page]") === 0, "one tap on a flight there opens that flight", `${svcId} → ${await page.locator("[data-open-flight]").getAttribute("data-open-flight").catch(() => "none")}`);
  await closeFlight(page);

  // notifications from More: a sheet
  await toMore(page);
  await tap(page, '[data-more-item="notifications"]', '[data-sheet="notifications"]');
  ok(await count(page, '[data-sheet="notifications"]') === 1, "More → Notifications opens the notifications");
  await closeSheet(page, "notifications");

  // phone settings
  if (await count(page, '[data-page="more"]') === 0) await toMore(page);
  await tap(page, '[data-more-item="settings"]', '[data-page="settings"]');
  const rows = await page.evaluate(() => [...document.querySelectorAll('[data-page="settings"] [data-settings-row]')].map((x) => x.getAttribute("data-settings-row")));
  ok(["start", "range", "theme", "clocks", "awake", "notify-delays", "notify-movements", "notify-services"].every((k) => rows.includes(k)) && !rows.includes("desktop-display"), "Phone settings: start page, range, theme, world clocks, keep awake and the three notification switches", rows.join(" "));
  await shot(page, "page-settings-staff-390-light");
  await tap(page, '[data-settings-control="theme"] [data-seg="dark"]');
  ok(await page.locator("[data-phone-app]").getAttribute("data-cw3") === "dark" && await page.evaluate(() => localStorage.getItem("cw-theme")) === "dark", "Settings: one tap on Dark turns the app dark, and it is kept");
  await tap(page, '[data-settings-control="theme"] [data-seg="light"]');
  ok(await page.locator("[data-phone-app]").getAttribute("data-cw3") === "light", "Settings: and back to light");
  await tap(page, '[data-settings-control="notify-movements"]');
  ok(await page.locator('[data-settings-control="notify-movements"]').getAttribute("aria-checked") === "false" && JSON.parse(await page.evaluate((k) => localStorage.getItem(k), `cw3-phone-prefs:${WHO}`)).notify.movements === false, "Settings: a notification switch is kept on this phone");
  await tap(page, '[data-settings-control="notify-movements"]');
  await tap(page, '[data-settings-control="start"] [data-seg="flights"]');
  ok(JSON.parse(await page.evaluate((k) => localStorage.getItem(k), `cw3-phone-prefs:${WHO}`)).view === "flights", "Settings: the start page is kept on this phone");
  // world clocks
  await tap(page, '[data-settings-row="clocks"]', '[data-page="clocks"]');
  const n0 = await count(page, "[data-clock-row]");
  if (await count(page, '[data-clock-add="full"]') === 1) await tap(page, page.locator("[data-clock-remove]").first());
  const n1 = await count(page, "[data-clock-row]");
  await tap(page, '[data-clock-add=""]', '[data-sheet="add-clock"] [data-clock-choice]');
  await shot(page, "sheet-add-clock-staff-390-light");
  const city = await page.locator("[data-clock-choice]").first().getAttribute("data-clock-choice");
  await tap(page, page.locator("[data-clock-choice]").first()); await gone(page, '[data-sheet="add-clock"]');
  ok(await count(page, "[data-clock-row]") === n1 + 1 && await count(page, `[data-clock-row="${city}"]`) === 1, "World clocks: Add a city adds it on one tap", `${n0} → ${await count(page, "[data-clock-row]")} (${city})`);
  await shot(page, "page-clocks-staff-390-light");
  await tap(page, "[data-clock-standard]");
  ok(await count(page, "[data-clock-row]") === n0, "World clocks: Use the standard clocks puts the room's list back", `${await count(page, "[data-clock-row]")}`);
  await tap(page, '[data-settings-control="clocks-on"]');
  ok(await page.locator('[data-settings-control="clocks-on"]').getAttribute("aria-checked") === "false", "World clocks: the switch turns them off");
  ok(/Settings/.test(await textOf(page, '[data-page="clocks"] [data-back]')), "World clocks: Back says Settings");
  await backTo(page, "clocks");
  ok(await count(page, '[data-page="settings"]') === 1 && /Off/.test(await textOf(page, '[data-settings-row="clocks"]')), "Back lands on Settings, which says the clocks are off", await textOf(page, '[data-settings-row="clocks"]'));
  await backTo(page, "settings"); await backTo(page, "more");
  ok(await count(page, "[data-page]") === 0 && /^\d\d:\d\d UTC$/.test(await textOf(page, "[data-utc-clock]")) && await count(page, "[data-clocks]") === 0, "T8 with the clocks off the header shows the UTC time alone", await textOf(page, "[data-utc-clock]"));
  await page.reload({ waitUntil: "load" }); await page.waitForSelector("[data-flight-row], [data-pill]", { timeout: 30000 }).catch(() => {}); await settled(page);
  ok(await page.locator("[data-phone-app]").getAttribute("data-current-view") === "flights" && await count(page, "[data-flight-row]") >= 1, "the start page chosen in Settings is where the next visit starts", await page.locator("[data-phone-app]").getAttribute("data-current-view"));

  // account (staff)
  await tap(page, '[data-rail-btn="menu"]', '[data-sheet="menu"]');
  const hasAcc = await count(page, '[data-menu-row="account"]');
  if (hasAcc) await tap(page, '[data-menu-row="account"]', '[data-page="account"]');
  else { await closeSheet(page, "menu"); await page.goto(`${BASE}${APP}?n=1#account`, { waitUntil: "load" }); await page.waitForSelector('[data-page="account"]', { timeout: 30000 }).catch(() => {}); await settled(page); }
  ok(await count(page, '[data-page="account"][data-account="staff"]') === 1 && /Staff/.test(await textOf(page, "[data-account-access]")) && await page.locator("a[data-account-profile]").getAttribute("href") === "/m/profile" && await count(page, "[data-signout]") === 1, `Account (${hasAcc ? "from the Menu" : "by its address #account"}): who is signed in, the access, Profile and Sign out`, `${await textOf(page, "[data-account-you]")} · ${await textOf(page, "[data-account-access]")}`);
  ok(await count(page, "[data-account-grant], [data-account-passengers], [data-account-password]") === 0, "a staff Account has none of the client's rows");
  await shot(page, "page-account-staff-390-light");
  ok(s.errors.length === 0, "no page error on the pages (the rig's own data)", s.errors.slice(0, 2).join(" | "));
  await s.ctx.close();

  // ── addresses of pages
  const ctx2 = await phoneContext(browser, {});
  const fc2 = await feedControl(ctx2); fc2.change = near;
  for (const [hash, want, back] of [["operators", '[data-page="operators"]', ["operators", "more"]], ["clocks", '[data-page="clocks"]', ["clocks", "settings", "more"]], ["settings", '[data-page="settings"]', ["settings", "more"]], ["service-status", '[data-page="service-status"]', ["service-status", "more"]], ["wall-settings", '[data-page="wall-settings"]', ["wall-settings", "more"]], ["account", '[data-page="account"]', ["account"]]]) {
    const o = await openApp(ctx2, BASE, `${APP}#${hash}`, { wait: want });
    let fine = await count(o.page, want) === 1; const trail = [hash];
    for (const b of back) { if (!(await backTo(o.page, b))) { fine = false; trail.push(`${b} stayed`); break; } trail.push(`← ${b}`); }
    ok(fine && await count(o.page, "[data-page]") === 0 && await count(o.page, "[data-pill]") === rigFlights.length, `the address #${hash} opens that page; Back walks ${back.join(" → ")} → the timeline`, trail.join(" "));
    await o.page.close();
  }
  let o = await openApp(ctx2, BASE, `${APP}#notifications`, { wait: '[data-sheet="notifications"]' });
  ok(await count(o.page, '[data-sheet="notifications"]') === 1, "the address #notifications opens the notifications");
  await o.page.close();
  o = await openApp(ctx2, BASE, `${APP}?view=flights`, {});
  ok(await o.page.locator("[data-phone-app]").getAttribute("data-current-view") === "flights" && await count(o.page, "[data-flight-row]") >= 1, "the address ?view=flights opens the flights list");
  await o.page.close();
  o = await openApp(ctx2, BASE, `${APP}#no-such-page`, {});
  ok(await count(o.page, "[data-pill]") === rigFlights.length && await count(o.page, "[data-part-failed]") === 0, "an address with an unknown page name lands on the timeline", `${await count(o.page, "[data-page]")} page(s) open`);
  await o.page.close();
  await ctx2.close();

  // ── with lists that have entries (invented stand-ins for the rig's empty lists)
  let ns = null;
  s = await start({ before: async (c1) => { ns = await notamStandIn(c1, { todo: AIR.adep.icao, done: AIR.ades.icao }); await listsStandIn(c1); } }); page = s.page;
  await tap(page, '[data-rail-btn="menu"]', '[data-sheet="menu"]');
  const vals = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll("[data-menu-row]")].map((r) => [r.getAttribute("data-menu-row"), r.textContent.replace(/\s+/g, " ").trim()])));
  ok(/1 to check/.test(vals.notam || ""), "the Menu says how many airports are still to check", JSON.stringify(vals));
  await shot(page, "menu-sheet-values-staff-390-light");
  await tap(page, '[data-menu-row="notam"]', "[data-notam-row]");
  const hero = page.locator("[data-notam-hero]");
  ok(await hero.getAttribute("data-done") === "1" && await hero.getAttribute("data-total") === "2" && await count(page, '[data-notam-group="todo"] [data-notam-row]') === 1 && await count(page, '[data-notam-group="checked"] [data-notam-row]') === 1, "NOTAM check: the round's count, the airports to check and the ones checked", await textOf(page, "[data-notam-hero]"));
  await shot(page, "page-notam-staff-390-light");
  await tap(page, `[data-notam-row="${AIR.adep.icao}"]`, "[data-notam-sheet]");
  ok(await count(page, "[data-notam-sheet] article[data-notam]") === 2 && await count(page, "[data-notam-ack]") === 1, "NOTAM check: one tap on an airport shows its flagged NOTAMs and Mark checked", `${await count(page, "[data-notam-sheet] article[data-notam]")} NOTAMs`);
  await shot(page, "sheet-notam-airport-staff-390-light");
  await tap(page, '[data-notam-which] [data-seg="all"]');
  ok(await count(page, "[data-notam-sheet] article[data-notam]") === 3, "NOTAM check: All shows every NOTAM of the airport", `${await count(page, "[data-notam-sheet] article[data-notam]")}`);
  await tap(page, "[data-notam-ack]", "[data-notam-done], [data-notam-undo]");
  ok(ns.acks.join() === AIR.adep.icao && await count(page, "[data-notam-undo]") === 1 && await count(page, "[data-notam-ack]") === 0, "NOTAM check: Mark checked sends the check and the sheet reads checked after the answer", `posts: ${ns.acks.join()} · ${await textOf(page, "[data-notam-done]")}`);
  await closeSheet(page, "notam-airport");
  ok(await page.locator(`[data-notam-row="${AIR.adep.icao}"]`).getAttribute("data-notam-state") === "checked" && await hero.getAttribute("data-done") === "2", "NOTAM check: the airport moves to Checked and the count goes up", await textOf(page, "[data-notam-hero]"));
  await shot(page, "page-notam-done-staff-390-light");
  if (await count(page, '[data-page="notam"] [data-full-row]') === 1) {
    await tap(page, '[data-page="notam"] [data-full-row]', "[data-staff-console]");
    ok(await count(page, "[data-staff-console]") >= 1 && /List/.test(await textOf(page, "[data-page] [data-back]")), "NOTAM check: the last row opens the console's full page, with Back to the list", (await textOf(page, "[data-staff-console]")).slice(0, 80));
    await shot(page, "page-notam-full-staff-390-light");
    await tap(page, page.locator("[data-page] [data-back]").last()); await page.waitForSelector("[data-notam-row]", { timeout: 8000 }).catch(() => {});
    ok(await count(page, "[data-notam-row]") === 2, "…and Back shows the list again");
  } else ok(false, "NOTAM check: the row to the console's full page is there");
  await backTo(page, "notam");

  await tap(page, '[data-rail-btn="menu"]', '[data-sheet="menu"]'); await tap(page, '[data-menu-row="limits"]', "[data-limit-row]");
  ok(await count(page, "[data-limit-row]") === 3 && await count(page, '[data-limit-group="off"] [data-limit-row]') === 1, "Limits: the limitations in force, and the ones switched off apart", `${await count(page, "[data-limit-row]")} rows · groups ${await page.evaluate(() => [...document.querySelectorAll("[data-limit-group]")].map((x) => x.getAttribute("data-limit-group")).join(" | "))}`);
  await shot(page, "page-limits-staff-390-light");
  await tap(page, '[data-limit-row="rig-l1"]', '[data-limit-sheet="rig-l1"]');
  ok(await count(page, "[data-limit-sheet] [data-limit-scope]") === 1 && await count(page, '[data-limit-sheet] [data-server-switch="limit-active"]') === 1 && /closes at sunset/.test(await textOf(page, "[data-limit-sheet]")), "Limits: one tap shows a limitation whole, with what it applies to and its switch", (await textOf(page, "[data-limit-scope]")).slice(0, 80));
  await shot(page, "sheet-limit-staff-390-light");
  await closeSheet(page, "limit"); await backTo(page, "limits");

  await tap(page, '[data-rail-btn="menu"]', '[data-sheet="menu"]'); await tap(page, '[data-menu-row="important"]', "[data-important-row]");
  ok(await count(page, "[data-important-row]") === 3 && await count(page, '[data-important-group="review"] [data-important-row]') === 1 && await count(page, '[data-important-group="off"] [data-important-row]') === 1, "Important: the notes that need review first, then active, then off", `${await count(page, "[data-important-row]")} rows`);
  await shot(page, "page-important-staff-390-light");
  await tap(page, page.locator('[data-important-group="review"] [data-important-row]').first(), '[data-sheet="important"]');
  ok(await count(page, "[data-important-review]") === 1, "Important: one tap shows the note with Mark reviewed");
  await shot(page, "sheet-important-staff-390-light");
  // the wall does not know this invented note: the save is refused, and the phone must say so and change nothing
  await tap(page, "[data-important-review]", "[data-important-note]");
  ok((await textOf(page, "[data-important-note]")).length > 5 && await count(page, "[data-important-done]") === 0 && await count(page, "[data-important-review]") === 1, "Important: a save the wall refuses is said in words, and nothing reads reviewed", await textOf(page, "[data-important-note]"));
  await closeSheet(page, "important");
  ok(await count(page, '[data-important-group="review"] [data-important-row]') === 1, "…and the note is still under ‘needs review’");
  ok(s.errors.length === 0, "no page error on the pages (lists with entries)", s.errors.slice(0, 2).join(" | "));
  await s.ctx.close();
});

// ════════════════════════════════════════════════════════════════════════════ the settings of the old phone wall
await part("prefs", async () => {
  const s = await start({ storage: { [`mw-phone-prefs:${WHO}`]: JSON.stringify({ view: "cards", range: "12H", clocksOn: false }) } });
  const { page } = s;
  const kept = await page.evaluate((k) => localStorage.getItem(k), `cw3-phone-prefs:${WHO}`);
  ok(await page.locator("[data-phone-app]").getAttribute("data-current-view") === "flights" && await count(page, "[data-flight-row]") >= 1, "a person who used the old phone wall's cards starts on the flights list", await page.locator("[data-phone-app]").getAttribute("data-current-view"));
  await tap(page, '[data-rail-btn="timeline"]', '[data-view="timeline"]');
  ok(await count(page, '[data-range="12H"]') === 1 && await count(page, "[data-utc-clock]") === 1 && await count(page, "[data-clocks]") === 0, "their range (12H) and their clocks setting (off) came along", await page.locator("[data-range]").first().getAttribute("data-range").catch(() => "none"));
  ok(kept && JSON.parse(kept).view === "flights" && JSON.parse(kept).range === "12H", "the old settings are taken over into the new place once", kept || "nothing kept");
  await s.ctx.close();
});

// ════════════════════════════════════════════════════════════════════════════ a part that breaks
await part("boundary", async () => {
  const breakIt = (page, where) => page.evaluate((w) => { window.__CW_THROW__ = w; window.dispatchEvent(new Event("cw-throw-probe")); }, where);
  const mend = (page) => page.evaluate(() => { window.__CW_THROW__ = ""; });
  let s = await start({ path: `${APP}#more`, wait: '[data-page="more"] [data-more-item]' });
  let { page } = s;
  await breakIt(page, "phone/page/more"); await page.waitForSelector('[data-page="more"] [data-part-failed]', { timeout: 8000 }).catch(() => {});
  ok(await count(page, '[data-page="more"] [data-part-failed]') === 1 && /This part failed\./.test(await textOf(page, '[data-page="more"] [data-part-failed]')) && /Reload/.test(await textOf(page, '[data-page="more"] [data-part-reload]')), "a page whose body breaks says ‘This part failed.’ with a Reload button", await textOf(page, '[data-page="more"] [data-part-failed]'));
  ok(await page.locator('[data-page="more"] [data-back]').isVisible() && /More/.test(await textOf(page, '[data-page="more"]')) && await count(page, "[data-part-leave]") === 0 && await count(page, "[data-more-item]") === 0, "only the body broke: the page's bar and its Back are still there");
  await shot(page, "part-failed-page-staff-390-light");
  await mend(page); await tap(page, '[data-page="more"] [data-part-reload]', "[data-more-item]");
  ok(await count(page, "[data-more-item]") >= 8 && await count(page, "[data-part-failed]") === 0, "Reload draws the page again");
  await breakIt(page, "phone/page/more"); await page.waitForSelector('[data-page="more"] [data-part-failed]', { timeout: 8000 }).catch(() => {});
  await backTo(page, "more");
  ok(await count(page, "[data-page]") === 0 && await count(page, "[data-pill]") === rigFlights.length, "Back on the broken page still works, and the timeline behind is fine");
  await mend(page);

  // the timeline breaks: the bars and the list keep working
  await breakIt(page, "phone/timeline"); await page.waitForSelector("[data-part-failed]", { timeout: 8000 }).catch(() => {});
  ok(await count(page, "[data-part-failed]") === 1 && /This part failed\./.test(await textOf(page, "[data-part-failed]")) && await count(page, "[data-part-reload]") === 1 && await count(page, "[data-rail]") === 1, "the timeline breaks: ‘This part failed.’ with Reload, the rail stays", await textOf(page, "[data-part-failed]"));
  await shot(page, "part-failed-timeline-staff-390-light");
  await tap(page, '[data-rail-btn="flights"]', "[data-flight-row]");
  ok(await count(page, "[data-flight-row]") >= rigFlights.length && await count(page, "[data-part-failed]") === 0, "…and the flights list still opens and works");
  await tap(page, page.locator("[data-flight-row]").first(), "[data-open-flight]");
  ok(await count(page, "[data-flight-callsign]") === 1, "…and a flight still opens");
  await closeFlight(page);
  await mend(page); await tap(page, '[data-rail-btn="timeline"]', "[data-pill], [data-part-reload]");
  if (await count(page, "[data-part-reload]")) await tap(page, "[data-part-reload]", "[data-pill]");
  ok(await count(page, "[data-pill]") === rigFlights.length, "the timeline is back after Reload");

  // the staff part of a flight breaks: the flight itself stays
  await page.evaluate(() => { window.__CW_THROW__ = "phone/flight/staff"; });
  await tap(page, `[data-pill="${PLAIN.flightNo}"]`, "[data-staff-failed], [data-checks-grid]");
  ok(await count(page, "[data-staff-failed]") === 1 && (await textOf(page, "[data-flight-callsign]")) === PLAIN.flightNo && await count(page, "[data-flight-times]") === 1 && await count(page, "[data-checks-grid]") === 0, "the staff part of a flight breaks: the flight's own facts stay, and words say what is missing", await textOf(page, "[data-staff-failed]"));
  await shot(page, "part-failed-flight-staff-390-light");
  await mend(page); await closeFlight(page);
  ok(await count(page, "[data-open-flight]") === 0, "…and the flight still closes");

  // a sheet breaks: it still closes
  await page.evaluate(() => { window.__CW_THROW__ = "phone/sheet/filter"; });
  await tap(page, "[data-filter-btn]", '[data-sheet="filter"]');
  ok(await count(page, '[data-sheet="filter"] [data-part-failed]') === 1 && await count(page, "[data-filter-aircraft]") === 0, "a sheet whose body breaks says so inside the sheet", await textOf(page, '[data-sheet="filter"] [data-part-failed]'));
  await mend(page); await closeSheet(page, "filter");
  ok(await count(page, '[data-sheet="filter"]') === 0 && await count(page, "[data-pill]") === rigFlights.length, "…and the sheet still closes");
  await s.ctx.close();
});

// ════════════════════════════════════════════════════════════════════════════ every screen, four phones
// A busy day (26 flights, two at once in a lane, long callsign, registration and operator), all five checks on one
// flight, the passengers' flight, a NOTAM round, Limits and Important with entries, weather with a long line.
const busy = (b) => withPax(editFlight(denseFeed(near(b), T0), PLAIN.flightNid, (f) => ({ ...f, ...FIVE })));
const AUDIT_PAGES = ["more", "operators", "aircraft", "caa", "reports", "wall-settings", "service-status", "settings", "clocks", "account"];

await part("audit", async () => {
  for (const [theme, width] of COMBOS) {
    const tag = (n) => `${n} ${width} ${theme}`;
    const s = await start({ theme, width, feed: busy, before: async (c1) => { await notamStandIn(c1, { todo: AIR.adep.icao, done: AIR.ades.icao }); await listsStandIn(c1); await infoStandIn(c1); } });
    const { page } = s;
    const aud = (name, root, opts = {}) => auditLayer(ok, page, tag(name), root, { theme, shot: `phone-v3-staff-${name.replace(/[^a-z0-9]+/gi, "-")}-${width}-${theme}`, ...opts });
    const sheetAud = async (name, opener, sheet = name) => {
      await tap(page, opener, `[data-sheet="${sheet}"] [role=dialog]`);
      if (await count(page, `[data-sheet="${sheet}"]`) === 0) { ok(false, `${tag(name)}: the sheet opens`); return; }
      await aud(`sheet ${name}`, `[data-sheet="${sheet}"]`);
      await closeSheet(page, sheet);
    };

    await tap(page, '[data-bottom-bar] [data-seg="12H"]', '[data-range="12H"]');
    await aud("timeline", "[data-phone-column]");
    { // the clocks row (carried over from the old phone wall's check): whole cells, all names or all codes
      const cl = await page.evaluate(() => [...document.querySelectorAll("[data-clocks] [data-city]")].map((x) => ({ t: x.textContent.trim(), cut: x.scrollWidth > x.clientWidth + 1 })));
      ok(cl.length >= 2 && cl.every((x) => !x.cut) && (cl.every((x) => x.t.length <= 3) || cl.filter((x) => x.t !== "UTC").every((x) => x.t.length > 3)), `${tag("clocks")}: every clock name is whole, and they are all names or all three-letter codes, never a mix`, cl.map((x) => x.t).join(" "));
    }
    await sheetAud("filter", "[data-filter-btn]");
    await sheetAud("notifications", "[data-bell]");
    await sheetAud("menu", '[data-rail-btn="menu"]');
    await tap(page, '[data-rail-btn="flights"]', "[data-flight-row]");
    await aud("flights list", "[data-phone-column]");
    await page.locator("input[data-search]").fill("zz-no-such-flight"); await page.waitForSelector('[data-empty="search"]', { timeout: 8000 }).catch(() => {}); await settled(page);
    await aud("flights list no match", "[data-phone-column]");
    await tap(page, "[data-search-clear]", "[data-flight-row]");

    // the flight with everything on it
    await tap(page, `[data-flight-row="${PLAIN.id}"]`, "[data-checks-grid]");
    await settled(page, { timeout: 8000 });
    await aud("flight", "[data-open-flight]");
    await page.locator("[data-flight-body]").evaluate((el) => { el.scrollTop = el.scrollHeight; }).catch(() => {}); await settled(page);
    await shot(page, `staff-flight-end-${width}-${theme}`);
    await page.locator("[data-flight-body]").evaluate((el) => { el.scrollTop = 0; }).catch(() => {});
    await tap(page, `[data-airport][data-side="dep"]`, '[data-sheet="airport"] [role=dialog]');
    await page.waitForSelector('[data-sheet="airport"] [data-notam], [data-sheet="airport"] [data-weather], [data-notams-none]', { timeout: 10000 }).catch(() => {}); await settled(page);
    await tap(page, '[data-airport-tabs] [data-seg="notams"]'); await page.waitForSelector('[data-sheet="airport"] [data-notam], [data-notams-none]', { timeout: 8000 }).catch(() => {});
    await aud("sheet airport notams", '[data-sheet="airport"]');
    await tap(page, '[data-airport-tabs] [data-seg="wx"]', '[data-sheet="airport"] [data-weather]');
    await aud("sheet airport weather", '[data-sheet="airport"]');
    await closeSheet(page, "airport");
    await sheetAud("limitations", "[data-open-limits]");
    await sheetAud("services", "[data-open-services]");
    await sheetAud("checks", "[data-open-checks-sheet]");
    if (await count(page, "[data-open-notes]")) await sheetAud("notes", "[data-open-notes]");
    await tap(page, "[data-open-map]", "[data-flight-map] [data-map-state]");
    await aud("flight map", "[data-flight-map]");
    await tap(page, "[data-map-back]"); await gone(page, "[data-flight-map]");
    await closeFlight(page);

    // the passengers
    await tap(page, `[data-flight-row="${PAX_ID}"]`, "[data-open-pax]");
    await tap(page, "[data-open-pax]", '[data-sheet="passengers"] [data-pax-list]');
    await page.waitForSelector('[data-sheet="passengers"] [data-pax-list] button', { timeout: 12000 }).catch(() => {}); await settled(page);
    await aud("sheet passengers", '[data-sheet="passengers"]');
    await closeSheet(page, "passengers"); await closeFlight(page);

    // every page, each by its own address (a fresh load: the page must stand on its own)
    let i = 0;
    const openPage = async (name, wait = `[data-page="${name}"]`) => { i += 1; await page.goto(`${BASE}${APP}?a=${i}#${name}`, { waitUntil: "load" }); await page.waitForSelector(wait, { timeout: 30000 }).catch(() => {}); await settled(page, { timeout: 8000 }); };
    await openPage("notam", "[data-notam-row]");
    await aud("page notam", '[data-page="notam"]');
    await tap(page, `[data-notam-row="${AIR.adep.icao}"]`, "[data-notam-sheet]");
    await aud("sheet notam airport", '[data-sheet="notam-airport"]');
    await closeSheet(page, "notam-airport");
    await openPage("limits", "[data-limit-row]");
    await aud("page limits", '[data-page="limits"]');
    await tap(page, '[data-limit-row="rig-l1"]', "[data-limit-sheet]");
    await aud("sheet limit", '[data-sheet="limit"]');
    await closeSheet(page, "limit");
    await openPage("important", "[data-important-row]");
    await aud("page important", '[data-page="important"]');
    await tap(page, page.locator("[data-important-row]").first(), '[data-sheet="important"] [role=dialog]');
    await aud("sheet important", '[data-sheet="important"]');
    await closeSheet(page, "important");
    for (const name of AUDIT_PAGES) {
      await openPage(name, ["operators", "aircraft", "caa", "reports"].includes(name) ? `[data-page="${name}"] [data-staff-console]` : `[data-page="${name}"]`);
      if (name === "wall-settings") await tap(page, '[data-wall-section="chips"] [data-wall-head]');
      if (name === "service-status") await page.waitForSelector("[data-service-row]", { timeout: 10000 }).catch(() => {});
      await aud(`page ${name}`, `[data-page="${name}"]`);
      if (name === "clocks" && await count(page, '[data-clock-add=""]')) {
        await tap(page, '[data-clock-add=""]', '[data-sheet="add-clock"] [role=dialog]');
        await aud("sheet add clock", '[data-sheet="add-clock"]');
        await closeSheet(page, "add-clock");
      }
    }
    ok(s.errors.length === 0, `${tag("every screen")}: no page error`, s.errors.slice(0, 3).join(" | "));
    await s.ctx.close();
  }

  // nothing to show: the words stand alone, nothing under a bar
  for (const [theme, width] of [["light", 390], ["dark", 360]]) {
    const tag = (n) => `${n} (empty) ${width} ${theme}`;
    const s = await start({ theme, width, before: async (_c, fc) => { fc.mode = "empty"; } });
    const { page } = s;
    const aud = (name, root) => auditLayer(ok, page, tag(name), root, { theme, shot: `phone-v3-staff-empty-${name.replace(/[^a-z0-9]+/gi, "-")}-${width}-${theme}` });
    ok(await count(page, "[data-empty]") === 1 && await count(page, "[data-pill]") === 0, `${tag("timeline")}: with no flights the timeline says so in words`, await textOf(page, "[data-empty]"));
    await aud("timeline", "[data-phone-column]");
    await tap(page, "[data-filter-btn]", '[data-sheet="filter"] [role=dialog]');
    await aud("sheet filter", '[data-sheet="filter"]');
    await closeSheet(page, "filter");
    await tap(page, '[data-rail-btn="flights"]', '[data-view="flights"] [data-empty]');
    ok(await count(page, '[data-view="flights"] [data-empty]') === 1, `${tag("flights list")}: with no flights the list says so in words`, await textOf(page, '[data-view="flights"] [data-empty]'));
    await aud("flights list", "[data-phone-column]");
    let i = 0;
    for (const name of ["notam", "limits", "important", "service-status", "more"]) {
      i += 1; await page.goto(`${BASE}${APP}?e=${i}#${name}`, { waitUntil: "load" }); await page.waitForSelector(`[data-page="${name}"]`, { timeout: 30000 }).catch(() => {}); await settled(page, { timeout: 8000 });
      ok((await textOf(page, `[data-page="${name}"]`)).length > 20 && await count(page, `[data-page="${name}"] [data-part-failed]`) === 0, `${tag(name)}: an empty page says what it has in words`, (await textOf(page, `[data-page="${name}"]`)).slice(0, 100));
      await aud(`page ${name}`, `[data-page="${name}"]`);
    }
    ok(s.errors.length === 0, `${tag("every screen")}: no page error`, s.errors.slice(0, 3).join(" | "));
    await s.ctx.close();
  }
});

await browser.close();
console.log(`\n${state.n} checks · ${state.failures ? `${state.failures} FAILED` : "all passed"}`);
process.exit(state.failures ? 1 : 0);
