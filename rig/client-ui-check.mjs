// The client screens (Stage 5, 2026-10-25; Client View v2, 2026-11-10): Admin › Clients, the ask-for-access page and the
// client's own world — Timeline, Flights, a flight, the map, the passengers, Account, the start page — on a desk (1440)
// and on phones (390 and 360), light and dark, with no horizontal page scroll and no zoom. Invented names only. On the
// sign-in rig: a client account is made with the service key, left "requested", then approved THROUGH THE ADMIN PAGE
// (scope by registration, a switch toggled, the passenger level set), looked at as the client, changed, and removed by
// typing the company — the row stays, emptied. Screenshots in rig/.scratch/shots/client-*.png.
// Timeline and Flights are drawn INSIDE a frame (iframe[data-client-frame] → /digital-wall/timeline/?in=client, the wall
// app's client surface, same origin): everything in them is read through page.frameLocator.
//   node --env-file=.env.rig rig/client-ui-check.mjs
import { chromium } from "playwright";
import fs from "node:fs";
import { settled } from "./lib/settle.mjs";
import { textOverlaps, clippedText } from "./lib/overlap.mjs";
import { ACTIVE_SWITCHES, RETIRED_SWITCH_KEYS } from "../lib/clients/switches.mjs";
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL, ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(String(SB))) { console.error("Refused: the rig's local Supabase only."); process.exit(2); }
const B = (process.env.RIG_SIGNIN_BASE || "http://127.0.0.1:3989"), OUT = "rig/.scratch/shots"; fs.mkdirSync(OUT, { recursive: true });
let failures = 0; const ok = (c, what, d = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${what}${d ? `  · ${String(d).slice(0, 170)}` : ""}`); if (!c) failures += 1; };
const H = { apikey: SVC, authorization: `Bearer ${SVC}`, "content-type": "application/json" };
const svc = (path, init = {}) => fetch(`${SB}${path}`, { ...init, headers: { ...H, ...(init.headers ?? {}) } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PASSWORD = "rig-access-check-only";
const grant = async (email) => (await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "content-type": "application/json" }, body: JSON.stringify({ email, password: PASSWORD }) })).json();
const cookie = (s) => ({ name: `sb-${new URL(SB).hostname.split(".")[0]}-auth-token`, value: `base64-${Buffer.from(JSON.stringify(s)).toString("base64")}`, url: B });
const cookieHeader = (s) => `${cookie(s).name}=${cookie(s).value}`;
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
// A phone screenshot is the screen as the phone shows it, tab bar at the bottom, and a second one scrolled to the end
// (2026-11-09: a full-page capture drew the sticky tab bar across the middle of the page). A desk one is the window.
const PHONE = (w) => w < 700;
const shot = async (page, file, width, { whole = false } = {}) => {
  if (!PHONE(width)) { await page.screenshot({ path: file, fullPage: whole }); return; }
  await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: file });
  const more = await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight + 40);
  if (more) { await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await page.waitForTimeout(150); await page.screenshot({ path: file.replace(/\.png$/, "-end.png") }); await page.evaluate(() => window.scrollTo(0, 0)); }
};
const viewportOf = (width) => ({ width, height: width === 390 ? 844 : width === 360 ? 780 : 900 });
// the frame: its locators (frameLocator) and its Frame (for evaluate)
const FRAME = "iframe[data-client-frame]";
const frameOf = (page) => page.frameLocator(FRAME);
const frameDoc = (page) => page.frames().find((f) => /\/digital-wall\/timeline(\/|\?|$)/.test(f.url())) ?? null;
const openClient = async (page, path, width) => {
  await page.goto(`${B}${path}`, { waitUntil: "load" });
  await page.waitForSelector("[data-client-shell]", { timeout: 20000 });
  await frameOf(page).locator(`[data-client-surface="${PHONE(width) ? "phone" : "desk"}"]`).waitFor({ timeout: 30000 });
  // the frame has read the fleet once the first lane, or an empty state, is drawn
  await frameOf(page).locator("[data-board] [data-fid], [data-flight-row], [data-empty]").first().waitFor({ timeout: 30000 }).catch(() => {});
  await settled(page);
};
const frameNoOverflow = (page) => frameDoc(page)?.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1) ?? false;
const COMPANY = "Rig Air Services"; // invented
const EMAIL = "rig-client-ui@rig.invalid";

// the requested client
let r = await svc("/auth/v1/admin/users", { method: "POST", body: JSON.stringify({ email: EMAIL, password: PASSWORD, email_confirm: true, user_metadata: { full_name: "Rig Client Person" }, app_metadata: { role: "client", is_approved: false, client_status: "requested" } }) });
let u = await r.json(); if (!r.ok) { const list = await (await svc("/auth/v1/admin/users?page=1&per_page=200")).json(); u = (list.users ?? []).find((x) => x.email === EMAIL); }
const uid = u.id;
// (the password too: this check changes it on the Account page and puts it back, and a run stopped in between left the
// next run unable to sign in, 2026-11-09; and the view preferences, so the start page and the hide switches begin empty)
await svc(`/auth/v1/admin/users/${uid}`, { method: "PUT", body: JSON.stringify({ password: PASSWORD, user_metadata: { full_name: "Rig Client Person", client_prefs: null }, app_metadata: { role: "client", is_approved: false, client_status: "requested" } }) });
// A previous run's row cannot be deleted (its decisions reference it — rows are never deleted, on the rig as in production):
// put it back to "requested", emptied, or make it when there is none.
const fresh = { user_id: uid, email: EMAIL, person_name: "Rig Client Person", company: COMPANY, kind: "broker", note: "Two legs for a client of ours next week.", status: "requested", scope: [], switches: [], passenger_level: "off", consent: false, decided_at: null, decided_by: null, decided_by_email: null, decision_note: "" };
const existing = await (await svc(`/rest/v1/clients?user_id=eq.${uid}&select=id`)).json();
if (existing[0]) await svc(`/rest/v1/clients?id=eq.${existing[0].id}`, { method: "PATCH", body: JSON.stringify(fresh) });
else await svc("/rest/v1/clients", { method: "POST", body: JSON.stringify(fresh) });
// the address clients write to is a setting (app_settings, Admin › Clients): this check sets its own, an invented one
const contact = "rig-client-help@rig.invalid";
await svc("/rest/v1/app_settings?on_conflict=key", { method: "POST", headers: { prefer: "resolution=merge-duplicates" }, body: JSON.stringify({ key: "clients.support_email", value: { email: contact }, updated_by_email: "rig/client-ui-check" }) });

const browser = await chromium.launch();
const admin = await grant("rig-access-admin@rig.invalid");
for (const theme of ["light", "dark"]) {
  for (const width of [1440, 390]) {
    const ctx = await browser.newContext({ viewport: viewportOf(width), colorScheme: theme });
    await ctx.addCookies([cookie(admin)]); await ctx.addInitScript((t) => { try { localStorage.setItem("cw-theme", t); } catch {} }, theme);
    const page = await ctx.newPage();
    await page.goto(`${B}/admin/clients`, { waitUntil: "load" }); await page.waitForSelector("[data-admin-clients]", { timeout: 20000 }); await settled(page);
    // The first pass approves the client through the page; every later pass finds them under Approved.
    const approvedYet = !(theme === "light" && width === 1440);
    ok(approvedYet ? await page.locator(`[data-client-approved]`).count() >= 1 : await page.locator(`[data-client-request]`).count() >= 1, `Clients page ${theme} ${width}: the client is under ${approvedYet ? "Approved" : "Waiting"}`);
    ok(await noOverflow(page), `Clients page ${theme} ${width}: no horizontal page scroll`);
    await page.screenshot({ path: `${OUT}/client-admin-${theme}-${width}.png`, fullPage: true });
    if (theme === "light" && width === 1440) {
      await page.locator("[data-review]").first().click(); await page.waitForSelector("[data-client-editor]", { timeout: 10000 });
      const approve = page.locator("[data-approve]");
      ok(await approve.isDisabled(), "editor: Approve is disabled with no scope");
      // the scope field suggests real records only (2026-11-02): type, then take the fleet's LY-TST from the suggestions
      const scopeBox = page.getByRole("combobox", { name: "Add to scope" });
      await scopeBox.click(); await page.keyboard.type("LY-TST");
      const opt = page.locator('[data-suggestions] [data-option="registration:LY-TST"]');
      await opt.waitFor({ timeout: 15000 }); await opt.dispatchEvent("mousedown");
      ok(await page.locator('[data-scope-entry="registration:LY-TST"]').count() === 1, "editor: the registration is in the scope list");
      ok(await page.locator('[data-switch="flight_board"]').isDisabled(), "editor: Flight board is required (cannot be turned off)");
      // the retired switches (2026-11-10): Documents and Airport search are not in the editor, and the nine that exist are
      const shown = await page.locator("[data-switch]").evaluateAll((els) => els.map((e) => e.getAttribute("data-switch")));
      ok(RETIRED_SWITCH_KEYS.length === 2 && shown.every((k) => !RETIRED_SWITCH_KEYS.includes(k)) && shown.length === ACTIVE_SWITCHES.length && ACTIVE_SWITCHES.length === 9, "editor: the nine switches that exist, and neither retired one (Documents, Airport search)", shown.join(","));
      await page.locator('[data-switch="limitations"]').click();
      await page.locator('[data-level="names"]').click();
      ok(await approve.isEnabled(), "editor: Approve enabled with a scope, the board and a level");
      await page.screenshot({ path: `${OUT}/client-admin-editor.png`, fullPage: true });
      await approve.click(); await page.waitForSelector(`[data-client-approved]`, { timeout: 15000 }); await settled(page);
      ok(await page.locator("[data-client-approved]").count() >= 1 && await page.locator("[data-client-request]").count() === 0, "approved through the page: moved from Waiting to Approved");
      ok(await page.locator('[data-decision="approved"]').count() >= 1, "the decision log shows APPROVED");
      const row = await (await svc(`/rest/v1/clients?user_id=eq.${uid}&select=status,scope,switches,passenger_level`)).json();
      ok(row[0]?.status === "approved" && JSON.stringify(row[0]?.scope) === JSON.stringify([{ kind: "registration", value: "LY-TST" }]) && row[0]?.switches.includes("limitations") && row[0]?.passenger_level === "names", "the row: approved, scope LY-TST, limitations on, names", JSON.stringify(row[0]).slice(0, 150));
      ok(row[0]?.switches.includes("radar") && !row[0]?.switches.some((k) => RETIRED_SWITCH_KEYS.includes(k)), "the row: the radar switch is among the starting ones, and no retired switch is saved", JSON.stringify(row[0]?.switches));
      const au = await (await svc(`/auth/v1/admin/users/${uid}`)).json();
      ok(au.app_metadata?.role === "client" && au.app_metadata?.is_approved === true && au.app_metadata?.client_status === "approved", "the account: client, approved, in app_metadata", JSON.stringify(au.app_metadata));
    }
    await ctx.close();
  }
}

// the client's own screens: Timeline and Flights in the frame, a flight, and on a phone the map and the passengers
let cs = await grant(EMAIL);
const MENU = ["Timeline", "Flights", "Account", "Settings"];   // Settings in the menu since 2026-11-12
// a flight that flies (a cancelled one carries no weather, NOTAM or passenger section, by design)
const flightNoOf = async (page) => frameOf(page).locator("[data-flight-row]:not(.is-cnl)").first().getAttribute("data-flight-row");
const readPax = (page, sel) => frameDoc(page)?.waitForFunction((q) => { const t = document.querySelector(q)?.textContent || ""; return t.length > 0 && !/Reading the passenger list/.test(t); }, sel, { timeout: 20000 }).catch(() => {});
for (const theme of ["light", "dark"]) {
  for (const width of [1440, 390, 360]) {
    const ctx = await browser.newContext({ viewport: viewportOf(width), colorScheme: theme, hasTouch: PHONE(width) });
    await ctx.addCookies([cookie(cs)]); await ctx.addInitScript((t) => { try { localStorage.setItem("cw-theme", t); } catch {} }, theme);
    const page = await ctx.newPage(); const tag = `client ${theme} ${width}`; const fr = frameOf(page);
    // ── Timeline ──
    await openClient(page, "/client", width);
    ok(await page.locator("[data-cw-sidebar]").count() === 0 && !(await page.content()).includes("Flight intake"), `${tag} Timeline: no portal shell in the page`);
    ok((await page.locator("[data-client-shell]").getAttribute("data-menu")) === "/client /client/flights /client/account /client/settings", `${tag} Timeline: the menu is Timeline, Flights, Account and nothing else`, await page.locator("[data-client-shell]").getAttribute("data-menu"));
    if (PHONE(width)) {
      ok(JSON.stringify((await page.locator(".clw-bottomnav a").allInnerTexts()).map((x) => x.trim())) === JSON.stringify(MENU) && await page.locator(".clw-side").isHidden(), `${tag} Timeline: the tab bar is Timeline, Flights, Account; no sidebar`);
      ok(await page.locator(".clw-head").isHidden(), `${tag} Timeline: the header is hidden, the frame has the screen`);
      const fb = await page.locator(FRAME).boundingBox(), nb = await page.locator(".clw-bottomnav").boundingBox();
      ok(fb && nb && fb.y < 2 && fb.height > 300 && fb.y + fb.height <= nb.y + 1, `${tag} Timeline: the frame fills the screen above the tab bar`, `frame ${fb ? `${Math.round(fb.y)}+${Math.round(fb.height)}` : "none"} · tabs at ${nb ? Math.round(nb.y) : "none"}`);
      ok(await page.evaluate(() => { const n = document.querySelector(".clw-bottomnav"); return !!n && !n.nextElementSibling; }), `${tag} Timeline: the tab bar is the last thing on the screen`);
    } else {
      ok(JSON.stringify((await page.locator(".clw-side-nav a").allInnerTexts()).map((x) => x.trim())) === JSON.stringify(MENU) && await page.locator(".clw-bottomnav").isHidden(), `${tag} Timeline: the sidebar is Timeline, Flights, Account; no tab bar`);
      ok(await page.locator(".clw-side-nav a.on").innerText().then((t) => t.trim() === "Timeline", () => false) && /Timeline/.test(await page.locator(".clw-head .clw-crumb").innerText()), `${tag} Timeline: marked in the sidebar and named in the crumb`);
      ok((await page.locator(".clw-side-help[data-client-contact] a").getAttribute("href")) === `mailto:${contact}`, `${tag} Timeline: the ops address under the sidebar is the client contact setting`);
      ok(await page.locator(".clw-head [data-theme-button]").isVisible() && await page.locator(".clw-head .clw-signout").isVisible(), `${tag} Timeline: the header has the theme button and Sign out`);
    }
    const surface = fr.locator("[data-client-surface]");
    ok((await surface.getAttribute("data-client-surface")) === (PHONE(width) ? "phone" : "desk") && (await surface.getAttribute("data-theme")) === theme, `${tag} Timeline: the frame draws the ${PHONE(width) ? "phone" : "desk"} surface in the ${theme} theme`, `${await surface.getAttribute("data-client-surface")} ${await surface.getAttribute("data-theme")}`);
    ok(await fr.locator(`${PHONE(width) ? ".cwp" : ".cwd"}[data-client-page="timeline"]`).count() === 1, `${tag} Timeline: the frame is on the timeline page`);
    const pills = await fr.locator("[data-board] [data-fid]").count();
    ok(pills >= 1, `${tag} Timeline: the board draws their flights`, `${pills} pills`);
    ok(await fr.locator("[data-service-status]").count() === 0, `${tag} Timeline: no service status line (its switch is off)`);
    if (!PHONE(width)) {
      ok(await fr.locator('[data-card="timeline"] [data-prev-day]').count() === 1 && await fr.locator('[data-card="timeline"] [data-next-day]').count() === 1 && await fr.locator('[data-card="timeline"] [data-zoom-out]').count() === 1 && await fr.locator('[data-card="timeline"] [data-zoom-in]').count() === 1 && await fr.locator('[data-card="timeline"] [data-go-now]').count() === 1, `${tag} Timeline: day, zoom and Now controls`);
      ok(/LY-TST|1 aircraft/.test(await fr.locator("[data-page-sub]").innerText()) && await fr.locator("[data-operators-button]").count() === 1, `${tag} Timeline: the subtitle counts their aircraft, Operators & aircraft is there`, (await fr.locator("[data-page-sub]").innerText()).trim());
      const z0 = await fr.locator("[data-zoom-label]").innerText(); await fr.locator("[data-zoom-in]").click(); await page.waitForTimeout(200);
      ok((await fr.locator("[data-zoom-label]").innerText()) !== z0, `${tag} Timeline: zoom in changes the zoom label`, `${z0} → ${await fr.locator("[data-zoom-label]").innerText()}`);
      await fr.locator("[data-zoom-out]").click(); await page.waitForTimeout(200);
      const agenda = await fr.locator('[data-card="coming-up"] [data-agenda-row]').count();
      ok(await fr.locator('[data-card="coming-up"]').count() === 0 || agenda >= 1, `${tag} Timeline: Coming up, when drawn, lists at least one flight`, `${agenda} rows`);
    } else {
      ok(await fr.locator(".cwp-bar [data-view-timeline][aria-selected='true']").count() === 1 && await fr.locator(".cwp-bar [data-view-list]").count() === 1 && await fr.locator(".cwp-bar [data-operators-button]").count() === 1, `${tag} Timeline: the bar has the timeline/list toggle and the operators button`);
    }
    ok(await noOverflow(page) && await frameNoOverflow(page), `${tag} Timeline: no horizontal scroll, on the page or in the frame`);
    await shot(page, `${OUT}/client-timeline-${theme}-${width}.png`, width);

    // ── a flight from the timeline (desk: a pill opens the side panel) ──
    if (!PHONE(width)) {
      const pill = fr.locator("[data-board] [data-fid]").first(); await pill.scrollIntoViewIfNeeded().catch(() => {}); await pill.click({ timeout: 10000 }).catch(() => {});
      await fr.locator("[data-flight-panel]").waitFor({ timeout: 15000 }).catch(() => {});
      ok(await fr.locator("[data-flight-panel]").count() === 1, `${tag} Timeline: a pill opens the flight panel`);
      await fr.locator("[data-flight-panel] [data-close-flight]").click();
      ok(await fr.locator("[data-flight-panel]").count() === 0, `${tag} Timeline: the panel closes`);
    }

    // ── Flights: by the sidebar on a desk, by the tab bar on a phone (the frame stays, the address follows) ──
    if (PHONE(width)) await page.locator(".clw-bottomnav a", { hasText: "Flights" }).click(); else await page.locator(".clw-side-nav a", { hasText: "Flights" }).click();
    await page.waitForURL((x) => new URL(x).pathname === "/client/flights", { timeout: 15000 }).catch(() => {});
    await fr.locator(`${PHONE(width) ? ".cwp" : ".cwd"}[data-client-page="flights"]`).waitFor({ timeout: 15000 }).catch(() => {});
    ok(new URL(page.url()).pathname === "/client/flights" && await fr.locator('[data-client-page="flights"]').count() === 1 && await page.locator(FRAME).count() === 1, `${tag} Flights: the ${PHONE(width) ? "tab" : "sidebar"} switches the frame's page and the address`, page.url());
    await fr.locator("[data-flight-row]").first().waitFor({ timeout: 15000 }).catch(() => {});
    const rows = await fr.locator("[data-flight-row]").count();
    ok(rows >= 1 && await fr.locator("[data-flights-search]").count() === 1, `${tag} Flights: the list has their flights and a search field`, `${rows} rows`);
    const search = fr.locator("[data-flights-search]");
    await search.fill("QQQQZZZZ"); await fr.locator('[data-empty="no-match"]').waitFor({ timeout: 8000 }).catch(() => {});
    ok(await fr.locator('[data-empty="no-match"]').count() === 1 && await fr.locator("[data-flight-row]").count() === 0, `${tag} Flights: a search with no match says so in words`);
    await search.fill(""); await fr.locator("[data-flight-row]").first().waitFor({ timeout: 8000 }).catch(() => {});
    ok(await noOverflow(page) && await frameNoOverflow(page), `${tag} Flights: no horizontal scroll, on the page or in the frame`);
    await shot(page, `${OUT}/client-flights-${theme}-${width}.png`, width);

    // ── the flight: a row opens it — a side panel on a desk, a page on a phone ──
    const fn = await flightNoOf(page);
    await fr.locator(`[data-flight-row="${fn}"]`).first().click();
    const opened = PHONE(width) ? fr.locator(`[data-flight-page="${fn}"]`) : fr.locator(`[data-flight-panel="${fn}"]`);
    await opened.waitFor({ timeout: 15000 }).catch(() => {});
    ok(await opened.count() === 1, `${tag} flight ${fn}: opens as a ${PHONE(width) ? "page" : "side panel"}`);
    await opened.locator('[data-section="weather"] [data-card="weather"], [data-section="weather"] .cwc-muted').first().waitFor({ timeout: 20000 }).catch(() => {});
    await opened.locator('[data-section="notams"], [data-section="passengers"]').first().waitFor({ timeout: 20000 }).catch(() => {}); // drawn once /api/flight-info has answered
    await opened.locator('[data-section="passengers"]').first().waitFor({ timeout: 20000 }).catch(() => {}); // the last section to draw (2026-11-11: the 1440 desk once counted before it was there)
    ok(await opened.locator('[data-card="times"]').count() === 1 && await opened.locator('[data-section="weather"]').count() === 1 && await opened.locator('[data-section="notams"]').count() === 1 && await opened.locator('[data-section="limitations"][data-card="limitations"]').count() === 1 && await opened.locator('[data-section="passengers"]').count() === 1, `${tag} flight ${fn}: times, weather, NOTAMs, limitations and passengers — their switches and level`, await opened.evaluate((el) => ["[data-card=times]", "[data-section=weather]", "[data-section=notams]", "[data-section=limitations][data-card=limitations]", "[data-section=passengers]"].map((q) => `${q}:${el.querySelectorAll(q).length}`).join(" ") + ` · ${(el.textContent || "").slice(0, 120)}`).catch(() => "no panel"));
    ok(await opened.locator('[data-section="important"]').count() === 0 && await opened.locator('[data-section="caa"]').count() === 0, `${tag} flight ${fn}: no notices and no authority sections — switches off add nothing`);
    await readPax(page, '[data-section="passengers"]');
    const paxText = (await opened.locator('[data-section="passengers"]').innerText().catch(() => "")).replace(/\s+/g, " ");
    ok(!/could not be read|answered \d{3}/.test(paxText), `${tag} flight ${fn}: the passenger list is read (names, or none entered)`, paxText.slice(0, 80));
    ok(await noOverflow(page) && await frameNoOverflow(page), `${tag} flight ${fn}: no horizontal scroll with the flight open`);
    await shot(page, `${OUT}/client-flight-${theme}-${width}.png`, width);
    if (PHONE(width)) {
      // the map (the radar switch is on) and the passengers sheet (level names)
      ok(await opened.locator("[data-open-map]").count() === 1 && await opened.locator("[data-open-pax]").count() === 1, `${tag} flight ${fn}: Map and Passengers buttons`);
      await opened.locator("[data-open-map]").click();
      await fr.locator(`[data-flight-page="${fn}"][data-sub="map"] .cwm[data-map-state]`).waitFor({ timeout: 15000 }).catch(() => {});
      const mapState = await fr.locator(".cwm[data-map-state]").getAttribute("data-map-state").catch(() => null);
      ok(Boolean(mapState) && mapState !== "loading", `${tag} flight ${fn}: the map opens with a state`, mapState);
      ok(await noOverflow(page) && await frameNoOverflow(page), `${tag} map: no horizontal scroll`);
      await shot(page, `${OUT}/client-map-${theme}-${width}.png`, width);
      await fr.locator('[data-sub="map"] .cwp-bar button[aria-label="Back to the flight"]').click();
      await fr.locator(`[data-flight-page="${fn}"]:not([data-sub])`).waitFor({ timeout: 10000 }).catch(() => {});
      ok(await fr.locator(`[data-flight-page="${fn}"][data-sub="map"]`).count() === 0 && await fr.locator("[data-open-pax]").count() === 1, `${tag} flight ${fn}: back from the map to the flight page`);
      await fr.locator("[data-open-pax]").click(); await fr.locator("[data-pax-sheet]").waitFor({ timeout: 10000 }).catch(() => {});
      await readPax(page, "[data-pax-sheet]");
      const sheet = (await fr.locator("[data-pax-sheet]").innerText().catch(() => "")).replace(/\s+/g, " ");
      ok(await fr.locator("[data-pax-sheet]").count() === 1 && /Passengers/.test(sheet) && !/could not be read|answered \d{3}/.test(sheet), `${tag} flight ${fn}: the passengers sheet opens and is read`, sheet.slice(0, 80));
      await shot(page, `${OUT}/client-passengers-${theme}-${width}.png`, width);
      await fr.locator('[data-pax-sheet] button[aria-label="Close"]').click();
      ok(await fr.locator("[data-pax-sheet]").count() === 0, `${tag} flight ${fn}: the sheet closes`);
      await fr.locator("[data-back]").click(); await fr.locator("[data-flight-row]").first().waitFor({ timeout: 10000 }).catch(() => {});
      ok(await fr.locator("[data-flight-page]").count() === 0 && await fr.locator("[data-flight-row]").count() >= 1, `${tag} flight ${fn}: back returns to the list`);
      // the Timeline tab from the list, then a reload: the page the address names, no stale flight
      await page.locator(".clw-bottomnav a", { hasText: "Timeline" }).click();
      await fr.locator('.cwp[data-client-page="timeline"]').waitFor({ timeout: 15000 }).catch(() => {});
      ok(new URL(page.url()).pathname === "/client" && await fr.locator('.cwp[data-client-page="timeline"]').count() === 1, `${tag}: the Timeline tab returns to the timeline`, page.url());
      await page.reload({ waitUntil: "load" }); await fr.locator('.cwp[data-client-page="timeline"]').waitFor({ timeout: 30000 }).catch(() => {});
      ok(await fr.locator('.cwp[data-client-page="timeline"]').count() === 1 && await fr.locator("[data-flight-page]").count() === 0, `${tag}: a reload shows the timeline, no flight open`);
    } else {
      await fr.locator("[data-close-flight]").click();
      ok(await fr.locator("[data-flight-panel]").count() === 0, `${tag} flight ${fn}: the panel closes`);
    }

    // ── Account, reached the way a person does: the sidebar on a desk, the last tab on a phone ──
    if (PHONE(width)) await page.locator(".clw-bottomnav a", { hasText: "Account" }).click(); else await page.locator(".clw-side-nav a", { hasText: "Account" }).click();   // Account is the third of four since 2026-11-12
    await page.waitForSelector('[data-tab="account"]', { timeout: 15000 }); await settled(page);
    const at = `${tag} account`;
    ok(new URL(page.url()).pathname === "/client/account" && await page.locator(FRAME).count() === 0, `${at}: ${PHONE(width) ? "the last tab" : "the sidebar"} opens it, with no frame on it`, page.url());
    const bg = await page.evaluate(() => { const c = getComputedStyle(document.body).backgroundColor.match(/[\d.]+/g)?.map(Number) ?? [255, 255, 255]; return (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255; });
    ok(theme === "dark" ? bg < 0.25 : bg > 0.75, `${at}: the page is in the ${theme} theme`, bg.toFixed(2));
    ok(await page.locator("[data-cw-sidebar]").count() === 0 && await noOverflow(page), `${at}: no portal shell, no horizontal page scroll`);
    ok((await page.locator("[data-account-email]").innerText()).trim() === EMAIL && (await page.locator('[data-card="you"]').innerText()).includes(COMPANY), `${at}: says who is signed in, and for which company`);
    ok(await page.locator('[data-card="start-page"] [data-start-option="timeline"]').count() === 1 && await page.locator('[data-card="start-page"] [data-start-option="flights"]').count() === 1 && await page.locator("[data-theme-option]").count() === 3, `${at}: the start page choice and the three appearance options`);
    ok(await page.locator('[data-card="password"] [data-change-password]').count() === 1, `${at}: the password card`);
    await page.locator('[data-card="grants"] [data-grant], [data-card="grants"] [data-grants-empty]').first().waitFor({ timeout: 15000 }).catch(() => {});
    const grantsText = (await page.locator('[data-card="grants"]').innerText().catch(() => "")).replace(/\s+/g, " ");
    ok(await page.locator('[data-card="grants"] [data-grant]').count() >= 1 && /LY-TST/.test(grantsText) && await page.locator("[data-grants-empty]").count() === 0, `${at}: the grants card lists their operator and LY-TST`, grantsText.slice(0, 100));
    ok((await page.locator('[data-card="help"] [data-client-contact] a').getAttribute("href")) === `mailto:${contact}`, `${at}: the help card carries the address to write to`);
    // 44 px targets are the phone's rule (design "Phone Views"); on a desk the design's own controls are 32–40 px
    if (PHONE(width)) {
      const small = await page.locator('[data-tab="account"] button, [data-tab="account"] input').evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().height < 43.5).map((e) => `${e.tagName.toLowerCase()} ${Math.round(e.getBoundingClientRect().height)}px`));
      ok(small.length === 0, `${at}: every button and field is at least 44px tall`, small.join(", "));
    }
    const wide = await page.locator('[data-tab="account"] *').evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().right > window.innerWidth + 1).length);
    ok(wide === 0, `${at}: nothing runs past the edge of the screen`, wide);
    if (PHONE(width)) {
      ok(await page.locator(".clw-bottomnav a.on").innerText().then((t) => t.trim() === "Account", () => false), `${at}: the Account tab is marked as the current one`);
      ok(await page.locator(".clw-head").isVisible() && await page.locator(".clw-head .clw-signout").isHidden() && await page.locator("[data-signout]").isVisible(), `${at}: the header is back, Sign out is on the page (the header keeps the room for the company's name)`);
      ok(await page.evaluate(() => { const n = document.querySelector(".clw-bottomnav"); return !!n && !n.nextElementSibling; }), `${at}: the tab bar is the last thing on the screen`);
      const smallFont = await page.locator('[data-tab="account"] input').evaluateAll((els) => els.map((e) => parseFloat(getComputedStyle(e).fontSize)).filter((s) => s < 16));
      ok(smallFont.length === 0, `${at}: every field's text is 16px or more (a phone does not zoom into it)`, smallFont.join(","));
    } else ok(await page.locator(".clw-head .clw-signout").isVisible() && await page.locator(".clw-side-nav a.on").innerText().then((t) => t.trim() === "Account", () => false), `${at}: Sign out is in the header, Account marked in the sidebar`);
    await shot(page, `${OUT}/client-account-${theme}-${width}.png`, width);
    await ctx.close();
  }
}

