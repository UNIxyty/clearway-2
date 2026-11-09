// What a client's browser is GIVEN of a flight, not what the page draws (2026-11-09). Until this check a client's feed
// carried each flight as the ops wall keeps it: 55 fields, with ops' notes matched to the flight (Limitations, Important
// entries, CAA contacts, unreviewed NOTAM and weather markers), ops' check marks, the checklist colours and the weather
// pills — whatever the client's switches said. The page drew none of it; the browser had all of it.
// Now a flight is a list of fields (digital-wall/lib/client-scope.mjs › CLIENT_FLIGHT_FIELDS) and the notes come only
// with their switches. This makes its own client and its own invented notes (through the wall's API, as the rig admin),
// reads every feed as the client with the switches off and then on, looks at the Flights page at 1440 and 390, and
// removes what it made.   node --env-file=.env.rig rig/client-feed-check.mjs
import { chromium } from "playwright";
import fs from "node:fs";
import { settled } from "./lib/settle.mjs";
import { CLIENT_FLIGHT_FIELDS } from "../digital-wall/lib/client-scope.mjs";

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

const EMAIL = "rig-client-feed@rig.invalid", PASSWORD = "rig-access-check-only-client-feed";
const TAG = `rig-feed-${Date.now().toString(36)}`;   // in every invented note's title, so this run finds and removes its own
const ROW = new Set(["key", "oprId", "operatorName", "registration", "acftTypeIcao", "acftTypeShortName", "flightNid", "flight", "notamCheck"]);
const FLIGHT = new Set([...CLIENT_FLIGHT_FIELDS, "limitations"]);
const CAA = new Set(["country", "authorityName", "validity", "functionText", "info", "contact", "phones", "mail", "sita", "aftn"]);
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
  await svc("/rest/v1/clients", { method: "POST", body: JSON.stringify({ user_id: uid, email: EMAIL, person_name: "Rig Feed Person", company: "Rig Feed Charter (invented)", kind: "operator", status: "approved", scope: ops.map((value) => ({ kind: "operator", value })), switches: ["flight_board"], passenger_level: "off" }) });
  const setSwitches = async (switches) => { await svc(`/rest/v1/clients?user_id=eq.${uid}`, { method: "PATCH", body: JSON.stringify({ switches }) }); await sleep(11_000); };   // the scope is cached ten seconds
  const c = await grant(EMAIL, PASSWORD);
  ok(Boolean(c.access_token) && ops.length > 0, "a client on every operator the rig wall has signs in", `${ops.length} operators`);

  const from = encodeURIComponent(new Date(Date.now() - 2 * 3600e3).toISOString()), to = encodeURIComponent(new Date(Date.now() + 7 * 86400e3).toISOString());
  const FEED = `/api/flights/normalized?window=all-cached&limit=500&from=${from}&to=${to}`;
  const feedOf = async (s) => (await wall(s, FEED)).json?.flights ?? [];
  const extra = (recs) => { const row = new Set(), fl = new Set(); for (const r of recs) { for (const k of Object.keys(r)) if (!ROW.has(k)) row.add(k); for (const k of Object.keys(r.flight ?? {})) if (!FLIGHT.has(k)) fl.add(k); } return { row: [...row], fl: [...fl] }; };
  const types = (recs) => { const t = {}; for (const r of recs) for (const l of r.flight?.limitations ?? []) t[l.type] = (t[l.type] ?? 0) + 1; return t; };

  // ── 1. the required switch only: a flight is the listed fields, with no notes at all ──
  let recs = await feedOf(c);
  ok(recs.length >= 1, "the client's feed has their flights", `${recs.length} flights`);
  let x = extra(recs);
  ok(x.row.length === 0 && x.fl.length === 0, "every flight in the feed is the listed fields and nothing else", `record: ${x.row.join(" ") || "—"} · flight: ${x.fl.join(" ") || "—"}`);
  ok(recs.every((r) => Array.isArray(r.flight?.limitations) && r.flight.limitations.length === 0) && recs.every((r) => !("notamCheck" in r)), "with the note switches off no flight carries a note, and no NOTAM check state", JSON.stringify(types(recs)));
  // the control: the same feed as staff carries the wall's own record, so the cut means something
  const staff = await feedOf(admin);
  const staffKeys = new Set(staff.flatMap((r) => Object.keys(r.flight ?? {})));
  ok(staff.length >= recs.length && ["checks", "limitations", "checklistColor", "tripStatus"].every((k) => staffKeys.has(k)), "control: staff get the wall's own record (checks, limitations, checklist colour, trip status)", `${staffKeys.size} fields`);

  // ── 2. invented notes on the airport of the client's first flight, made through the wall as the admin ──
  const target = recs.find((r) => !r.flight.isCnl && r.flight.adep?.icao) ?? recs[0];
  const icao = target.flight.adep.icao;
  const lim = await wall(admin, "/api/timeline/limitations", { method: "POST", body: JSON.stringify({ title: `${TAG} limitation (invented)`, description: "Invented for the rig: slots required after 2200 local.", isPermanent: true, match: { airportIcaos: [icao] } }) });
  const imp = await wall(admin, "/api/important", { method: "POST", body: JSON.stringify({ title: `${TAG} notice (invented)`, body: "Invented for the rig: fuel by prior arrangement only.", reviewed: true, match: { airportIcaos: [icao] } }) });
  const caa = await wall(admin, "/api/caa", { method: "POST", body: JSON.stringify({ country: "Rigland (invented)", authorityName: `${TAG} authority (invented)`, functionText: "Landing permits", validity: "Permanent", phones: "+000 000 0000", mail: "permits@rig.invalid", reviewed: true, match: { airportIcaos: [icao] } }) });
  made.lim = lim.json?.limitation?.id ?? null; made.imp = imp.json?.entry?.id ?? null; made.caa = caa.json?.entry?.id ?? null;
  ok(Boolean(made.lim && made.imp && made.caa), `an invented limitation, notice and CAA entry are on ${icao}`, `${lim.status} ${imp.status} ${caa.status}`);
  const staffNow = (await feedOf(admin)).find((r) => r.key === target.key);
  const staffTypes = new Set((staffNow?.flight?.limitations ?? []).map((l) => l.type));
  ok(["LIM", "IMP", "CAA"].every((t) => staffTypes.has(t)), "control: staff see all three on the flight", [...staffTypes].join(" "));

  // ── 3. still only the required switch: none of it reaches the client, by any feed ──
  recs = await feedOf(c);
  const mine = recs.find((r) => r.key === target.key);
  ok(mine && mine.flight.limitations.length === 0 && !JSON.stringify(recs).includes(TAG), "the notes exist, the switches are off: the client's feed has none of them");
  const info = await wall(c, `/api/flight-info?flightNid=${target.flight.flightNid}&oprId=${encodeURIComponent(target.oprId)}`);
  const infoExtra = Object.keys(info.json?.flight ?? {}).filter((k) => !FLIGHT.has(k));
  ok(info.status === 200 && infoExtra.length === 0 && !info.text.includes(TAG) && !("portalConfigured" in (info.json ?? {})) && Object.keys(info.json?.aircraft ?? {}).every((k) => ROW.has(k)), "one flight opened: the same listed fields, no notes, and of the aircraft only what names it", infoExtra.join(" "));
  for (const p of ["/api/timeline/flights?allOperators=true", "/api/upcoming/flights", "/api/flights/data", "/api/timeline/aircraft"]) {
    const r = await wall(c, p); const fl = [];
    const walk = (v) => { if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === "object") { if ("flightNid" in v && "startTimeUTC" in v) fl.push(v); for (const k of Object.keys(v)) if (k !== "adep" && k !== "ades") walk(v[k]); } };
    walk(r.json);
    const bad = [...new Set(fl.flatMap((f) => Object.keys(f)).filter((k) => !FLIGHT.has(k)))];
    ok(r.status === 200 && bad.length === 0 && !r.text.includes(TAG), `${p.replace(/\?.*/, "")}: every flight in it is the listed fields (${fl.length} flights)`, `${r.status} ${bad.join(" ")}`);
  }
  for (const p of ["/api/limitations", "/api/important", "/api/caa", "/api/timeline/sync-status", "/api/notam-check/today"]) ok((await wall(c, p)).status === 404, `${p}: 404 with its switch off`);
  ok((await wall(c, `/api/flight-checks?keys=${encodeURIComponent(target.key)}`)).status === 404, "ops' check marks (/api/flight-checks) are not a client's at any setting: 404");

  // ── 4. one switch on: that kind of note, and only that kind ──
  await setSwitches(["flight_board", "limitations"]);
  let notes = (await feedOf(c)).find((r) => r.key === target.key)?.flight.limitations ?? [];
  ok(notes.some((n) => n.type === "LIM" && n.title.includes(TAG) && /slots required/.test(n.description)) && notes.every((n) => n.type === "LIM" && Object.keys(n).every((k) => ["id", "type", "title", "description"].includes(k))), "Limitations on: the limitation, as its title and text, and nothing of another kind", notes.map((n) => n.type).join(" "));

  // ── 5. every note switch on ──
  await setSwitches(["flight_board", "weather", "notams", "limitations", "important", "caa", "service_status", "notam_check_status"]);
  recs = await feedOf(c); notes = recs.find((r) => r.key === target.key)?.flight.limitations ?? [];
  const byType = (t) => notes.filter((n) => n.type === t);
  ok(byType("LIM").length >= 1 && byType("IMP").some((n) => n.title.includes(TAG) && /fuel by prior arrangement/.test(n.description)) && byType("CAA").some((n) => String(n.caa?.authorityName).includes(TAG)), "all three on: the limitation, the notice and the CAA entry are on the flight", notes.map((n) => n.type).join(" "));
  ok(recs.every((r) => (r.flight.limitations ?? []).every((n) => ["LIM", "IMP", "CAA"].includes(n.type))), "ops' review markers (NTM, WX) never reach the client", JSON.stringify(types(recs)));
  ok(byType("IMP").every((n) => Object.keys(n).every((k) => ["id", "type", "title", "description"].includes(k))) && byType("CAA").every((n) => Object.keys(n.caa ?? {}).every((k) => CAA.has(k)) && !("description" in n)), "a notice is its title and text (no attachments); a CAA entry is its contact fields (no match rules)");
  x = extra(recs);
  ok(x.row.length === 0 && x.fl.length === 0 && recs.every((r) => !r.notamCheck || Object.keys(r.notamCheck).every((k) => ["day", "dep", "arr"].includes(k))), "with every switch on a flight is still the listed fields; the NOTAM check state has no name on it", `${x.row.join(" ")} ${x.fl.join(" ")}`);
  const lists = { "/api/limitations": ["limitations", ["id", "title", "description", "isPermanent", "startDate", "endDate"]], "/api/important": ["entries", ["id", "title", "body"]], "/api/caa": ["entries", ["id", ...CAA]] };
  for (const [p, [key, fields]] of Object.entries(lists)) {
    const r = await wall(c, p); const items = r.json?.[key] ?? [];
    const bad = [...new Set(items.flatMap((e) => Object.keys(e)).filter((k) => !fields.includes(k)))];
    ok(r.status === 200 && items.some((e) => JSON.stringify(e).includes(TAG)) && bad.length === 0, `${p}: the client's own, as content only (no match rules, no names from the audit trail)`, `${r.status} · ${items.length} items · ${bad.join(" ")}`);
  }
  const everything = (await Promise.all([FEED, "/api/limitations", "/api/important", "/api/caa", `/api/flight-info?flightNid=${target.flight.flightNid}&oprId=${encodeURIComponent(target.oprId)}`].map((p) => wall(c, p)))).map((r) => r.text).join("\n");
  ok(!/rig-access-admin|confirmedBy|addedBy|updatedBy|"match"/.test(everything), "nothing the client is sent names who in ops wrote or confirmed a note, or what it is matched on");
  const st = await wall(c, "/api/timeline/sync-status");
  ok(st.status === 200 && Object.keys(st.json ?? {}).every((k) => ["ok", "lastSyncTimestamp", "healthy", "live", "updatedAt"].includes(k)) && typeof st.json?.live === "boolean", "Service status on: live or not, and when last updated; nothing about operators, errors or the cache", Object.keys(st.json ?? {}).join(" "));

  // ── 6. the page: the cards for the notes, the status chip; nothing drawn empty ──
  const browser = await chromium.launch();
  const open = async (theme, width) => {
    const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, colorScheme: theme, hasTouch: width === 390 });
    const ck = cookieOf(c); await ctx.addCookies([{ name: ck.split("=")[0], value: ck.slice(ck.indexOf("=") + 1), url: B }]);
    await ctx.addInitScript((t) => { try { localStorage.setItem("cw-theme", t); } catch { /* no storage */ } }, theme);
    const page = await ctx.newPage(); await page.goto(`${B}/client`, { waitUntil: "load" }); await page.waitForSelector("[data-client-wall]", { timeout: 20000 }); await settled(page);
    await page.getByRole("tab", { name: "7 days" }).click(); await settled(page);
    return { ctx, page };
  };
  for (const theme of ["light", "dark"]) for (const width of [1440, 390]) {
    const { ctx, page } = await open(theme, width); const tag = `client notes ${theme} ${width}`;
    const chip = page.locator("[data-service-status]");
    ok(await chip.isVisible() && /Flight data (is live|may be behind)/.test(await chip.innerText()), `${tag}: the service status is said in words`, (await chip.innerText().catch(() => "")).trim());
    await page.locator(`[data-flight="${target.key}"]`).click(); await settled(page);
    const text = async (card) => (await page.locator(`[data-card="${card}"]`).innerText().catch(() => "")).replace(/\s+/g, " ");
    ok((await text("limitations")).includes(`${TAG} limitation`) && /slots required/.test(await text("limitations")), `${tag}: Limitations shows the limitation, title and text`);
    ok((await text("important")).includes(`${TAG} notice`) && /fuel by prior arrangement/.test(await text("important")), `${tag}: Important notices shows the notice`);
    ok((await text("caa")).includes(`${TAG} authority`) && /Landing permits/.test(await text("caa")) && /permits@rig\.invalid/.test(await text("caa")), `${tag}: CAA details shows the authority and how to reach it`);
    ok(await noOverflow(page), `${tag}: no horizontal page scroll`);
    const wide = await page.locator("[data-detail] *").evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().right > window.innerWidth + 1).length);
    ok(wide === 0, `${tag}: nothing runs past the edge of the screen`, wide);
    await page.screenshot({ path: `${OUT}/client-notes-${theme}-${width}.png`, fullPage: true });
    if (theme === "light") {
      // a flight the notes do not match: the cards are there (the switches are on) and say "none" in words
      const other = recs.find((r) => r.key !== target.key && r.flight.adep?.icao !== icao && r.flight.ades?.icao !== icao && !r.flight.isCnl && (r.flight.limitations ?? []).length === 0);
      if (other) {
        if (width === 390) { await page.locator(".clw-back").click(); await settled(page); }
        await page.locator(`[data-flight="${other.key}"]`).click(); await settled(page);
        ok(/No limitations apply/.test(await text("limitations")) && /No notices/.test(await text("important")) && /No authority details/.test(await text("caa")), `${tag}: a flight with no notes says so in words, three times`);
      }
    }
    await ctx.close();
  }
  await setSwitches(["flight_board"]);
  {
    const { ctx, page } = await open("light", 1440);
    await page.locator(`[data-flight="${target.key}"]`).click(); await settled(page);
    ok(await page.locator('[data-card="limitations"], [data-card="important"], [data-card="caa"], [data-service-status]').count() === 0, "switches off again: no notes cards and no status chip are drawn — a switch that is off adds nothing");
    await ctx.close();
  }
  await browser.close();
} finally {
  // what this run made, removed: the notes (deleted, then purged) and the client
  if (made.lim) { await wall(admin, `/api/timeline/limitations/${made.lim}`, { method: "DELETE" }); await wall(admin, `/api/timeline/limitations/${made.lim}/purge`, { method: "DELETE" }); }
  if (made.imp) { await wall(admin, `/api/important/${made.imp}`, { method: "DELETE" }); await wall(admin, `/api/important/${made.imp}/purge`, { method: "DELETE" }); }
  if (made.caa) await wall(admin, `/api/caa/${made.caa}`, { method: "DELETE" });
  const left = (await wall(admin, "/api/flights/normalized?window=all-cached&limit=500")).text.includes(TAG);
  ok(!left, "the invented notes are gone from the wall");
  if (uid) { await svc(`/rest/v1/clients?user_id=eq.${uid}`, { method: "DELETE" }); await svc(`/auth/v1/admin/users/${uid}`, { method: "DELETE" }); }
}
console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
