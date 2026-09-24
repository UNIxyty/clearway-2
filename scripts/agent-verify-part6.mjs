#!/usr/bin/env node
// Part 6's done-condition: sources are visibly distinguished in every answer,
// and the agent prefers internal data when it suffices.
//
//   node scripts/agent-verify-part6.mjs

import { readFileSync, existsSync } from "node:fs";

if (existsSync(".env")) {
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && process.env[m[1]] === undefined && m[2].trim()) process.env[m[1]] = m[2].trim();
  }
}

const args = process.argv.slice(2);
const value = (f, d) => (args.indexOf(f) === -1 ? d : args[args.indexOf(f) + 1] ?? d);
const BASE = value("--base", process.env.AGENT_BASE_URL || "http://127.0.0.1:5175").replace(/\/+$/, "");
const MOCK_USER_ID = "00000000-0000-4000-8000-000000000001";
const OTHER_USER_ID = "00000000-0000-4000-8000-0000000000ee";
const SB = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
const KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "");
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

const results = [];
const check = (name, passed, detail = "") => { results.push({ name, passed }); console.log(`${passed ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`); };
const skip = (name, why) => { results.push({ name, passed: true, skipped: true }); console.log(`SKIP  ${name} — ${why}`); };

async function sb(path, init = {}) {
  const res = await fetch(`${SB}/rest/v1/${path}`, { headers: H, ...init });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path} -> ${res.status}: ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}
const invoke = (name, input = {}) =>
  fetch(`${BASE}/api/tools/invoke`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, input }) }).then((r) => r.json());

