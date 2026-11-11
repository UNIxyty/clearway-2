// The red ring, proven against Leon (2026-11-11): the flights Leon reports as unconfirmed right now (status OPTION or
// OPPORTUNITY, isConfirmed false, or times to be confirmed) in the wall's window, and whether the wall's own feed
// marks each one (isConfirmed false in the running wall's cache, which is what every display and phone draws from).
// Read-only; flight numbers, statuses and counts only. Runs inside the wall container, which holds the Leon token:
//   docker cp scripts/prod-checks/leon-unconfirmed-walk.mjs digital-wall-backend:/tmp/u.mjs && docker exec digital-wall-backend node /tmp/u.mjs
import { readFileSync } from "node:fs";
import { LeonTimelineService } from "/app/leon-sync.mjs";
import { OperatorsStore } from "/app/operators-store.mjs";

const operatorsStore = new OperatorsStore();
const svc = new LeonTimelineService({ operatorsStore });
const now = new Date();
const s = new Date(now.getTime() - 6 * 3600_000).toISOString().slice(0, 19) + "Z";
const e = new Date(now.getTime() + 7 * 24 * 3600_000).toISOString().slice(0, 19) + "Z";
// every operator the wall syncs (the ops operator from the env, plus the ones in the operators store)
let oprIds = [svc.operatorId].filter(Boolean);
try { const ops = await operatorsStore.listOperators({ includeInactive: false }); oprIds = [...new Set([...oprIds, ...ops.map((o) => String(o.oprId ?? o.id ?? "")).filter(Boolean)])]; } catch (err) { console.log(`(operators store not readable: ${err?.message ?? err}; the env operator only)`); }
const leon = [];
for (const oprId of oprIds) {
  try { const data = await svc.graphqlRequest(`query{ flightList(filter:{ isCnl:false, timeInterval:{ start:"${s}", end:"${e}" } }){ flightNo flightNid status isConfirmed isTimesToBeConfirmed trip{ tripStatus } } }`, undefined, oprId); for (const f of data?.flightList ?? []) leon.push({ ...f, oprId }); }
  catch (err) { console.log(`  operator ${oprId}: Leon did not answer (${String(err?.message ?? err).slice(0, 80)})`); }
}
console.log(`operators read: ${oprIds.length}`);
let cache = { flights: [] };
try { cache = JSON.parse(readFileSync("/app/data/timeline-cache.json", "utf8")); } catch { /* judged below */ }
// the cache: { savedAt, flights: [{ key, flight, aircraft }] } — `flight` is the mapped record the feed sends
const records = (Array.isArray(cache.flights) ? cache.flights : []).map((x) => x.flight ?? x).filter(Boolean);
const byNid = new Map(records.map((f) => [String(f.flightNid ?? f.nid ?? f.id), f]));
const unconfirmedInLeon = leon.filter((f) => f.isConfirmed === false || ["OPTION", "OPPORTUNITY"].includes(String(f.status ?? "").toUpperCase()) || ["OPTION", "OPPORTUNITY"].includes(String(f.trip?.tripStatus ?? "").toUpperCase()) || f.isTimesToBeConfirmed === true);
console.log(`Leon: ${leon.length} flights in the window (−6 h … +7 d, the wall's sync span), ${unconfirmedInLeon.length} reported unconfirmed; wall cache: ${records.length} records`);
let marked = 0;
for (const f of unconfirmedInLeon) {
  const w = byNid.get(String(f.flightNid));
  const wallMark = w ? (w.isConfirmed === false ? "ring (isConfirmed false)" : `NO RING (isConfirmed ${w.isConfirmed})`) : "not in the wall's cache";
  if (w && w.isConfirmed === false) marked += 1;
  console.log(`  ${String(f.flightNo).padEnd(9)} Leon: status ${f.status ?? "?"} · trip ${f.trip?.tripStatus ?? "?"} · isConfirmed ${f.isConfirmed} · TBC ${f.isTimesToBeConfirmed ?? "?"}   → wall: ${wallMark}`);
}
const inCache = unconfirmedInLeon.filter((f) => byNid.has(String(f.flightNid))).length;
console.log(`${marked} of ${inCache} unconfirmed flights in the wall's cache carry the ring mark${unconfirmedInLeon.length === 0 ? " (none unconfirmed right now: nothing to ring)" : ""}`);
process.exit(inCache === marked ? 0 : 1);
