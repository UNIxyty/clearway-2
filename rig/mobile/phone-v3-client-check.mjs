// The phone app (v3) as a CLIENT: /digital-wall/phone/ through the rig's sign-in shell (:3989), signed in as an
// invented client account. What it proves: the client rules hold on the phone (only granted flights; no checklist, no
// staff notes or actions, no agent, AIP or documents; passengers only with the switch; the operator and aircraft
// filter and the start page are saved on the ACCOUNT); the staff code is never downloaded (every request of every
// client session is looked at); ?view=flights and #account are honoured and staff page names are ignored; a flight
// outside the grants reads exactly like a flight that never was; the support address shows when the setting has one;
// and every client screen passes the phone rules at 390 and 360 px, light and dark.
//   node --env-file=.env.rig rig/mobile/phone-v3-client-check.mjs     (ONLY=first,flight runs some parts)
// Needs rig/up.sh and rig/shell.sh (the sign-in shell) and the built wall pages. Staff: phone-v3-check.mjs.
// The account, its row and the support-address setting are this check's own; what it changes it puts back.
import { chromium } from "playwright";
import { settled, until } from "../lib/settle.mjs";
import {
  APP, OUT, COMBOS, makeOk, phoneContext, openApp, tap, gone, count, firePoll, auditLayer, viewportMeta, metaIsFine,
  feedControl, steady, denseFeed, editFlight, textOf, parts,
} from "./phone-v3-lib.mjs";

