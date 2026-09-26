// Voice rules that must not be broken (design spec §3 rules 9 and 10, §4.25),
// tested on the pure planner the /api/voice/speak route uses.
//   node --test tests/agent-voice-speech.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { speechPlan, isSpokenYes, LIMITATION_ON_SCREEN } from "../agent/lib/voice/speech.mjs";
import { rankRealtime, REALTIME_MAX_TERMS, REALTIME_MAX_CHARS } from "../agent/lib/voice/keyterms.mjs";

const LIM = { id: "LIM-0412", text: "AUTOLAND IS NOT PERMITTED on runway 18 including gusts above 25 kt." };

test("rule 10: verbatim text echoed in the prose is never spoken; the voice points at the screen", () => {
  const plan = speechPlan({ content: "One limitation at EVRA. It reads: autoland is not permitted on runway 18 including gusts above 25 kt. Plan a manual landing.", blocks: { verbatim: [LIM] } });
  assert.ok(!/autoland/i.test(plan.spoken), plan.spoken);
  assert.ok(plan.spoken.endsWith(LIMITATION_ON_SCREEN));
  assert.equal(plan.withheldSentences, 1);
  assert.deepEqual(plan.verbatimIds, ["LIM-0412"]);
});

test("rule 10: decided by the blocks — a verbatim block alone still says the limitation is on screen", () => {
  const plan = speechPlan({ content: "Here is what applies.", blocks: { verbatim: [LIM] } });
  assert.match(plan.spoken, /The limitation is on screen\.$/);
});

test("block quotes and code fences are not speakable", () => {
  const plan = speechPlan({ content: "Current METAR:\n```\nEVRA 261150Z 18012KT 9999 FEW030 12/08 Q1012\n```\n> AUTOLAND IS NOT PERMITTED\nAll fine." });
  assert.ok(!/Q1012|AUTOLAND/.test(plan.spoken), plan.spoken);
});

test("rule 9: a pending confirmation is only pointed at, never confirmed", () => {
  const plan = speechPlan({ content: "I can mark EPWA as checked.", blocks: { confirmations: [{ token: "t" }] } });
  assert.equal(plan.kind, "confirm");
  assert.equal(plan.room, true);
  assert.match(plan.spoken, /It's on screen\./);
});

test("tables are shown with one line naming them", () => {
  const plan = speechPlan({ content: "Here they are.\n\n| a |\n|--|\n| 1 |", blocks: { tables: [{ title: "Flights to EVRA", columns: ["Flight"], rows: [["a"], ["b"], ["c"], ["d"]] }] } });
  assert.equal(plan.kind, "shown");
  assert.equal(plan.badge, "SHOWN · TABLE");
  assert.match(plan.spoken, /Four flights\. It's on screen\./);
});

test("long answers are summarised and say so", () => {
  const plan = speechPlan({ content: "The wall is busy this morning with many movements to track. ".repeat(10) });
  assert.equal(plan.kind, "long");
  assert.ok(plan.summarised);
  assert.match(plan.spoken, /^In short:/);
  assert.match(plan.spoken, /The full answer is on screen\./);
});

test("spoken yes is recognised (and only to answer 'Please confirm on screen')", () => {
  for (const y of ["Yes", "yes, confirm it", "Go ahead", "OK", "да"]) assert.ok(isSpokenYes(y), y);
  for (const n of ["yesterday's flights", "what about EVRA", "okayama"]) assert.ok(!isSpokenYes(n), n);
});

test("realtime keyterms: ≤ 50 terms of ≤ 20 characters, today's airports first, no group starves", () => {
  const icaos = Array.from({ length: 80 }, (_, i) => `E${String.fromCharCode(65 + (i % 26))}${String.fromCharCode(65 + Math.floor(i / 26))}A`);
  const callsigns = Array.from({ length: 300 }, (_, i) => `BTI${100 + i}`);
  const list = rankRealtime({ icaos, callsigns, registrations: ["YL-ABC", "YL-ABD"], operators: ["BTI"] }, ["NOTAM", "X".repeat(21)]);
  assert.ok(list.length <= REALTIME_MAX_TERMS);
  assert.ok(list.every((t) => t.length <= REALTIME_MAX_CHARS));
  assert.equal(list[0], icaos[0]);
  assert.ok(list.includes("YL-ABC") && list.includes("BTI") && list.includes("NOTAM") && list.includes("BTI100"));
});
