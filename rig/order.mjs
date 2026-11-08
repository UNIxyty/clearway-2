// The run's order (2026-11-09). A suite that passes only in one order is not a passing suite: it depends on something
// it did not make (tier1-check passed for weeks on intake requests another suite left behind; two lanes found it by
// accident). rig/run-all-suites.sh calls this when RIG_SHUFFLE or RIG_SPLIT is set, and runs the copy it writes.
//   shuffle <seed>     each group of suites between two setup lines is put in a random order (the setup lines are what
//                      the runner makes for the suites after them: a wall preview, the sign-in agent stopped, a build;
//                      a suite may count on those). A comment above a suite moves with it.
//   split cut          lane b from LANE_B_FROM on, as written (the timed split)
//   split alternate    every other suite to the other lane: no suite keeps the suites it ran after
//   split random:<s>   each suite to a random lane, half and half: a suite whose maker lands in the other box fails
// The same seeds give the same order and the same lanes, on any machine: a red can be run again exactly.
//   node rig/order.mjs <runner> <shuffle seed or ""> <split> <out dir>   → <out>/run-all-suites.sh, <out>/lane-b.txt
import fs from "node:fs";
import path from "node:path";

const [runner, shuffleSeed = "", split = "cut", out] = process.argv.slice(2);
if (!runner || !out) { console.error("usage: node rig/order.mjs <runner> <shuffle seed or \"\"> <cut|alternate|random:<seed>> <out dir>"); process.exit(2); }
const lines = fs.readFileSync(runner, "utf8").split("\n");

const rng = (seed) => { // mulberry32 over a string hash: small, and the same everywhere
  let h = 1779033703 ^ seed.length; for (let i = 0; i < seed.length; i += 1) { h = Math.imul(h ^ seed.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = h >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
};
const shuffled = (list, r) => { const a = [...list]; for (let i = a.length - 1; i > 0; i -= 1) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const isRun = (l) => /^run \S/.test(l);
const isQuiet = (l) => /^\s*(#.*)?$/.test(l); // a comment or a blank line

// the suites in the order written, and the lanes
const suites = lines.filter(isRun).map((l) => l.split(/\s+/)[1]);
let laneB;
if (split === "cut") {
  const from = (lines.find((l) => /^LANE_B_FROM=/.test(l)) ?? "").replace(/^LANE_B_FROM=(\S+).*/, "$1");
  const i = suites.indexOf(from); if (i < 0) { console.error(`LANE_B_FROM (${from}) is not a suite`); process.exit(2); }
  laneB = suites.slice(i);
} else if (split === "alternate") laneB = suites.filter((_, i) => i % 2 === 1);
else if (/^random:\S+$/.test(split)) { const r = rng(`split:${split.slice(7)}`); laneB = shuffled(suites, r).slice(Math.ceil(suites.length / 2)); }
else { console.error(`unknown split ${split}`); process.exit(2); }

// the groups: a stretch of run lines with only comments and blanks between them
const outLines = []; let groups = 0, moved = 0;
for (let i = 0; i < lines.length;) {
  if (!isRun(lines[i])) { outLines.push(lines[i]); i += 1; continue; } // a group starts at a run line; the comments above it stay put
  // collect the group from i: units of (comments…, run line), and what trails after the last run line
  const units = []; let pending = [], j = i;
  while (j < lines.length && (isRun(lines[j]) || isQuiet(lines[j]))) { pending.push(lines[j]); if (isRun(lines[j])) { units.push(pending); pending = []; } j += 1; }
  groups += 1;
  const order = shuffleSeed ? shuffled(units, rng(`shuffle:${shuffleSeed}:${groups}`)) : units;
  order.forEach((u, k) => { if (u !== units[k]) moved += 1; });
  outLines.push(...order.flat(), ...pending); i = j;
}

fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, "run-all-suites.sh"), outLines.join("\n"));
fs.writeFileSync(path.join(out, "lane-b.txt"), `${laneB.join("\n")}\n`);
const same = outLines.filter(isRun).length === suites.length && [...outLines.filter(isRun)].sort().join() === lines.filter(isRun).sort().join();
if (!same) { console.error("the ordered copy does not hold every suite exactly once"); process.exit(1); }
console.log(`order: ${shuffleSeed ? `shuffled (seed ${shuffleSeed}), ${moved} of ${suites.length} suites moved within ${groups} groups` : "as written"} · lanes: ${split} (lane b ${laneB.length} of ${suites.length})`);