const SB = process.env.NEXT_PUBLIC_SUPABASE_URL, ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(String(SB))) { console.error("Refused: the rig's local Supabase only."); process.exit(2); }
const B = process.env.RIG_SIGNIN_BASE || "http://127.0.0.1:3989";
const EMAIL = "rig-phone-v3@rig.invalid", PERSON = "Rig Phone Person", COMPANY = "Rig Phone Charter Co", PASSWORD = "rig-access-check-only";
const HELP = "rig-phone-help@rig.invalid";                      // an invented support address, set and taken off again below
const OPR = "cwy-cwy", GRANTED = ["LY-TST", "LY-TSU"];          // the grants: two aircraft of the rig's operator, not the other two
const ALL_ON = ["flight_board", "weather", "notams", "radar"];
const H = { apikey: SVC, authorization: `Bearer ${SVC}`, "content-type": "application/json" };
const svc = (path, init = {}) => fetch(`${SB}${path}`, { ...init, headers: { ...H, ...(init.headers ?? {}) } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T0 = Math.floor(Date.now() / 60_000) * 60_000;
const near = (b) => steady(b, T0);
const { ok, state } = makeOk();
const part = parts(ok);
const shot = (page, name) => page.screenshot({ path: `${OUT}/phone-v3-client-${name}.png` }).catch(() => {});
const closeFlight = async (page) => { await tap(page, '[data-flight-sheet] button[aria-label="Close flight"]'); return gone(page, "[data-open-flight]"); };
const closeSheet = async (page, name) => { await tap(page, `[data-sheet="${name}"] [role=dialog] button[aria-label="Close"]`); return gone(page, `[data-sheet="${name}"]`); };
const backTo = async (page, from) => { await tap(page, `[data-page="${from}"] [data-back]`); return gone(page, `[data-page="${from}"]`); };
const view = (page) => page.locator("[data-phone-app]").first().getAttribute("data-current-view").catch(() => null);
const prefsOf = (page) => page.evaluate(() => fetch("/api/client/prefs", { cache: "no-store" }).then((r) => r.json()).then((d) => d.prefs || null).catch(() => null));
const pathOf = (page) => { const u = new URL(page.url()); return `${u.pathname}${u.search}${u.hash}`; };

// ── the account: an approved client who may see two aircraft, with names of passengers
let r = await svc("/auth/v1/admin/users", { method: "POST", body: JSON.stringify({ email: EMAIL, password: PASSWORD, email_confirm: true, user_metadata: { full_name: PERSON }, app_metadata: { role: "client", is_approved: true, client_status: "approved" } }) });
let u = await r.json(); if (!r.ok) { const list = await (await svc("/auth/v1/admin/users?page=1&per_page=200")).json(); u = (list.users ?? []).find((x) => x.email === EMAIL); }
if (!u?.id) { console.error("The rig's sign-in service did not make the account."); process.exit(1); }
const uid = u.id;
const resetAccount = () => svc(`/auth/v1/admin/users/${uid}`, { method: "PUT", body: JSON.stringify({ password: PASSWORD, user_metadata: { full_name: PERSON, client_prefs: null }, app_metadata: { role: "client", is_approved: true, client_status: "approved" } }) });
await resetAccount();
// the account's saved view (start page, filter) emptied; the password is left alone, since changing it ends every session
const clearPrefs = () => svc(`/auth/v1/admin/users/${uid}`, { method: "PUT", body: JSON.stringify({ user_metadata: { full_name: PERSON, client_prefs: null } }) });
const scope = GRANTED.map((value) => ({ kind: "registration", value }));
const rowOf = (extra = {}) => ({ user_id: uid, email: EMAIL, person_name: PERSON, company: COMPANY, kind: "operator", note: "", status: "approved", scope, switches: ALL_ON, passenger_level: "names", consent: true, decided_at: new Date().toISOString(), decision_note: "", ...extra });
const existing = await (await svc(`/rest/v1/clients?user_id=eq.${uid}&select=id`)).json();
if (existing[0]) await svc(`/rest/v1/clients?id=eq.${existing[0].id}`, { method: "PATCH", body: JSON.stringify(rowOf()) });
else await svc("/rest/v1/clients", { method: "POST", body: JSON.stringify(rowOf()) });
const setRow = async (patch) => { await svc(`/rest/v1/clients?user_id=eq.${uid}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(patch) }); await sleep(11_000); };   // the wall keeps a client's grants for ten seconds
// the support address is a setting other checks set too: remember it, and put it back at the end
const helpWas = (await (await svc("/rest/v1/app_settings?key=eq.clients.support_email&select=value")).json().catch(() => []))?.[0]?.value ?? null;
const setHelp = (email) => svc("/rest/v1/app_settings?on_conflict=key", { method: "POST", headers: { prefer: "resolution=merge-duplicates" }, body: JSON.stringify({ key: "clients.support_email", value: { email }, updated_by_email: "rig/phone-v3-client-check" }) });
await setHelp("");
await sleep(11_000);

const session = await (await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "content-type": "application/json" }, body: JSON.stringify({ email: EMAIL, password: PASSWORD }) })).json();
ok(Boolean(session?.access_token), "the invented client account signs in on the rig");
if (!session?.access_token) { console.log("\n1 FAILED"); process.exit(1); }
const cookie = { name: `sb-${new URL(SB).hostname.split(".")[0]}-auth-token`, value: `base64-${Buffer.from(JSON.stringify(session)).toString("base64")}`, url: B };

const browser = await chromium.launch();
const asked = [];                                               // every request of every client session, for the last part
/** A phone signed in as the client, the feed under the suite's hand, and the app open. */
async function start({ theme = "light", width = 390, path = APP, feed = near, before = null, wait } = {}) {
  const ctx = await phoneContext(browser, { theme, width });
  await ctx.addCookies([cookie]);
  ctx.on("request", (q) => asked.push(q.url()));
  const fc = await feedControl(ctx);
  fc.change = feed;
  if (before) await before(ctx, fc);
  const { page, errors } = await openApp(ctx, B, path, wait === undefined ? {} : { wait });
  return { ctx, fc, page, errors };
}
const api = (page, path) => page.evaluate((p) => fetch(p, { cache: "no-store" }).then(async (res) => ({ status: res.status, body: await res.json().catch(() => null) })).catch(() => ({ status: 0, body: null })), path);

// what the wall itself gives this client (asked with the client's own session)
let OUTSIDE = null, AIR = null, PLAIN = null, OTHER = null;
const feed0 = await fetch(`${B}/digital-wall/api/timeline/flights`, { headers: { cookie: `${cookie.name}=${cookie.value}` } }).then((x) => x.json()).catch(() => null);
const mine = (feed0?.aircraft || []).flatMap((a) => (a.flights || []).map((f) => ({ ...f, reg: a.registration, id: `${a.oprId}:${f.flightNid}` }))).filter((f) => !f.isCnl);
const regs0 = [...new Set((feed0?.aircraft || []).map((a) => a.registration))].sort();

// ════════════════════════════════════════════════════════════════════════════ first run, and where the account starts
await part("first", async () => {
  const s = await start({});
  const { page } = s;
  ok(new URL(page.url()).pathname.replace(/\/$/, "") === "/digital-wall/phone" && await page.locator("[data-phone-app]").getAttribute("data-role") === "client", "a signed-in client at /digital-wall/phone/ gets the phone app, as a client", `${pathOf(page)} · role ${await page.locator("[data-phone-app]").getAttribute("data-role").catch(() => null)}`);
  ok(metaIsFine(await viewportMeta(page)), "the page does not zoom by itself and does not block zoom", await viewportMeta(page));
  ok(await count(page, "[data-onboarding]") === 1 && await count(page, "[data-onboarding-choice]") === 2, "first visit: the account has no start page yet, so the phone asks (Timeline or Flights)", await textOf(page, "[data-onboarding]"));
  await auditLayer(ok, page, "onboarding 390 light", "[data-onboarding]", { theme: "light", shot: "phone-v3-client-onboarding-390-light" });
  // a save the server refuses: words, and the app does not go on as if it had been saved
  await s.ctx.route(/\/api\/client\/prefs/, (route) => (route.request().method() === "PUT" ? route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ ok: false, error: "rig: refused" }) }) : route.fallback()));
  await tap(page, '[data-onboarding-choice="flights"]'); await tap(page, '[data-onboarding-open="flights"]');
  await page.waitForFunction(() => (document.querySelector("[data-onboarding-note]")?.textContent || "").trim().length > 3, null, { timeout: 8000 }).catch(() => {});
  ok(await count(page, "[data-onboarding]") === 1 && (await textOf(page, "[data-onboarding-note]")).length > 3 && !/rig: refused/.test(await textOf(page, "[data-onboarding]")), "a start page the server did not save: plain words say so and the question stays", await textOf(page, "[data-onboarding-note]"));
  await s.ctx.unroute(/\/api\/client\/prefs/);
  await tap(page, '[data-onboarding-open="flights"]'); await gone(page, "[data-onboarding]");
  ok(await count(page, "[data-onboarding]") === 0 && await view(page) === "flights" && await count(page, "[data-flight-row]") >= 1, "choosing Flights opens the flights list", `view ${await view(page)}`);
  ok((await prefsOf(page))?.start === "flights", "the choice is saved on the account", JSON.stringify(await prefsOf(page)));
  // the grants, as the wall cuts them (and the browser gets the same answer)
  const feed = (await api(page, "/digital-wall/api/timeline/flights"))?.body;
  const regs = [...new Set((feed?.aircraft || []).map((a) => a.registration))].sort();
  ok(mine.length >= 2 && regs0.length >= 1 && regs0.every((x) => GRANTED.includes(x)) && regs.join() === regs0.join(), "the wall gives this client only the aircraft granted to them", `${regs.join(", ")} · ${mine.length} flights`);
  await s.ctx.close();

  // another phone, the same account: no question, and it starts where the account says
  const again = await start({});
  ok(await count(again.page, "[data-onboarding]") === 0 && await view(again.page) === "flights", "another phone on the same account starts on Flights without being asked: the start page belongs to the account", `view ${await view(again.page)}`);
  await again.ctx.close();
});
if (mine.length < 2) { ok(false, "the client has flights to look at (rig/up.sh, and the wall's grants)", `${mine.length}`); await browser.close(); console.log(`\n${state.n} checks · ${state.failures} FAILED`); process.exit(1); }
AIR = mine.find((f) => f.movementState === "airborne") || mine[0];
PLAIN = mine.find((f) => f !== AIR && !["airborne", "arrived"].includes(f.movementState)) || mine[1];
OTHER = mine.find((f) => f !== AIR && f !== PLAIN) || mine[1];
// a flight of the same operator on an aircraft NOT granted (asked from the rig's staff side, where sign-in is off)
{
  const staffFeed = await fetch(`${process.env.RIG_SHELL_URL || "http://127.0.0.1:3999"}/digital-wall/api/timeline/flights?allOperators=true&refresh=false`).then((x) => x.json()).catch(() => null);
  const out = (staffFeed?.aircraft || []).filter((a) => !GRANTED.includes(a.registration)).flatMap((a) => (a.flights || []).map((f) => ({ ...f, reg: a.registration, id: `${a.oprId}:${f.flightNid}` })));
  OUTSIDE = out[0] || null;
  ok(Boolean(OUTSIDE), "the rig has a flight outside this client's grants to try", OUTSIDE ? `${OUTSIDE.reg}` : "none");
}

// ════════════════════════════════════════════════════════════════════════════ the grants, the addresses, the rail
await part("scope", async () => {
  const s = await start({ path: `${APP}?view=timeline` });
  const { page } = s;
  await tap(page, '[data-rail-btn="timeline"]', "[data-pill]");
  await tap(page, '[data-bottom-bar] [data-seg="DAY"]', '[data-range="DAY"]');
  const pills = await page.evaluate(() => [...document.querySelectorAll("[data-pill]")].map((p) => p.getAttribute("data-pill")));
  ok(pills.length === mine.length && mine.every((f) => pills.includes(f.flightNo)) && !(OUTSIDE && pills.includes(OUTSIDE.flightNo)), "the timeline shows the granted flights and no other", `${pills.join(" ")}${OUTSIDE ? ` · not ${OUTSIDE.flightNo}` : ""}`);
  const rail = await page.evaluate(() => [...document.querySelectorAll("[data-rail-btn]")].map((b) => b.getAttribute("data-rail-btn")));
  ok(rail.join(",") === "timeline,flights,settings,account", "the rail of a client: Timeline, Flights, Settings, Account; no Wall menu", rail.join(","));
  ok(await count(page, "[data-checks-grid]") + await count(page, "[data-menu-row]") + await count(page, "[data-more-item]") === 0, "no staff control is drawn on the first screen");
  await shot(page, "timeline-390-light");
  await tap(page, '[data-rail-btn="flights"]', "[data-flight-row]");
  const rows = await page.evaluate(() => [...document.querySelectorAll("[data-flight-row]")].map((x) => x.getAttribute("data-flight-row")));
  ok(rows.length >= mine.length && rows.every((id) => mine.some((f) => f.id === id)), "the flights list has the granted flights and no other", `${rows.length} rows`);
  await shot(page, "list-390-light");
  await s.ctx.close();

  // the addresses
  const ctx = (await start({ wait: "[data-flight-row], [data-pill]" })).ctx;
  const visit = async (path, wait) => { const o = await openApp(ctx, B, path, wait ? { wait } : {}); return o.page; };
  let p = await visit(`${APP}?view=flights`);
  ok(await view(p) === "flights" && await count(p, "[data-flight-row]") >= 1, "?view=flights opens the flights list for a client", `view ${await view(p)}`);
  await p.close();
  p = await visit(`${APP}?view=timeline`);
  ok(await view(p) === "timeline" && await count(p, "[data-pill]") >= 1, "?view=timeline opens the timeline, whatever the account's start page", `view ${await view(p)}`);
  await p.close();
  p = await visit(`${APP}#account`, '[data-page="account"]');
  ok(await count(p, '[data-page="account"][data-account="client"]') === 1, "#account opens the Account page for a client");
  ok(await backTo(p, "account") && await count(p, "[data-page]") === 0 && await count(p, "[data-flight-row], [data-pill]") >= 1, "Back from it leads to the first screen");
  await p.close();
  for (const name of ["more", "notam", "limits", "important", "operators", "aircraft", "caa", "reports", "wall-settings", "service-status"]) {
    p = await visit(`${APP}#${name}`);
    const fine = await count(p, "[data-page]") === 0 && await count(p, "[data-staff-console]") === 0 && await count(p, "[data-flight-row], [data-pill]") >= 1 && new URL(p.url()).hash === "";
    ok(fine, `the staff page name #${name} is ignored for a client: the first screen, and the name is taken off the address`, `${await count(p, "[data-page]")} page(s) · ${pathOf(p)}`);
    await p.close();
  }

  // a flight outside the grants reads exactly like a flight that never was
  const words = async (id) => { const q = await visit(`${APP}?flight=${encodeURIComponent(id)}`, "[data-flight-gone], [data-open-flight]"); await q.waitForSelector("[data-flight-gone]", { timeout: 15000 }).catch(() => {}); const t = (await textOf(q, "[data-flight-gone]")).replace(/\d\d:\d\dZ?/g, "hh:mm"); const n = await count(q, "[data-flight-sheet] [data-flight-callsign]"); await shot(q, `flight-gone-${id.replace(/\W+/g, "-")}`); await q.close(); return { t, n }; };
  if (OUTSIDE) {
    const out = await words(OUTSIDE.id), never = await words(`${OPR}:999999`);
    ok(out.t.length > 10 && /no longer on the schedule/.test(out.t) && out.t === never.t, "a link to a flight outside the grants says the same as a link to a flight that never was", `outside: ${out.t} · never: ${never.t}`);
    ok(!out.t.includes(OUTSIDE.flightNo) && !out.t.includes(OUTSIDE.reg) && out.n === 0, "and it names neither the flight nor its aircraft");
    const info = await api((await start({})).page, `/digital-wall/api/flight-info?flightNid=${OUTSIDE.flightNid}&oprId=${OPR}`);
    ok(info.status === 404 || info.status === 403, "the wall refuses that flight's details to this client", `status ${info.status}`);
  }
  p = await visit(`${APP}?flight=${encodeURIComponent(PLAIN.id)}`, "[data-open-flight]");
  const old = await p.evaluate(() => fetch("/m/wall", { cache: "no-store" }).then((x) => ({ status: x.status, at: new URL(x.url).pathname })).catch(() => ({ status: 0, at: "" })));
  ok(old.status === 404, "the portal's old phone address /m/wall stays closed to a client, as every portal page is (404)", `${old.status} ${old.at}`);
  const lim = await api(p, "/digital-wall/api/timeline/limitations");
  ok(lim.status === 404 && !Array.isArray(lim.body?.limitations), "the ops notes are not granted to this client: the wall answers the app's ask for limitations with 404", `status ${lim.status}`);
  ok(await count(p, `[data-open-flight="${PLAIN.id}"]`) === 1 && (await textOf(p, "[data-flight-callsign]")).includes(PLAIN.flightNo), "a link to a granted flight opens it", await textOf(p, "[data-flight-callsign]"));
  await p.close();
  await ctx.close();
});

// ════════════════════════════════════════════════════════════════════════════ the flight a client sees
const NAMES = ["Invented Passenger One", "Invented Passenger With A Very Long Family Name Of Many Letters Two", "I. Three"];
const paxStandIn = (ctx) => ctx.route(/\/digital-wall\/api\/flight-passengers/, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, count: NAMES.length, passengers: NAMES.map((name, i) => ({ id: `rig-${i}`, name })), readAt: new Date().toISOString() }) }));
const STAFF_ONLY = ["[data-checks-grid]", "[data-open-services]", "[data-open-limits]", "[data-flight-foot]", "[data-mark-checked]", "[data-staff-failed]", "[data-open-checks]", "[data-passenger-viewer]"];