// the zoom check (2026-11-10), on a phone: no step in the frame or on the page scales the viewport — the frame's
// viewport meta allows pinch (an accessibility rule) and every field's text is 16px or more, so a phone has no reason
// to zoom into one. The scale and the document's width are read at load, with a flight open, with the search focused
// and after going back: all equal the first.
{
  const ctx = await browser.newContext({ viewport: viewportOf(390), hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  await ctx.addCookies([cookie(cs)]); const page = await ctx.newPage(); const fr = frameOf(page);
  const sample = async () => ({ page: await page.evaluate(() => [visualViewport.scale, document.documentElement.clientWidth]), frame: await (frameDoc(page)?.evaluate(() => [visualViewport.scale, document.documentElement.clientWidth]) ?? [null, null]) });
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  await openClient(page, "/client/flights", 390);
  await fr.locator("[data-flight-row]").first().waitFor({ timeout: 15000 }).catch(() => {});
  const s0 = await sample();
  ok(s0.page[0] === 1 && s0.frame[0] === 1 && s0.page[1] === 390, "zoom 390: at load the page and the frame are at scale 1, 390px wide", JSON.stringify(s0));
  const fn = await flightNoOf(page);
  await fr.locator(`[data-flight-row="${fn}"]`).first().click(); await fr.locator(`[data-flight-page="${fn}"]`).waitFor({ timeout: 15000 }).catch(() => {});
  const s1 = await sample(); ok(same(s1, s0), "zoom 390: the same with a flight open", JSON.stringify(s1));
  await fr.locator("[data-back]").click(); await fr.locator("[data-flights-search]").waitFor({ timeout: 10000 }).catch(() => {});
  const s2 = await sample(); ok(same(s2, s0), "zoom 390: the same after going back", JSON.stringify(s2));
  await fr.locator("[data-flights-search]").focus(); await page.waitForTimeout(300);
  const s3 = await sample(); ok(same(s3, s0) && await fr.locator("[data-flights-search]").evaluate((e) => document.activeElement === e), "zoom 390: the same with the search field focused", JSON.stringify(s3));
  await fr.locator("[data-flights-search]").blur().catch(() => {});
  const meta = await frameDoc(page)?.evaluate(() => document.querySelector('meta[name="viewport"]')?.getAttribute("content") ?? "");
  ok(typeof meta === "string" && meta.length > 0 && !/user-scalable\s*=\s*no/i.test(meta) && !/maximum-scale\s*=\s*1(\.0)?\b/i.test(meta), "zoom 390: the frame's viewport meta does not forbid pinch zoom", meta);
  const fonts = await fr.locator("input").evaluateAll((els) => els.map((e) => `${e.getAttribute("data-flights-search") !== null ? "search" : e.name || e.type} ${parseFloat(getComputedStyle(e).fontSize)}px`).filter((s) => parseFloat(s.split(" ")[1]) < 16));
  ok(fonts.length === 0 && await fr.locator("input").count() >= 1, "zoom 390: every field in the frame has text of 16px or more", fonts.join(", "));
  await ctx.close();
}

// Operators & aircraft (2026-11-10): a view filter saved on the account. One aircraft switched off is marked hidden,
// is in the client's own preferences, stays hidden after a reload, and Show all clears it — and the preferences.
{
  const prefs = async () => (await (await fetch(`${B}/api/client/prefs`, { headers: { cookie: cookieHeader(cs) } })).json()).prefs ?? {};
  await fetch(`${B}/api/client/prefs`, { method: "PUT", headers: { cookie: cookieHeader(cs), "content-type": "application/json" }, body: JSON.stringify({ hidden: { operators: [], registrations: [] } }) });
  const ctx = await browser.newContext({ viewport: viewportOf(1440) }); await ctx.addCookies([cookie(cs)]);
  const page = await ctx.newPage(); const fr = frameOf(page);
  await openClient(page, "/client", 1440);
  ok(await fr.locator("[data-hidden-chip]").count() === 0, "filter: nothing hidden to begin with");
  await fr.locator("[data-operators-button]").click(); await fr.locator("[data-operators-panel]").waitFor({ timeout: 10000 }).catch(() => {});
  ok(await fr.locator("[data-operators-panel]").count() === 1 && await fr.locator('[data-operators-panel] [data-op-switch="cwy-cwy"]').count() === 1 && await fr.locator('[data-operators-panel] [data-reg-switch="LY-TST"]').count() === 1, "filter: the panel lists their operator and LY-TST as switches");
  ok(await fr.locator('[data-reg-switch="LY-TST"]').getAttribute("aria-checked") === "true" && await fr.locator("[data-operators-panel] [data-show-all]").isDisabled(), "filter: the aircraft is on, Show all has nothing to do");
  await fr.locator('[data-reg-switch="LY-TST"]').click();
  await fr.locator("[data-hidden-chip]").waitFor({ timeout: 10000 }).catch(() => {});
  ok(await fr.locator('[data-reg-switch="LY-TST"]').getAttribute("aria-checked") === "false" && /1 aircraft hidden/.test(await fr.locator("[data-hidden-chip]").innerText().catch(() => "")), "filter: LY-TST switched off — the hidden chip says one aircraft is hidden");
  let saved = null; for (let i = 0; i < 40 && !saved; i += 1) { const p = await prefs(); if (p.hidden?.registrations?.includes("LY-TST")) saved = p; else await sleep(250); }
  ok(Boolean(saved) && saved.hidden.operators.length === 0, "filter: the account's preferences hold LY-TST under hidden registrations (and no operator)", JSON.stringify(saved?.hidden));
  await page.reload({ waitUntil: "load" }); await fr.locator('[data-client-surface="desk"]').waitFor({ timeout: 30000 }); await fr.locator("[data-hidden-chip]").waitFor({ timeout: 15000 }).catch(() => {});
  ok(await fr.locator("[data-hidden-chip]").count() === 1 && await fr.locator('[data-empty="all-hidden"]').count() >= 1, "filter: after a reload the aircraft is still hidden (their only one, so the board says every aircraft is hidden)");
  await fr.locator("[data-hidden-chip] [data-show-all]").click(); await fr.locator("[data-board] [data-fid]").first().waitFor({ timeout: 15000 }).catch(() => {});
  ok(await fr.locator("[data-hidden-chip]").count() === 0 && await fr.locator("[data-board] [data-fid]").count() >= 1, "filter: Show all brings the aircraft and its flights back");
  let cleared = null; for (let i = 0; i < 40 && !cleared; i += 1) { const p = await prefs(); if (p.hidden?.registrations?.length === 0) cleared = p; else await sleep(250); }
  ok(Boolean(cleared) && cleared.hidden.operators.length === 0, "filter: the preferences are empty again", JSON.stringify(cleared?.hidden));
  await ctx.close();
}

// the start page (2026-11-10): the one-time choice after the password. Flights chosen there lands on Flights and makes
// the root open Flights; Account switches it back to Timeline and the root opens Timeline; Decide later saves nothing.
{
  const prefs = async () => (await (await fetch(`${B}/api/client/prefs`, { headers: { cookie: cookieHeader(cs) } })).json()).prefs ?? {};
  const rootGoes = async () => { const res = await fetch(`${B}/`, { headers: { cookie: cookieHeader(cs) }, redirect: "manual" }); return `${res.status} ${new URL(res.headers.get("location") || "/none", B).pathname}`; };
  const ctx = await browser.newContext({ viewport: viewportOf(1440) }); await ctx.addCookies([cookie(cs)]); const page = await ctx.newPage();
  await page.goto(`${B}/client/start`, { waitUntil: "load" }); await page.waitForSelector("[data-client-start]", { timeout: 20000 }); await settled(page);
  ok(await page.locator('[data-start-choice="timeline"]').count() === 1 && await page.locator('[data-start-choice="flights"]').count() === 1 && await page.locator("[data-decide-later]").count() === 1, "start page: Timeline, Flights list and Decide later");
  ok((await page.locator("[data-client-shell]").getAttribute("data-menu")) === "/client /client/flights /client/account /client/settings", "start page: not a menu item (the menu stays the three)");
  await page.screenshot({ path: `${OUT}/client-start-1440.png`, fullPage: true });
  await page.locator('[data-start-choice="flights"]').click();
  await page.waitForURL((x) => new URL(x).pathname === "/client/flights", { timeout: 20000 }).catch(() => {});
  await frameOf(page).locator('[data-client-page="flights"]').waitFor({ timeout: 30000 }).catch(() => {});
  ok(new URL(page.url()).pathname === "/client/flights" && await frameOf(page).locator('[data-client-page="flights"]').count() === 1, "start page: choosing Flights lands on Flights", page.url());
  ok((await prefs()).start === "flights", "start page: the choice is saved on the account");
  ok((await rootGoes()) === "307 /client/flights", "start page: the root now sends them to Flights", await rootGoes());
  // Account: back to Timeline
  await page.goto(`${B}/client/account`, { waitUntil: "load" }); await page.waitForSelector('[data-card="start-page"]', { timeout: 20000 }); await settled(page);
  ok(await page.locator('[data-start-option="flights"]').getAttribute("aria-checked") === "true", "account: the start page card shows Flights as the choice");
  await page.locator('[data-start-option="timeline"]').click(); await page.locator("[data-start-note]").waitFor({ timeout: 15000 }).catch(() => {});
  ok(/Saved\. Timeline opens/.test(await page.locator("[data-start-note]").innerText().catch(() => "")) && await page.locator('[data-start-option="timeline"]').getAttribute("aria-checked") === "true", "account: Timeline chosen, said once saved", (await page.locator("[data-start-note]").innerText().catch(() => "")).trim());
  ok((await prefs()).start === "timeline" && (await rootGoes()) === "307 /client", "account: the root sends them to Timeline again", await rootGoes());
  // Decide later on a phone: Timeline opens, the saved choice stays as it was
  const pc = await browser.newContext({ viewport: viewportOf(390), hasTouch: true }); await pc.addCookies([cookie(cs)]); const pp = await pc.newPage();
  await pp.goto(`${B}/client/start`, { waitUntil: "load" }); await pp.waitForSelector("[data-client-start]", { timeout: 20000 }); await settled(pp);
  ok(await noOverflow(pp), "start page 390: no horizontal page scroll");
  await shot(pp, `${OUT}/client-start-390.png`, 390);
  await pp.locator("[data-decide-later]").click(); await pp.waitForURL((x) => new URL(x).pathname === "/client", { timeout: 20000 }).catch(() => {});
  ok(new URL(pp.url()).pathname === "/client" && (await prefs()).start === "timeline", "start page: Decide later opens Timeline and changes nothing", pp.url());
  await pc.close(); await ctx.close();
}

// the client's Account page (2026-11-09): the password change, on the phone: refused in words, changed only with the
// current password, said only once done. Then signing out and in again, which lands on Timeline.
{
  const MOCK = "http://127.0.0.1:3996";   // the rig's mock mail service (as rig/client-onboarding-check.mjs)
  const NEW = "rig-access-check-only-changed-1";
  const sentBefore = MOCK ? (await (await fetch(`${MOCK}/_rig/sent`)).json()).length : 0;
  const other = await grant(EMAIL);   // a second device, signed in before the change
  const ctx = await browser.newContext({ viewport: viewportOf(390), hasTouch: true }); await ctx.addCookies([cookie(cs)]);
  const page = await ctx.newPage(); let dialogs = 0; page.on("dialog", async (d) => { dialogs += 1; await d.dismiss(); });
  try {
  await page.goto(`${B}/client/account`, { waitUntil: "load" }); await page.waitForSelector('[data-tab="account"]', { timeout: 15000 }); await settled(page);
  const cur = page.locator('input[name="current"]'), nxt = page.locator('input[name="next"]'), go = page.locator("[data-change-password]");
  await go.click();
  ok(/Enter your current password/.test(await page.locator("[data-password-error]").innerText().catch(() => "")), "client account: an empty form is refused in words");
  await cur.fill(PASSWORD); await nxt.fill("short"); await go.click();
  ok(/at least 10 characters/.test(await page.locator("[data-password-error]").innerText().catch(() => "")), "client account: a short new password is refused");
  await cur.fill("rig-access-check-only-wrong"); await nxt.fill(NEW); await go.click(); await page.locator("[data-password-error]").waitFor({ timeout: 15000 }).catch(() => {});
  ok(/isn't your current password/.test(await page.locator("[data-password-error]").innerText().catch(() => "")) && await page.locator("[data-password-changed]").count() === 0, "client account: a wrong current password is refused by the server, and nothing says changed");
  ok((await grant(EMAIL)).access_token, "…and the password is still the old one");
  await cur.fill(PASSWORD); await nxt.fill(NEW); await go.click(); await page.locator("[data-password-changed]").waitFor({ timeout: 20000 }).catch(() => {});
  const said = await page.locator("[data-password-changed]").innerText().catch(() => "");
  ok(/Password changed\./.test(said) && /other devices are signed out/.test(said), "client account: the right current password changes it, and the page says so once the server has", said.slice(0, 120));
  ok(await cur.inputValue() === "" && await nxt.inputValue() === "", "…the fields are emptied");
  const withOld = await grant(EMAIL);
  const withNew = await (await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "content-type": "application/json" }, body: JSON.stringify({ email: EMAIL, password: NEW }) })).json();
  ok(!withOld.access_token && Boolean(withNew.access_token), "…the old password no longer signs in; the new one does");
  const refreshed = await (await fetch(`${SB}/auth/v1/token?grant_type=refresh_token`, { method: "POST", headers: { apikey: ANON, "content-type": "application/json" }, body: JSON.stringify({ refresh_token: other.refresh_token }) })).json();
  ok(!refreshed.access_token, "…the second device's session is ended (it cannot refresh)", refreshed.error_code ?? refreshed.msg ?? "");
  await page.reload({ waitUntil: "load" }); await page.waitForSelector('[data-tab="account"]', { timeout: 15000 }).catch(() => {});
  ok(new URL(page.url()).pathname === "/client/account", "…and this device stays signed in", page.url());
  if (MOCK) {
    let note = null; for (let i = 0; i < 40 && !note; i += 1) { note = (await (await fetch(`${MOCK}/_rig/sent`)).json()).slice(sentBefore).find((e) => [].concat(e.to).includes(EMAIL) && /password was changed/i.test(e.subject)); if (!note) await sleep(250); }
    ok(Boolean(note) && /^Clearway </.test(String(note?.from)) && /A note went to/.test(said), "…the client is told by email, from the brand's sender", note ? `${note.from} · ${note.subject}` : "none");
  }
  // signing out from the page, then the old password back for the rest of this check
  await page.locator("[data-signout]").click(); await page.waitForURL(/\/login/, { timeout: 15000 }).catch(() => {});
  ok(new URL(page.url()).pathname === "/login", "client account: Sign out goes to the sign-in page", page.url());
  const after = await page.goto(`${B}/client/account`, { waitUntil: "load" });
  ok(new URL(page.url()).pathname === "/login" && after?.status() === 200, "…and the account page then asks for a sign-in");
  // the frame, opened signed out, says so and draws no flights
  await page.goto(`${B}/digital-wall/timeline/?in=client&page=timeline`, { waitUntil: "load" }); await page.waitForSelector("[data-client-signed-out]", { timeout: 20000 }).catch(() => {});
  ok(await page.locator("[data-client-signed-out]").count() === 1 && await page.locator("[data-client-surface]").count() === 0, "the frame's own address, signed out: the signed-out notice, no surface");
  // the sign-in page itself, typed as a person does, with the new password: Timeline is where this client lands (their choice)
  await page.goto(`${B}/login`, { waitUntil: "load" }); await settled(page);
  await page.locator('input[type="email"]').first().fill(EMAIL); await page.locator('input[type="password"]').first().fill(NEW); await page.keyboard.press("Enter");
  await page.waitForURL((x) => new URL(x).pathname.startsWith("/client"), { timeout: 20000 }).catch(() => {});
  await page.waitForSelector("[data-client-shell]", { timeout: 20000 }).catch(() => {});
  await frameOf(page).locator('[data-client-page="timeline"]').waitFor({ timeout: 30000 }).catch(() => {});
  ok(new URL(page.url()).pathname === "/client" && await frameOf(page).locator('[data-client-page="timeline"]').count() === 1, "client sign-in: the sign-in page, with the new password, lands on Timeline", page.url());
  ok(dialogs === 0, "client account: no browser dialog at any point", dialogs);
  } catch (e) { ok(false, "client account: the password walk ran to its end", String(e?.message ?? e).split("\n")[0]); }
  finally { await ctx.close().catch(() => {}); await svc(`/auth/v1/admin/users/${uid}`, { method: "PUT", body: JSON.stringify({ password: PASSWORD }) }); }   // the rig password back, whatever happened
  cs = await grant(EMAIL);
  ok(Boolean(cs.access_token), "(the rig password is back for the rest of this check)");
}

