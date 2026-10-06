// READ-ONLY: every timing field Leon holds for the flights matching a flight number (default ORO2151) in a
// window, beside what the wall's cache holds and the bar the wall would draw. Writes nothing.
//   docker compose exec -T digital-wall-backend node scripts/check-flight-times.mjs [flightNo=ORO2151] [daysBack=3] [daysAhead=40]
import fs from "node:fs";
import path from "node:path";
import { OperatorsStore } from "../operators-store.mjs";
import { LeonTimelineService } from "../leon-sync.mjs";

const fno = String(process.argv[2] ?? "ORO2151").replace(/\s+/g, "").toUpperCase();
const back = Number(process.argv[3] ?? 3), ahead = Number(process.argv[4] ?? 40);
const svc = new LeonTimelineService({ staticRoot: process.cwd(), operatorsStore: new OperatorsStore() });
const cache = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "data", "timeline-cache.json"), "utf8"));
const cached = new Map(cache.flights.map((e) => [String(e.flight.flightNid), e.flight]));
const ops = await svc.listConfiguredOperators();
const fw = await svc.introspectTypeFields("FlightWatch", ops[0].oprId).catch(() => new Set());
const fl = await svc.introspectTypeFields("Flight", ops[0].oprId).catch(() => new Set());
const timeLike = (s) => [...s].filter((n) => /eet|ete|eta|etd|sta|std|time|block|dur|ldg|to(Iso)?$|landing|takeoff|off|on/i.test(n));
console.log(`FlightWatch time-like fields: ${timeLike(fw).join(", ")}`);
console.log(`Flight time-like fields: ${timeLike(fl).join(", ")}`);
const wantFw = [...fw].filter((n) => /^(eet|eetIso|ete|eta|etaIso|etd|etdIso|atd|ata|toIso|ldgIso|offBlock|bloffIso|blonIso|ctotIso)$/.test(n));
const wantFl = [...fl].filter((n) => /^(startTimeUTC|endTimeUTC|eet|blockTime|flightTime|duration)$/.test(n));
for (const op of ops) {
  for (let t = Date.now() - back * 86400_000; t < Date.now() + ahead * 86400_000; t += 2 * 86400_000) {
    const a = new Date(t).toISOString().slice(0, 10), b = new Date(t + 2 * 86400_000).toISOString().slice(0, 10);
    let data;
    try { data = await svc.graphqlRequest(`query { flightList(filter: { isCnl: false, timeInterval: { start: "${a}", end: "${b}" } }) { flightNid flightNo ${wantFl.join(" ")} startAirport { code { icao } } endAirport { code { icao } } flightWatch { ${wantFw.join(" ")} } } }`, undefined, op.oprId); }
    catch (e) { console.log(`${op.oprId} ${a}: ${String(e.message).slice(0, 100)}`); break; }
    for (const f of data.flightList ?? []) {
      if (String(f.flightNo ?? "").replace(/\s+/g, "").toUpperCase() !== fno) continue;
      const c = cached.get(String(f.flightNid));
      console.log(`\n${op.oprId} ${f.flightNid} ${f.flightNo} ${f.startAirport?.code?.icao}→${f.endAirport?.code?.icao}`);
      console.log(`  Leon flight: ${wantFl.map((k) => `${k}=${f[k] ?? "-"}`).join("  ")}`);
      console.log(`  Leon flightWatch: ${wantFw.map((k) => `${k}=${f.flightWatch?.[k] ?? "-"}`).join("  ")}`);
      console.log(`  wall cache: ${c ? `startTimeUTC=${c.startTimeUTC} endTimeUTC=${c.endTimeUTC} etd=${c.etd} eta=${c.eta} atd=${c.atd} ata=${c.ata} eet=${c.eet ?? "-"}` : "(not in cache)"}`);
    }
  }
}
process.exit(0);