await part("flight", async () => {
  const s = await start({ path: `${APP}?view=timeline` });
  const { page } = s;
  await tap(page, '[data-bottom-bar] [data-seg="DAY"]', '[data-range="DAY"]');
  await tap(page, `[data-pill="${AIR.flightNo}"]`, "[data-open-flight]");
  await settled(page, { timeout: 8000 });
  ok(await count(page, `[data-open-flight="${AIR.id}"]`) === 1 && (await textOf(page, "[data-flight-callsign]")).includes(AIR.flightNo), "one tap on a pill opens the flight", await textOf(page, "[data-flight-callsign]"));
  const there = []; for (const sel of STAFF_ONLY) if (await count(page, sel)) there.push(sel);
  ok(there.length === 0, "the flight has no checks grid, no Service status, no Limitations button, no Mark checked, no staff passenger viewer", there.join(" "));
  ok(!/checklist|mark checked|service status|ops agent|leon/i.test(await textOf(page, "[data-open-flight]")), "and none of their words, nor the scheduling system's name");
  ok(await count(page, 'button[data-airport][data-side="dep"]') === 1 && await count(page, 'button[data-airport][data-side="arr"]') === 1 && await count(page, "[data-open-map]") === 1 && await count(page, "[data-open-pax]") === 1, "with the switches on: both airports open, the Map button and the Passengers button are there");
  await shot(page, "flight-390-light");

  // an airport: weather and NOTAMs, to read only
  await tap(page, 'button[data-airport][data-side="dep"]', '[data-sheet="airport"] [role=dialog]');
  await page.waitForSelector("[data-airport-sheet] [data-weather], [data-airport-sheet] [data-weather-none], [data-airport-sheet] [data-notam]", { timeout: 10000 }).catch(() => {});
  ok(await count(page, '[data-airport-tabs] [data-seg="wx"]') === 1 && await count(page, '[data-airport-tabs] [data-seg="notams"]') === 1, "one tap on an airport opens its sheet: Weather and NOTAMs");
  await tap(page, '[data-airport-tabs] [data-seg="notams"]'); await page.waitForSelector("[data-airport-sheet] [data-notam], [data-notams-none], [data-notams-failed]", { timeout: 8000 }).catch(() => {});
  ok(await count(page, "[data-airport-sheet] [data-notam]") >= 1 && await count(page, "[data-airport-sheet] [data-new]") === 0 && await count(page, "[data-airport-sheet] [data-ack], [data-airport-sheet] [data-mark-airport]") === 0, "the NOTAMs of the airport are listed, with nothing to mark or acknowledge", `${await count(page, "[data-airport-sheet] [data-notam]")} NOTAMs at ${AIR.adep?.icao}`);
  await shot(page, "sheet-airport-notams-390-light");
  await closeSheet(page, "airport");

  // the map
  await tap(page, "[data-open-map]", "[data-flight-map]");
  ok(await count(page, "[data-flight-map]") === 1 && /no live position/i.test(await textOf(page, "[data-flight-map]")), "the Map button opens the map; it says there is no live position", (await textOf(page, "[data-flight-map]")).slice(0, 90));
  await shot(page, "flight-map-390-light");
  await tap(page, "[data-map-back]"); await gone(page, "[data-flight-map]");

  // passengers: what the wall answers for this client, names at most
  await tap(page, "[data-open-pax]", '[data-sheet="passengers"] [role=dialog]');
  await page.waitForSelector("[data-pax-row], [data-pax-none], [data-pax-failed]", { timeout: 12000 }).catch(() => {});
  const real = await textOf(page, '[data-sheet="passengers"]');
  ok(await count(page, '[data-sheet="passengers"]') === 1 && /shares names only/.test(real) && (await count(page, "[data-pax-row]") >= 1 || await count(page, "[data-pax-none]") === 1), "the Passengers button opens the client's sheet: names only, or ‘none entered yet’", real.slice(0, 140));
  ok(!/passport|nationality|date of birth|expires|document no/i.test(real.replace("Documents stay with the ops team.", "")) && await count(page, '[data-sheet="passengers"] button:not([aria-label="Close"])') === 0, "no document, and nothing to tap that could show one");
  await closeSheet(page, "passengers");
  ok(await closeFlight(page) && await count(page, "[data-pill]") >= mine.length, "closing the flight returns to the timeline");
  await s.ctx.close();

  // with names to show (a stand-in answers with invented ones)
  const n = await start({ path: `${APP}?flight=${encodeURIComponent(PLAIN.id)}`, before: paxStandIn, wait: "[data-open-flight]" });
  await tap(n.page, "[data-open-pax]", "[data-pax-row]");
  ok(await count(n.page, "[data-pax-row]") === NAMES.length && (await textOf(n.page, '[data-sheet="passengers"]')).includes(NAMES[0]), "names the wall gives are listed, one row each", `${await count(n.page, "[data-pax-row]")} rows`);
  await auditLayer(ok, n.page, "sheet passengers 390 light", '[data-sheet="passengers"]', { theme: "light", shot: "phone-v3-client-sheet-passengers-390-light" });
  await n.ctx.close();
});