// the retired areas (2026-11-10): /client/airports and /client/documents are not pages of a client's any more, with or
// without the old switches on their row; a 404 in the client's own words
{
  const before = (await (await svc(`/rest/v1/clients?user_id=eq.${uid}&select=switches`)).json())[0]?.switches ?? [];
  const get = async (p) => { const res = await fetch(`${B}${p}`, { headers: { cookie: cookieHeader(cs) }, redirect: "manual" }); return { status: res.status, text: await res.text() }; };
  const r1 = await Promise.all(["/client/airports", "/client/documents"].map(get));
  ok(r1.every((x) => x.status === 404 && /data-client-notfound/.test(x.text)), "Airports and Documents: 404 to the client, in their own not-found page", r1.map((x) => x.status).join(" "));
  await svc(`/rest/v1/clients?user_id=eq.${uid}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ switches: [...new Set([...before, ...RETIRED_SWITCH_KEYS])] }) });
  await sleep(11_000);   // the client's scope is cached ten seconds
  try {
    const r2 = await Promise.all(["/client/airports", "/client/documents"].map(get));
    ok(r2.every((x) => x.status === 404), "…and still 404 with the retired switches written on their row (a retired switch grants nothing)", r2.map((x) => x.status).join(" "));
    const me = await (await fetch(`${B}/api/client/me`, { headers: { cookie: cookieHeader(cs) } })).json();
    ok(Array.isArray(me.switches) && !me.switches.some((k) => RETIRED_SWITCH_KEYS.includes(k)), "…and their own standing lists neither retired switch", (me.switches ?? []).join(","));
    const t = await get("/client");
    ok(t.status === 200 && /data-menu="\/client \/client\/flights \/client\/account \/client\/settings"/.test(t.text), "…and the menu stays the four", /data-menu="([^"]*)"/.exec(t.text)?.[1]);
  } finally {
    await svc(`/rest/v1/clients?user_id=eq.${uid}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ switches: before }) });
  }
}

