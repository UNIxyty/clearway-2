// The rig's Leon: answers the queries and mutations the intake sends, from a READ-ONLY snapshot of cwy-cwy
// (rig/intake/leon-snapshot.mjs) plus whatever the rig creates. Refusals use the exact wording and shape
// captured from real Leon on 2026-09-30 (disposable test flight): HTTP 400, errors[].extensions.category
// "argumentValidation". Faults for tests come from rig/.scratch/leon-mock-faults.json:
//   { "refuseFlightNo": ["YULSA"], "refuseLegOnAdes": ["LIPZ"], "hangFlightNo": ["AMQ5V"], "hangMs": 60000,
//     "refuseChecklistDef": [1231] }
// Every mutation is appended to rig/.scratch/leon-mock-log.jsonl (the evidence for "one flight, not two").
import http from "node:http";
import { readFileSync, appendFileSync, existsSync } from "node:fs";
import path from "node:path";
const PORT = Number(process.env.PORT || 3995);
const SCR = path.resolve(process.env.RIG_SCRATCH || "../.scratch");
const snap = JSON.parse(readFileSync(path.join(SCR, "leon-snapshot.json"), "utf8"));
const faults = () => { try { return JSON.parse(readFileSync(path.join(SCR, "leon-mock-faults.json"), "utf8")); } catch { return {}; } };
const log = (e) => appendFileSync(path.join(SCR, "leon-mock-log.jsonl"), JSON.stringify({ at: new Date().toISOString(), ...e }) + "\n");
const airportByCode = (c) => { const k = String(c).toUpperCase(); const hit = snap.airports[k] ?? Object.values(snap.airports).find((a) => a && (a.code.icao === k || a.code.iata === k)); return hit ?? null; };
let nextFlight = 90000001, nextTrip = 9000001;
const created = []; // { flightNid, tripNid, payload, isCnl, checklist: Map }
const defs = snap.definitions;
function toFlight(f) { return { flightNid: f.flightNid, tripNid: f.tripNid, flightNo: f.payload.flightNo, startTimeUTC: f.payload.startTimeUTC.replace(/Z?$/, "Z"), endTimeUTC: f.payload.endTimeUTC.replace(/Z?$/, "Z"), isCnl: f.isCnl, creationDateTime: f.at, acft: f.payload.aircraftNid ? { registration: snap.aircraft.find((a) => a.acftNid === f.payload.aircraftNid)?.registration ?? null } : null, startAirport: { code: { icao: airportByCode(f.payload.adepCode)?.code.icao } }, endAirport: { code: { icao: airportByCode(f.payload.adesCode)?.code.icao } }, notes: { ops: f.payload.opsNotes ?? "" }, trip: { tripNumber: `RIG/${f.tripNid}` }, checklist: { allItems: [...f.checklist.entries()].map(([cdNid, v]) => ({ cdNid, csId: v.csId, comment: v.comment ?? null })) } }; }
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
  created.push(f); return f;
}
const reply = (res, status, body) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
http.createServer(async (req, res) => {
  let b = ""; for await (const c of req) b += c;
  if (req.url.startsWith("/access_token/refresh")) { res.writeHead(200, { "content-type": "text/plain" }); return res.end("rig-mock-leon-access-token-" + "x".repeat(40)); }
  if (!req.url.startsWith("/api/graphql")) return reply(res, 404, { errors: [{ message: "not in the mock" }] });
  const { query = "", variables = {} } = JSON.parse(b || "{}");
  const q = query.replace(/\s+/g, " ");
  if (/mutation/.test(q)) log({ q: q.slice(0, 80), variables });
  try {
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
    if (q.includes("flightDelete")) { const f = created.find((x) => x.flightNid === Number(variables.n)); if (f) f.isCnl = true; return reply(res, 200, { data: { flightDelete: !!f } }); }
    return reply(res, 400, { errors: [{ message: `mock leon does not know: ${q.slice(0, 60)}` }] });
  } catch (e) { return reply(res, 500, { errors: [{ message: String(e.message) }] }); }
}).listen(PORT, "127.0.0.1", () => console.log(`mock leon on :${PORT} · ${Object.keys(snap.airports).length} airports · ${snap.flights.length} flights`));
