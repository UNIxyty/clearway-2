#!/usr/bin/env node
// Voice readout on the wall (item 6): what would reach the room screen?
//
// Feeds hostile console payloads through the agent's sanitiser AND the wall
// backend's normaliser (the exact two steps a real event takes), prints the
// resulting SSE event, and fails if anything on the withheld list survives.
// Also checks the per-session rate limit / coalescing, the TTL expiry and the
// constant-time secret check. In-process only: starts no servers.
//
//   node scripts/agent-verify-wall-voice-readout.mjs

import { sanitiseVoiceActivity, relayVoiceActivity, speakerLabel, TRANSCRIPT_MAX } from "../agent/lib/voice/wall-readout.mjs";
import { normaliseVoiceReadout, VoiceReadoutStore, voiceEventsSecretMatches } from "../digital-wall/lib/voice-readout.mjs";

let failures = 0;
const check = (ok, what) => { console.log(`${ok ? "PASS" : "FAIL"}  ${what}`); if (!ok) failures += 1; };

const user = {
  userId: "5f1c2d9e-0000-4000-8000-000000000001",
  email: "jane.dispatcher@clearway.aero",
  name: "Jane Mary Dispatcher",
  role: "admin",
  agentRole: "developer",
  userMetadata: { full_name: "Jane Mary Dispatcher" },
  accessToken: "eyJhbGciOiJIUzI1NiJ9.SECRET.TOKEN",
  cookieHeader: "sb-abc-auth-token=SECRETCOOKIE",
};

const longTranscript =
  "is BTI472 still on the CTOT or has it been released and also email the crew roster to captain.smith@example.com " +
  "and call me on +44 7700 900123 about the sick leave for first officer Jones then check https://intranet.example/secret " +
  "and tell me the weather at EGLL for the 07:20 departure QNH 1009 please and thank you very much indeed";

const hostile = {
  sessionId: "console-session-abc123",
  phase: "acting",
  committed: longTranscript,
  partial: "and forward it to ops.private@example.org",
  tools: [
    { name: "search_flights", state: "ok", input: { query: "BTI472" }, result: { flights: ["BTI472 EPWA-EVRA"] } },
    { name: "send_email", state: "running", input: { to: ["captain.smith@example.com"], subject: "Sick leave Jones", body: "Confidential medical note" } },
    { name: "email_document", state: "ok", input: { to: "hr@example.com", filename: "Jones-medical.pdf" } },
    { name: "recall", state: "ok", result: { notes: "Jane prefers... personal note" } },
    { name: "search_knowledge", state: "ok", result: { hits: [{ title: "Crew Contracts 2026.pdf", text: "salary table" }] } },
    { name: "totally_unknown_tool", state: "error" },
    { name: "get_weather", state: "running", input: { icao: "EGLL" } },
  ],
  outcome: { kind: "ok", summary: "Here is my full reply: Jones is off sick until Friday, I emailed HR the medical note." },
  reply: "Jones is off sick until Friday.",
  history: [{ role: "user", content: "earlier private question" }],
  attachments: [{ name: "Jones-medical.pdf" }],
  userEmail: "spoofed@example.com",
  speaker: "Spoofed Speaker <boss@example.com>",
};

function throughBothHops(body, who = user) {
  const agentSide = sanitiseVoiceActivity(body, who);
  if (!agentSide) return null;
  // What the wall backend broadcasts after its own clamp.
  return { type: "voice-activity", ...normaliseVoiceReadout(JSON.parse(JSON.stringify(agentSide))) };
}

console.log("\n── Hostile payload → what the wall would receive ──");
const wallEvent = throughBothHops(hostile);
console.log(JSON.stringify(wallEvent, null, 2));

const serialised = JSON.stringify(wallEvent);
const FORBIDDEN = [
  "captain.smith", "@example", "ops.private", "hr@", "7700", "900123", "intranet.example",
  "Sick leave Jones", "Confidential medical", "Jones-medical", "personal note", "Crew Contracts", "salary",
  "totally_unknown_tool", "send_email", "email_document", "recall", "search_knowledge",
  "Here is my full reply", "off sick until Friday", "earlier private question",
  "jane.dispatcher", "clearway.aero", "5f1c2d9e", "console-session-abc123", "admin", "developer",
  "SECRET", "Spoofed", "boss@", "EPWA-EVRA", "\"icao\"",
];
for (const needle of FORBIDDEN) check(!serialised.includes(needle), `withheld: ${needle}`);
check(wallEvent.speaker === "Jane D.", `speaker is first name + initial (${wallEvent.speaker})`);
const shownLen = (wallEvent.transcript.committed + " " + wallEvent.transcript.partial).trim().length;
check(shownLen <= TRANSCRIPT_MAX + 2, `transcript truncated to ~2 lines (${shownLen} chars)`);
check(wallEvent.transcript.committed.includes("QNH 1009") || wallEvent.transcript.committed.endsWith("indeed"), "transcript keeps the END of what was said");
check(wallEvent.activity.every((a) => ["Searching flights", "Working…", "Checking weather"].includes(a.label)), "activity labels are allowlisted or generic");
check(wallEvent.activity.filter((a) => a.label === "Working…").length === 1, "consecutive non-operational tools collapse into ONE generic step");
check(/^[a-f0-9]{16}$/.test(wallEvent.id), "session id is an opaque hash");