// ════════════════════════════════════════════════════════════════════════════ with every switch off
await part("switches", async () => {
  await setRow({ switches: ["flight_board"], passenger_level: "off" });
  try {
    const s = await start({ path: `${APP}?flight=${encodeURIComponent(PLAIN.id)}`, wait: "[data-open-flight]" });
    const { page } = s;
    await settled(page, { timeout: 8000 });
    ok(await count(page, `[data-open-flight="${PLAIN.id}"]`) === 1, "with only the flight board granted, the flight still opens");
    ok(await count(page, "[data-open-pax]") === 0, "passengers switched off: no Passengers button");
    ok(await count(page, "button[data-airport]") === 0 && await count(page, "[data-wx-cat]") === 0, "weather and NOTAMs switched off: the airports are words, not buttons, with no weather mark", `${await count(page, "button[data-airport]")} buttons`);
    ok(await count(page, "[data-open-map]") === 0, "the map switched off: no Map button");
    const pax = await api(page, `/digital-wall/api/flight-passengers?flightNid=${PLAIN.flightNid}&oprId=${OPR}`);
    ok(pax.status !== 200 && !Array.isArray(pax.body?.passengers), "and the wall itself refuses the passengers of that flight", `status ${pax.status}`);
    await shot(page, "flight-bare-390-light");
    await closeFlight(page);
    await tap(page, '[data-rail-btn="account"]', '[data-page="account"]');
    ok(await count(page, '[data-account-passengers="off"]') === 1, "the Account page says passengers are not shared", await textOf(page, "[data-account-passengers]"));
    await s.ctx.close();
  } finally { await setRow({ switches: ALL_ON, passenger_level: "names" }); }
});