// ask for access: the public page renders at both sizes
{
  const ctx = await browser.newContext({ viewport: viewportOf(390) }); const page = await ctx.newPage();
  await page.goto(`${B}/request-access`, { waitUntil: "load" }); await page.waitForSelector("[data-request-access]", { timeout: 20000 });
  ok(await page.getByLabel("Company *").count() === 1 && await page.locator("[data-you-are]").count() === 2 && await page.locator("[data-note]").count() === 1, "ask for access: name, company (required), email, You are, note — no password, no trip or registration field");
  ok(!(await page.content()).includes("trip number") && await page.getByText("Send request").count() === 1, "ask for access: the button says Send request");
  ok(await noOverflow(page), "ask for access 390: no horizontal scroll");
  await page.screenshot({ path: `${OUT}/client-request-390.png`, fullPage: true });
  await ctx.close();
  const l = await browser.newContext({ viewport: viewportOf(1440) }); const lp = await l.newPage();
  await lp.goto(`${B}/login`, { waitUntil: "load" }); await settled(lp);
  ok(await lp.locator("[data-client-ask]").count() === 1 && await lp.getByText("Ask for access").count() >= 1, "sign-in: the operators-and-brokers block with Ask for access");
  await lp.screenshot({ path: `${OUT}/client-signin-1440.png` });
  await l.close();
}

