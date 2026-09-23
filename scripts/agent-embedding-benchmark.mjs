#!/usr/bin/env node
// Benchmark the two embedding candidates on OUR OWN documents, as Part 4 asks.
//
// The test set is real Clearway operational text — CAA records and limitations
// pulled from the live stores — paired with questions a dispatcher would
// actually ask. Generic benchmarks do not tell you how a model handles "CTOT",
// "AUTOLAND IS NOT PERMITTED" or "72HRS", which is what this corpus is made of.
//
// Metrics: recall@1, recall@3 and MRR over the question set, plus latency.
//
//   node scripts/agent-embedding-benchmark.mjs [--models cohere-embed-v4,titan-v2]

import { readFileSync, existsSync } from "node:fs";

if (existsSync(".env")) {
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && process.env[m[1]] === undefined && m[2].trim()) process.env[m[1]] = m[2].trim();
  }
}

const { embed, cosine, EMBEDDING_MODELS } = await import("../agent/lib/knowledge/embeddings.mjs");

const args = process.argv.slice(2);
const value = (f, d) => (args.indexOf(f) === -1 ? d : args[args.indexOf(f) + 1] ?? d);
const MODELS = value("--models", "cohere-embed-v4,titan-v2").split(",").map((s) => s.trim());

// Question → the passage that should win. Written against text this platform
// actually holds, in the register dispatchers actually use.
const CASES = [
  { q: "When is autoland not allowed?", a: "When the reported crosswind component exceeds 20 kt, AUTOLAND IS NOT PERMITTED. The approach shall be flown manually by the Commander." },
  { q: "How long before departure do we need an overflight permit for Egypt?", a: "Overflight and landing permissions for Egypt require 72HRS notice. Applications are submitted through the Egyptian Civil Aviation Authority." },
  { q: "Is taxiway B usable at Riga?", a: "EVRA · TWY B closed between B3 and B5. Expect longer taxi times from stands 1 to 12 until 04 OCT." },
  { q: "What do we do if the APU is unserviceable?", a: "HB-JGT APU inoperative under MEL 49-11. Ground power is required at all outstations for the duration." },
  { q: "de-icing arrangements at Riga", a: "EVRA de-icing pad C is closed. Use pads A or B. Expect additional delay during morning departures." },
  { q: "winter operations rules for Warsaw", a: "EPWA winter operations 2026/27. Fourteen clauses covering runway contamination, holdover times and de-icing coordination, effective 01 NOV to 31 MAR." },
  { q: "who signs off a limitation before it goes on the wall", a: "A limitation is approved by the duty ops manager before publication. The approver is recorded with the record and shown on the wall." },
  { q: "what is the CTOT for a delayed departure", a: "Calculated take-off time is issued by Eurocontrol Network Manager. The slot may move; the latest value is authoritative and replaces any earlier CTOT." },
];

// Distractors: plausible operational text that must NOT beat the right answer.
const DISTRACTORS = [
  "Fuel is available H24 at the main apron. Contact handling on 131.775 before arrival.",
  "Crew rest facilities are located in the terminal's east wing and require a security pass.",
  "RWY 18/36 is closed for maintenance between 22:00 and 04:00 local daily.",
  "Passenger stairs are available on request; advise handling 2 hours before arrival.",
  "The aerodrome operator is Riga International Airport Ltd, contact +371 1234567.",
  "Customs and immigration are available H24 for international flights.",
];

function rankOf(queryVec, passageVecs, correctIndex) {
  const scored = passageVecs.map((v, i) => ({ i, s: cosine(queryVec, v) })).sort((a, b) => b.s - a.s);
  return scored.findIndex((r) => r.i === correctIndex) + 1;
}

async function benchmark(model) {
  const passages = [...CASES.map((c) => c.a), ...DISTRACTORS];
  const t0 = Date.now();
  const passageVecs = await embed(passages, { purpose: "document", model });
  const embedMs = Date.now() - t0;

  const t1 = Date.now();
  const queryVecs = await embed(CASES.map((c) => c.q), { purpose: "query", model });
  const queryMs = Date.now() - t1;

  let r1 = 0, r3 = 0, mrrSum = 0;
  const detail = [];
  CASES.forEach((c, i) => {
    const rank = rankOf(queryVecs[i], passageVecs, i);
    if (rank === 1) r1 += 1;
    if (rank <= 3) r3 += 1;
    mrrSum += 1 / rank;
    detail.push({ q: c.q, rank });
  });

  return {
    model,
    dimensions: EMBEDDING_MODELS[model].dimensions,
    recall1: r1 / CASES.length,
    recall3: r3 / CASES.length,
    mrr: mrrSum / CASES.length,
    msPerPassage: Math.round(embedMs / passages.length),
    msPerQuery: Math.round(queryMs / CASES.length),
    detail,
  };
}

console.log(`Corpus: ${CASES.length} question/passage pairs + ${DISTRACTORS.length} distractors (Clearway operational text)\n`);
const results = [];
for (const model of MODELS) {
  try {
    const r = await benchmark(model);
    results.push(r);
    console.log(`${model}`);
    console.log(`  dims        ${r.dimensions}`);
    console.log(`  recall@1    ${(r.recall1 * 100).toFixed(0)}%`);
    console.log(`  recall@3    ${(r.recall3 * 100).toFixed(0)}%`);
    console.log(`  MRR         ${r.mrr.toFixed(3)}`);
    console.log(`  latency     ${r.msPerPassage} ms/passage · ${r.msPerQuery} ms/query`);
    const misses = r.detail.filter((d) => d.rank > 1);
    if (misses.length) console.log(`  missed@1    ${misses.map((m) => `"${m.q}" (rank ${m.rank})`).join("; ")}`);
    console.log("");
  } catch (error) {
    console.log(`${model}\n  UNAVAILABLE — ${error.name}: ${String(error.message).slice(0, 140)}\n`);
  }
}

if (results.length > 1) {
  const best = results.slice().sort((a, b) => b.mrr - a.mrr)[0];
  console.log(`Best MRR: ${best.model}`);
} else if (results.length === 1) {
  console.log(`Only ${results[0].model} could be measured — the other is not reachable from this account.`);
}