// ════════════════════════════════════════════════════════════════════════════ the filter and the start page, on the account
await part("account-prefs", async () => {
  const s = await start({ path: `${APP}?view=timeline` });
  const { page } = s;
  await tap(page, '[data-bottom-bar] [data-seg="DAY"]', '[data-range="DAY"]');
  const HIDE = OTHER.reg !== AIR.reg ? OTHER.reg : GRANTED.find((g) => g !== AIR.reg);
  await tap(page, "[data-filter-btn]", '[data-sheet="filter"]');
  const listed = await page.evaluate(() => [...document.querySelectorAll("[data-filter-aircraft]")].map((x) => x.getAttribute("data-filter-aircraft")));
  ok(listed.length === GRANTED.length && listed.every((x) => GRANTED.includes(x)) && await count(page, "[data-filter-operator]") === 1, "the filter lists the client's operator and aircraft, and no other", listed.join(", "));
  await shot(page, "sheet-filter-390-light");
  await tap(page, `[data-filter-aircraft="${HIDE}"] [role=switch]`);
  await until(async () => ((await prefsOf(page))?.hidden?.registrations || []).includes(HIDE), { timeout: 8000 }).catch(() => {});
  ok(((await prefsOf(page))?.hidden?.registrations || []).includes(HIDE) && await page.locator(`[data-filter-aircraft="${HIDE}"] [role=switch]`).getAttribute("aria-checked") === "false", "switching an aircraft off saves it on the account", JSON.stringify((await prefsOf(page))?.hidden));
  await closeSheet(page, "filter");
  const left = mine.filter((f) => f.reg !== HIDE).length;
  ok(await count(page, "[data-pill]") === left && await count(page, "[data-filter-banner]") === 1, "its flights leave the timeline, and a line says one aircraft is hidden", `${await count(page, "[data-pill]")} pills · ${await textOf(page, "[data-filter-banner]")}`);
  await s.ctx.close();

  const again = await start({ path: `${APP}?view=timeline` });
  await tap(again.page, '[data-bottom-bar] [data-seg="DAY"]', '[data-range="DAY"]');
  ok(await count(again.page, "[data-pill]") === left && await count(again.page, "[data-filter-banner]") === 1, "another phone on the account has the same aircraft hidden: the filter belongs to the account", `${await count(again.page, "[data-pill]")} pills`);
  // a save the server refuses: the switch goes back and words say so
  await again.ctx.route(/\/api\/client\/prefs/, (route) => (route.request().method() === "PUT" ? route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ ok: false, error: "rig: refused" }) }) : route.fallback()));
  await tap(again.page, "[data-filter-btn]", '[data-sheet="filter"]');
  await tap(again.page, `[data-filter-aircraft="${HIDE}"] [role=switch]`);
  await again.page.waitForSelector("[data-filter-failed]", { timeout: 8000 }).catch(() => {});
  ok(await count(again.page, "[data-filter-failed]") >= 1 && /back as it was/.test(await textOf(again.page, "[data-filter-failed]")) && await again.page.locator(`[data-filter-aircraft="${HIDE}"] [role=switch]`).getAttribute("aria-checked") === "false", "a filter change the server did not save: words say so and the switch is back as it was", await textOf(again.page, "[data-filter-failed]"));
  await again.ctx.unroute(/\/api\/client\/prefs/);
  // the whole operator off, then everything back
  await tap(again.page, '[data-filter-switch="operator"]');
  await until(async () => ((await prefsOf(again.page))?.hidden?.operators || []).includes(OPR), { timeout: 8000 }).catch(() => {});
  ok(((await prefsOf(again.page))?.hidden?.operators || []).includes(OPR), "switching the operator off saves that on the account too", JSON.stringify((await prefsOf(again.page))?.hidden));
  await closeSheet(again.page, "filter");
  ok(await count(again.page, "[data-pill]") === 0 && await count(again.page, '[data-empty="filtered"]') === 1, "with everything hidden the timeline says so, with a way back", await textOf(again.page, "[data-empty]"));
  await shot(again.page, "filtered-empty-390-light");
  await tap(again.page, '[data-empty="filtered"] button');
  await until(async () => { const h = (await prefsOf(again.page))?.hidden; return !(h?.operators || []).length && !(h?.registrations || []).length; }, { timeout: 8000 }).catch(() => {});
  const h = (await prefsOf(again.page))?.hidden;
  ok(await count(again.page, "[data-pill]") === mine.length && !(h?.operators || []).length && !(h?.registrations || []).length, "‘Show all aircraft’ brings every flight back and clears the account's filter", JSON.stringify(h));

  // Settings: the start page is the account's; the desk display has its own page
  await tap(again.page, '[data-rail-btn="settings"]', '[data-page="settings"]');
  ok(await count(again.page, '[data-settings-row="desktop-display"]') === 1 && /\/client\/settings$/.test(await again.page.locator('[data-settings-row="desktop-display"]').getAttribute("href") || ""), "Settings links to the desk timeline's display settings", await again.page.locator('[data-settings-row="desktop-display"]').getAttribute("href").catch(() => "none"));
  ok(await count(again.page, '[data-settings-control="notify-services"]') === 0 && await count(again.page, '[data-settings-control="notify-delays"]') === 1, "the notification switches of a client have no ‘Service confirmations’");
  await tap(again.page, '[data-settings-control="start"] [data-seg="timeline"]');
  await until(async () => (await prefsOf(again.page))?.start === "timeline", { timeout: 8000 }).catch(() => {});
  ok((await prefsOf(again.page))?.start === "timeline" && await again.page.locator('[data-settings-control="start"] [data-seg="timeline"]').getAttribute("aria-checked") === "true", "the start page chosen in Settings is saved on the account", JSON.stringify(await prefsOf(again.page)));
  await tap(again.page, '[data-settings-control="theme"] [data-seg="dark"]');
  ok(await again.page.locator("[data-phone-app]").getAttribute("data-cw3") === "dark", "the theme changes at once");
  await tap(again.page, '[data-settings-control="theme"] [data-seg="light"]');
  await tap(again.page, '[data-settings-row="clocks"]', '[data-page="clocks"]');
  ok(await count(again.page, '[data-page="clocks"]') === 1 && await backTo(again.page, "clocks"), "World clocks opens from Settings and Back returns");
  await again.ctx.close();
  const third = await start({});
  ok(await view(third.page) === "timeline" && await count(third.page, "[data-pill]") >= 1, "the next visit starts on the timeline");
  await third.ctx.close();
});

