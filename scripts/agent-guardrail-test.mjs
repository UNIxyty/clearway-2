#!/usr/bin/env node
// Prove the guardrail actually catches things, and report WHAT it catches.
//
// Three cases are AWS's own reference examples, so a failure here is a setup
// problem rather than an argument about the test. Two are aviation cases in the
// register this agent actually works in.
//
//   node scripts/agent-guardrail-test.mjs

import { readFileSync, existsSync } from "node:fs";

if (existsSync(".env")) {
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && process.env[m[1]] === undefined && m[2].trim()) process.env[m[1]] = m[2].trim();
  }
}

const { checkGrounding, groundingConfigured } = await import("../agent/lib/knowledge/grounding.mjs");

if (!groundingConfigured()) {
  console.error("BEDROCK_GUARDRAIL_ID is not set — see docs/BEDROCK-GUARDRAIL-SETUP.md");
  process.exit(1);
}

const CAPITALS = "London is the capital of UK. Tokyo is the capital of Japan.";
const OPS =
  "EVRA de-icing pad C is closed until 18:00Z. Use pads A or B.\n\n" +
  "When the reported crosswind component exceeds 20 kt, AUTOLAND IS NOT PERMITTED. " +
  "The approach shall be flown manually by the Commander.";

const CASES = [
  { name: "grounded + relevant (AWS ref)", expect: "pass", query: "What is the capital of Japan?", sources: [{ text: CAPITALS }], answer: "The capital of Japan is Tokyo." },
  { name: "ungrounded (AWS ref)", expect: "catch", query: "What is the capital of Japan?", sources: [{ text: CAPITALS }], answer: "The capital of Japan is London." },
  { name: "irrelevant (AWS ref)", expect: "catch", query: "What is the capital of Japan?", sources: [{ text: CAPITALS }], answer: "The capital of UK is London." },
  { name: "ops · grounded answer", expect: "pass", query: "Can we use de-icing pad C at Riga?", sources: [{ text: OPS }], answer: "No — pad C is closed until 18:00Z. Use pad A or B." },
  { name: "ops · invented detail", expect: "catch", query: "Can we use de-icing pad C at Riga?", sources: [{ text: OPS }], answer: "Pad C is closed until 18:00Z, and pads A and B have a 25-minute holdover limit in freezing rain." },
  { name: "ops · invented limit value", expect: "catch", query: "When is autoland not permitted?", sources: [{ text: OPS }], answer: "Autoland is not permitted when the crosswind exceeds 15 kt." },
];

let correct = 0;
for (const c of CASES) {
  const verdict = await checkGrounding({ query: c.query, answer: c.answer, sources: c.sources });
  const caught = verdict.ran && !verdict.verified;
  const asExpected = c.expect === "catch" ? caught : verdict.verified;
  if (asExpected) correct += 1;

  const scores = (verdict.scores ?? [])
    .map((s) => `${s.type.toLowerCase()} ${typeof s.score === "number" ? s.score.toFixed(2) : "?"}${s.detected ? " ✗" : ""}`)
    .join(" · ");
  console.log(`${asExpected ? "OK  " : "MISS"}  ${c.name.padEnd(30)} expected ${c.expect.padEnd(5)} ${caught ? "caught" : verdict.ran ? "passed" : "DID NOT RUN"}  ${scores}`);
  if (!verdict.ran && verdict.reason) console.log(`        ${verdict.reason}`);
}

console.log(`\n${correct}/${CASES.length} behaved as expected`);
process.exit(correct === CASES.length ? 0 : 1);