async function main() {
  console.log(`agent: ${BASE}\n`);
  await sb("agent_settings?id=eq.global", { method: "PATCH", body: JSON.stringify({ enabled: true, reason: "part6 verify" }) });
  await sb(`agent_access?user_id=eq.${MOCK_USER_ID}`, { method: "DELETE" });
  await sb("agent_access", { method: "POST", headers: { ...H, Prefer: "return=minimal" }, body: JSON.stringify([{ user_id: MOCK_USER_ID, user_email: "part6@clearway.local" }]) });
  await sb(`agent_memories?user_id=eq.${MOCK_USER_ID}`, { method: "DELETE" });
  await sb(`agent_memories?user_id=eq.${OTHER_USER_ID}`, { method: "DELETE" });

  // ── Memory ─────────────────────────────────────────────────────────────
  const saved = await invoke("remember", { content: "EPWA ground handling is slow before 0600 local — allow an extra 20 minutes.", relatesToKind: "airport", relatesTo: "epwa" });
  check("a note is remembered", saved.ok === true && Boolean(saved.memory?.id), saved.ok ? saved.memory.content.slice(0, 48) : saved.message);
  check("the note is normalised and attributed", saved.memory?.relatesTo === "EPWA" && saved.memory?.isMine === true, `relatesTo=${saved.memory?.relatesTo}`);

  const recalled = await invoke("recall", { relatesTo: "EPWA" });
  check("it is recalled by what it relates to", recalled.ok === true && recalled.count === 1, `${recalled.count} note(s)`);
  check("recall warns that a note is not a rule", /not approved company rules/i.test(recalled.note ?? ""));

  // Another user's PRIVATE note must not be visible.
  await sb("agent_memories", { method: "POST", headers: { ...H, Prefer: "return=minimal" }, body: JSON.stringify([{ user_id: OTHER_USER_ID, user_email: "someone.else@clearway.local", content: "PRIVATE-NOTE-SHOULD-NOT-LEAK", relates_to: "EPWA", relates_to_kind: "airport" }]) });
  const afterOther = await invoke("recall", { relatesTo: "EPWA" });
  check("another user's private note is NOT visible",
    !(afterOther.memories ?? []).some((m) => m.content.includes("PRIVATE-NOTE-SHOULD-NOT-LEAK")),
    `${afterOther.count} visible`);

  // A shared note IS visible, and marked as not mine.
  await sb(`agent_memories?user_id=eq.${OTHER_USER_ID}`, { method: "PATCH", body: JSON.stringify({ is_shared: true, content: "SHARED-NOTE-VISIBLE" }) });
  const withShared = await invoke("recall", { relatesTo: "EPWA" });
  const shared = (withShared.memories ?? []).find((m) => m.content === "SHARED-NOTE-VISIBLE");
  check("a shared note IS visible and marked not-mine", Boolean(shared) && shared.isMine === false && shared.isShared === true);

  // You can only forget your own.
  const forgetOther = shared ? await invoke("forget", { id: shared.id }) : { error: "no shared note" };
  check("you cannot forget someone else's note", forgetOther.ok === false && forgetOther.error === "NOT_FOUND", forgetOther.error);
  const forgetMine = await invoke("forget", { id: saved.memory.id });
  check("you can forget your own note", forgetMine.ok === true && forgetMine.forgotten === true);

  // ── Web search ─────────────────────────────────────────────────────────
  const web = await invoke("web_search", { query: "EUROCONTROL network operations slot rules" });
  if (web.ok === false && web.error === "SERVICE_UNAVAILABLE") {
    check("web search refuses clearly when unconfigured, telling the model not to guess",
      /not configured/i.test(web.message) && /do not answer from memory/i.test(web.message), web.message.slice(0, 80));
    skip("web results are labelled external and non-authoritative", "no BRAVE_SEARCH_API_KEY or TAVILY_API_KEY set");
  } else {
    check("web search returns results", web.ok === true && Array.isArray(web.results), `${web.results?.length} results`);
    check("results are marked non-authoritative and carry a domain",
      web.authoritative === false && (web.results ?? []).every((r) => r.domain && r.retrievedAt),
      `filtered=${web.filtered} provider=${web.provider}`);
  }

  // ── Flight tracking: declared, honest about not being enabled ───────────
  const track = await invoke("get_flight_tracking", { callsign: "BTI472" });
  check("flight tracking is declared and degrades honestly",
    track.ok === true && track.available === false && /not enabled/i.test(track.note ?? ""),
    track.ok ? track.note.slice(0, 60) : track.message);

  // ── Provenance: every tier is distinguishable ───────────────────────────
  const { SOURCE_TIERS, sourcesFromToolCalls } = await import("../agent/lib/tools/framework.mjs");
  await import("../agent/lib/tools/index.mjs");
  check("four distinct source tiers exist", Object.keys(SOURCE_TIERS).length === 4, Object.keys(SOURCE_TIERS).join(", "));
  const colours = new Set(Object.values(SOURCE_TIERS).map((t) => t.fg));
  check("each tier has its own colour", colours.size === 4, [...colours].join(" "));

  const mixed = sourcesFromToolCalls([
    { name: "list_limitations", ok: true, input: {}, result: { source: "wall" } },
    { name: "get_flight", ok: true, input: { flight_id: "OPR:1" }, result: {} },
    { name: "web_search", ok: true, input: { query: "x" }, result: { results: [{ domain: "eurocontrol.int" }] } },
    { name: "recall", ok: true, input: {}, result: { count: 1 } },
  ]);
  check("a mixed answer attributes all four tiers separately",
    new Set(mixed.map((s) => s.tier)).size === 4,
    mixed.map((s) => `${s.n}:${s.tier}`).join(" "));

  // ── The system prompt carries the rule ─────────────────────────────────
  const prompt = readFileSync("agent/config/system-prompt.md", "utf8");
  check("the system prompt states the provenance rule", /Where every fact came from/i.test(prompt) && /Prefer internal data/i.test(prompt));
  check("the prompt forbids treating web content as approved guidance", /never\*\* approved operational guidance/i.test(prompt));

  await sb(`agent_memories?user_id=eq.${MOCK_USER_ID}`, { method: "DELETE" });
  await sb(`agent_memories?user_id=eq.${OTHER_USER_ID}`, { method: "DELETE" });
  await sb(`agent_access?user_id=eq.${MOCK_USER_ID}`, { method: "DELETE" });

  const failed = results.filter((r) => !r.passed);
  const skipped = results.filter((r) => r.skipped).length;
  console.log(`\n${results.length - failed.length - skipped}/${results.length - skipped} checks passed${skipped ? `, ${skipped} skipped` : ""}`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((e) => { console.error(`\nverification aborted: ${e.message}`); process.exit(1); });