// ── Display settings (2026-11-11): the ops look cards on the client's own profile, desk and phone, light and dark ──
{
  cs = await grant(EMAIL);
  for (const [theme, width] of [["light", 1440], ["dark", 390]]) {
    const ctx = await browser.newContext({ viewport: viewportOf(width), colorScheme: theme, hasTouch: PHONE(width) });
    await ctx.addCookies([cookie(cs)]); await ctx.addInitScript((t) => { try { localStorage.setItem("cw-theme", t); } catch {} }, theme);
    const page = await ctx.newPage();
    await page.goto(`${B}/client/account`, { waitUntil: "load" });
    await page.waitForSelector("[data-display-settings]", { timeout: 20000 }).catch(() => {});   // the account page streams in after the standing is read
    ok(await page.locator("[data-display-settings]").count() === 1, `${theme} ${width}: Account links to the display settings`, page.url());
    await page.locator("[data-display-settings]").click();
    await page.waitForURL(/\/client\/settings/, { timeout: 15000 }).catch(() => {});
    await frameOf(page).locator("[data-client-settings]").waitFor({ timeout: 30000 });
    await frameOf(page).locator("[data-client-settings] .cws-cards > *", { hasText: /Wall font/ }).first().waitFor({ timeout: 30000 }).catch(() => {});   // the last card draws after its own reads
    const cards = await frameOf(page).locator("[data-client-settings] .cws-cards > *").evaluateAll((els) => els.map((el) => (el.querySelector("h2, h3, h4") || el).textContent.trim().slice(0, 40)));
    ok(/Display scale/.test(cards.join("|")) && /Hour spacing/.test(cards.join("|")) && /Vertical sizing/.test(cards.join("|")) && /Horizontal sizing/.test(cards.join("|")) && /Chips/.test(cards.join("|")) && /Colours|Colors/i.test(cards.join("|")) && /font/i.test(cards.join("|")), `${theme} ${width}: the ops look cards are all there (scale, hour spacing, vertical, horizontal, chips, colours, font)`, cards.join(" | ").slice(0, 160));
    ok(await frameOf(page).locator("[data-view-preview]").count() === 1 && await frameOf(page).locator("[data-reset-view]").count() === 1, `${theme} ${width}: a live preview and a Reset to default button`);
    // the page scrolls (2026-11-12: it could not): the last section's reset button comes into view by wheel, and the
    // side list jumps to a section on the desk; on the phone the sections fold and the last one opens
    const fd = frameDoc(page);
    if (PHONE(width)) { await frameOf(page).locator('[data-settings-section="font"] .cws-section-toggle').click(); }
    else { await frameOf(page).locator('[data-jump="font"]').click(); await page.waitForTimeout(700); }
    await frameOf(page).locator('[data-reset-section="font"]').scrollIntoViewIfNeeded().catch(() => {});
    const reach = fd ? await fd.evaluate(() => { const b = document.querySelector('[data-reset-section="font"]'); if (!b) return null; const r = b.getBoundingClientRect(); return { inView: r.top >= 0 && r.bottom <= window.innerHeight, scrollY: window.scrollY, docScrolls: getComputedStyle(document.documentElement).overflowY !== "hidden" }; }) : null;
    ok(Boolean(reach?.inView) && reach.docScrolls && reach.scrollY > 0, `${theme} ${width}: the last section (Font) is reachable by scrolling, and the document itself scrolls`, JSON.stringify(reach));
    const sections = await frameOf(page).locator("[data-settings-section]").evaluateAll((els) => els.map((e) => e.getAttribute("data-settings-section")));
    ok(sections.join(",") === "scale,hour,vertical,horizontal,chips,colours,font", `${theme} ${width}: the ops wall's sections, in its order`, sections.join(","));
    if (!PHONE(width)) { const stuck = fd ? await fd.evaluate(() => { const p = document.querySelector("[data-view-preview]"); const r = p.getBoundingClientRect(); return r.top >= 0 && r.top < 80; }) : false; ok(stuck, `${theme} ${width}: the preview stays in view while scrolled to the last section`); }
    // one section's reset puts only its keys back
    await fetch(`${B}/digital-wall/api/client/view`, { method: "PUT", headers: { cookie: cookieHeader(cs), "content-type": "application/json" }, body: JSON.stringify({ settings: { scale: 1.7, timeZoom: 1.4 } }) });
    await page.reload({ waitUntil: "load" }); await frameOf(page).locator("[data-client-settings]").waitFor({ timeout: 30000 });
    if (PHONE(width)) await frameOf(page).locator('[data-settings-section="hour"] .cws-section-toggle').click();
    await frameOf(page).locator('[data-reset-section="hour"]').click(); await frameOf(page).locator("[data-reset-said]").waitFor({ timeout: 15000 }).catch(() => {});
    const afterSec = await fetch(`${B}/digital-wall/api/client/view`, { headers: { cookie: cookieHeader(cs) } }).then((r) => r.json());
    ok(afterSec.settings?.timeZoom === afterSec.defaults?.timeZoom && afterSec.settings?.scale === 1.7, `${theme} ${width}: Reset this section puts back only that section (hour spacing), the scale stays`, JSON.stringify({ timeZoom: afterSec.settings?.timeZoom, scale: afterSec.settings?.scale }));
    // a change saves on the account: set the scale through the slider's own route and read it back at the wall
    const before = await fetch(`${B}/digital-wall/api/client/view`, { headers: { cookie: cookieHeader(cs) } }).then((r) => r.json());
    const put = await fetch(`${B}/digital-wall/api/client/view`, { method: "PUT", headers: { cookie: cookieHeader(cs), "content-type": "application/json" }, body: JSON.stringify({ settings: { scale: 1.55, upcomingHorizonHours: 99 } }) }).then((r) => r.json());
    const after = await fetch(`${B}/digital-wall/api/client/view`, { headers: { cookie: cookieHeader(cs) } }).then((r) => r.json());
    ok(before.ok && put.ok && after.settings?.scale === 1.55 && after.source === "account", `${theme} ${width}: a saved setting is read back from the client's own profile`, JSON.stringify({ before: before.settings?.scale, after: after.settings?.scale, source: after.source }));
    ok(!("upcomingHorizonHours" in (after.settings ?? {})) && put.settings?.upcomingHorizonHours === undefined, `${theme} ${width}: the visibility window is not a client's to set (ignored)`);
    const theirs = await fetch(`${B}/digital-wall/api/display/settings`, { headers: { cookie: cookieHeader(cs) } });
    ok(theirs.status === 404, `${theme} ${width}: the ops settings route stays 404 to a client`, theirs.status);
    await page.reload({ waitUntil: "load" }); await frameOf(page).locator("[data-client-settings]").waitFor({ timeout: 30000 }); await page.waitForTimeout(600);
    await shot(page, `${OUT}/client-settings-${theme}-${width}.png`, width, { whole: true });
    const reset = await fetch(`${B}/digital-wall/api/client/view`, { method: "DELETE", headers: { cookie: cookieHeader(cs) } }).then((r) => r.json());
    ok(reset.ok && reset.source === "default" && reset.settings?.scale !== 1.55, `${theme} ${width}: Reset puts the ops wall's default back`, JSON.stringify({ scale: reset.settings?.scale, source: reset.source }));
    await ctx.close();
  }
}

