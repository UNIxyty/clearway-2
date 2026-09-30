// A deliberately disposable test flight in Leon (cwy-cwy), to settle two facts the docs leave open:
//   1. the timestamp format Leon accepts and what it stores (with a "Z", and without one);
//   2. what a refusal looks like (unknown airport, end before start).
// It creates ONE trip far in the future, reads it back, forces the refusals, reads the checklist, then
// deletes every flight and the trip and checks they are gone. Everything it created is deleted in `finally`.
// Run: node --env-file=.env rig/intake/leon-disposable-flight.mjs      (prints no token, no personal data)
import { leonGraphql, leonOperator } from "../../agent/lib/intake/leon-client.mjs";

const created = { tripNid: null, flights: [] };
const out = (label, v) => console.log(`\n## ${label}\n${typeof v === "string" ? v : JSON.stringify(v, null, 2)}`);
const MARK = "CWY-INTAKE DISPOSABLE TEST - safe to delete";
const FLIGHT_FIELDS = `flightNid tripNid flightNo status isCnl startTime endTime startTimeUTC endTimeUTC startTimeLocal endTimeLocal startAirport{ code{icao iata} } endAirport{ code{icao iata} } notes{ ops } externalId{ salesforceId }`;

async function main() {
  out("operator", leonOperator());
  // 1. Create: leg 1 with a Z timestamp, via createTrip.
  const leg1 = { flightNo: "CWYTEST1", startTimeUTC: "2027-03-10T10:00:00Z", endTimeUTC: "2027-03-10T11:05:00Z", adepCode: "EVRA", adesCode: "EYVI", isEmptyLeg: true, opsNotes: MARK };
  const c = await leonGraphql(`mutation($t:TripCreate!){ createTrip(trip:$t){ tripNid tripNumber flightList{ ${FLIGHT_FIELDS} } } }`, { t: { flights: [leg1], status: "OPTION", tripType: "other" } });
  out("createTrip (startTimeUTC sent as 2027-03-10T10:00:00Z)", { httpStatus: c.httpStatus, ms: c.ms, errors: c.errors, data: c.data });
  if (c.errors || !c.data?.createTrip) throw new Error("createTrip did not create the test trip; stopping");
  created.tripNid = c.data.createTrip.tripNid;
  for (const f of c.data.createTrip.flightList) created.flights.push(f.flightNid);

  // 2. Leg 2 via flightCreate, time WITHOUT a zone designator — does Leon read it as UTC?
  const leg2 = { flightNo: "CWYTEST2", startTimeUTC: "2027-03-10T13:00:00", endTimeUTC: "2027-03-10T14:05:00", adepCode: "EYVI", adesCode: "EVRA", isEmptyLeg: true, opsNotes: MARK };
  const c2 = await leonGraphql(`mutation($n:TripNid!,$f:FlightCreate!){ flightCreate(tripNid:$n, flight:$f){ ${FLIGHT_FIELDS} } }`, { n: created.tripNid, f: leg2 });
  out("flightCreate (startTimeUTC sent as 2027-03-10T13:00:00, no zone)", { httpStatus: c2.httpStatus, ms: c2.ms, errors: c2.errors, data: c2.data });
  if (c2.data?.flightCreate?.flightNid) created.flights.push(c2.data.flightCreate.flightNid);

  // 3. Forced refusals.
  const bad1 = { ...leg2, flightNo: "CWYTEST3", adepCode: "ZZZQ" };
  const r1 = await leonGraphql(`mutation($n:TripNid!,$f:FlightCreate!){ flightCreate(tripNid:$n, flight:$f){ flightNid } }`, { n: created.tripNid, f: bad1 });
  out("refusal 1: unknown airport ZZZQ", { httpStatus: r1.httpStatus, ms: r1.ms, errors: r1.errors, data: r1.data });
  if (r1.data?.flightCreate?.flightNid) created.flights.push(r1.data.flightCreate.flightNid);
  const bad2 = { ...leg2, flightNo: "CWYTEST4", startTimeUTC: "2027-03-10T16:00:00Z", endTimeUTC: "2027-03-10T15:00:00Z" };
  const r2 = await leonGraphql(`mutation($n:TripNid!,$f:FlightCreate!){ flightCreate(tripNid:$n, flight:$f){ flightNid } }`, { n: created.tripNid, f: bad2 });
  out("refusal 2: end before start", { httpStatus: r2.httpStatus, ms: r2.ms, errors: r2.errors, data: r2.data });
  if (r2.data?.flightCreate?.flightNid) created.flights.push(r2.data.flightCreate.flightNid);
  const r3 = await leonGraphql(`mutation($t:TripCreate!){ createTrip(trip:$t){ tripNid } }`, { t: { flights: [{ ...leg1, flightNo: "CWYTEST5", adesCode: "ZZZQ" }], status: "OPTION" } });
  out("refusal 3: createTrip with unknown airport", { httpStatus: r3.httpStatus, ms: r3.ms, errors: r3.errors, data: r3.data });
  if (r3.data?.createTrip?.tripNid) out("UNEXPECTED: refusal 3 created a trip", r3.data);

  // 4. Read back and checklist (what is auto-added before we add anything).
  for (const nid of created.flights) {
    const f = await leonGraphql(`query($n:FlightNid!){ flight(flightNid:$n){ ${FLIGHT_FIELDS} checklist{ allItems{ cdNid csId comment } } } }`, { n: nid });
    out(`read back flight ${nid}`, { errors: f.errors, data: f.data });
  }
  const defs = await leonGraphql(`query{ checklist{ getAvailableDefinitions(groupId: OPS){ nid label section isAutoAddToLeg enableForUse defaultStatus{ checklistStatusId caption } statuses{ checklistStatusId caption } } } }`);
  out("OPS checklist definitions (count, first 3, auto-add count)", { errors: defs.errors, count: defs.data?.checklist?.getAvailableDefinitions?.length, autoAdd: defs.data?.checklist?.getAvailableDefinitions?.filter((d) => d.isAutoAddToLeg).length, sample: defs.data?.checklist?.getAvailableDefinitions?.slice(0, 3) });

  // 5. Duplicate lookup as the intake will do it: flightList by flight number over the day.
  const dl = await leonGraphql(`query($f:FlightFilter!){ flightList(filter:$f){ flightNid flightNo startTimeUTC isCnl } }`, { f: { timeInterval: { start: "2027-03-10T00:00:00Z", end: "2027-03-11T00:00:00Z" }, flightNumber: "CWYTEST1" } });
  out("flightList by flightNumber CWYTEST1 on 2027-03-10", { errors: dl.errors, data: dl.data });
}

async function cleanup() {
  for (const nid of created.flights) {
    const d = await leonGraphql(`mutation($n:FlightNid!){ flightDelete(flightNid:$n) }`, { n: nid });
    out(`flightDelete ${nid}`, { errors: d.errors, data: d.data });
    const after = await leonGraphql(`query($n:FlightNid!){ flight(flightNid:$n){ flightNid isCnl } }`, { n: nid });
    out(`after delete, flight ${nid}`, { errors: after.errors, data: after.data });
  }
  if (created.tripNid) {
    const t = await leonGraphql(`mutation($n:TripNid!){ deleteTrip(tripNid:$n) }`, { n: created.tripNid });
    out(`deleteTrip ${created.tripNid}`, { errors: t.errors, data: t.data });
  }
}

try { await main(); } catch (e) { out("stopped", String(e.message)); } finally { await cleanup(); }
