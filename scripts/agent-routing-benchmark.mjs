#!/usr/bin/env node
// Routing regression (PROMPT 10). Run this BEFORE deploying a routing change.
//
//   node scripts/agent-routing-benchmark.mjs                 # routing only (cheap)
//   node scripts/agent-routing-benchmark.mjs --mode full     # full turns (costs real money)
//
// The number that matters is NOT exact-match accuracy. It is UNDER-ROUTING:
// how often a question was handed to a model weaker than it needed. An
// over-route costs a few cents. An under-route costs a right answer, and does
// it silently — the reply still looks fluent. So exact match is reported, and
// under-routes are listed individually.

import { readFileSync, existsSync } from "node:fs";

if (existsSync(".env")) {
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && process.env[m[1]] === undefined && m[2].trim()) process.env[m[1]] = m[2].trim();
  }
}

const args = process.argv.slice(2);
const value = (f, d) => (args.indexOf(f) === -1 ? d : args[args.indexOf(f) + 1] ?? d);
const MODE = value("--mode", "route");
const BASE = value("--base", process.env.AGENT_BASE_URL || "http://127.0.0.1:5175").replace(/\/+$/, "");
const ORDER = ["fast", "standard", "reasoning"];

// Bedrock eu rates, $/MTok in|out. Used for an ORDER-OF-MAGNITUDE comparison,
// not billing: published prices move, and the audit log is the source of truth
// for what was actually spent.
const RATES = {
  "nova-micro": [0.035, 0.14],
  haiku: [0.8, 4.0],
  sonnet: [3.0, 15.0],
  opus: [15.0, 75.0],
};
const rateFor = (modelId) => {
  const id = String(modelId ?? "");
  if (/nova-micro/.test(id)) return RATES["nova-micro"];
  if (/haiku/.test(id)) return RATES.haiku;
  if (/opus/.test(id)) return RATES.opus;
  return RATES.sonnet;
};
const costOf = (modelId, inTok, outTok) => {
  const [i, o] = rateFor(modelId);
  return (inTok / 1e6) * i + (outTok / 1e6) * o;
};

const manifest = JSON.parse(readFileSync("docs/routing-benchmark/queries.json", "utf8"));

