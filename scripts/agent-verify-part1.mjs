#!/usr/bin/env node
// End-to-end proof of Part 1's done-condition, runnable against a local agent
// service or the deployed one. It exercises the three things the prompt asks
// for and cleans up after itself:
//
//   1. a user ON the allowlist can send a message and get a model reply, logged
//   2. a user NOT on the allowlist gets nothing
//   3. the kill switch disables the agent for everyone
//
// Requires: the tables from docs/supabase-agent-foundation.sql, Supabase
// service-role credentials in .env, and the agent running with
// DISABLE_AUTH_FOR_TESTING=true (so the mock user stands in for a real caller
// without needing a browser session).
//
//   node agent/server.mjs   # in another shell, with DISABLE_AUTH_FOR_TESTING=true
//   node scripts/agent-verify-part1.mjs [--base http://127.0.0.1:5175]

import { readFileSync, existsSync } from "node:fs";

if (existsSync(".env")) {
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && process.env[m[1]] === undefined && m[2].trim()) process.env[m[1]] = m[2].trim();
  }
}

const args = process.argv.slice(2);
const value = (f, d) => (args.indexOf(f) === -1 ? d : args[args.indexOf(f) + 1] ?? d);
const BASE = (value("--base", process.env.AGENT_BASE_URL || "http://127.0.0.1:5175")).replace(/\/+$/, "");
// Must match MOCK_USER.userId in agent/lib/auth.mjs.
const MOCK_USER_ID = "00000000-0000-4000-8000-000000000001";

const SB = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
const KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "");
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

async function sb(pathAndQuery, { method = "GET", body = null, prefer = null } = {}) {
  const res = await fetch(`${SB}/rest/v1/${pathAndQuery}`, {
    method,
    headers: prefer ? { ...H, Prefer: prefer } : H,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) throw new Error(`Supabase ${method} ${pathAndQuery} -> ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

const results = [];
function check(name, passed, detail = "") {
  results.push({ name, passed, detail });
  console.log(`${passed ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function availability() {
  const res = await fetch(`${BASE}/api/availability`);
  return res.json();
}

/** Returns { status, events, text } — consumes the SSE stream to completion. */
async function chat(message) {
  const res = await fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", content: message }] }),
  });
  if (!res.ok || !res.body) return { status: res.status, events: [], text: "", body: await res.json().catch(() => null) };
  const raw = await res.text();
  const events = [...raw.matchAll(/^event: (.+)$/gm)].map((m) => m[1]);
  const text = [...raw.matchAll(/^data: (.+)$/gm)]
    .map((m) => { try { return JSON.parse(m[1]); } catch { return {}; } })
    .map((d) => d.text ?? "")
    .join("");
  return { status: res.status, events, text, raw };
}

async function main() {
  if (!SB || !KEY) throw new Error("Supabase service-role credentials are required in .env");
  console.log(`agent: ${BASE}\nsupabase: ${SB}\n`);

  const health = await (await fetch(`${BASE}/api/health`)).json();
  check("service answers /api/health as 'agent'", health.service === "agent", `store=${health.store} auth=${health.auth} tier=${health.activeTier}`);

  // Start from a known state: no grant for the mock user, switch on.
  await sb(`agent_access?user_id=eq.${MOCK_USER_ID}`, { method: "DELETE" });
  await sb("agent_settings?id=eq.global", { method: "PATCH", body: { enabled: true, reason: "verify: baseline" } });

  // ── 2. Not on the allowlist ──────────────────────────────────────────────
  const before = await availability();
  check("user NOT on the allowlist sees no agent", before.available === false && before.reason === "not_on_allowlist", `reason=${before.reason}`);
  const deniedChat = await chat("Should never reach a model.");
  check("chat is refused without a grant", deniedChat.status === 403, `HTTP ${deniedChat.status}`);

  const deniedRows = await sb(`agent_audit_log?user_id=eq.${MOCK_USER_ID}&kind=eq.chat.denied&select=id&order=created_at.desc&limit=1`);
  check("the refusal is audited", Array.isArray(deniedRows) && deniedRows.length > 0);

  // ── 1. On the allowlist ──────────────────────────────────────────────────
  await sb("agent_access", {
    method: "POST",
    prefer: "return=representation",
    body: [{ user_id: MOCK_USER_ID, user_email: "verify@clearway.local", note: "agent-verify-part1" }],
  });
  const granted = await availability();
  check("granted user sees the agent", granted.available === true);

  const reply = await chat("Reply with exactly: READY");
  const streamed = reply.events.includes("delta") && reply.events.includes("done");
  check("granted user gets a STREAMED model reply", streamed && reply.text.trim().length > 0, `${reply.text.trim().slice(0, 60)}`);

  const logged = await sb(`agent_audit_log?user_id=eq.${MOCK_USER_ID}&kind=eq.chat.response&select=model_id,model_tier,input_tokens,output_tokens&order=created_at.desc&limit=1`);
  const row = logged?.[0];
  check("the exchange is audited with model and tokens", Boolean(row?.model_id), row ? `${row.model_tier} -> ${row.model_id}, ${row.input_tokens}/${row.output_tokens} tokens` : "no row");

  // ── 3. Kill switch ───────────────────────────────────────────────────────
  await sb("agent_settings?id=eq.global", { method: "PATCH", body: { enabled: false, reason: "verify: kill switch test" } });
  const killed = await availability();
  check("kill switch hides the agent from a GRANTED user", killed.available === false && killed.reason === "disabled_globally", `reason=${killed.reason}`);
  const killedChat = await chat("Should be refused by the kill switch.");
  check("kill switch refuses chat for a GRANTED user", killedChat.status === 503, `HTTP ${killedChat.status}`);

  // Restore.
  await sb("agent_settings?id=eq.global", { method: "PATCH", body: { enabled: true, reason: "verify: restored" } });
  await sb(`agent_access?user_id=eq.${MOCK_USER_ID}`, { method: "DELETE" });
  const restored = await availability();
  check("cleanup left the mock user with no access", restored.available === false);

  const failed = results.filter((r) => !r.passed);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(`\nverification aborted: ${error.message}`);
  if (/agent_access|agent_settings|agent_audit_log/.test(error.message)) {
    console.error("→ Run docs/supabase-agent-foundation.sql in the Supabase SQL editor first.");
  }
  process.exit(1);
});
