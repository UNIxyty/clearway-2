// What a client's browser is GIVEN of a flight, not what the page draws (2026-11-09). Until this check a client's feed
// carried each flight as the ops wall keeps it: 55 fields, with ops' notes matched to the flight (Limitations, Important
// entries, CAA contacts, unreviewed NOTAM and weather markers), ops' check marks, the checklist colours and the weather
// pills — whatever the client's switches said. The page drew none of it; the browser had all of it.
// Now a flight is a list of fields (digital-wall/lib/client-scope.mjs › CLIENT_FLIGHT_FIELDS, plus the weather category
// of each airport with the Weather switch: CLIENT_FLIGHT_SWITCH_FIELDS). Since 2026-11-15 the notes never come, at any
// setting: Limitations, Important notices, CAA details, service status and the NOTAM check are the ops room's own, their
// switches are retired, and their reads answer a client 404. Every read that carries flights is walked, for a client with
// the fewest switches and for one with every switch a row has ever held (the five retired ones written straight into
// the row, as an old row would have them): no flight key outside the list, no key of CLIENT_FLIGHT_NEVER at any depth of
// any answer, no word of the invented notes — which ops DO see on the same flight (the control).
// This makes its own client and its own invented notes (through the wall's API, as the rig admin),
// reads every feed as the client with the switches off and then on, looks at a flight on Flights at 1440 (the frame,
// since 2026-11-10: iframe[data-client-frame] holds the wall app's client surface) and at 390 (the phone app, where a
// client on a phone is sent since v3, 2026-11-13: /digital-wall/phone/), and removes what it made.
//   node --env-file=.env.rig rig/client-feed-check.mjs
import { chromium } from "playwright";
import fs from "node:fs";
import { settled } from "./lib/settle.mjs";
import { CLIENT_FLIGHT_FIELDS, CLIENT_FLIGHT_SWITCH_FIELDS, CLIENT_FLIGHT_NEVER, NOT_ON_ACCOUNT } from "../digital-wall/lib/client-scope.mjs";
import { isNeverPath } from "./lib/bundle-sweep.mjs";