async function main() {
  const { routeTurn } = await import("../agent/lib/router.mjs");
  console.log(`mode: ${MODE}\nqueries: ${manifest.queries.length}\n`);

  const rows = [];
  for (const q of manifest.queries) {
    const t0 = Date.now();
    let routed, err = null;
    try {
      routed = await routeTurn({ question: q.text, hasHistory: false });
    } catch (e) { err = String(e.message); routed = { tier: "standard", source: "error", reason: err }; }
    rows.push({ q, routed, ms: Date.now() - t0, err });
    const d = ORDER.indexOf(routed.tier) - ORDER.indexOf(q.expectTier);
    const mark = d === 0 ? "ok  " : d > 0 ? "OVER" : "UNDER";
    console.log(`  ${mark}  ${q.id.padEnd(4)} ${q.expectTier.padEnd(9)} -> ${routed.tier.padEnd(9)} ${routed.source.padEnd(9)} ${String(routed.routerLatencyMs).padStart(5)}ms  ${q.text.slice(0, 54)}`);
  }

  // The router entry point is fast or standard; reasoning is reached only by
  // escalation. So a reasoning-labelled query ENTERING at standard is correct.
  // There is exactly one dangerous error: routed to fast when it should not be.
  const shouldBeFast = (r) => r.q.expectTier === "fast";
  const exact = rows.filter((r) => (r.routed.tier === "fast") === shouldBeFast(r));
  const under = rows.filter((r) => r.routed.tier === "fast" && !shouldBeFast(r));
  const over = rows.filter((r) => r.routed.tier !== "fast" && shouldBeFast(r));
  const pct = (n) => `${((n / rows.length) * 100).toFixed(1)}%`;

  console.log(`\n=== ROUTING (entry tier: fast or standard; reasoning is escalation-only) ===`);
  console.log(`  correct entry   ${exact.length}/${rows.length}  ${pct(exact.length)}`);
  console.log(`  over-routed     ${over.length}  ${pct(over.length)}   (a trivial question paid standard prices)`);
  console.log(`  UNDER-routed    ${under.length}  ${pct(under.length)}   (a real question got the weakest model)`);

  console.log(`\n  confusion (expected -> routed):`);
  for (const e of ORDER) {
    const line = ORDER.map((a) => `${a}:${rows.filter((r) => r.q.expectTier === e && r.routed.tier === a).length}`).join("  ");
    console.log(`    ${e.padEnd(10)} ${line}`);
  }

  if (under.length) {
    console.log(`\n  EVERY UNDER-ROUTE, in full — these are the ones that matter:`);
    for (const r of under) console.log(`    ${r.q.id}  ${r.q.expectTier} -> ${r.routed.tier}  "${r.q.text}"`);
  }

  // The property that actually matters for safety: the deterministic floor
  // should make it impossible for anything that CHANGES something to enter on
  // the cheapest model, whatever the classifier thinks.
  const writeCats = new Set(["write", "destructive", "files", "email"]);
  const writeOnFast = rows.filter((r) => writeCats.has(r.q.category) && r.routed.tier === "fast" && !shouldBeFast(r));
  console.log(`\n  writes/deletes routed to the cheapest model: ${writeOnFast.length}`);
  for (const r of writeOnFast) console.log(`    ${r.q.id}  "${r.q.text}"`);

  const lat = rows.map((r) => r.routed.routerLatencyMs ?? r.ms).sort((a, b) => a - b);
  console.log(`\n  router latency  p50 ${lat[Math.floor(lat.length / 2)]}ms  p90 ${lat[Math.floor(lat.length * 0.9)]}ms  max ${lat.at(-1)}ms`);
  console.log(`  router adds this to EVERY turn, so it is a cost of routing, not a saving.`);

  const byCat = {};
  for (const r of rows) {
    const c = r.q.category;
    byCat[c] = byCat[c] || { n: 0, ok: 0, under: 0 };
    byCat[c].n++;
    // Same definitions as above: correct = the fast/not-fast call was right.
    if ((r.routed.tier === "fast") === shouldBeFast(r)) byCat[c].ok++;
    if (r.routed.tier === "fast" && !shouldBeFast(r)) byCat[c].under++;
  }
  console.log(`\n  by category:`);
  for (const [c, v] of Object.entries(byCat).sort((a, b) => b[1].under - a[1].under))
    console.log(`    ${c.padEnd(12)} ${v.ok}/${v.n} correct${v.under ? `   ${v.under} UNDER-ROUTED` : ""}`);

  // What routing would have cost against the flat-Sonnet baseline, using this
  // deployment's own measured token profile.
  const MEDIAN_IN = 17980, MEDIAN_OUT = 188; // measured, real dispatcher turns
  const flat = rows.length * costOf("sonnet", MEDIAN_IN, MEDIAN_OUT);
  const routedCost = rows.reduce((sum, r) => sum + costOf(r.routed.tier === "fast" ? "haiku" : "sonnet", MEDIAN_IN, MEDIAN_OUT), 0)
    + rows.length * costOf("nova-micro", 220, 4);
  console.log(`\n=== MODELLED COST over these ${rows.length} turns, at THIS deployment's measured token profile ===`);
  console.log(`  flat standard (today)   $${flat.toFixed(4)}`);
  console.log(`  routed (incl. router)   $${routedCost.toFixed(4)}   ${routedCost < flat ? "cheaper" : "MORE EXPENSIVE"} by ${Math.abs(((routedCost - flat) / flat) * 100).toFixed(1)}%`);
  console.log(`  NOTE: a benchmark's mix is not a production mix. This says what routing does to THIS set.`);

  if (MODE === "full") {
    console.log(`\n=== FULL TURNS not run: needs the agent service and spends real money on ${rows.length} turns. ===`);
    console.log(`  Start the rig and re-run with --mode full once you want tool-selection and answer-quality numbers.`);
  }

  console.log(under.length === 0
    ? `\n  VERDICT: no under-routes. Safe to deploy on this set.`
    : `\n  VERDICT: ${under.length} under-route(s). Fix the classifier or the labels before deploying.`);
  process.exit(under.length === 0 ? 0 : 1);
}

main().catch((e) => { console.error(`\nbenchmark aborted: ${e.message}`); process.exit(1); });