// ── The status screens (2026-11-11): one shared screen for not-found, refused, for-admins and the link states ──
{
  const shots = [];
  for (const [theme, width] of [["light", 1440], ["dark", 390]]) {
    const ctx = await browser.newContext({ viewport: viewportOf(width), colorScheme: theme, hasTouch: PHONE(width) });
    await ctx.addInitScript((t) => { try { localStorage.setItem("cw-theme", t); } catch {} }, theme);
    const page = await ctx.newPage();
    const see = async (path, kind, what, who = null) => {
      if (who) await ctx.addCookies([cookie(who)]);
      await page.goto(`${B}${path}`, { waitUntil: "load" });
      await page.waitForSelector(`[data-status-screen="${kind}"]`, { timeout: 15000 }).catch(() => {});
      const r = await page.evaluate((k) => { const el = document.querySelector(`[data-status-screen="${k}"]`); if (!el) return null; const a = el.querySelector("[data-status-action]"); const logo = el.querySelector("svg[role=img]"); const cs = logo ? getComputedStyle(logo) : null; return { title: el.querySelector("h1")?.textContent ?? "", action: a?.textContent ?? "", href: a?.getAttribute("href") ?? "", logo: Boolean(logo), logoColor: cs?.color ?? "", centred: (() => { const r = el.getBoundingClientRect(); const p = el.parentElement.getBoundingClientRect(); return Math.abs((r.left + r.width / 2) - (p.left + p.width / 2)) < 8; })() }; }, kind);   // centred in its container (inside the staff frame, the content area; alone, the page)
      ok(Boolean(r) && r.logo && r.title.length > 0 && r.action.length > 0 && r.centred, `${theme} ${width}: ${what} — one status screen, centred, with the logo, a headline and one button`, r ? `${r.title} → ${r.action} ${r.href}` : "no status screen");
      if (r) shots.push({ kind, logoColor: r.logoColor, theme });
      await page.screenshot({ path: `${OUT}/status-${kind}-${theme}-${width}.png` });
      return r;
    };
    // staff see the portal's not-found and forbidden; a client gets their own not-found for anything outside their world
    const nf = await see("/no-such-page-at-all", "not-found", "a page that does not exist (staff)", admin);
    ok(nf?.href === "/", "the not-found button goes to the start (the person's own front door)", nf?.href);
    await see("/forbidden", "forbidden", "a page a role does not cover (staff)", admin);
    await ctx.clearCookies();
    const cnf = await see("/client/airports", "client-not-found", "a client reaching a page outside their account", cs);
    ok(cnf?.href === "/" && /Your flights/.test(cnf?.action ?? ""), "the client's not-found button is Your flights, to their start page", cnf?.action);
    await ctx.clearCookies();
    await see("/welcome?token=not-a-real-token", "link-unknown", "a set-password link nobody knows");
    await ctx.close();
  }
  const dark = shots.filter((x) => x.theme === "dark"), light = shots.filter((x) => x.theme === "light");
  const lum = (c) => { const m = c.match(/\d+/g) || [0, 0, 0]; return (Number(m[0]) + Number(m[1]) + Number(m[2])) / 3; };
  ok(dark.length > 0 && dark.every((x) => lum(x.logoColor) > 160) && light.every((x) => lum(x.logoColor) < 100), "the Clearway logo on the status screens is light on the dark theme and dark on the light theme", JSON.stringify({ dark: dark[0]?.logoColor, light: light[0]?.logoColor }));
}