const SB = process.env.NEXT_PUBLIC_SUPABASE_URL, ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(String(SB))) { console.error("Refused: the rig's local Supabase only."); process.exit(2); }
const B = process.env.RIG_SIGNIN_BASE || "http://127.0.0.1:3989", OUT = "rig/.scratch/shots"; fs.mkdirSync(OUT, { recursive: true });
let failures = 0; const ok = (c, what, d = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${what}${d !== "" ? `  · ${String(d).slice(0, 300)}` : ""}`); if (!c) failures += 1; };
const H = { apikey: SVC, authorization: `Bearer ${SVC}`, "content-type": "application/json" };
const svc = (p, init = {}) => fetch(`${SB}${p}`, { ...init, headers: { ...H, ...(init.headers ?? {}) } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const grant = async (email, password) => (await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "content-type": "application/json" }, body: JSON.stringify({ email, password }) })).json();
const cookieOf = (s) => `sb-${new URL(SB).hostname.split(".")[0]}-auth-token=base64-${Buffer.from(JSON.stringify(s)).toString("base64")}`;
const wall = async (s, p, init = {}) => { const r = await fetch(`${B}/digital-wall${p}`, { ...init, headers: { cookie: cookieOf(s), authorization: `Bearer ${s.access_token}`, "content-type": "application/json", ...(init.headers ?? {}) } }); const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* not JSON */ } return { status: r.status, json, text }; };
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
// A phone screenshot is the screen as the phone shows it, tab bar at the bottom, and a second one scrolled to the end
// (2026-11-09: a full-page capture drew the sticky tab bar across the middle of the page). A desk one is the window.
const shot = async (page, file, width, { whole = false } = {}) => {
  if (width >= 700) { await page.screenshot({ path: file, fullPage: whole }); return; }
  await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: file });
  const more = await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight + 40);
  if (more) { await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await page.waitForTimeout(150); await page.screenshot({ path: file.replace(/\.png$/, "-end.png") }); await page.evaluate(() => window.scrollTo(0, 0)); }
};

const EMAIL = "rig-client-feed@rig.invalid", PASSWORD = "rig-access-check-only-client-feed";
const TAG = `rig-feed-${Date.now().toString(36)}`;   // in every invented note's title, so this run finds and removes its own
const ROW = new Set(["key", "oprId", "operatorName", "registration", "acftTypeIcao", "acftTypeShortName", "flightNid", "flight"]);
// the fields a client's flight may carry with these switches on: the list, and the switch fields their switches allow
const flightFieldsFor = (switches) => new Set([...CLIENT_FLIGHT_FIELDS, ...Object.entries(CLIENT_FLIGHT_SWITCH_FIELDS).filter(([, sw]) => switches.includes(sw)).map(([k]) => k)]);
let FLIGHT = flightFieldsFor(["flight_board"]); let SWITCHED = ["flight_board"];
const NEVER = new Set(CLIENT_FLIGHT_NEVER), WX = new Set(["VFR", "MVFR", "IFR", "LIFR"]);
// every key of the never-list, at any depth of an answer: "path.to.key" for each one found
const neverKeys = (v, at = "", out = []) => { if (Array.isArray(v)) v.forEach((x, i) => neverKeys(x, `${at}[${i}]`, out)); else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) { if (NEVER.has(k)) out.push(`${at}.${k}`.replace(/\[\d+\]/g, "[]")); neverKeys(x, `${at}.${k}`, out); } return [...new Set(out)]; };
// every flight in an answer: an object with a flight id and a start time (the airports inside one are not flights)
const flightsIn = (v, out = []) => { if (Array.isArray(v)) v.forEach((x) => flightsIn(x, out)); else if (v && typeof v === "object") { if ("flightNid" in v && "startTimeUTC" in v) out.push(v); for (const [k, x] of Object.entries(v)) if (k !== "adep" && k !== "ades") flightsIn(x, out); } return out; };
// the weather category: only with the Weather switch, and only one of the four categories or null
const wxWrong = (f, switches) => ["wxDep", "wxArr"].filter((k) => k in f && (!switches.includes("weather") || !(f[k] === null || WX.has(f[k]))));
const made = { lim: null, imp: null, caa: null }; let uid = null;
const admin = await grant("rig-access-admin@rig.invalid", "rig-access-check-only");
if (!admin.access_token) { console.error("the rig's admin account cannot sign in (rig/access-accounts.mjs)"); process.exit(2); }

try {
  // ── the client: every operator the rig wall has, the required switch only ──
  const list = await (await svc("/auth/v1/admin/users?page=1&per_page=1000")).json();
  for (const u of (list.users ?? []).filter((x) => x.email === EMAIL)) { await svc(`/rest/v1/clients?user_id=eq.${u.id}`, { method: "DELETE" }); await svc(`/auth/v1/admin/users/${u.id}`, { method: "DELETE" }); }
  const u = await (await svc("/auth/v1/admin/users", { method: "POST", body: JSON.stringify({ email: EMAIL, password: PASSWORD, email_confirm: true, user_metadata: { full_name: "Rig Feed Person" }, app_metadata: { role: "client", is_approved: true, client_status: "approved" } }) })).json();
  uid = u.id;
  const ops = (await (await svc("/rest/v1/leon_operators?select=opr_id")).json()).map((o) => o.opr_id);
  await svc("/rest/v1/clients", { method: "POST", body: JSON.stringify({ user_id: uid, email: EMAIL, person_name: "Rig Feed Person", company: "Rig Feed Charter (invented)", kind: "operator", status: "approved", scope: ops.map((value) => ({ kind: "operator", value })), switches: ["flight_board"], passenger_level: "names" }) });   // names: the passengers read is a level, not a switch (step 3)
  // written with the service key, straight into the row (an old row may hold switches retired since); what the client
  // is allowed is what survives normaliseSwitches — the active ones
  const ACTIVE = ["flight_board", "weather", "notams", "radar"];
  const setSwitches = async (switches) => { await svc(`/rest/v1/clients?user_id=eq.${uid}`, { method: "PATCH", body: JSON.stringify({ switches }) }); await sleep(11_000); SWITCHED = switches.filter((k) => ACTIVE.includes(k)); FLIGHT = flightFieldsFor(SWITCHED); };   // the scope is cached ten seconds
  const c = await grant(EMAIL, PASSWORD);
  ok(Boolean(c.access_token) && ops.length > 0, "a client on every operator the rig wall has signs in", `${ops.length} operators`);

  const from = encodeURIComponent(new Date(Date.now() - 2 * 3600e3).toISOString()), to = encodeURIComponent(new Date(Date.now() + 7 * 86400e3).toISOString());
  const FEED = `/api/flights/normalized?window=all-cached&limit=500&from=${from}&to=${to}`;
  const feedOf = async (s) => (await wall(s, FEED)).json?.flights ?? [];
  const extra = (recs) => { const row = new Set(), fl = new Set(); for (const r of recs) { for (const k of Object.keys(r)) if (!ROW.has(k)) row.add(k); for (const k of Object.keys(r.flight ?? {})) if (!FLIGHT.has(k)) fl.add(k); } return { row: [...row], fl: [...fl] }; };
  // the five reads that were a client's until 2026-11-15 (Limitations ×2, Important, CAA, the NOTAM check): 404 with the one sentence
  const RETIRED_READS = ["/api/notam-check/today", "/api/timeline/limitations", "/api/limitations", "/api/important", "/api/caa"];
  const retiredReads = async (tag) => {
    const res = await Promise.all(RETIRED_READS.map(async (p) => { const r = await wall(c, p); return [p, r.status, r.json?.error === NOT_ON_ACCOUNT.error && r.json?.ok === false && Object.keys(r.json).length === 2]; }));
    ok(res.every(([, st, said]) => st === 404 && said), `${tag}: the five ops-only reads (Limitations ×2, Important, CAA, NOTAM check) answer 404 "${NOT_ON_ACCOUNT.error}" and nothing else`, res.map(([p, st, said]) => `${p} ${st}${said ? "" : " (other words)"}`).join(" · "));
  };
  // the words of the invented notes (titles and texts), as a client must never be sent them
  const SEEDED = () => [TAG, "slots required after 2200", "fuel by prior arrangement", "Landing permits", "permits@rig.invalid", "Rigland (invented)"];
  const seededIn = (text) => SEEDED().filter((w) => text.includes(w));
  // every client read that carries flights, walked as the client: exact fields, no never-key at any depth, the weather
  // rule, no word of the notes; aircraft rows are what names them
  const walkReads = async (tag, { notes = true } = {}) => {
    const reads = ["/api/timeline/flights?allOperators=true", "/api/upcoming/flights", FEED, "/api/flights/data", "/api/timeline/aircraft", "/api/aircraft/schedule", `/api/flight-info?flightNid=${target.flight.flightNid}&oprId=${encodeURIComponent(target.oprId)}`];
    let all = "";
    for (const p of reads) {
      const r = await wall(c, p); const fl = flightsIn(r.json); all += r.text;
      const beyond = [...new Set(fl.flatMap((f) => Object.keys(f)).filter((k) => !FLIGHT.has(k)))];
      const wx = [...new Set(fl.flatMap((f) => wxWrong(f, SWITCHED)))];
      const nk = neverKeys(r.json);
      const words = notes ? seededIn(r.text) : [];
      const name = p.replace(/\?.*/, "");
      ok(r.status === 200 && (fl.length >= 1 || !["/api/timeline/flights", "/api/flights/normalized", "/api/flight-info"].includes(name)) && beyond.length === 0 && wx.length === 0, `${tag}: ${name} — every flight in it is the listed fields${SWITCHED.includes("weather") ? " (and the weather category, a category or null)" : " (no weather category without Weather)"} (${fl.length} flights)`, `${r.status} · beyond: ${beyond.join(" ") || "none"} · weather: ${wx.join(" ") || "ok"}`);
      ok(r.status === 200 && nk.length === 0, `${tag}: ${name} — no key of the never-list (${CLIENT_FLIGHT_NEVER.length}: limitations, checks, notamCheck, important, caa, services, notes…) at any depth`, nk.slice(0, 6).join(" ") || "none");
      if (notes) ok(words.length === 0, `${tag}: ${name} — no title or text of the invented limitation, notice or CAA entry`, words.join(" · ") || "none");
    }
    return all;
  };

  // ── 1. the required switch only: a flight is the listed fields, with no notes at all ──
  let recs = await feedOf(c);
  ok(recs.length >= 1, "the client's feed has their flights", `${recs.length} flights`);
  let x = extra(recs);
  ok(x.row.length === 0 && x.fl.length === 0, "every flight in the feed is the listed fields and nothing else", `record: ${x.row.join(" ") || "—"} · flight: ${x.fl.join(" ") || "—"}`);
  ok(recs.every((r) => r.flight && !("limitations" in r.flight)) && recs.every((r) => !("notamCheck" in r)), "no flight carries a limitations key at all (not even an empty list), and no record a NOTAM check state", `${recs.filter((r) => r.flight && "limitations" in r.flight).length} with limitations · ${recs.filter((r) => "notamCheck" in r).length} with notamCheck`);
  // the control: the same feed as staff carries the wall's own record, so the cut means something
  const staff = await feedOf(admin);
  const staffKeys = new Set(staff.flatMap((r) => Object.keys(r.flight ?? {})));
  ok(staff.length >= recs.length && ["checks", "limitations", "checklistColor", "tripStatus"].every((k) => staffKeys.has(k)), "control: staff get the wall's own record (checks, limitations, checklist colour, trip status)", `${staffKeys.size} fields`);

  // ── 1b. the ops room's "hidden aircraft" never empties a client's board (2026-11-12: the test client saw "No aircraft
  // on your account yet" because ops had hidden KlasJet's tails on the wall) ──
  {
    const before = ((await wall(c, "/api/timeline/flights?allOperators=true")).json?.aircraft ?? []);
    const first = before[0];
    if (first) {
      const hide = await wall(admin, "/api/aircraft/visibility", { method: "PUT", body: JSON.stringify({ oprId: first.oprId, registration: first.registration, isHidden: true }) });
      const during = ((await wall(c, "/api/timeline/flights?allOperators=true")).json?.aircraft ?? []);
      const staffDuring = ((await wall(admin, "/api/timeline/flights?allOperators=true")).json?.aircraft ?? []);
      await wall(admin, "/api/aircraft/visibility", { method: "PUT", body: JSON.stringify({ oprId: first.oprId, registration: first.registration, isHidden: false }) });
      ok(hide.status === 200 && during.some((g) => g.registration === first.registration) && during.length === before.length, "an aircraft ops hid on the wall stays on the client's board (hiding is the room's display choice, not a grant)", `${before.length} → ${during.length} aircraft while hidden`);
      ok(!staffDuring.some((g) => g.registration === first.registration), "control: the same aircraft is off the ops feed while hidden", `${staffDuring.length} groups`);
    } else ok(false, "the client's board has an aircraft to hide and show", "0 aircraft");
  }

  // ── 2. invented notes on the airport of the client's first flight, made through the wall as the admin ──
  // (one the timeline's own window holds too, so the page part below finds its row on Flights)
  const boardNids = new Set(((await wall(c, "/api/timeline/flights?allOperators=true")).json?.aircraft ?? []).flatMap((g) => (g.flights ?? []).map((f) => String(f.flightNid))));
  const target = recs.find((r) => !r.flight.isCnl && r.flight.adep?.icao && boardNids.has(String(r.flight.flightNid))) ?? recs.find((r) => !r.flight.isCnl && r.flight.adep?.icao) ?? recs[0];
  const icao = target.flight.adep.icao;
  const lim = await wall(admin, "/api/timeline/limitations", { method: "POST", body: JSON.stringify({ title: `${TAG} limitation (invented)`, description: "Invented for the rig: slots required after 2200 local.", isPermanent: false, startDate: new Date(Date.now() - 86400e3).toISOString().slice(0, 10), endDate: new Date(Date.now() + 8 * 86400e3).toISOString().slice(0, 10), match: { airportIcaos: [icao] } }) });   // dated, not permanent: a permanent limitation cannot be deleted, and this check removes what it makes
  const imp = await wall(admin, "/api/important", { method: "POST", body: JSON.stringify({ title: `${TAG} notice (invented)`, body: "Invented for the rig: fuel by prior arrangement only.", reviewed: true, match: { airportIcaos: [icao] } }) });
  const caa = await wall(admin, "/api/caa", { method: "POST", body: JSON.stringify({ country: "Rigland (invented)", authorityName: `${TAG} authority (invented)`, functionText: "Landing permits", validity: "Permanent", phones: "+000 000 0000", mail: "permits@rig.invalid", reviewed: true, match: { airportIcaos: [icao] } }) });
  made.lim = lim.json?.limitation?.id ?? null; made.imp = imp.json?.entry?.id ?? null; made.caa = caa.json?.entry?.id ?? null;
  ok(Boolean(made.lim && made.imp && made.caa), `an invented limitation, notice and CAA entry are on ${icao}`, `${lim.status} ${imp.status} ${caa.status}`);
  const staffNow = (await feedOf(admin)).find((r) => r.key === target.key);
  const staffTypes = new Set((staffNow?.flight?.limitations ?? []).map((l) => l.type));
  ok(["LIM", "IMP", "CAA"].every((t) => staffTypes.has(t)), "control: staff see all three on the flight", [...staffTypes].join(" "));
  // the control for every word looked for below: ops' read of the same flight, and ops' lists, DO carry them
  const staffInfo = await wall(admin, `/api/flight-info?flightNid=${target.flight.flightNid}&oprId=${encodeURIComponent(target.oprId)}`);
  const staffLists = (await Promise.all(["/api/timeline/limitations?includeInactive=false", "/api/important", "/api/caa"].map((p) => wall(admin, p)))).map((r) => r.text).join("\n");
  ok(staffInfo.status === 200 && staffInfo.text.includes(TAG) && neverKeys(staffInfo.json).length > 0 && SEEDED().every((w) => (staffInfo.text + staffLists).includes(w)), "control: ops' read of the same flight carries the notes (and never-list keys), and ops' lists carry every word looked for", `${staffInfo.status} · never-keys ${neverKeys(staffInfo.json).length} · words ${SEEDED().filter((w) => (staffInfo.text + staffLists).includes(w)).length}/${SEEDED().length}`);

  // ── 3. still only the required switch: none of it reaches the client, by any feed ──
  recs = await feedOf(c);
  const mine = recs.find((r) => r.key === target.key);
  ok(mine && !("limitations" in mine.flight) && !JSON.stringify(recs).includes(TAG), "the notes exist: the client's feed has none of them, and their flight no limitations key");
  const info = await wall(c, `/api/flight-info?flightNid=${target.flight.flightNid}&oprId=${encodeURIComponent(target.oprId)}`);
  const infoExtra = Object.keys(info.json?.flight ?? {}).filter((k) => !FLIGHT.has(k));
  ok(info.status === 200 && infoExtra.length === 0 && !info.text.includes(TAG) && !("portalConfigured" in (info.json ?? {})) && Object.keys(info.json?.aircraft ?? {}).every((k) => ROW.has(k)), "one flight opened: the same listed fields, no notes, and of the aircraft only what names it", infoExtra.join(" "));
  await walkReads("fewest switches");
  await retiredReads("fewest switches");
  { // is the feed live: every client is told (under the flight board since 2026-11-15), as four plain facts
    const st0 = await wall(c, "/api/timeline/sync-status");
    ok(st0.status === 200 && Object.keys(st0.json ?? {}).every((k) => ["ok", "lastSyncTimestamp", "healthy", "live", "updatedAt"].includes(k)) && typeof st0.json?.live === "boolean", "/api/timeline/sync-status with the fewest switches: 200, live or not and when last updated; nothing about operators, errors or the cache", `${st0.status} · ${Object.keys(st0.json ?? {}).join(" ")}`);
  }
  ok((await wall(c, `/api/flight-checks?keys=${encodeURIComponent(target.key)}`)).status === 404, "ops' check marks (/api/flight-checks) are not a client's at any setting: 404");
  // the reference reads a client had until 2026-11-10 (Airports, AIP pages, airport search, Documents): gone for good
  const removed = ["/api/aip-pdf?icao=EVRA", "/api/airports/search?q=EVRA", "/api/geo/airports", "/api/geo/countries", "/api/countries"];
  const removedRes = await Promise.all(removed.map(async (p) => [p, (await wall(c, p)).status]));
  ok(removedRes.every(([, st]) => st === 404), "the five retired reference reads (AIP PDF, airport search, geo airports and countries, countries): 404 at any setting", removedRes.map(([p, st]) => `${p.replace(/\?.*/, "")} ${st}`).join(" · "));
  ok((await wall(c, "/api/geo/coords?icao=EVRA")).status === 404, "/api/geo/coords: 404 with the radar switch off");
  // passengers: a level (names), not a switch — the names of one of THEIR flights; a flight that is not theirs does not exist
  const pax = await wall(c, `/api/flight-passengers?flightNid=${target.flight.flightNid}&oprId=${encodeURIComponent(target.oprId)}`);
  ok(pax.status === 200 && Array.isArray(pax.json?.passengers) && (pax.json.passengers ?? []).every((p) => Object.keys(p).every((k) => ["id", "name"].includes(k))), "/api/flight-passengers for one of their flights: 200, names only (level names)", `${pax.status} · ${(pax.json?.passengers ?? []).length} names`);
  const notTheirs = await wall(c, "/api/flight-passengers?flightNid=999999999&oprId=cwy-cwy");
  ok(notTheirs.status === 404 && /not on your account/i.test(notTheirs.text), "/api/flight-passengers for a flight that is not theirs: 404, not on your account", `${notTheirs.status} ${notTheirs.text.slice(0, 60)}`);

  // ── 4. every switch a row has ever held, the five retired ones written straight into the row: still none of it ──
  // (until 2026-11-15 the Limitations, Important and CAA switches brought the notes on the flight, and the lists; they
  // are retired: an old row holding them grants nothing)
  await setSwitches(["flight_board", "weather", "notams", "radar", "limitations", "important", "caa", "service_status", "notam_check_status"]);
  { const co = await wall(c, "/api/geo/coords?icao=EVRA"); ok(co.status === 200 && co.json?.ok === true && Number.isFinite(co.json?.coords?.EVRA?.lat), "/api/geo/coords?icao=EVRA: 200 with the radar switch on, the airport's position for the map", `${co.status} ${JSON.stringify(co.json?.coords?.EVRA ?? null)}`); }
  {
    const me = await fetch(`${B}/api/client/me`, { headers: { cookie: cookieOf(c) } }).then((r) => r.json()).catch(() => null);
    ok(JSON.stringify(me?.switches ?? null) === JSON.stringify(ACTIVE), "their own standing with every old switch on the row: the four active ones only", (me?.switches ?? []).join(","));
  }
  recs = await feedOf(c);
  x = extra(recs);
  ok(recs.length >= 1 && x.row.length === 0 && x.fl.length === 0 && recs.every((r) => !("limitations" in r.flight) && !("notamCheck" in r)), "every switch on: a flight is still the listed fields (with the weather category now), no limitations key, no NOTAM check state", `record: ${x.row.join(" ") || "—"} · flight: ${x.fl.join(" ") || "—"}`);
  const everything = await walkReads("every switch");
  await retiredReads("every switch, the retired ones on the row");
  ok(!/rig-access-admin|confirmedBy|addedBy|updatedBy|"match"/.test(everything), "nothing the client is sent names who in ops wrote or confirmed a note, or what it is matched on");
  const st = await wall(c, "/api/timeline/sync-status");
  ok(st.status === 200 && Object.keys(st.json ?? {}).every((k) => ["ok", "lastSyncTimestamp", "healthy", "live", "updatedAt"].includes(k)) && typeof st.json?.live === "boolean", "/api/timeline/sync-status with every switch: the same four facts; the old Service status switch adds nothing", Object.keys(st.json ?? {}).join(" "));
  { // the stream: its first events for this client are flight changes cut to their keys, and nothing of the never-list
    const ac = new AbortController(); let text = "";
    try {
      const r = await fetch(`${B}/digital-wall/api/stream`, { headers: { cookie: cookieOf(c), authorization: `Bearer ${c.access_token}`, accept: "text/event-stream" }, signal: ac.signal });
      const rd = r.body.getReader(); const until = Date.now() + 4000;
      while (Date.now() < until) { const chunk = await Promise.race([rd.read(), sleep(Math.max(1, until - Date.now())).then(() => null)]); if (!chunk || chunk.done) break; text += Buffer.from(chunk.value).toString("utf8"); }
    } catch { /* stopped */ } finally { ac.abort(); }
    const events = text.split("\n").filter((l) => l.startsWith("data:")).map((l) => { try { return JSON.parse(l.slice(5)); } catch { return null; } }).filter(Boolean);
    ok(text.length > 0 && events.every((e) => neverKeys(e).length === 0) && seededIn(text).length === 0 && !/"type":"(limitations|important|caa|notam-check)\.changed"/.test(text), "the stream's first events (4 s) carry nothing of the never-list, no note's words, no notes event", `${events.length} events · ${text.length} bytes`);
  }

  // ── 6. the page, every switch on: no notes card, no Notes button, no word of the notes, no request for them. On a desk (1440) Flights and the
  //    flight are drawn inside the frame (iframe[data-client-frame]); the flight is a side panel. On a phone (390) the
  //    client is sent to the phone app (/digital-wall/phone/, since v3 2026-11-13): the same facts are checked there —
  //    what the phone's browser is GIVEN is the listed fields, only their operators' flights are drawn, nothing of the
  //    staff's is on the screen, and no note is drawn or asked for at any setting (2026-11-15) ──
  const browser = await chromium.launch();
  const FRAME = "iframe[data-client-frame]";
  const newCtx = async (theme, width) => {
    const ctx = await browser.newContext({ viewport: { width, height: width < 700 ? 844 : 900 }, colorScheme: theme, hasTouch: width < 700 });
    const ck = cookieOf(c); await ctx.addCookies([{ name: ck.split("=")[0], value: ck.slice(ck.indexOf("=") + 1), url: B }]);
    await ctx.addInitScript((t) => { try { localStorage.setItem("cw-theme", t); } catch { /* no storage */ } }, theme);
    return ctx;
  };
  const open = async (theme, width) => {
    const ctx = await newCtx(theme, width);
    const page = await ctx.newPage(); const asked = new Set();
    page.on("request", (rq) => { const u = new URL(rq.url()); if (u.pathname.startsWith("/digital-wall/api/")) asked.add(u.pathname); });
    await page.goto(`${B}/client/flights`, { waitUntil: "load" }); await page.waitForSelector("[data-client-shell]", { timeout: 20000 });
    const fr = page.frameLocator(FRAME);
    await fr.locator('[data-client-surface="desk"]').waitFor({ timeout: 30000 });
    await fr.locator("[data-flight-row]").first().waitFor({ timeout: 30000 }).catch(() => {});
    await settled(page);
    return { ctx, page, fr, asked };
  };
  // whatever the panel draws from /api/flight-info is drawn once it has answered: wait for that answer, then a beat
  const openFlight = async (fr, fno, page) => {
    const read = page.waitForResponse((r) => /\/api\/flight-info/.test(r.url()), { timeout: 20000 }).catch(() => null);
    await fr.locator(`[data-flight-row="${fno}"]`).first().click();
    const panel = fr.locator(`[data-flight-panel="${fno}"]`);
    await panel.waitFor({ timeout: 15000 }).catch(() => {});
    await read; await page.waitForTimeout(600);
    return panel;
  };
  // what the notes were drawn as, on the desk and on the phone, until 2026-11-15: none of it may be on a client's screen
  const NOTE_PARTS = '[data-card="limitations"], [data-card="important"], [data-card="caa"], [data-section="caa"], [data-notes], [data-open-notes], [data-sheet="notes"], [data-limit-row], [data-open-limits]';
  // the phone app: where /client/flights sends a phone; when the rig does not answer /digital-wall/phone/ the same
  // app is under /digital-wall/timeline/phone/. Every answer of the wall's API the page is given is kept, to be read.
  const PHONE_APP = '[data-phone-app][data-role="client"]';
  const STAFF_PARTS = "[data-open-limits], [data-open-checks], [data-open-checks-sheet], [data-open-services], [data-mark-checked], [data-staff-console], [data-notam-row], [data-notam-sheet], [data-limit-row], [data-service-row], [data-wall-section], [data-more-group]";
  const openPhone = async (theme) => {
    const ctx = await newCtx(theme, 390);
    const page = await ctx.newPage(); const given = []; const asked = new Set();
    page.on("response", async (r) => { const u = new URL(r.url()); if (!u.pathname.startsWith("/digital-wall/api/")) return; asked.add(u.pathname.replace("/digital-wall", "")); if (r.status() !== 200) return; try { given.push({ path: u.pathname.replace("/digital-wall", ""), json: await r.json() }); } catch { /* not JSON */ } });
    await page.goto(`${B}/client/flights`, { waitUntil: "load" }).catch(() => {});
    await page.waitForURL((x) => /\/phone\//.test(new URL(x).pathname), { timeout: 15000 }).catch(() => {});
    const sentTo = new URL(page.url()).pathname + new URL(page.url()).search;
    let drawn = await page.locator(PHONE_APP).waitFor({ timeout: 20000 }).then(() => true, () => false);
    let addr = drawn ? new URL(page.url()).pathname : "";
    for (const a of ["/digital-wall/phone/", "/digital-wall/timeline/phone/"]) {
      if (drawn) break;
      await page.goto(`${B}${a}?view=flights`, { waitUntil: "load" }).catch(() => {});
      drawn = await page.locator(PHONE_APP).waitFor({ timeout: 20000 }).then(() => true, () => false); if (drawn) addr = a;
    }
    await page.locator('[data-view="flights"] [data-flight-row]').first().waitFor({ timeout: 30000 }).catch(() => {});
    await settled(page);
    return { ctx, page, given, asked, sentTo, addr, drawn };
  };
  const phoneRow = (page, nid) => page.locator(`[data-view="flights"] [data-flight-row$=":${nid}"]`);
  const openPhoneFlight = async (page, nid) => {
    await phoneRow(page, nid).first().scrollIntoViewIfNeeded().catch(() => {}); await phoneRow(page, nid).first().click({ timeout: 10000 }).catch(() => {});
    const sheet = page.locator(`[data-open-flight$=":${nid}"]`);
    await sheet.waitFor({ timeout: 15000 }).catch(() => {});
    // the sheet has read the flight (/api/flight-info) once its state is no longer "loading"
    await page.waitForFunction((n) => { const e = document.querySelector(`[data-open-flight$=":${n}"]`); return e && !/load|read/i.test(e.getAttribute("data-flight-state") || ""); }, nid, { timeout: 20000 }).catch(() => {});
    await page.waitForResponse((r) => /\/api\/flight-info/.test(r.url()), { timeout: 4000 }).catch(() => {}); await page.waitForTimeout(400);
    return sheet;
  };
  const fno = String(target.flight.flightNo), nid = String(target.flight.flightNid);
  for (const theme of ["light", "dark"]) {
    const width = 1440;
    const { ctx, page, fr, asked } = await open(theme, width); const tag = `client flight ${theme} ${width}, every switch`;
    // the status line: a client is told only when the feed is NOT live, in words; never a "live" chip, never ops' list of services
    const chipStates = await fr.locator("[data-service-status]").evaluateAll((els) => els.map((e) => e.getAttribute("data-service-status")));
    ok(chipStates.every((st) => st === "behind") && (chipStates.length === 0 || /Not live right now/.test(await fr.locator("[data-service-status]").first().innerText().catch(() => ""))) && await fr.locator("[data-service-row]").count() === 0, `${tag}: the only status line is "Not live right now", in words, when it is so; no service list`, chipStates.join(" ") || "live: nothing drawn");
    ok(await fr.locator(`[data-flight-row="${fno}"]`).count() >= 1, `${tag}: the flight the invented notes are on is on Flights`, fno);
    const panel = await openFlight(fr, fno, page);
    const words = seededIn(`${await panel.innerText().catch(() => "")}\n${await fr.locator("body").innerText().catch(() => "")}`);
    ok(await panel.count() === 1 && await fr.locator(NOTE_PARTS).count() === 0 && words.length === 0, `${tag}: the flight opens with no Limitations, Important or CAA section, and no word of the invented notes anywhere in the frame`, `${await fr.locator(NOTE_PARTS).count()} note parts · words: ${words.join(" · ") || "none"}`);
    const never = [...asked].filter((x) => isNeverPath(x));
    ok(asked.size >= 2 && never.length === 0, `${tag}: the page never asked for Limitations, Important, CAA or the NOTAM check (${asked.size} wall reads)`, never.join(" ") || "none");
    ok(await noOverflow(page) && await (page.frames().find((f) => /\/digital-wall\/timeline(\/|\?|$)/.test(f.url()))?.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1) ?? false), `${tag}: no horizontal scroll, on the page or in the frame`);
    const wide = await panel.locator("*").evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().right > window.innerWidth + 1).length);
    ok(wide === 0, `${tag}: nothing in the flight runs past the edge of the screen`, wide);
    await shot(page, `${OUT}/client-flight-${theme}-${width}.png`, width);
    await ctx.close();
  }
  // the phone app, switches on. A client who has not chosen a start page is walked through set-up first (the phone app
  // draws it over the flights; client-ui-check and client-onboarding-check cover that walk), so this client chooses one.
  {
    const r = await fetch(`${B}/api/client/prefs`, { method: "PUT", headers: { cookie: cookieOf(c), "content-type": "application/json" }, body: JSON.stringify({ start: "flights" }) }).catch(() => null);
    const j = r && r.ok ? await r.json().catch(() => null) : null;
    ok(j?.prefs?.start === "flights", "the client's start page is saved before the phone is opened (no set-up steps in the way)", r ? r.status : "no answer");
  }
  const feedNids = new Set(recs.map((r) => String(r.flight.flightNid)));
  const grantedOps = new Set(ops.map((o) => String(o).toLowerCase()));
  for (const theme of ["light", "dark"]) {
    const { ctx, page, given, asked, sentTo, addr, drawn } = await openPhone(theme); const tag = `client flight ${theme} 390 (phone app), every switch`;
    ok(/^\/digital-wall\/phone\/\?view=flights$/.test(sentTo), `${tag}: a phone on /client/flights is sent to the phone app's Flights`, sentTo);
    ok(drawn && await page.locator("[data-client-shell], iframe[data-client-frame]").count() === 0, `${tag}: the phone app draws for a client, with no desk shell and no frame`, addr || "not drawn");
    const rowIds = await page.locator('[data-view="flights"] [data-flight-row]').evaluateAll((els) => els.map((e) => e.getAttribute("data-flight-row") || ""));
    const strangers = rowIds.filter((id) => !feedNids.has(id.slice(id.lastIndexOf(":") + 1)) || !grantedOps.has(id.slice(0, id.lastIndexOf(":")).toLowerCase()));
    ok(rowIds.length >= 1 && strangers.length === 0, `${tag}: every flight drawn is one of the client's feed, of an operator granted to them`, `${rowIds.length} rows · not theirs: ${strangers.slice(0, 4).join(" ") || "none"}`);
    ok(await phoneRow(page, nid).count() >= 1, `${tag}: the flight the invented notes are on is on Flights`, fno);
    const sheet = await openPhoneFlight(page, nid);
    const state = await sheet.getAttribute("data-flight-state").catch(() => null);
    const words = seededIn(await page.locator("body").innerText().catch(() => ""));
    ok(await sheet.count() === 1 && await page.locator(NOTE_PARTS).count() === 0 && words.length === 0, `${tag}: the flight opens with no Notes button or sheet, and no word of the invented notes on the screen`, `state ${state} · ${await page.locator(NOTE_PARTS).count()} note parts · words: ${words.join(" · ") || "none"}`);
    ok(await page.locator(STAFF_PARTS).count() === 0, `${tag}: nothing of the staff's is on the screen (no checks, service status, limitations list, NOTAM check, console)`, await page.locator(STAFF_PARTS).evaluateAll((els) => els.slice(0, 4).map((e) => e.getAttributeNames().filter((n) => n.startsWith("data-")).join(",")).join(" ")));
    // what this phone's browser was GIVEN: every flight, by any answer, is the listed fields; no staff read was asked
    const fl = [], rowKeys = new Set();
    for (const g of given) {
      // the feed gives a list of aircraft; one flight (/api/flight-info) gives its one aircraft
      for (const a of (Array.isArray(g.json?.aircraft) ? g.json.aircraft : g.json?.aircraft && typeof g.json.aircraft === "object" ? [g.json.aircraft] : [])) { for (const k of Object.keys(a)) if (!ROW.has(k) && k !== "flights") rowKeys.add(`${g.path}:${k}`); for (const f of a.flights ?? []) fl.push([g.path, f]); }
      for (const r of g.json?.flights ?? []) if (r && typeof r === "object") fl.push([g.path, r.flight ?? r]);
      if (g.json?.flight && typeof g.json.flight === "object") fl.push([g.path, g.json.flight]);
    }
    const beyond = [...new Set(fl.flatMap(([path, f]) => Object.keys(f).filter((k) => !FLIGHT.has(k)).map((k) => `${path}:${k}`)))];
    const wxBad = [...new Set(fl.flatMap(([path, f]) => wxWrong(f, SWITCHED).map((k) => `${path}:${k}`)))];
    ok(fl.length >= 1 && beyond.length === 0 && wxBad.length === 0, `${tag}: every flight the phone's browser was given is the listed fields and nothing else (the weather category a category or null)`, `${fl.length} flights read · beyond the list: ${beyond.slice(0, 6).join(" ") || "none"} · weather: ${wxBad.join(" ") || "ok"}`);
    const nk = [...new Set(given.flatMap((g) => neverKeys(g.json).map((k) => `${g.path}${k}`)))], gw = seededIn(JSON.stringify(given.map((g) => g.json)));
    ok(nk.length === 0 && gw.length === 0, `${tag}: no answer the phone's browser was given holds a key of the never-list at any depth, or a word of the invented notes`, `${nk.slice(0, 6).join(" ") || "no keys"} · ${gw.join(" · ") || "no words"}`);
    const neverAsked = [...asked].filter((x) => isNeverPath(x));
    ok(neverAsked.length === 0, `${tag}: the phone never asked for Limitations, Important, CAA or the NOTAM check`, neverAsked.join(" ") || "none");
    ok(rowKeys.size === 0, `${tag}: every aircraft the phone's browser was given carries what names it and nothing else`, [...rowKeys].slice(0, 6).join(" ") || "none beyond the list");
    const staffReads = [...new Set(given.map((g) => g.path))].filter((x) => /^\/api\/(flight-services|notam-check|flight-checks|operators|reports|webhooks|alerts|limitations|timeline\/limitations|important|caa)(\/|$)/.test(x));
    ok(staffReads.length === 0 && !/rig-access-admin|confirmedBy|addedBy|updatedBy|"match"|"checks"|"checklistColor"|"tripStatus"/.test(JSON.stringify(given.map((g) => g.json))), `${tag}: no staff read was answered, and no answer names ops' checks or who wrote a note`, `${staffReads.join(" ") || "none"} · asked: ${[...asked].join(" ")}`);
    ok(await noOverflow(page), `${tag}: no horizontal scroll`);
    const wide = await page.locator("[data-phone-app] *").evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().right > window.innerWidth + 1).length);
    ok(wide === 0, `${tag}: nothing runs past the edge of the screen`, wide);
    await page.screenshot({ path: `${OUT}/client-flight-${theme}-390.png` });
    await ctx.close();
  }
  await setSwitches(["flight_board"]);
  {
    const { ctx, page, fr, asked } = await open("light", 1440);
    const panel = await openFlight(fr, fno, page);
    ok(await panel.count() === 1 && await fr.locator(NOTE_PARTS).count() === 0 && seededIn(await fr.locator("body").innerText().catch(() => "")).length === 0 && ![...asked].some((x) => isNeverPath(x)), "the fewest switches, on the desk: the flight opens with no notes section and no word of the notes, and nothing of them is asked for");
    await ctx.close();
  }
  {
    const { ctx, page, given, asked } = await openPhone("light");
    const sheet = await openPhoneFlight(page, nid);
    ok(await sheet.count() === 1 && await page.locator(NOTE_PARTS).count() === 0 && seededIn(JSON.stringify(given.map((g) => g.json))).length === 0 && given.every((g) => neverKeys(g.json).length === 0) && ![...asked].some((x) => isNeverPath(x)), "the fewest switches, on the phone app: the flight opens with no Notes, no answer holds a note or a never-list key, and nothing of them is asked for");
    await ctx.close();
  }
  await browser.close();
} finally {
  // what this run made, removed: the notes (deleted, then purged) and the client
  if (made.lim) { await wall(admin, `/api/timeline/limitations/${made.lim}`, { method: "DELETE" }); await wall(admin, `/api/timeline/limitations/${made.lim}/purge`, { method: "DELETE" }); }
  if (made.imp) { await wall(admin, `/api/important/${made.imp}`, { method: "DELETE" }); await wall(admin, `/api/important/${made.imp}/purge`, { method: "DELETE" }); }
  if (made.caa) await wall(admin, `/api/caa/${made.caa}`, { method: "DELETE" });
  // an earlier run's leftovers too (one stopped half-way): every note of this check's making, by its title
  for (const l of (await wall(admin, "/api/timeline/limitations?includeInactive=true")).json?.limitations ?? []) if (/^rig-feed-\w+ limitation \(invented\)$/.test(String(l.title))) { if (l.isPermanent) await wall(admin, "/api/timeline/limitations", { method: "POST", body: JSON.stringify({ ...l, isPermanent: false }) }); await wall(admin, `/api/timeline/limitations/${l.id}`, { method: "DELETE" }); await wall(admin, `/api/timeline/limitations/${l.id}/purge`, { method: "DELETE" }); }
  for (const e of (await wall(admin, "/api/important")).json?.entries ?? []) if (/^rig-feed-\w+ notice \(invented\)$/.test(String(e.title))) { await wall(admin, `/api/important/${e.id}`, { method: "DELETE" }); await wall(admin, `/api/important/${e.id}/purge`, { method: "DELETE" }); }
  for (const e of (await wall(admin, "/api/caa")).json?.entries ?? []) if (/^rig-feed-\w+ authority \(invented\)$/.test(String(e.authorityName))) await wall(admin, `/api/caa/${e.id}`, { method: "DELETE" });
  const left = /rig-feed-\w+ (limitation|notice|authority) \(invented\)/.test((await wall(admin, "/api/flights/normalized?window=all-cached&limit=500")).text);
  ok(!left, "the invented notes are gone from the wall");
  if (uid) { await svc(`/rest/v1/clients?user_id=eq.${uid}`, { method: "DELETE" }); await svc(`/auth/v1/admin/users/${uid}`, { method: "DELETE" }); }
}
console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