// ════════════════════════════════════════════════════════════════════════════ notifications, the Account page, the support address
await part("account", async () => {
  const s = await start({ path: `${APP}?view=timeline` });
  const { page, fc } = s;
  await tap(page, "[data-bell]", '[data-sheet="notifications"]');
  ok(await count(page, "[data-notif-empty]") === 1, "the bell opens the notifications; with no news it says so", await textOf(page, "[data-notif-empty]"));
  await closeSheet(page, "notifications");
  // one flight departs, one is cancelled: a client hears of the departure only
  fc.change = (b) => editFlight(editFlight(near(b), PLAIN.flightNid, (x) => ({ ...x, movementState: "airborne", isAirborne: true })), OTHER.flightNid, (x) => ({ ...x, isCnl: true, status: "CANCELLED" }));
  await until(async () => { await firePoll(page); return (await count(page, "[data-bell] [data-badge]")) === 1; }, { timeout: 20000, every: 1500 }).catch(() => {});
  await tap(page, "[data-bell]", '[data-sheet="notifications"]');
  ok(await count(page, '[data-notif="DEP"]') === 1 && await count(page, '[data-notif="CNX"]') === 0 && await count(page, '[data-notif="NTM"]') === 0, "a departure is announced; a cancellation and NOTAM rounds are not (staff matters)", `${await count(page, "[data-notif]")} item(s): ${await textOf(page, "[data-notif]")}`);
  await shot(page, "notifications-390-light");
  await page.locator('[data-notif="DEP"]').first().click(); await page.waitForSelector("[data-open-flight]", { timeout: 8000 }).catch(() => {});
  ok(await count(page, `[data-open-flight="${PLAIN.id}"]`) === 1 && await count(page, '[data-sheet="notifications"]') === 0, "one tap on it closes the sheet and opens that flight");
  await closeFlight(page);
  fc.change = near;

  // the Account page (no support address set)
  await tap(page, '[data-rail-btn="account"]', '[data-page="account"]');
  const acc = '[data-page="account"]';
  ok((await textOf(page, "[data-account-you]")).includes(EMAIL) && (await textOf(page, "[data-account-company]")).includes(COMPANY) && /Client · view only/.test(await textOf(page, "[data-account-access]")), "Account says who is signed in, the company, and ‘Client · view only’", `${await textOf(page, "[data-account-you]")} · ${await textOf(page, "[data-account-access]")}`);
  ok(await count(page, "[data-account-grant]") === 1 && (await textOf(page, "[data-account-grant]")).includes(GRANTED[0]) && (await textOf(page, "[data-account-grant]")).includes(GRANTED[1]), "it lists what the client can see: the operator and the granted aircraft", await textOf(page, "[data-account-grant]"));
  ok(await count(page, '[data-account-passengers="on"]') === 1 && await count(page, "[data-signout]") === 1 && await count(page, "[data-account-profile]") === 0, "passengers ‘on’, a Sign out button, and no staff profile link", await textOf(page, "[data-account-passengers]"));
  ok(await count(page, `${acc} a[href^="mailto:"]`) === 0 && !/@/.test((await textOf(page, acc)).replace(EMAIL, "")) && (await textOf(page, acc)).includes("Granted by Clearway ops."), "no support address set: no address is shown and no ‘write to’ link; the footer has the company's name only", (await textOf(page, acc)).slice(-90));
  await shot(page, "page-account-390-light");
  await tap(page, "[data-account-password]", '[data-sheet] [data-password-form]');
  ok(await count(page, "[data-password-form]") === 1 && await count(page, "[data-change-password]") === 1 && await count(page, '[data-password-form] input[type="password"]') >= 2, "Change password opens its sheet with the fields");
  await auditLayer(ok, page, "sheet password 390 light", "[data-sheet]:has([data-password-form])", { theme: "light", shot: "phone-v3-client-sheet-password-390-light" });
  await page.keyboard.press("Escape"); await gone(page, "[data-password-form]");
  ok(await count(page, "[data-password-form]") === 0, "Escape closes it, nothing changed");
  await s.ctx.close();

  // with a support address
  await setHelp(HELP);
  try {
    await sleep(1500);
    const w = await start({ path: `${APP}#account`, wait: '[data-page="account"]' });
    await until(async () => { const me = await api(w.page, "/api/client/me"); return me.body?.supportEmail === HELP; }, { timeout: 30000, every: 2000 }).catch(() => {});
    await w.page.reload({ waitUntil: "load" }); await w.page.waitForSelector(`${acc} a[href^="mailto:"]`, { timeout: 15000 }).catch(() => {}); await settled(w.page);
    ok(await w.page.locator(`${acc} a[href^="mailto:"]`).getAttribute("href").catch(() => "") === `mailto:${HELP}`, "with a support address set, Account says where to write, as a link", await w.page.locator(`${acc} a[href^="mailto:"]`).getAttribute("href").catch(() => "none"));
    const whole = await textOf(w.page, acc);
    ok(whole.split(HELP).length >= 3, "and the footer line has the address after the company's name", whole.slice(-110));
    await auditLayer(ok, w.page, "page account with address 390 light", acc, { theme: "light", shot: "phone-v3-client-page-account-address-390-light" });
    await w.ctx.close();
  } finally { await setHelp(""); }
});