// ── Nothing may overlap (2026-11-12): every client page at 1280, 1440, 1920 and 390, light and dark, with the board
// full, with every aircraft hidden (the empty words in the lanes), and the status screens ──
{
  cs = await grant(EMAIL);
  const PAGES = ["/client", "/client/flights", "/client/account", "/client/settings"];
  for (const theme of ["light", "dark"]) for (const width of [1280, 1440, 1920, 390]) {
    const ctx = await browser.newContext({ viewport: viewportOf(width), colorScheme: theme, hasTouch: PHONE(width) });
    await ctx.addCookies([cookie(cs)]); await ctx.addInitScript((t) => { try { localStorage.setItem("cw-theme", t); } catch {} }, theme);
    const page = await ctx.newPage();
    for (const path of PAGES) {
      await page.goto(`${B}${path}`, { waitUntil: "load" });
      if (path !== "/client/account") { await frameOf(page).locator("[data-client-surface]").waitFor({ timeout: 30000 }).catch(() => {}); await frameOf(page).locator("[data-board] [data-fid], [data-flight-row], [data-client-settings]").first().waitFor({ timeout: 30000 }).catch(() => {}); }
      await settled(page); await page.waitForTimeout(400);
      const shell = await textOverlaps(page, { ignore: ["iframe"] });
      const fd = frameDoc(page); const inner = fd ? await textOverlaps(fd, { ignore: [".cwp-scrim", "[data-pax-sheet]"] }) : [];
      const clipped = fd ? await clippedText(fd) : [];
      ok(shell.length === 0 && inner.length === 0, `${theme} ${width} ${path}: no two text boxes overlap (shell and frame)`, [...shell, ...inner].map((o) => `"${o.a}" × "${o.b}" ${o.x}×${o.y}px`).join(" · "));
      ok(clipped.length === 0, `${theme} ${width} ${path}: no text is cut without an ellipsis`, clipped.map((c) => `"${c.t}" +${c.over}px`).join(" · "));
      if (path === "/client" && (width === 1440 || width === 390)) await shot(page, `${OUT}/overlap-${path.replace(/\//g, "_") || "_client"}-${theme}-${width}.png`, width);
    }
    // the empty board: hide every aircraft, the words sit in the lanes below the hour row
    if (width === 1440 || width === 390) {
      await page.goto(`${B}/client`, { waitUntil: "load" }); const fr = frameOf(page);
      await fr.locator("[data-board] [data-fid]").first().waitFor({ timeout: 30000 }).catch(() => {});
      await fr.locator("[data-operators-button]").click(); await fr.locator("[data-op-switch]").first().waitFor({ timeout: 10000 }).catch(() => {});
      const ops = await fr.locator("[data-op-switch]").count(); for (let i = 0; i < ops; i++) { const sw = fr.locator("[data-op-switch]").nth(i); if ((await sw.getAttribute("aria-checked")) === "true") await sw.click(); }
      await fr.locator('[data-empty="all-hidden"]').first().waitFor({ timeout: 15000 }).catch(() => {});
      if (!PHONE(width)) { await page.keyboard.press("Escape").catch(() => {}); await fr.locator("[data-operators-button]").click().catch(() => {}); }
      await settled(page); await page.waitForTimeout(300);
      const fd = frameDoc(page); const inner = fd ? await textOverlaps(fd, { ignore: [".cwp-scrim", "[data-operators-panel]"] }) : [];
      const geo = fd ? await fd.evaluate(() => { const e = document.querySelector('[data-empty="all-hidden"]'); const b = document.querySelector("[data-board]"); return e && b ? { top: e.getBoundingClientRect().top - b.getBoundingClientRect().top, boardH: b.getBoundingClientRect().height } : null; }) : null;
      ok(inner.length === 0, `${theme} ${width}: the empty board (every aircraft hidden) overlaps nothing`, inner.map((o) => `"${o.a}" × "${o.b}"`).join(" · "));
      ok(Boolean(geo) && geo.boardH >= 200, `${theme} ${width}: the empty board keeps a sensible height`, JSON.stringify(geo));
      await shot(page, `${OUT}/overlap-empty-${theme}-${width}.png`, width);
      await fr.locator("[data-hidden-chip] [data-show-all], [data-operators-panel] [data-show-all]").first().click().catch(() => {});
    }
    await ctx.close();
  }
  for (const [theme, width] of [["light", 1440], ["dark", 390]]) {
    const ctx = await browser.newContext({ viewport: viewportOf(width), colorScheme: theme }); await ctx.addInitScript((t) => { try { localStorage.setItem("cw-theme", t); } catch {} }, theme);
    const page = await ctx.newPage(); await ctx.addCookies([cookie(admin)]);
    for (const [path, kind] of [["/no-such-page-at-all", "not-found"], ["/forbidden", "forbidden"]]) {
      await page.goto(`${B}${path}`, { waitUntil: "load" }); await page.waitForSelector(`[data-status-screen="${kind}"]`, { timeout: 15000 }).catch(() => {});
      const o = await textOverlaps(page); ok(o.length === 0, `${theme} ${width} ${kind}: the status screen overlaps nothing`, o.map((x) => `"${x.a}" × "${x.b}"`).join(" · "));
    }
    await ctx.close();
  }
}

