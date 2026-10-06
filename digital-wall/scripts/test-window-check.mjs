// Stub-Leon test of the flight-count window check (bug report 7 follow-up item 2). No network, no credentials:
// Leon is a stub, the cache lives in a temp directory.   node digital-wall/scripts/test-window-check.mjs
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { LeonTimelineService } from "../leon-sync.mjs";
import { windowCheckLine, windowRepairLine } from "../../opsboard-react/src/services/windowCheck.js";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "window-check-"));
const H = 3600_000, now = Date.now();
const iso = (ms) => new Date(ms).toISOString().replace(/\.\d+Z$/, "Z");
let hidden = [];
const leon = new Map(); // nid -> raw
const raw = (nid, depH, durH = 1, reg = "LY-AAA", extra = {}) => ({ flightNid: nid, flightNo: `LY${nid}`, status: "CONFIRMED", isConfirmed: true, trip: { tripStatus: "confirmed" }, startTimeUTC: iso(now + depH * H), endTimeUTC: iso(now + (depH + durH) * H), acft: { aircraftNid: 1, registration: reg }, flightWatch: {}, ...extra });
let failResync = false;
const svc = new LeonTimelineService({ staticRoot: process.cwd(), operatorsStore: { listConfiguredOperators: async () => [{ oprId: "klj", name: "klj" }], listHiddenAircraftKeys: async () => hidden, recordSyncOutcome: async () => {} } });
svc.cacheFilePath = path.join(dir, "timeline-cache.json");
svc.getVisibilitySettings = async () => ({ upcomingHorizonHours: 24, postLandingHours: 2.5 });
svc.listConfiguredOperators = async () => [{ oprId: "klj", name: "klj" }];
svc.flightSelectionByOperator.set("klj", "flightNid");
svc.checklistDefsByOperator.set("klj", null);
svc.aircraftCacheByOperator.set("klj", []); svc.aircraftFetchedAtByOperator.set("klj", Date.now());
svc.syncStateByOperator.set("klj", { lastSyncTimestamp: iso(now) });
svc.fetchFlightsForOperatorRange = async (op, from, to) => [...leon.values()].filter((f) => Date.parse(f.startTimeUTC) >= from - 24 * H && Date.parse(f.startTimeUTC) <= +to + 24 * H);
svc.graphqlRequest = async (q) => {
  if (q.includes("getModifiedFlightList")) return { flights: { getModifiedFlightList: { timestamp: Math.floor(Date.now() / 1000), created: [], changed: [], deleted: [] } } };
  const m = /flight\(flightNid: (\d+)\)/.exec(q);
  if (m) { if (failResync) throw new Error("stub: Leon unreachable"); return { flight: leon.get(Number(m[1])) ?? null }; }
  throw new Error("unexpected query " + q.slice(0, 80));
};
const { mapLeonFlight } = await import("../leon-sync.mjs");
const cachePut = (r) => { const f = mapLeonFlight(r); f.oprId = "klj"; svc.flightsByNid.set(`klj:${r.flightNid}`, f); svc.aircraftByFlightNid.set(`klj:${r.flightNid}`, { oprId: "klj", aircraftNid: 1, registration: r.acft.registration }); };
const ok = (c, m) => { console.log(`${c ? "PASS" : "FAIL"}  ${m}`); if (!c) process.exitCode = 1; };
const cycle = async () => { await svc.runSyncCycle(); return svc.getWindowCheck(); };

// A: 10 flights in Leon's window; the wall cached only 7 (3 never-modified, like the klj legs); one beyond horizon.
for (let i = 1; i <= 10; i++) leon.set(i, raw(i, i * 2 - 1));
leon.set(50, raw(50, 30)); // dep +30 h: outside the 24 h horizon, inside the pull
for (let i = 1; i <= 7; i++) cachePut(leon.get(i));
let wc = await cycle();
const recA = svc.windowCheckByOperator.get("klj");
ok(recA.before.wall === 7 && recA.before.missing === 3 && recA.leon === 10, `A before: Leon 10 · wall 7 · 3 missing (got Leon ${recA.leon} · wall ${recA.before.wall} · missing ${recA.before.missing})`);
ok(wc.agree && wc.leon === 10 && wc.wall === 10, `A after repair: agree, 10/10 (got ${wc.leon}/${wc.wall}, agree ${wc.agree})`);
ok(svc.flightsByNid.has("klj:50"), "A: the +30 h flight is cached too (pull reaches horizon + 12 h)");
ok(windowCheckLine(wc).level === "ok" && /Leon 10 · wall 10/.test(windowCheckLine(wc).text), `A wall line quiet, console: "${windowCheckLine(wc).text}"`);
ok(/klj 3 missing/.test(windowRepairLine(wc) ?? ""), `A console repair line: "${windowRepairLine(wc)}"`);

