// One broken part never takes the wall app down (2026-11-13; a missing prop on the passengers sheet had blanked the
// whole phone app). Each tab, flight panel and sheet sits in its own boundary (opsboard-react/src/components/
// ErrorBoundary.jsx): the part that throws shows "This part failed. Reload", everything around it keeps working, the
// error goes to the wall's log (POST /api/ui-error, answered 204) and its text is never shown. The ops room display
// tries again on its own and the timeline keeps its last good picture under a NOT LIVE mark meanwhile.
// The way in: window.__CW_THROW__ = a boundary's name (or the start of one) makes the part inside it throw on its next
// render; the event `cw-throw-probe` asks for that render now. Nothing in the app sets either.
// Through the rig proxy (:3999, sign-in off: the mock person). The console is opened under /digital-wall/timeline/
// because that is the path the proxy serves the wall app on; the app reads "console" from the path all the same.
//   node --env-file=.env.rig rig/error-boundary-check.mjs
import { chromium } from "playwright";
import { settled, until } from "./lib/settle.mjs";

const BASE = process.env.RIG_SHELL_URL || "http://127.0.0.1:3999";
const APP = `${BASE}/digital-wall/timeline`;
const API = `${BASE}/digital-wall/api`;
let failures = 0; const ok = (c, what, d = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${what}${d ? `  · ${String(d).slice(0, 240)}` : ""}`); if (!c) failures += 1; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const throwAt = (page, where) => page.evaluate((w) => { window.__CW_THROW__ = w; window.dispatchEvent(new Event("cw-throw-probe")); }, where);
const throwNoMore = (page) => page.evaluate(() => { window.__CW_THROW__ = ""; });
const count = (page, sel) => page.locator(sel).count();
const gone = (page, sel, timeout) => until(async () => (await count(page, sel)) === 0, { timeout, every: 250 });
const shown = (page, sel, timeout) => until(async () => (await count(page, sel)) > 0, { timeout, every: 250 });
// what a person can read on the page, and the raw error text that must never be in it
const words = (page) => page.evaluate(() => document.body.innerText || "");
const RAW = [/boundary probe/i, /\b\w*Error:/, /\bat \S+ \(?\S*:\d+:\d+\)?/, /\.jsx?:\d+:\d+/, /componentStack|ErrorBoundary/];
const rawIn = (text) => RAW.filter((re) => re.test(text)).map(String);
// every report the page sends to the wall's log: where it said it was, and how the server answered
const reportsOf = (page) => {
  const list = [];
  page.on("response", (res) => {
    if (!/\/api\/ui-error(\?|$)/.test(res.url())) return;
    let where = ""; try { where = JSON.parse(res.request().postData() || "{}").where || ""; } catch { /* not ours */ }
    list.push({ where, status: res.status() });
  });
  return list;
};
const pageErrors = (page) => { const list = []; page.on("pageerror", (e) => list.push(String(e?.message || e))); return list; };

const browser = await chromium.launch();
try {
  // ── 1. the console: a tab that throws ───────────────────────────────────────────────────────────────────────────
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage(); const reports = reportsOf(page); const uncaught = pageErrors(page);
    await page.goto(`${APP}/console/flights`, { waitUntil: "load" });
    await page.waitForSelector('button[title="Limitations"]', { timeout: 30000 }).catch(() => {});
    await page.waitForSelector("h2", { timeout: 30000 }).catch(() => {}); await settled(page);
    const tabs = await count(page, 'button[title="Flights"], button[title="Operators"], button[title="Limitations"], button[title="Settings"]');
    ok(tabs === 4 && await count(page, "[data-part-failed]") === 0, "console: the page draws with its menu and no failed part", `${tabs} of 4 menu items · ${page.url()}`);

    await page.evaluate(() => { window.__CW_THROW__ = "console/limitations"; });
    await page.locator('button[title="Limitations"]').click({ timeout: 10000 }).catch(() => {}); await shown(page, "[data-part-failed]", 10000); await settled(page);
    const failedText = (await page.locator("[data-part-failed]").first().innerText().catch(() => "")).replace(/\s+/g, " ").trim();
    ok(await count(page, "[data-part-failed]") === 1 && /^This part failed\. ?Reload$/.test(failedText), "console: the tab that throws shows the small message and a Reload button, nothing else", failedText);
    ok(await count(page, 'button[title="Flights"], button[title="Operators"], button[title="Limitations"], button[title="Settings"]') === 4
      && await page.locator("[data-part-failed]").evaluate((el) => !el.closest("nav, aside") && el.getBoundingClientRect().left > 60).catch(() => false),
      "console: the menu is still there and the message sits in the page area");
    let bad = rawIn(await words(page));
    ok(bad.length === 0, "console: no raw error text on screen (no error name, no message, no stack)", bad.join(" "));
    await until(async () => reports.some((r) => r.where === "console/limitations"), { timeout: 8000, every: 200 });
    const rep = reports.find((r) => r.where === "console/limitations");
    ok(rep?.status === 204, "console: the error went to the wall's log (POST /api/ui-error answered 204)", JSON.stringify(reports));

    // another tab works, and the menu took us there
    await page.locator('button[title="Operators"]').click({ timeout: 10000 }).catch(() => {});
    await page.waitForSelector('h2:has-text("Operators")', { timeout: 20000 }).catch(() => {}); await settled(page);
    ok(await count(page, 'h2:has-text("Operators")') === 1 && await count(page, "[data-part-failed]") === 0 && /\/console\/operators$/.test(new URL(page.url()).pathname),
      "console: another tab opens and works while Limitations is broken", page.url());
    // back to the broken one: it fails again, quietly; then the cause goes away and Reload brings it back
    await page.locator('button[title="Limitations"]').click({ timeout: 10000 }).catch(() => {}); await shown(page, "[data-part-failed]", 10000);
    ok(await count(page, "[data-part-failed]") === 1 && await count(page, 'h2:has-text("Limitations")') === 0, "console: the broken tab still shows the message when opened again");
    await page.locator("[data-part-reload]").click({ timeout: 10000 }).catch(() => {}); await sleep(400);
    ok(await count(page, "[data-part-failed]") === 1, "console: Reload while it is still broken leaves the message (no blank page, no loop)");
    await throwNoMore(page);
    await page.locator("[data-part-reload]").click({ timeout: 10000 }).catch(() => {});
    await page.waitForSelector('h2:has-text("Limitations")', { timeout: 20000 }).catch(() => {}); await settled(page);
    ok(await count(page, 'h2:has-text("Limitations")') === 1 && await count(page, "[data-part-failed]") === 0, "console: once the cause is gone, Reload brings the tab back");

    // a part of the frame (the signed-in person's badge): the message takes its place, the page and the menu stay
    await throwAt(page, "console/nav/user"); await shown(page, "[data-part-failed]", 8000);
    ok(await count(page, "[data-part-failed]") === 1 && await count(page, 'h2:has-text("Limitations")') === 1 && await count(page, 'button[title="Operators"]') === 1,
      "console: a broken part of the frame (the person's badge) leaves the page and the menu standing");
    await throwNoMore(page); await page.locator("[data-part-reload]").click({ timeout: 10000 }).catch(() => {}); await gone(page, "[data-part-failed]", 8000);
    ok(await count(page, "[data-part-failed]") === 0, "console: …and Reload brings the badge back");

    // a sheet: the confirm dialog fails closed — the message and Close, never the action it was asking about
    await page.locator('button[title="Operators"]').click({ timeout: 10000 }).catch(() => {}); await page.waitForSelector('h2:has-text("Operators")', { timeout: 20000 }).catch(() => {}); await settled(page);
    const del = page.locator('button[title="Delete operator"]').first();
    if (await del.count()) {
      await page.evaluate(() => { window.__CW_THROW__ = "console/sheet/confirm"; });
      await del.click({ timeout: 10000 }).catch(() => {}); await shown(page, "[data-part-failed]", 8000);
      const dialogWords = (await page.locator('[role="dialog"], [role="alertdialog"]').first().innerText().catch(() => "")).replace(/\s+/g, " ").trim();
      ok(await count(page, "[data-part-failed]") === 1 && await count(page, 'h2:has-text("Operators")') === 1 && !/\bDelete\b/.test(dialogWords) && /Close/.test(dialogWords),
        "console: a confirm dialog that breaks shows the message and Close, not the Delete button; the page under it stays", dialogWords);
      await throwNoMore(page);
      await page.getByRole("button", { name: "Close", exact: true }).first().click({ timeout: 10000 }).catch(() => {}); await gone(page, "[data-part-failed]", 8000);
      ok(await count(page, "[data-part-failed]") === 0 && await count(page, 'h2:has-text("Operators")') === 1, "console: Close closes the broken dialog and nothing was deleted");
    } else {
      ok(false, "console: an operator row with a Delete button to open the confirm dialog from (the rig seeds operators)");
    }
    bad = rawIn(await words(page));
    ok(bad.length === 0 && uncaught.length === 0, "console: nothing raw on screen at the end and no error escaped the boundaries", `${bad.join(" ")} ${uncaught.join(" | ")}`);
    await ctx.close();
  }

  // ── 2. the ops room display: it never goes blank and nobody has to tap ──────────────────────────────────────────
  // 1920 wide: the ops room layout. Every recovery below is the display's own: this block never clicks.
  {
    const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const page = await ctx.newPage(); const reports = reportsOf(page); const uncaught = pageErrors(page);
    const picture = () => page.evaluate(() => ({
      pills: document.querySelectorAll("[data-fid]").length, header: !!document.querySelector("header"),
      seen: [...document.querySelectorAll("[data-fid]")].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.right > 0 && r.left < innerWidth && r.bottom > 0 && r.top < innerHeight; }).length,
      nowOn: (() => { const r = document.querySelector("[data-now-line]")?.getBoundingClientRect(); return !!r && r.left > 0 && r.left < innerWidth; })(),
      clock: /\b\d{2}:\d{2}/.test(document.querySelector("header")?.innerText || ""),
      notLive: document.querySelectorAll("[data-not-live]").length, mark: document.querySelector("[data-not-live]")?.textContent || "",
      failed: [...document.querySelectorAll("[data-wall-part-failed]")].map((el) => el.getAttribute("data-wall-part-failed") || "part"),
      down: document.querySelectorAll("[data-timeline-down] [data-part-failed]").length, words: (document.body.innerText || "").trim().length,
    }));
    const open = async () => { await page.goto(`${APP}/`, { waitUntil: "load" }); await page.waitForSelector("[data-fid]", { timeout: 45000 }).catch(() => {}); await settled(page); };
    await open();
    const before = await picture();
    ok(before.pills > 0 && before.header && before.clock && before.notLive === 0 && before.failed.length === 0,
      "display: the timeline, the clocks and no NOT LIVE mark when nothing is wrong", JSON.stringify(before));

    // the timeline throws: the last good picture stays, marked NOT LIVE
    await throwAt(page, "display/timeline"); await shown(page, "[data-not-live]", 8000);
    let now = await picture();
    ok(now.words > 0 && now.header && now.clock, "display: the timeline throws and the page is not blank — the clocks are still drawn", JSON.stringify(now));
    ok(now.notLive === 1 && /^NOT LIVE/.test(now.mark) && (now.pills > 0 || now.down === 1),
      "display: the timeline shows its last good picture under a NOT LIVE mark (or, with no picture to show, the small message)", JSON.stringify(now));
    ok(now.pills === before.pills || now.down === 1, "display: the held picture has the flights that were on screen", `${now.pills} of ${before.pills}`);
    const inPlace = (p) => p.down === 1 || (p.nowOn === before.nowOn && Math.abs(p.seen - before.seen) <= 1);
    ok(inPlace(now), "display: the held picture sits where the live one did — the same flights in view, the now-line on screen", `in view ${now.seen} of ${before.seen} · now-line ${now.nowOn}`);
    ok(/since \d{2}:\d{2}Z$/.test(now.mark) || now.down === 1, "display: the mark says since when, in UTC", now.mark);
    let bad = rawIn(await words(page));
    ok(bad.length === 0, "display: no raw error text on the wall", bad.join(" "));
    await until(async () => reports.some((r) => r.where === "display/timeline"), { timeout: 8000, every: 200 });
    ok(reports.find((r) => r.where === "display/timeline")?.status === 204, "display: the error went to the wall's log (204)", JSON.stringify(reports));
    // its first try on its own (after 5 s) fails again: still the held picture and the mark, still not blank
    await sleep(7000);
    now = await picture();
    ok(now.notLive === 1 && now.header && (now.pills === before.pills || now.down === 1) && inPlace(now), "display: a try that fails again leaves the held picture, in place, and the mark", JSON.stringify(now));
    // the cause goes away: the next try (15 s after the last) draws the live timeline and the mark goes — no click
    await throwNoMore(page); const t0 = Date.now();
    await gone(page, "[data-not-live]", 30000); const took = Math.round((Date.now() - t0) / 1000); await sleep(1500); await settled(page);
    now = await picture();
    ok(now.notLive === 0 && now.pills > 0 && now.failed.length === 0 && now.down === 0, "display: it recovers on its own once the cause is gone, and the mark is gone", `${took} s · ${JSON.stringify(now)}`);
    ok(now.nowOn === before.nowOn && Math.abs(now.seen - before.seen) <= 1, "display: the live timeline is back where it was (the now-line on screen, the same flights in view)", `in view ${now.seen} of ${before.seen} · now-line ${now.nowOn}`);

    // everything on the display throws at once, the held picture too: small messages, a NOT LIVE mark, never a blank
    // page — and all of it comes back on its own (a fresh page: the waits start at 5 s again)
    await open();
    await throwAt(page, "display/"); await shown(page, "[data-timeline-down] [data-part-failed]", 8000);
    now = await picture();
    ok(now.words > 0 && now.down === 1 && now.notLive === 1 && now.failed.includes("timeline") && now.failed.length >= 2,
      "display: with every part failing the page still is not blank — a small message per part and the NOT LIVE mark", JSON.stringify(now));
    bad = rawIn(await words(page));
    ok(bad.length === 0, "display: …and still no raw error text", bad.join(" "));
    await throwNoMore(page);
    await until(async () => { const p = await picture(); return p.failed.length === 0 && p.notLive === 0 && p.pills > 0; }, { timeout: 30000, every: 250 }); await settled(page);
    now = await picture();
    ok(now.failed.length === 0 && now.notLive === 0 && now.pills > 0 && now.header && now.clock, "display: every part comes back on its own", JSON.stringify(now));

    // ── 3. the flight panel on the display ──
    // a flight to open: the room's own feed. The panel is opened the way the console opens it, and closed again at the end.
    const pick = await page.evaluate(async (api) => {
      const r = await fetch(`${api}/timeline/flights?allOperators=true`); const j = await r.json().catch(() => ({}));
      for (const g of j.aircraft || []) for (const f of g.flights || []) if (f.flightNid != null) return { flightNid: f.flightNid, oprId: f.oprId || g.oprId || null, flightNo: f.flightNo || "" };
      return null;
    }, API).catch(() => null);
    const overlay = (body) => page.evaluate(async ({ api, body }) => (await fetch(`${api}/display/overlay`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })).status, { api: API, body });
    if (pick) {
      const said = (text, s) => text.split(s).length - 1;
      const panelWords = `Flight ${pick.flightNid}`;
      const calm = await words(page);
      const panelOpen = async () => { const text = await words(page); return /opened by /.test(text) || text.includes(panelWords) || (pick.flightNo && said(text, pick.flightNo) > said(calm, pick.flightNo)) || /Loading flight details/.test(text); };
      try {
        const st = await overlay({ action: "open", flightNid: pick.flightNid, oprId: pick.oprId });
        // the display hears it on its stream; a display that missed it restores the open panel when it starts
        if (!await until(panelOpen, { timeout: 6000, every: 250 })) { await open(); await until(panelOpen, { timeout: 8000, every: 250 }); }
        ok(st === 200 && await panelOpen(), "display: the flight panel opens", `${st} · ${pick.flightNo}`);
        await throwAt(page, "display/flight"); await shown(page, '[data-wall-part-failed="flight"]', 8000);
        now = await picture();
        ok(now.failed.join() === "flight" && now.pills > 0 && now.header && now.clock && now.notLive === 0,
          "display: the flight panel throws — a small message where the panel was; the timeline and the clocks stay, live", JSON.stringify(now));
        bad = rawIn(await words(page));
        ok(bad.length === 0, "display: no raw error text where the panel was", bad.join(" "));
        await throwNoMore(page);
        await gone(page, "[data-wall-part-failed]", 12000);
        ok(await count(page, "[data-wall-part-failed]") === 0 && await panelOpen(), "display: the panel comes back on its own");
      } finally {
        const st = await overlay({ action: "close" }).catch(() => 0);
        ok(st === 200, "display: the panel is closed again for the suites that follow", String(st));
      }
    } else {
      ok(false, "display: a flight in the rig's feed to open the panel for");
    }
    ok(uncaught.length === 0, "display: no error escaped the boundaries", uncaught.join(" | "));

    // ── 4. the report endpoint itself: 204, nothing back, whatever is sent ──
    const posts = await page.evaluate(async (api) => {
      const send = async (body, type = "application/json") => { const r = await fetch(`${api}/ui-error`, { method: "POST", headers: { "content-type": type }, body }); return { status: r.status, text: await r.text(), type: r.headers.get("content-type") || "" }; };
      return {
        plain: await send(JSON.stringify({ where: "rig/echo-probe", name: "RigProbe", message: "rig-echo-marker-51", stack: "rig-echo-marker-51\n    at nowhere", component: "", path: "/rig" })),
        big: await send(JSON.stringify({ where: "rig/echo-probe", message: "x".repeat(20000) })),
        junk: await send("{not json", "text/plain"),
        odd: await send(JSON.stringify({ where: ["rig"], message: { a: 1 }, stack: 7 })),
      };
    }, API);
    ok(Object.values(posts).every((p) => p.status === 204 && p.text === ""), "POST /api/ui-error answers 204 with an empty body — a report, one over 8 KB, one that is not JSON, one with the wrong types",
      JSON.stringify(Object.fromEntries(Object.entries(posts).map(([k, p]) => [k, `${p.status}:${p.text.length}`]))));
    ok(!JSON.stringify(posts).includes("rig-echo-marker-51"), "POST /api/ui-error never sends back what it was sent");
    await ctx.close();
  }

  // ── 5. the phone app (its own boundaries, named in src/phone/kit.jsx) ───────────────────────────────────────────
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
    const page = await ctx.newPage(); const reports = reportsOf(page);
    // the flag before the app's first render: the More page fails as it opens
    await page.addInitScript(() => { try { if (sessionStorage.getItem("cw-probe-off")) return; } catch { /* no storage: the flag is set */ } window.__CW_THROW__ = "phone/page/more"; });
    // production serves the phone app at /digital-wall/phone/; where the rig proxy has no such page, the wall app's own
    // path does the same (the app reads "phone" from the path)
    let at = `${BASE}/digital-wall/phone/`;
    await page.goto(`${at}#more`, { waitUntil: "load" });
    if (!await page.waitForSelector("[data-phone-app]", { timeout: 8000 }).catch(() => null)) { at = `${APP}/phone/`; await page.goto(`${at}#more`, { waitUntil: "load" }); }
    await page.waitForSelector("[data-phone-app]", { timeout: 30000 }).catch(() => {});
    await shown(page, "[data-phone-app] [data-part-failed]", 20000); await settled(page);
    const inApp = await count(page, "[data-phone-app] [data-part-failed]");
    ok(inApp === 1, "phone: the More page throws and shows its message, once", `${inApp} in the app · ${at}`);
    // the way back: the page's own bar when the message is inside the page, or the message's own Back button when the
    // message stands in for the whole page
    const back = page.locator('[data-phone-app] [data-page="more"] [data-back], [data-phone-app] [data-part-leave]').first();
    ok(await back.count() === 1, "phone: the broken page keeps a way back (the bar's Back, or the message's own Back button)");
    let bad = rawIn(await words(page));
    ok(bad.length === 0, "phone: no raw error text on screen", bad.join(" "));
    // the page's own boundary (phone/page/more) or the one around it (phone/outer/more): whichever caught it reports it
    const pageReport = (r) => r.where === "phone/page/more" || r.where === "phone/outer/more";
    await until(async () => reports.some(pageReport), { timeout: 8000, every: 200 });
    ok(reports.find(pageReport)?.status === 204, "phone: the error went to the wall's log (204)", JSON.stringify(reports));
    await back.click({ timeout: 10000 }).catch(() => {}); await gone(page, '[data-page="more"], [data-phone-app] [data-part-failed]', 10000);
    await page.waitForSelector("[data-phone-app] [data-pill]", { timeout: 30000 }).catch(() => {});
    const pills = await count(page, "[data-phone-app] [data-pill]");
    ok(await count(page, '[data-page="more"]') === 0 && await count(page, "[data-phone-app] [data-part-failed]") === 0 && pills > 0, "phone: Back works and the timeline under the page is still there", `${pills} pills`);

    // a flight that throws: the message where the broken part of the flight would be, the rest still there. The flag
    // is a prefix: it reaches the flight's own boundary and the parts inside it (phone/flight/…), whose message may be
    // the phone's own ("Couldn't load… Try again") instead of the small one.
    const FAILED = "[data-phone-app] :is([data-part-failed], [data-staff-failed])";
    await page.evaluate(() => { try { sessionStorage.setItem("cw-probe-off", "1"); } catch { /* the flag is set by hand below */ } window.__CW_THROW__ = "phone/flight"; });
    await page.locator("[data-phone-app] [data-pill]").first().click({ timeout: 10000 }).catch(() => {});
    await shown(page, FAILED, 15000); await settled(page);
    const under = await count(page, "[data-phone-app] [data-pill]") + await count(page, "[data-phone-app] [data-back]");
    ok(await count(page, FAILED) >= 1 && under > 0, "phone: a flight that throws shows a message where the broken part is; the page around it is still there", `${await count(page, FAILED)} failed · ${under} pills and Back buttons`);
    bad = rawIn(await words(page));
    ok(bad.length === 0, "phone: no raw error text on the flight either", bad.join(" "));
    await throwNoMore(page);
    // each failed part has one button (Reload, or Try again): press them until none is left
    for (let i = 0; i < 5 && await count(page, FAILED) > 0; i += 1) { await page.locator(`${FAILED} button`).first().click({ timeout: 10000 }).catch(() => {}); await sleep(500); }
    await gone(page, FAILED, 10000);
    ok(await count(page, FAILED) === 0, "phone: once the cause is gone, the part's own button brings it back");
    if (await count(page, "[data-phone-app] [data-pill]") === 0) { await page.locator("[data-phone-app] [data-back]").first().click({ timeout: 10000 }).catch(() => {}); await page.waitForSelector("[data-phone-app] [data-pill]", { timeout: 10000 }).catch(() => {}); }
    ok(await count(page, "[data-phone-app] [data-pill]") > 0, "phone: the timeline is there after the flight");
    await ctx.close();
  }
} finally {
  await browser.close();
}
console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