// change, then remove through the page: the row stays, emptied
{
  const ctx = await browser.newContext({ viewport: viewportOf(1440) }); await ctx.addCookies([cookie(admin)]); const page = await ctx.newPage();
  await page.goto(`${B}/admin/clients`, { waitUntil: "load" }); await page.waitForSelector("[data-client-approved]", { timeout: 20000 }); await settled(page);
  await page.locator("[data-change]").first().click(); await page.waitForSelector("[data-client-editor]", { timeout: 10000 });
  await page.locator('[data-switch="weather"]').click(); await page.locator("[data-approve]").click(); await settled(page);
  const changed = await (await svc(`/rest/v1/clients?user_id=eq.${uid}&select=switches`)).json();
  ok(!changed[0]?.switches.includes("weather"), "Change: a switch turned off is saved", JSON.stringify(changed[0]?.switches));
  ok(await page.locator('[data-decision="changed"]').count() >= 1, "the decision log shows CHANGED");
  await page.locator("[data-change]").first().click(); await page.waitForSelector("[data-client-editor]", { timeout: 10000 });
  await page.getByRole("button", { name: "Remove access" }).first().click(); await settled(page);
  ok(await page.locator("[data-remove-confirm]").isDisabled(), "Remove: confirm is disabled until the company is typed");
  await page.getByLabel("Company name to confirm").fill(COMPANY);
  ok(await page.locator("[data-remove-confirm]").isEnabled(), "Remove: typing the company enables it");
  await page.screenshot({ path: `${OUT}/client-admin-remove.png` });
  await page.locator("[data-remove-confirm]").click(); await settled(page);
  const gone = await (await svc(`/rest/v1/clients?user_id=eq.${uid}&select=status,scope,switches`)).json();
  ok(gone[0]?.status === "removed" && gone[0]?.scope.length === 0 && gone[0]?.switches.length === 0, "Removed: the row stays, emptied", JSON.stringify(gone[0]));
  const au = await (await svc(`/auth/v1/admin/users/${uid}`)).json();
  ok(au.app_metadata?.is_approved === false && au.app_metadata?.client_status === "removed", "Removed: the account is not approved, status removed", JSON.stringify(au.app_metadata));
  cs = await grant(EMAIL);
  const c2 = await browser.newContext({ viewport: viewportOf(1440) }); await c2.addCookies([cookie(cs)]); const p2 = await c2.newPage();
  const resp = await p2.goto(`${B}/`, { waitUntil: "load" });
  ok(p2.url().includes("/client/removed") && resp && resp.status() === 200, "the removed client lands on the removed page", p2.url());
  // the client's layout reads their standing on the server (2026-11-04), so the page streams in after a blank skeleton: wait for it
  await p2.waitForSelector("[data-client-hold]", { timeout: 15000 }).catch(() => {});
  ok(await p2.locator("[data-client-hold]").count() === 1 && await p2.locator("[data-cw-sidebar]").count() === 0 && await p2.locator("[data-client-shell]").count() === 0, "the removed page: shell-less (no portal shell, no client shell, no menu), with Sign out");
  await p2.screenshot({ path: `${OUT}/client-removed-1440.png` });
  await c2.close(); await ctx.close();
}
await browser.close();
console.log(failures ? `${failures} FAILED` : "ALL PASSED");
process.exit(failures ? 1 : 0);