// ════════════════════════════════════════════════════════════════════════════ a broken part
await part("boundary", async () => {
  const s = await start({ path: `${APP}#account`, wait: '[data-page="account"]' });
  const { page } = s;
  await page.evaluate(() => { window.__CW_THROW__ = "phone/page/account"; window.dispatchEvent(new Event("cw-throw-probe")); });
  await page.waitForSelector('[data-page="account"] [data-part-failed]', { timeout: 8000 }).catch(() => {});
  ok(await count(page, '[data-page="account"] [data-part-failed]') === 1 && /This part failed\./.test(await textOf(page, "[data-part-failed]")) && await page.locator('[data-page="account"] [data-back]').isVisible(), "a page whose body breaks says ‘This part failed.’ with Reload; its bar and Back stay", await textOf(page, "[data-part-failed]"));
  await shot(page, "part-failed-page-390-light");
  await page.evaluate(() => { window.__CW_THROW__ = ""; });
  await tap(page, '[data-page="account"] [data-part-reload]', "[data-account-you]");
  ok(await count(page, "[data-account-you]") === 1 && await count(page, "[data-part-failed]") === 0, "Reload draws it again");
  await backTo(page, "account");
  ok(await count(page, "[data-pill], [data-flight-row]") >= 1, "and the rest of the app worked all along");
  await s.ctx.close();
});

