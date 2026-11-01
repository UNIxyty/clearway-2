// The run's verdict (2026-11-02). Reads the runner's log and rig/known-failures.json and sorts every red suite: LISTED
// (its cause is recorded) or UNLISTED (nobody has written it down). Unlisted reds are named, every time. A listed suite
// that passed is named too, so its entry can go. There is no "green except": any red, listed or not, is RED (exit 1);
// a run that is incomplete is INCOMPLETE (exit 2, decided by the runner before this). shell-check sat red and unlisted
// from mid-October to 2026-11-02 under a summary nobody read closely; this is what stops that.
//   node rig/verdict.mjs <log> <expected suite count>
import { readFileSync } from "node:fs";
const [, , logFile, expectedRaw] = process.argv;
let known;
try { known = JSON.parse(readFileSync(new URL("./known-failures.json", import.meta.url), "utf8")); } catch (e) { console.log(`VERDICT: RED — the known-failures record cannot be read (${e.message}); every red counts as unlisted`); known = {}; }
const listed = new Map();
for (const [key, v] of Object.entries(known)) {
  if (key.startsWith("$")) continue;
  if (!v?.cause || !v?.since || !Array.isArray(v?.suites) || !v.suites.length) { console.log(`VERDICT: RED — known-failures entry "${key}" has no cause, date or suites`); process.exit(1); }
  for (const s of v.suites) { if (/[*?]/.test(s)) { console.log(`VERDICT: RED — known-failures entry "${key}" uses a wildcard (${s}): name every suite`); process.exit(1); } listed.set(s, key); }
}
const lines = readFileSync(logFile, "utf8").split("\n").filter((l) => / rc=\d+ /.test(l));
const results = lines.map((l) => { const [name] = l.split(" "); const rc = Number(l.match(/ rc=(\d+) /)[1]); return { name, rc }; });
const red = results.filter((r) => r.rc !== 0), unlisted = red.filter((r) => !listed.has(r.name)), knownRed = red.filter((r) => listed.has(r.name));
const passedButListed = results.filter((r) => r.rc === 0 && listed.has(r.name));
const missing = [...listed.keys()].filter((s) => !results.some((r) => r.name === s));
for (const r of knownRed) console.log(`  known  ${r.name} — ${listed.get(r.name)}: ${known[listed.get(r.name)].cause.slice(0, 120)}`);
for (const r of unlisted) console.log(`  UNLISTED RED  ${r.name} (rc=${r.rc}) — no recorded cause: investigate it, or record its cause in rig/known-failures.json`);
for (const r of passedButListed) console.log(`  listed but PASSED  ${r.name} — remove it from "${listed.get(r.name)}" in rig/known-failures.json`);
for (const s of missing) console.log(`  listed but NOT RUN  ${s} — the record names a suite this run does not have`);
const expected = Number(expectedRaw);
if (!results.length || !Number.isFinite(expected) || expected < 1) { console.log(`VERDICT: INCOMPLETE — no suite results in the log (or no expected count): nothing can be called green`); process.exit(2); }
if (results.length !== expected) { console.log(`VERDICT: INCOMPLETE — ${results.length} of ${expected} suites ran`); process.exit(2); }
if (unlisted.length) { console.log(`VERDICT: RED — ${unlisted.length} UNLISTED red suite(s): ${unlisted.map((r) => r.name).join(", ")}${knownRed.length ? `; and ${knownRed.length} red with a recorded cause` : ""}`); process.exit(1); }
if (knownRed.length) { console.log(`VERDICT: RED — ${knownRed.length} of ${results.length} suites red, every one with a recorded cause (${[...new Set(knownRed.map((r) => listed.get(r.name)))].join(", ")}); no unlisted red`); process.exit(1); }
if (passedButListed.length || missing.length) { console.log(`VERDICT: RED — every suite passed, but the known-failures record is out of date (above); fix the record`); process.exit(1); }
console.log(`VERDICT: GREEN — all ${results.length} suites passed, and the known-failures record is empty`);
process.exit(0);
