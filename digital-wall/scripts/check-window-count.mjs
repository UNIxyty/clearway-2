// READ-ONLY: runs the flight-count window check (bug report 7 follow-up item 2) against Leon on a copy of the cache
// held in memory, and prints Leon vs wall per operator. Never persists (no persistLocalCache, no recordWindowCheck).
//   docker compose exec -T digital-wall-backend node scripts/check-window-count.mjs
import fs from "node:fs";
import { OperatorsStore } from "../operators-store.mjs";
import { LeonTimelineService } from "../leon-sync.mjs";
const svc = new LeonTimelineService({ staticRoot: process.cwd(), operatorsStore: new OperatorsStore() });
svc.persistLocalCache = async () => { throw new Error("dry run must not persist"); };
const profiles = JSON.parse(fs.readFileSync("data/display-settings.json", "utf8"));
const def = profiles.default ?? {};
svc.getVisibilitySettings = async () => ({ upcomingHorizonHours: def.upcomingHorizonHours ?? 24, postLandingHours: def.postLandingHours ?? 2.5 });
console.log("window settings", JSON.stringify(await svc.wallWindowSettings()));
await svc.loadLocalCache();
console.log("cache loaded", svc.flightsByNid.size);
for (const op of await svc.listConfiguredOperators()) {
  const t0 = Date.now();
  try {
    const { record } = await svc.windowCheck(op.oprId);
    console.log(`${op.oprId.padEnd(8)} hidden-aircraft flights ${String(record.hidden).padStart(3)} · Leon ${String(record.leon).padStart(3)} · wall before ${String(record.before.wall).padStart(3)} (missing ${record.before.missing}, extra ${record.before.extra}, stale ${record.before.stale}) → after ${record.wall}${record.missing.length || record.extra.length ? " STILL " + JSON.stringify({ missing: record.missing, extra: record.extra }) : " agree"} · ${Date.now() - t0} ms${record.missingBefore.length ? " · missing e.g. " + record.missingBefore.join(",") : ""}${record.extraBefore.length ? " · extra e.g. " + record.extraBefore.join(",") : ""}`);
  } catch (e) { console.log(op.oprId, "ERR", e.message.slice(0, 200)); }
}
process.exit(0);
