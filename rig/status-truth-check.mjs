// Statuses say what they prove (2026-11-03, docs/success-too-early.md › Every status, traced). The backend halves,
// without a browser: the Leon feed verdict every reader uses, and the TV's NOTAM sign tied to today.
//   node rig/status-truth-check.mjs
let failures = 0; const ok = (c, what, d = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${what}${d ? `  · ${String(d).slice(0, 160)}` : ""}`); if (!c) failures += 1; };
const leonMod = await import("../digital-wall/leon-sync.mjs");
const Leon = Object.values(leonMod).find((v) => typeof v === "function" && v.prototype && "feedVerdict" in v.prototype);
const feed = (state, pollMs = 120_000) => { const o = Object.create(Leon.prototype); o.state = { configured: true, ...state }; o.pollMs = pollMs; return o.feedVerdict(); };
const now = Date.now(), recent = new Date(now - 60_000).toISOString(), old = new Date(now - 40 * 60_000).toISOString();
ok(feed({ healthy: null, lastRunAt: null }) === "unknown", "before any cycle: unknown (it used to start healthy)");
ok(feed({ healthy: true, lastRunAt: recent, operatorsOk: 4, operatorsTotal: 4 }) === "working", "every operator synced a minute ago: working");
ok(feed({ healthy: true, lastRunAt: recent, operatorsOk: 3, operatorsTotal: 4 }) === "partial", "three of four: partial, not healthy");
ok(feed({ healthy: true, lastRunAt: old, operatorsOk: 4, operatorsTotal: 4 }) === "stale", "last cycle 40 min ago (every 2): stale, however healthy it was");
ok(feed({ healthy: false, lastRunAt: recent }) === "failing", "no operator synced: failing");
ok(feed({ configured: false, healthy: null }) === "not_set_up", "not configured: not set up");

const notam = await import("../digital-wall/lib/notam-check.mjs");
const Check = Object.values(notam).find((v) => typeof v === "function" && v.prototype && "signState" in v.prototype);
const sign = (state, at) => { const o = Object.create(Check.prototype); o.state = state; return o.signState(at); };
const yday = { day: "2026-11-02", airports: [{ icao: "EVRA", checked: true }] };
ok(sign(yday, { day: "2026-11-03", hour: 7 }) === "NONE", "yesterday's acks, 07:00 today: no sign (nothing claimed for today yet)");
ok(sign(yday, { day: "2026-11-03", hour: 11 }) === "CHECK", "past the check hour with no run today (late or failed): CHECK, never yesterday's CHECKED");
ok(sign({ day: "2026-11-03", airports: [{ icao: "EVRA", checked: true }] }, { day: "2026-11-03", hour: 12 }) === "CHECKED", "today, every airport acknowledged: CHECKED");
ok(sign({ day: "2026-11-03", airports: [{ icao: "EVRA", checked: true }, { icao: "EYVI", checked: null }] }, { day: "2026-11-03", hour: 12 }) === "CHECK", "today, one airport open: CHECK");
console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