console.log("\n── Outcomes ──");
const done = throughBothHops({ ...hostile, phase: "done", partial: "should not show" });
console.log("done, free-text summary   →", done.outcome, "| partial:", JSON.stringify(done.transcript.partial));
check(done.outcome.text === "Done · checked flights", "free-text summary dropped; outcome derived from the tools that SUCCEEDED");
check(wallEvent.outcome === null, "an ok outcome sent mid-turn (phase acting) is not shown as Done");
check(done.transcript.partial === "", "no partial after the turn ends");
const counted = throughBothHops({ sessionId: "s2", phase: "done", tools: [{ name: "search_flights", state: "ok" }], outcome: { kind: "ok", summary: "2 flights shown" } });
console.log("done, grammar summary     →", counted.outcome);
check(counted.outcome.text === "Done · 2 flights shown", "strict count grammar passes through");
const sneaky = throughBothHops({ sessionId: "s2", phase: "done", outcome: { kind: "ok", summary: "2 flights shown to jane@example.com" } });
check(sneaky.outcome.text === "Done", "count grammar is anchored (no trailing payload)");
const confirm = throughBothHops({ sessionId: "s3", phase: "acting", tools: [{ name: "send_email", state: "running" }], outcome: { kind: "confirm", summary: "Send to hr@example.com?" } });
console.log("confirm                   →", confirm.outcome);
check(confirm.outcome.text === "Needs confirmation on the console" && !JSON.stringify(confirm).includes("hr@"), "confirmation is a fixed phrase");
const err = throughBothHops({ sessionId: "s4", phase: "error", outcome: { kind: "error", summary: "Stack trace: token=abc" } });
console.log("error                     →", err.outcome);
check(err.outcome.text === "Couldn't complete", "error is a fixed phrase");
check(sanitiseVoiceActivity({ sessionId: "x", phase: "rm -rf" }, user) === null, "unknown phase rejected");
check(sanitiseVoiceActivity({ phase: "listening" }, user) === null, "missing sessionId rejected");

console.log("\n── Speaker names ──");
const cases = [
  [{ email: "a.b@x.com", name: "a.b", userMetadata: {} }, "A dispatcher"],
  [{ email: "x@x.com", name: "Ops", userMetadata: { firstname: "Anna", lastname: "Kalnina" } }, "Anna K."],
  [{ email: "x@x.com", userMetadata: { full_name: "Madonna" } }, "Madonna"],
  [{ email: "x@x.com", userMetadata: { full_name: "evil@example.com" } }, "A dispatcher"],
];
for (const [u, want] of cases) { const got = speakerLabel(u); console.log(`  ${JSON.stringify(u.userMetadata)} → ${got}`); check(got === want, `speaker ${want}`); }

console.log("\n── Rate limit: 40 partials in 1 s from one session ──");
process.env.AGENT_WALL_EVENTS_SECRET = "test-secret";
const sent = [];
const fakeSend = (p) => sent.push({ at: Date.now(), p });
const t0 = Date.now();
for (let i = 0; i < 40; i++) {
  relayVoiceActivity({ ...sanitiseVoiceActivity({ sessionId: "burst", phase: "listening", partial: `word ${i}` }, user) }, { send: fakeSend });
  await new Promise((r) => setTimeout(r, 25));
}
relayVoiceActivity(sanitiseVoiceActivity({ sessionId: "burst", phase: "done", committed: "final words" }, user), { send: fakeSend });
await new Promise((r) => setTimeout(r, 400));
const elapsed = (Date.now() - t0) / 1000;
console.log(`  ${sent.length} relayed in ${elapsed.toFixed(2)} s; last phase = ${sent.at(-1)?.p.phase}`);
check(sent.length <= Math.ceil(elapsed * 5) + 1, "≤ 5 events/s per session");
check(sent.at(-1)?.p.phase === "done", "terminal phase is never lost to coalescing");
delete process.env.AGENT_WALL_EVENTS_SECRET;
check(relayVoiceActivity(wallEvent, { send: fakeSend }).relayed === false, "no secret → relayed:false, no send");

console.log("\n── Wall backend: secret + TTL ──");
process.env.AGENT_WALL_EVENTS_SECRET = "right-secret";
check(voiceEventsSecretMatches("right-secret") === true, "correct secret accepted");
check(voiceEventsSecretMatches("wrong") === false && voiceEventsSecretMatches(undefined) === false, "wrong / missing secret refused");
delete process.env.AGENT_WALL_EVENTS_SECRET;
check(voiceEventsSecretMatches("") === false, "unset secret refuses everything");
check(normaliseVoiceReadout({ id: "not-hex!", phase: "listening" }) === null, "wall rejects a malformed id");
const broadcasts = [];
const store = new VoiceReadoutStore({ broadcast: (e) => broadcasts.push(e), ttlMs: 50 });
store.upsert(normaliseVoiceReadout({ id: "abcdef0123456789", phase: "thinking", speaker: "Jane D." }));
store.sweep(Date.now() + 100);
console.log("  broadcasts:", broadcasts.map((b) => `${b.type}:${b.phase}`).join(", "));
check(broadcasts.at(-1)?.phase === "expired", "a console that goes silent is expired by TTL");
clearInterval(store.sweeper);

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