// ════════════════════════════════════════════════════════════════════════════ every client screen, four phones
// A busy day made of the client's own flights (copies, two at once in a lane, long callsign and registration).
const busy = (b) => denseFeed(near(b), T0);
await part("audit", async () => {
  for (const [theme, width] of COMBOS) {
    const tag = (n) => `${n} ${width} ${theme}`;
    const s = await start({ theme, width, feed: busy, before: paxStandIn, path: `${APP}?view=timeline` });
    const { page, errors } = s;
    const aud = (name, root, opts = {}) => auditLayer(ok, page, tag(name), root, { theme, shot: `phone-v3-client-${name.replace(/[^a-z0-9]+/gi, "-")}-${width}-${theme}`, ...opts });
    const sheetAud = async (name, opener, sheet = name) => {
      await tap(page, opener, `[data-sheet="${sheet}"] [role=dialog]`);
      if (await count(page, `[data-sheet="${sheet}"]`) === 0) { ok(false, `${tag(name)}: the sheet opens`); return; }
      await aud(`sheet ${name}`, `[data-sheet="${sheet}"]`);
      await closeSheet(page, sheet);
    };
    await tap(page, '[data-bottom-bar] [data-seg="12H"]', '[data-range="12H"]');
    await aud("timeline", "[data-phone-column]");
    await sheetAud("filter", "[data-filter-btn]");
    await sheetAud("notifications", "[data-bell]");
    await tap(page, '[data-rail-btn="flights"]', "[data-flight-row]");
    await aud("flights list", "[data-phone-column]");
    await tap(page, `[data-flight-row="${PLAIN.id}"]`, "[data-open-flight]");
    await settled(page, { timeout: 8000 });
    await aud("flight", "[data-open-flight]");
    await tap(page, 'button[data-airport][data-side="dep"]', '[data-sheet="airport"] [role=dialog]');
    await tap(page, '[data-airport-tabs] [data-seg="notams"]'); await page.waitForSelector('[data-sheet="airport"] [data-notam], [data-notams-none]', { timeout: 8000 }).catch(() => {});
    await aud("sheet airport notams", '[data-sheet="airport"]');
    await tap(page, '[data-airport-tabs] [data-seg="wx"]'); await page.waitForSelector("[data-airport-sheet] [data-weather], [data-airport-sheet] [data-weather-none]", { timeout: 8000 }).catch(() => {});
    await aud("sheet airport weather", '[data-sheet="airport"]');
    await closeSheet(page, "airport");
    await sheetAud("passengers", "[data-open-pax]");
    await tap(page, "[data-open-map]", "[data-flight-map]"); await settled(page, { timeout: 8000 });
    await aud("flight map", "[data-flight-map]");
    await tap(page, "[data-map-back]"); await gone(page, "[data-flight-map]");
    await closeFlight(page);
    for (const name of ["settings", "account"]) {
      await tap(page, `[data-rail-btn="${name}"]`, `[data-page="${name}"]`);
      await aud(`page ${name}`, `[data-page="${name}"]`);
      if (name === "settings") { await tap(page, '[data-settings-row="clocks"]', '[data-page="clocks"]'); await aud("page clocks", '[data-page="clocks"]'); await backTo(page, "clocks"); }
      await backTo(page, name);
    }
    ok(errors.length === 0, `${tag("the whole walk")}: no error on the page`, errors.slice(0, 3).join(" · "));
    await s.ctx.close();
  }
  // nothing granted is flying: the words for an empty day, and the first question in the dark at 360
  const e = await start({ theme: "dark", width: 360, path: `${APP}?view=timeline`, before: (_c, fc) => { fc.mode = "empty"; } });
  await auditLayer(ok, e.page, "timeline with no flights 360 dark", "[data-phone-column]", { theme: "dark", shot: "phone-v3-client-empty-timeline-360-dark" });
  ok(await count(e.page, "[data-empty]") === 1 && !/leon/i.test(await textOf(e.page, "[data-empty]")), "an empty day says so in plain words", await textOf(e.page, "[data-empty]"));
  await e.ctx.close();
});

// ════════════════════════════════════════════════════════════════════════════ asked again when the account has no start page
await part("onboarding", async () => {
  await clearPrefs();
  const o = await start({ theme: "dark", width: 360 });
  ok(await count(o.page, "[data-onboarding]") === 1, "an account with no start page is asked again");
  await auditLayer(ok, o.page, "onboarding 360 dark", "[data-onboarding]", { theme: "dark", shot: "phone-v3-client-onboarding-360-dark" });
  await tap(o.page, '[data-onboarding-choice="timeline"]'); await tap(o.page, '[data-onboarding-open="timeline"]'); await gone(o.page, "[data-onboarding]");
  await until(async () => (await prefsOf(o.page))?.start === "timeline", { timeout: 8000 }).catch(() => {});
  ok(await count(o.page, "[data-onboarding]") === 0 && await view(o.page) === "timeline" && (await prefsOf(o.page))?.start === "timeline", "choosing Timeline opens the timeline and saves it", `view ${await view(o.page)} · ${JSON.stringify(await prefsOf(o.page))} · ${await textOf(o.page, "[data-onboarding-note]").catch(() => "")}`);
  await o.ctx.close();
});

// ════════════════════════════════════════════════════════════════════════════ what the client's browser asked for
await part("requests", async () => {
  const paths = [...new Set(asked.map((x) => { try { const v = new URL(x); return v.pathname; } catch { return x; } }))];
  const chunks = paths.filter((x) => /\/assets\/[^/]+\.(js|css)$/.test(x)).map((x) => x.split("/").pop());
  const STAFF_CHUNK = /^(staff|staffFlight|ConsoleApp|ConsoleGate|OperatorsPage|AircraftPage|CaaPage|ReportsPage|SettingsPage|NotamCheckPage|LimitationsPage|ImportantPage|FlightsPage|WebhooksPage|DisplayApp|Board|passenger-viewer)-/;
  const badChunks = chunks.filter((x) => STAFF_CHUNK.test(x));
  ok(chunks.some((x) => /^PhoneApp-/.test(x)) && badChunks.length === 0, "in all these client sessions the browser never asked for the staff, console or display code", badChunks.length ? badChunks.join(" ") : `${chunks.length} files of the app, e.g. ${chunks.filter((x) => /\.js$/.test(x)).slice(0, 6).join(" ")}`);
  const STAFF_API = /\/api\/(flight-services|flight-checks|notam-check|limitations|important|caa|reports|operators|webhooks|agent|aip|intake|documents)(\/|$)|\/api\/passenger|\/console\//;
  const badApis = paths.filter((x) => STAFF_API.test(x));
  const apis = paths.filter((x) => /\/api\//.test(x));
  ok(badApis.length === 0, "nor for a staff read: no service status, checks, NOTAM round, staff lists, reports, agent, AIP or documents", badApis.length ? badApis.join(" ") : `${apis.length} API paths`);
  console.log(`      every API path asked: ${apis.join(" ")}`);
  console.log(`      every file of the app asked: ${chunks.join(" ")}`);
});

await browser.close();
// what this check set, put back: the support address as it was, the account's view preferences empty
await clearPrefs();
if (helpWas && typeof helpWas === "object") await svc("/rest/v1/app_settings?on_conflict=key", { method: "POST", headers: { prefer: "resolution=merge-duplicates" }, body: JSON.stringify({ key: "clients.support_email", value: helpWas, updated_by_email: "rig/phone-v3-client-check" }) });
console.log(`\n${state.n} checks · ${state.failures ? `${state.failures} FAILED` : "all passed"}`);
process.exit(state.failures ? 1 : 0);
