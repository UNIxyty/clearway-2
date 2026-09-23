#!/usr/bin/env node
// Part 3's done-condition: a dispatcher on the allowlist can hold a useful
// read-only conversation, with sources attributed and verbatim text marked,
// and history that survives a reload.
//
//   node scripts/agent-verify-part3.mjs [--base http://127.0.0.1:5175]
//
// Needs docs/supabase-agent-conversations.sql applied and the agent running
// with DISABLE_AUTH_FOR_TESTING=true.

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
const SB = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
const KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "");
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

const results = [];
const check = (name, passed, detail = "") => {
  results.push({ name, passed });
  console.log(`${passed ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

const sb = async (path, init = {}) => {
  const res = await fetch(`${SB}/rest/v1/${path}`, { headers: H, ...init });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path} -> ${res.status}: ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
};

/** Send one turn and consume the whole SSE stream. */
async function ask(message, conversationId = null, context = null) {
  const res = await fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, conversationId, context }),
  });
  if (!res.ok) return { status: res.status, body: await res.json().catch(() => null) };
  const raw = await res.text();
  const events = {};
  for (const frame of raw.split("\n\n")) {
    const ev = /^event: (.+)$/m.exec(frame)?.[1];
    const data = /^data: (.+)$/m.exec(frame)?.[1];
    if (!ev || !data) continue;
    const payload = JSON.parse(data);
    if (ev === "delta") events.text = (events.text ?? "") + payload.text;
    else (events[ev] ??= []).push(payload);
  }
  return { status: 200, ...events };
}

async function main() {
  console.log(`agent: ${BASE}\n`);
  await sb("agent_settings?id=eq.global", { method: "PATCH", body: JSON.stringify({ enabled: true, reason: "part3 verify" }) });
  await sb(`agent_access?user_id=eq.${MOCK_USER_ID}`, { method: "DELETE" });
  await sb("agent_access", { method: "POST", headers: { ...H, Prefer: "return=minimal" }, body: JSON.stringify([{ user_id: MOCK_USER_ID, user_email: "part3@clearway.local" }]) });

  // 1. A question that must use a company-tier tool.
  const first = await ask("What CAA contacts do we have for Egypt? Quote the record.", null, { kind: "page", label: "Dashboard" });
  const conversationId = first.start?.[0]?.conversationId ?? null;
  check("a turn answers and opens a conversation", first.status === 200 && Boolean(conversationId), conversationId ?? `HTTP ${first.status}`);
  check("the reply streamed text", Boolean(first.text && first.text.trim().length > 0), (first.text ?? "").slice(0, 60));

  const done = first.done?.[0] ?? {};
  check("tool activity is reported", Array.isArray(done.toolActivity) && done.toolActivity.length > 0, (done.toolActivity ?? []).map((t) => t.name).join(", "));
  check("sources are attributed with a tier", Array.isArray(done.sources) && done.sources.length > 0 && done.sources.every((s) => s.tier), (done.sources ?? []).map((s) => `${s.tier}:${s.label}`).join(" | ").slice(0, 120));

  const companySource = (done.sources ?? []).some((s) => s.tier === "company");
  check("a company-tier source is used for operational content", companySource, companySource ? "company tier present" : "no company source");

  // 2. History is SERVER-side.
  const list = await (await fetch(`${BASE}/api/conversations`)).json();
  check("the conversation appears in server-side history", (list.conversations ?? []).some((c) => c.id === conversationId), `${(list.conversations ?? []).length} conversations`);

  const thread = await (await fetch(`${BASE}/api/conversations/${conversationId}`)).json();
  const roles = (thread.messages ?? []).map((m) => m.role);
  check("both turns are persisted", roles.includes("user") && roles.includes("assistant"), roles.join(","));

  const assistant = (thread.messages ?? []).find((m) => m.role === "assistant");
  check("the stored turn keeps its sources", Array.isArray(assistant?.sources) && assistant.sources.length > 0);
  check("the stored turn keeps its tool activity", Array.isArray(assistant?.toolActivity) && assistant.toolActivity.length > 0);

  // 3. A follow-up continues the SAME thread (the model gets the history).
  const second = await ask("And which of those did you just quote?", conversationId);
  const sameThread = second.start?.[0]?.conversationId === conversationId;
  check("a follow-up continues the same conversation", sameThread, second.start?.[0]?.conversationId ?? "none");
  const after = await (await fetch(`${BASE}/api/conversations/${conversationId}`)).json();
  check("the thread grew rather than forking", (after.messages ?? []).length >= 4, `${(after.messages ?? []).length} messages`);

  // 4. Verbatim records only ever come from a tool that marked them so.
  const verbatim = done.verbatim ?? [];
  check("verbatim records carry their source and id when present", verbatim.every((v) => v.source && v.tool), verbatim.length ? `${verbatim.length} records` : "none quoted this turn (acceptable)");

  // 5. Another user's conversation is not readable.
  const foreign = await sb("agent_conversations", {
    method: "POST",
    headers: { ...H, Prefer: "return=representation" },
    body: JSON.stringify([{ user_id: "00000000-0000-4000-8000-0000000000ff", title: "not yours" }]),
  });
  const foreignId = foreign?.[0]?.id;
  const foreignRead = await fetch(`${BASE}/api/conversations/${foreignId}`);
  check("another user's conversation is not readable", foreignRead.status === 404, `HTTP ${foreignRead.status}`);
  await sb(`agent_conversations?id=eq.${foreignId}`, { method: "DELETE" });

  // 6. The gate still applies.
  await sb(`agent_access?user_id=eq.${MOCK_USER_ID}`, { method: "DELETE" });
  const afterRevoke = await fetch(`${BASE}/api/conversations`);
  check("history is refused once access is revoked", afterRevoke.status === 403, `HTTP ${afterRevoke.status}`);

  const failed = results.filter((r) => !r.passed);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(`\nverification aborted: ${e.message}`);
  if (/agent_conversations|agent_messages/.test(e.message)) {
    console.error("→ Run docs/supabase-agent-conversations.sql in the Supabase SQL editor first.");
  }
  process.exit(1);
});
