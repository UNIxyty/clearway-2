// READ-ONLY snapshot of the Leon (cwy-cwy) data the intake reads, for the rig's mock Leon. Run from a normal
// shell with .env (not the rig):  node --env-file=.env rig/intake/leon-snapshot.mjs
// Writes rig/.scratch/leon-snapshot.json (git-ignored). Ops notes of real flights are NOT kept.
import { writeFileSync, mkdirSync } from "node:fs";
import { leonGraphql } from "../../agent/lib/intake/leon-client.mjs";
const codes = ["EGKB", "EYVI", "LIPZ", "EPRZ", "LYBE", "LFMN", "EVRA", "LOWW", "EKCH", "EGLL", "LFPG", "EETN", "EPWA", "EDDF", "EHAM", "EFHK", "LEPA", "LKPR", "BQH", "VNO", "VCE", "RZE", "BEG", "NCE", "RIX", "VIE"];
const out = { takenAt: new Date().toISOString(), airports: {}, aircraft: [], definitions: [], flights: [] };
for (const c of codes) { const r = await leonGraphql(`query($c:AirportCodeScalar!){ airportByCode(airportCode:$c){ name city code{ icao iata } timezone{ name nativeTimezoneName } } }`, { c }); out.airports[c] = r.data?.airportByCode ?? null; }
out.aircraft = (await leonGraphql(`query{ aircraftList(onlyActive:true){ acftNid registration acftType{ icao } } }`)).data?.aircraftList ?? [];
out.definitions = (await leonGraphql(`query{ checklist{ getAvailableDefinitions(groupId: OPS){ nid label section isAutoAddToLeg enableForUse defaultStatus{ checklistStatusId } statuses{ checklistStatusId caption } } } }`)).data?.checklist?.getAvailableDefinitions ?? [];
for (const [s, e] of [["2026-09-02T00:00:00Z", "2026-09-06T00:00:00Z"], ["2026-09-29T00:00:00Z", "2026-10-02T00:00:00Z"], ["2027-09-01T00:00:00Z", "2027-09-05T00:00:00Z"], ["2027-09-28T00:00:00Z", "2027-10-01T00:00:00Z"]]) {
  const r = await leonGraphql(`query($f:FlightFilter!){ flightList(filter:$f){ flightNid tripNid flightNo startTimeUTC endTimeUTC isCnl creationDateTime acft{ registration } startAirport{ code{ icao } } endAirport{ code{ icao } } trip{ tripNumber } } }`, { f: { timeInterval: { start: s, end: e }, isCnl: false } });
  out.flights.push(...(r.data?.flightList ?? []));
}
mkdirSync("rig/.scratch", { recursive: true }); writeFileSync("rig/.scratch/leon-snapshot.json", JSON.stringify(out));
console.log(`airports ${Object.values(out.airports).filter(Boolean).length}/${codes.length} · aircraft ${out.aircraft.length} · definitions ${out.definitions.length} · flights ${out.flights.length}`);
