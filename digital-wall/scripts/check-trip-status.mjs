// READ-ONLY: compares each flight's trip status in Leon (the source) with what the wall holds in its cache.
// One flightList query per configured operator over the window the wall shows, plus a schema check for any
// other status-like field on Flight / Trip. Writes nothing, anywhere.
//   docker compose exec -T digital-wall-backend node scripts/check-trip-status.mjs [hoursBack=3] [hoursAhead=24]
// Prints one line per flight: Leon's status, the cache's status and isConfirmed, and whether they agree.
import fs from "node:fs";
import path from "node:path";
import { OperatorsStore } from "../operators-store.mjs";
import { LeonTimelineService } from "../leon-sync.mjs";

const back = Number(process.argv[2] ?? 3), ahead = Number(process.argv[3] ?? 24);
const from = new Date(Date.now() - back * 3600_000).toISOString().replace(/\.\d+Z$/, "Z");
const to = new Date(Date.now() + ahead * 3600_000).toISOString().replace(/\.\d+Z$/, "Z");
const svc = new LeonTimelineService({ staticRoot: process.cwd(), operatorsStore: new OperatorsStore() });
const cache = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "data", "timeline-cache.json"), "utf8"));
const cached = new Map(cache.flights.map((e) => [String(e.flight.flightNid), e.flight]));
const ops = await svc.listConfiguredOperators();
console.log(`window ${from} → ${to} · ${ops.length} operators · cache saved ${cache.savedAt}`);
let schemaShown = false; const rows = [];
for (const op of ops) {
  try {
    if (!schemaShown) {
      for (const t of ["Flight", "Trip", "TripSimple"]) {
        const f = await svc.introspectTypeFields(t, op.oprId).catch(() => new Set());
        console.log(`schema ${t}: ${[...f].filter((n) => /status|confirm|option|trip/i.test(n)).join(", ") || "(none)"}`);
      }
      schemaShown = true;
    }
    // Leon caps query complexity (1600): one query per 48 h slice, sequential (no hammering).
    for (let t = Date.parse(from); t < Date.parse(to); t += 48 * 3600_000) {
      const a = new Date(t).toISOString().replace(/\.\d+Z$/, "Z"), b = new Date(Math.min(t + 48 * 3600_000, Date.parse(to))).toISOString().replace(/\.\d+Z$/, "Z");
      const data = await svc.graphqlRequest(`query { flightList(filter: { isCnl: false, timeInterval: { start: "${a}", end: "${b}" } }) { flightNid flightNo status isConfirmed isTimesToBeConfirmed flightConfirmationTime startTimeUTC acft { registration } trip { tripNid tripNumber tripStatus } } }`, undefined, op.oprId);
      for (const f of data.flightList ?? []) if (!rows.some((r) => r.flightNid === f.flightNid)) rows.push({ op: op.oprId, ...f });
    }
  } catch (e) { console.log(`${op.oprId}: ${String(e.message).slice(0, 120)}`); }
}
rows.sort((a, b) => String(a.startTimeUTC).localeCompare(String(b.startTimeUTC)));
let disagree = 0;
for (const r of rows) {
  const c = cached.get(String(r.flightNid));
  const leonConfirmed = String(r.status ?? "").toUpperCase() === "CONFIRMED";
  const leonUnconfirmed = !leonConfirmed || r.isConfirmed === false || String(r.trip?.tripStatus ?? "confirmed").toLowerCase() !== "confirmed";
  const agree = c ? (c.isConfirmed !== false) === !leonUnconfirmed : null;
  if (agree === false) disagree += 1;
  console.log(`${r.op.padEnd(8)} ${String(r.flightNid).padEnd(9)} ${String(r.flightNo ?? "").padEnd(8)} ${String(r.acft?.registration ?? "").padEnd(8)} ${r.startTimeUTC} Leon status=${String(r.status).padEnd(10)} trip=${String(r.trip?.tripStatus).padEnd(10)} flight.isConfirmed=${String(r.isConfirmed).padEnd(5)} timesTBC=${String(r.isTimesToBeConfirmed).padEnd(5)} confirmedAt=${r.flightConfirmationTime ?? "-"} | wall=${c ? `isConfirmed=${c.isConfirmed}` : "(not in cache)"}${agree === false ? "  ✗ DISAGREE" : ""}`);
}
console.log(`${rows.length} flights in Leon for the window; ${disagree} disagree with the wall's cache on status; ${rows.filter((r) => String(r.status).toUpperCase() !== "CONFIRMED").length} status≠CONFIRMED; ${rows.filter((r) => r.isConfirmed === false).length} flight.isConfirmed=false; ${rows.filter((r) => r.isTimesToBeConfirmed === true).length} times-to-be-confirmed; ${rows.filter((r) => !cached.has(String(r.flightNid))).length} not in the wall's cache.`);
process.exit(0);
