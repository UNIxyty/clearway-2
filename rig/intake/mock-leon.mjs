// The rig's Leon: answers the queries and mutations the intake sends, from a READ-ONLY snapshot of cwy-cwy
// (rig/intake/leon-snapshot.mjs) plus whatever the rig creates. Refusals use the exact wording and shape
// captured from real Leon on 2026-09-30 (disposable test flight): HTTP 400, errors[].extensions.category
// "argumentValidation". Faults for tests come from rig/.scratch/leon-mock-faults.json:
//   { "refuseFlightNo": ["YULSA"], "refuseLegOnAdes": ["LIPZ"], "hangFlightNo": ["AMQ5V"], "hangMs": 60000,
//     "refuseChecklistDef": [1231], "refusePassengerText": ["9HGVL"], "refuseCrewNotes": ["9HGVL"],
//     "hangPassengerText": ["9HGVL"], "dispatcherEditAfterCreate": ["9HGVL"], "refuseCancelFlightNid": [90000001],
//     "hangCancelFlightNid": [90000001] }
// dispatcherEditAfterCreate: a dispatcher types into the flight's OPS notes the moment it exists (before the agent's
// passenger write), so a test can show the agent never writes the notes back over that edit.
// Passengers (passengerList.savePassengerText) and the crew's OPS-notes update (flights.flightListUpdate) are held per
// flight and read back by flight(flightNid); their text is never written to the mock's log (a hash and a length only).
// Every mutation is appended to rig/.scratch/leon-mock-log.jsonl (the evidence for "one flight, not two").
import http from "node:http";
import { readFileSync, appendFileSync, existsSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
const PORT = Number(process.env.PORT || 3995);
const SCR = path.resolve(process.env.RIG_SCRATCH || "../.scratch");
const snap = JSON.parse(readFileSync(path.join(SCR, "leon-snapshot.json"), "utf8"));
// Airports and aircraft the snapshot lacks but the CNAIR fixtures need (rig/fixtures/intake/leon-extra.json).
{ const extraPath = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../fixtures/intake/leon-extra.json");
  if (existsSync(extraPath)) { const extra = JSON.parse(readFileSync(extraPath, "utf8")); Object.assign(snap.airports, extra.airports ?? {}); for (const a of extra.aircraft ?? []) if (!snap.aircraft.some((x) => x.registration === a.registration)) snap.aircraft.push(a); } }
const faults = () => { try { return JSON.parse(readFileSync(path.join(SCR, "leon-mock-faults.json"), "utf8")); } catch { return {}; } };
const log = (e) => appendFileSync(path.join(SCR, "leon-mock-log.jsonl"), JSON.stringify({ at: new Date().toISOString(), ...e }) + "\n");
const airportByCode = (c) => { const k = String(c).toUpperCase(); const hit = snap.airports[k] ?? Object.values(snap.airports).find((a) => a && (a.code.icao === k || a.code.iata === k)); return hit ?? null; };
let nextFlight = 90000001, nextTrip = 9000001;
const created = []; // { flightNid, tripNid, payload, isCnl, checklist: Map, contacts: [{contactNid, departurePassportNid}] }
// The address book (phonebook): contacts with passports. Leon's searches match NAMES only (probe, 2026-10-08).
const contacts = []; let nextContact = 7000001, nextPassport = 3000001, nextPaxRow = 10000001;
const COUNTRIES = [["LVA", "LV", "Latvia"], ["FRA", "FR", "France"], ["DEU", "DE", "Germany"], ["GRC", "GR", "Greece"], ["MLT", "MT", "Malta"], ["AUT", "AT", "Austria"], ["ESP", "ES", "Spain"], ["CZE", "CZ", "Czechia"]].map(([code, codeIso, name]) => ({ code, codeIso, name }));
const contactOut = (c) => ({ contactNid: c.contactNid, name: c.name, surname: c.surname, middleName: "", genderEnum: c.gender ?? "UNKNOWN", dateOfBirth: c.dateOfBirth ?? null, placeOfBirth: null, isDeleted: false, nationality: c.nationality ? { code: c.nationality, codeIso: COUNTRIES.find((x) => x.code === c.nationality)?.codeIso ?? null, name: COUNTRIES.find((x) => x.code === c.nationality)?.name ?? c.nationality } : null, maskingStatus: { isPassportMasked: false, isProfileDataMasked: false }, passportList: c.passports.map((p) => ({ passportNid: p.passportNid, number: p.number, countryCode: p.country, expiresDate: p.dateOfExpiry ?? null })) });
function newContact(p) { const c = { contactNid: nextContact++, name: p.name, surname: p.surname, gender: p.gender, dateOfBirth: p.dateOfBirth, nationality: p.nationality, passports: (p.documents?.passportList ?? []).map((d) => ({ passportNid: nextPassport++, ...d })) }; contacts.push(c); return c; }
const defs = snap.definitions;
function toFlight(f) { return { flightNid: f.flightNid, tripNid: f.tripNid, flightNo: f.payload.flightNo, startTimeUTC: f.payload.startTimeUTC.replace(/Z?$/, "Z"), endTimeUTC: f.payload.endTimeUTC.replace(/Z?$/, "Z"), isCnl: f.isCnl, creationDateTime: f.at, acft: f.payload.aircraftNid ? { registration: snap.aircraft.find((a) => a.acftNid === f.payload.aircraftNid)?.registration ?? null } : null, startAirport: { code: { icao: airportByCode(f.payload.adepCode)?.code.icao } }, endAirport: { code: { icao: airportByCode(f.payload.adesCode)?.code.icao } }, notes: { ops: f.opsNotes ?? f.payload.opsNotes ?? "" }, passengerList: f.contacts?.length ? { count: f.contacts.length, realCount: f.contacts.length, isDataSourceText: false, isDataSourceContact: true, passengerText: null, passengerListAsText: "", fileList: [], passengerContactList: f.contacts.map((x) => { const c = contacts.find((y) => y.contactNid === x.contactNid); const p = c?.passports.find((y) => y.passportNid === x.departurePassportNid); const out = contactOut(c); return { passengerContactNid: x.passengerContactNid, contact: out, departurePassport: p ? { passportNid: p.passportNid, number: p.number, countryCode: p.country, expiresDate: p.dateOfExpiry ?? null, neverExpires: false, isMasked: false, unavailable: false, surname: p.surname, name: p.name, middleName: "", nationality: out.nationality } : null, arrivalPassport: null, departureTravelDocument: null, arrivalTravelDocument: null, departureNationalId: null, arrivalNationalId: null }; }) } : f.passengerText != null ? { count: f.paxCount, realCount: f.paxCount, isDataSourceText: true, isDataSourceContact: false, passengerText: f.passengerText, passengerListAsText: f.passengerText, passengerContactList: null, fileList: [] } : { count: f.payload.paxNumber ?? 0, realCount: f.payload.paxNumber ?? 0, isDataSourceText: true, isDataSourceContact: false, passengerText: "", passengerListAsText: "", passengerContactList: null, fileList: [] }, crewMemberList: [], trip: { tripNumber: `RIG/${f.tripNid}` }, checklist: { allItems: [...f.checklist.entries()].map(([cdNid, v]) => ({ cdNid, csId: v.csId, comment: v.comment ?? null })) } }; }
function validate(fl, where) {
  for (const k of ["adepCode", "adesCode"]) if (!airportByCode(fl[k])) return { status: 400, errors: [{ message: `Variable "$${where.v}" got invalid value "${fl[k]}" at "${where.path}.${k}"; Argument '${fl[k]}' validation failed with reason 'Its not an airport code'`, locations: [{ line: 1, column: 10 }], extensions: { category: "argumentValidation" } }] };
  if (Date.parse(fl.startTimeUTC) >= Date.parse(fl.endTimeUTC)) return { status: 400, errors: [{ message: "Argument 'startTimeUTC' validation failed with reason 'Start time cannot be later or equal then end time'", locations: [{ line: 1, column: 41 }], path: [where.op], extensions: { category: "argumentValidation" } }] };
  const f = faults();
  if ((f.refuseFlightNo ?? []).includes(fl.flightNo) && (!f.refuseLegOnAdes || f.refuseLegOnAdes.includes(fl.adesCode))) return { status: 400, errors: [{ message: `Argument 'aircraftNid' validation failed with reason 'Aircraft is already scheduled at this time'`, locations: [{ line: 1, column: 41 }], path: [where.op], extensions: { category: "argumentValidation" } }] };
  return null;
}
function create(fl, tripNid) {
  const f = { flightNid: nextFlight++, tripNid, payload: fl, isCnl: false, at: new Date().toISOString().replace(/\.\d+Z$/, "Z"), checklist: new Map() };
  for (const d of defs.filter((x) => x.isAutoAddToLeg && x.enableForUse)) f.checklist.set(d.nid, { csId: d.defaultStatus?.checklistStatusId ?? "QSM", comment: null });
  if ((faults().dispatcherEditAfterCreate ?? []).includes(fl.flightNo)) f.opsNotes = `${fl.opsNotes ?? ""}\n\nDISPATCHER EDIT: typed in Leon right after the flight was created`;
  created.push(f); return f;
}
const reply = (res, status, body) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
http.createServer(async (req, res) => {
  let b = ""; for await (const c of req) b += c;
  if (req.url.startsWith("/access_token/refresh")) { res.writeHead(200, { "content-type": "text/plain" }); return res.end("rig-mock-leon-access-token-" + "x".repeat(40)); }
  if (req.url === "/_rig/flights") return reply(res, 200, created.map(toFlight));
  if (req.url === "/_rig/contacts") return reply(res, 200, contacts.map(contactOut)); // tests: the address book
  if (req.url === "/_rig/seed-contact") { const c = newContact(JSON.parse(b || "{}")); return reply(res, 200, contactOut(c)); } // tests: a contact ops created by hand
  if (req.url === "/_rig/set-flight") { const { flightNid, isCnl, startTimeUTC } = JSON.parse(b || "{}"); const f = created.find((x) => x.flightNid === Number(flightNid)); if (f) { if (isCnl !== undefined) f.isCnl = isCnl; if (startTimeUTC) f.payload = { ...f.payload, startTimeUTC }; } return reply(res, f ? 200 : 404, { ok: !!f }); } // tests: Leon changed by hand
  if (req.url === "/_rig/edit-passenger-text") { const { flightNid, text } = JSON.parse(b || "{}"); const f = created.find((x) => x.flightNid === Number(flightNid)); if (f) f.passengerText = text; return reply(res, f ? 200 : 404, { ok: !!f }); } // tests: someone edits the list in Leon   // tests: what the mock holds, checklist included
  if (!req.url.startsWith("/api/graphql")) return reply(res, 404, { errors: [{ message: "not in the mock" }] });
  const { query = "", variables = {} } = JSON.parse(b || "{}");
  const q = query.replace(/\s+/g, " ");
  const textless = (v) => JSON.parse(JSON.stringify(v ?? {}, (k, x) => (typeof x === "string" && ["text", "opsNotes", "name", "surname", "knownAs", "number", "dateOfBirth", "dateOfExpiry", "middleName", "wildcard"].includes(k) ? { sha256: createHash("sha256").update(x).digest("hex").slice(0, 16), length: x.length } : x)));
  if (/mutation/.test(q)) log({ q: q.slice(0, 240), variables: textless(variables) });
  try {
    if (q.includes("countriesByWildcard")) { const w = String(variables.w ?? "").toUpperCase(); return reply(res, 200, { data: { countriesByWildcard: COUNTRIES.filter((c) => c.name.toUpperCase().includes(w) || c.code === w || c.codeIso === w) } }); }
    if (q.includes("contactByWildcardForDuplicationList")) { // names only, like Leon
      const words = String(variables.f?.wildcard ?? "").toLowerCase().split(/\s+/).filter(Boolean);
      const hits = contacts.filter((c) => words.length && words.every((w) => `${c.name} ${c.surname}`.toLowerCase().includes(w)));
      return reply(res, 200, { data: { contactByWildcardForDuplicationList: hits.map((c) => ({ contactNid: c.contactNid, name: c.name, surname: c.surname, passportList: c.passports.map((p) => ({ passportNid: p.passportNid, countryCode: p.country, number: p.number })) })) } });
    }
    if (q.includes("contactsByNids")) return reply(res, 200, { data: { contact: { contactsByNids: (variables.l ?? []).map((n) => contacts.find((c) => c.contactNid === Number(n))).filter(Boolean).map(contactOut) } } });
    if (q.includes("personCreate(")) {
      const p = variables.p ?? {}; const num = p.documents?.passportList?.[0]?.number;
      if (num && (faults().refuseContactPassport ?? []).includes(num)) return reply(res, 200, { data: { phonebook: { personCreate: { errorList: [{ message: `Passport number "${num}" is not valid for the issuing country`, category: "argumentValidation", path: ["documents"] }] } } } });
      return reply(res, 200, { data: { phonebook: { personCreate: { value: contactOut(newContact(p)) } } } });
    }
    if (q.includes("addPassengersToList(")) { // REPLACES the flight's list (seen on the real Leon)
      const f = created.find((x) => x.flightNid === Number(variables.f));
      if (!f) return reply(res, 200, { data: null, errors: [{ message: "Flight not found", extensions: { category: "businessLogic" } }] });
      if ((faults().hangPassengerList ?? []).includes(f.payload.flightNo)) await new Promise((r) => setTimeout(r, faults().hangMs ?? 60000));
      f.contacts = (variables.l ?? []).map((x) => ({ contactNid: Number(x.contactNid), departurePassportNid: x.departurePassportNid ?? null, passengerContactNid: nextPaxRow++ })); f.passengerText = null;
      return reply(res, 200, { data: { passengerList: { addPassengersToList: { count: f.contacts.length, realCount: f.contacts.length, isDataSourceContact: true, passengerContactList: f.contacts.map((x) => ({ contact: { contactNid: x.contactNid } })) } } } });
    }
    if (q.includes("savePassengerText(")) {
      const f = created.find((x) => x.flightNid === Number(variables.f));
      if (!f) return reply(res, 200, { data: null, errors: [{ message: "Flight not found", extensions: { category: "businessLogic" } }] });
      if ((faults().refusePassengerText ?? []).includes(f.payload.flightNo)) return reply(res, 400, { data: null, errors: [{ message: `Variable "$t" got invalid value "${variables.t.text}" at "t.text"; Argument 'text' validation failed with reason 'Passenger list is locked by another user'`, extensions: { category: "argumentValidation" } }] });
      if ((faults().hangPassengerText ?? []).includes(f.payload.flightNo)) await new Promise((r) => setTimeout(r, faults().hangMs ?? 60000));
      f.passengerText = variables.t.text; f.paxCount = variables.t.count;
      return reply(res, 200, { data: { passengerList: { savePassengerText: { count: f.paxCount } } } });
    }
    if (q.includes("flightListUpdate(")) {
      const out = [];
      for (const u of variables.l) {
        const f = created.find((x) => x.flightNid === Number(u.flightNid));
        if (!f) return reply(res, 200, { data: null, errors: [{ message: "Flight not found", extensions: { category: "businessLogic" } }] });
        if ((faults().refuseCrewNotes ?? []).includes(f.payload.flightNo)) return reply(res, 200, { data: null, errors: [{ message: "Flight is locked by another user", extensions: { category: "businessLogic" } }] });
        if (u.opsNotes !== undefined) f.opsNotes = u.opsNotes; out.push({ flightNid: f.flightNid });
      }
      return reply(res, 200, { data: { flights: { flightListUpdate: out } } });
    }
    if (q.includes("airportByCode")) { const a = airportByCode(variables.c); return reply(res, 200, { data: { airportByCode: a } }); }
    if (q.includes("aircraftList")) return reply(res, 200, { data: { aircraftList: snap.aircraft } });
    if (q.includes("getAvailableDefinitions")) return reply(res, 200, { data: { checklist: { getAvailableDefinitions: defs } } });
    if (q.includes("flightList(")) {
      const f = variables.f; const s = Date.parse(f.timeInterval.start), e = Date.parse(f.timeInterval.end);
      const mine = created.map(toFlight);
      const all = [...snap.flights.map((x) => ({ ...x, notes: { ops: "" } })), ...mine].filter((x) => { const t = Date.parse(x.startTimeUTC); return t >= s && t <= e && (f.isCnl === undefined || x.isCnl === f.isCnl) && (!f.flightNumber || x.flightNo === f.flightNumber); });
      return reply(res, 200, { data: { flightList: all } });
    }
    if (q.includes("createTrip(")) {
      const fl = variables.t.flights[0]; const v = validate(fl, { v: "t", path: "t.flights[0]", op: "createTrip" }); if (v) return reply(res, v.status, { data: null, errors: v.errors });
      const hang = faults(); if ((hang.hangFlightNo ?? []).includes(fl.flightNo)) { await new Promise((r) => setTimeout(r, hang.hangMs ?? 60000)); }
      const tripNid = nextTrip++; const f = create(fl, tripNid);
      return reply(res, 200, { data: { createTrip: { tripNid, flightList: [{ flightNid: f.flightNid, tripNid }] } } });
    }
    if (q.includes("flightCreate(")) {
      const fl = variables.f; const v = validate(fl, { v: "f", path: "f", op: "flightCreate" }); if (v) return reply(res, v.status, { data: null, errors: v.errors });
      const hang = faults(); if ((hang.hangFlightNo ?? []).includes(fl.flightNo)) { await new Promise((r) => setTimeout(r, hang.hangMs ?? 60000)); }
      const f = create(fl, variables.n); return reply(res, 200, { data: { flightCreate: { flightNid: f.flightNid, tripNid: f.tripNid } } });
    }
    if (q.includes("flight(flightNid")) { const f = created.find((x) => x.flightNid === Number(variables.n)); return reply(res, 200, { data: { flight: f ? toFlight(f) : null } }); }
    if (q.includes("addOrUpdateOpsItems") || q.includes("opsItemStatusUpdate") || q.includes("opsItemNoteUpdate")) {
      const f = created.find((x) => x.flightNid === Number(variables.f));
      const items = variables.i ?? [{ checklistDefinitionNid: variables.c, checklistStatusId: variables.s, note: variables.n }];
      for (const it of items) {
        if ((faults().refuseChecklistDef ?? []).includes(it.checklistDefinitionNid)) return reply(res, 200, { data: null, errors: [{ message: "Checklist is locked by another user", path: ["checklist"], extensions: { category: "businessLogic" } }] });
        const cur = f?.checklist.get(it.checklistDefinitionNid) ?? {}; f?.checklist.set(it.checklistDefinitionNid, { csId: it.checklistStatusId ?? cur.csId, comment: it.note !== undefined ? it.note : cur.comment });
      }
      const key = q.includes("addOrUpdateOpsItems") ? "addOrUpdateOpsItems" : q.includes("opsItemStatusUpdate") ? "opsItemStatusUpdate" : "opsItemNoteUpdate";
      return reply(res, 200, { data: { checklist: { [key]: true } } });
    }
    if (q.includes("flightDelete")) {
      const f = created.find((x) => x.flightNid === Number(variables.n));
      const fx = faults();
      if (f && (fx.refuseCancelFlightNid ?? []).includes(f.flightNid)) return reply(res, 400, { data: null, errors: [{ message: "Flight has a journey log and cannot be cancelled", extensions: { category: "businessLogic" } }] });
      if (f && (fx.hangCancelFlightNid ?? []).includes(f.flightNid)) await new Promise((r) => setTimeout(r, fx.hangMs ?? 60000));
      if (f) f.isCnl = true; return reply(res, 200, { data: { flightDelete: !!f } });
    }
    return reply(res, 400, { errors: [{ message: `mock leon does not know: ${q.slice(0, 60)}` }] });
  } catch (e) { return reply(res, 500, { errors: [{ message: String(e.message) }] }); }
}).listen(PORT, "127.0.0.1", () => console.log(`mock leon on :${PORT} · ${Object.keys(snap.airports).length} airports · ${snap.flights.length} flights`));