// B: Leon deletes one flight → evicted by the pull → agree. Pax change on another → stale before, refreshed.
leon.delete(4);
leon.set(5, { ...leon.get(5), passengerList: { count: 9 } });
wc = await cycle();
const recB = svc.windowCheckByOperator.get("klj");
ok(recB.before.extra === 1 && recB.before.stale === 1 && wc.agree && wc.wall === 9, `B: 1 extra + 1 stale (pax) before, agree 9/9 after (got extra ${recB.before.extra}, stale ${recB.before.stale}, ${wc.leon}/${wc.wall})`);
ok(svc.flightsByNid.get("klj:5").passengerCount === 9, "B: pax 9 reached the cache");

// C: hidden aircraft is excluded on BOTH sides.
leon.set(60, raw(60, 3, 1, "LY-HID")); hidden = ["klj:LY-HID"];
wc = await cycle();
ok(wc.agree && wc.leon === 9, `C: hidden aircraft not counted (Leon ${wc.leon} · wall ${wc.wall})`);

// D: Leon loses 6 of 9 at once (looks like a partial response) → eviction refused → per-flight re-read: Leon
//    says they are gone → evicted → agree.
for (const n of [1, 2, 3, 6, 7, 8]) leon.delete(n);
wc = await cycle();
ok(wc.agree && wc.wall === 3, `D: implausible mass-absence refused, then re-read one by one and evicted (Leon ${wc.leon} · wall ${wc.wall})`);

// E: the same, but the re-reads fail → STILL disagree → wall shows the error line.
for (let i = 20; i <= 26; i++) { leon.set(i, raw(i, i - 18)); }
await cycle();
for (let i = 20; i <= 25; i++) leon.delete(i);
failResync = true;
wc = await cycle();
const line = windowCheckLine(wc);
ok(!wc.agree && line.level === "error" && /Leon has \d+ flights in the wall's window, the wall shows \d+/.test(line.text), `E: unresolved → wall error line: "${line.text}"`);
failResync = false;
wc = await cycle();
ok(wc.agree, `E: next cycle with Leon reachable → agree again (${wc.leon}/${wc.wall})`);

// F: client-side drop and staleness.
ok(windowCheckLine(wc, { received: 12, drawn: 11 }).level === "error", `F: wall drew fewer than it was sent → "${windowCheckLine(wc, { received: 12, drawn: 11 }).text}"`);
ok(windowCheckLine({ ...wc, ageMs: 11 * 60_000 }).level === "warn", `F: no check for 11 min → "${windowCheckLine({ ...wc, ageMs: 11 * 60_000 }).text}"`);

// G: the record file.
const lines = fs.readFileSync(path.join(dir, "window-check.jsonl"), "utf8").trim().split("\n");
ok(lines.length === 7, `G: one record line per cycle (${lines.length}); first: ${lines[0]}`);

// H: confirmation rule.
const m = (x) => mapLeonFlight({ flightNid: 1, startTimeUTC: iso(now), endTimeUTC: iso(now + H), ...x }).isConfirmed;
ok(m({ status: "CONFIRMED", isConfirmed: true, trip: { tripStatus: "confirmed" } }) === true, "H: CONFIRMED/true/confirmed → confirmed");
ok(m({ status: "OPTION", isConfirmed: false, trip: { tripStatus: "option" } }) === false, "H: OPTION → ring");
ok(m({ status: "OPPORTUNITY" }) === false, "H: OPPORTUNITY → ring");
ok(m({ status: "CONFIRMED", isConfirmed: false }) === false, "H: CONFIRMED but flight.isConfirmed false → ring");
ok(m({ status: "CONFIRMED", trip: { tripStatus: "quotation" } }) === false, "H: CONFIRMED but trip status 'quotation' → ring");
ok(m({ status: "CONFIRMED", trip: { tripStatus: "Confirmed " } }) === true, "H: trip status case/space-insensitive");
process.exit();
