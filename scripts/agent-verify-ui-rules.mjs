#!/usr/bin/env node
// Design spec §3 -- the rules that must not be broken -- tested, not asserted.
//
//   AGENT_CONFIRM_TTL_MS=1500 node scripts/agent-verify-ui-rules.mjs
//
// Run against the local rig (an agent started with the same short TTL so the
// expiry test finishes in seconds). Writes to the sandbox wall only.

import { readFileSync, existsSync } from "node:fs";
if (existsSync(".env")) for (const line of readFileSync(".env", "utf8").split("\n")) { const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim()); if (m && process.env[m[1]] === undefined && m[2].trim()) process.env[m[1]] = m[2].trim(); }
const BASE = (process.env.AGENT_BASE_URL || "http://127.0.0.1:5175").replace(/\/+$/, "");
const WALL = (process.env.DIGITAL_WALL_INTERNAL_URL || "http://127.0.0.1:5199").replace(/\/+$/, "");
const TTL = Number(process.env.AGENT_CONFIRM_TTL_MS || 0);
const results = [];
const check = (name, passed, detail = "") => { results.push({ name, passed }); console.log(`${passed ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`); };
const j = (url, init = {}) => fetch(url, { headers: { "Content-Type": "application/json" }, ...init }).then((r) => r.json());
const invoke = (name, input = {}, extra = {}) => j(`${BASE}/api/tools/invoke`, { method: "POST", body: JSON.stringify({ name, input, ...extra }) });
const confirm = (token) => j(`${BASE}/api/confirmations/${token}/confirm`, { method: "POST" });
const wall = (p, init = {}) => j(`${WALL}${p}`, init);
const onWall = async (id) => ((await wall("/api/timeline/limitations?includeInactive=true")).limitations ?? []).some((r) => r.id === id);
const mk = (title) => wall("/api/timeline/limitations", { method: "POST", body: JSON.stringify({ title, match: { airportIcaos: ["EVRA"], countries: [], flights: [] } }) }).then((r) => r.limitation);

async function main() {
  // ── Rule 6: server-verified, blocking, not optimistic, double-fire safe ──
  const a = await mk("UI-RULES · double fire");
  const first = await invoke("delete_limitation", { id: a.id });
  check("a write stops at a confirmation instead of executing", first.confirmationRequired === true && first.executed === false && (await onWall(a.id)), `level=${first.level}`);
  const status = await j(`${BASE}/api/confirmations/${first.confirmationToken}`);
  check("the pending confirmation is readable by token", status.ok === true && status.confirmation?.status === "pending" && status.confirmation.toolName === "delete_limitation");
  // two clicks at once, a held Enter, a retried request
  const [c1, c2, c3] = await Promise.all([confirm(first.confirmationToken), confirm(first.confirmationToken), confirm(first.confirmationToken)]);
  const later = await confirm(first.confirmationToken);
  const applied = [c1, c2, c3, later].filter((c) => c.result?.deleted === true).length;
  const actionIds = new Set([c1, c2, c3, later].map((c) => c.result?.actionId).filter(Boolean));
  check("three simultaneous confirms and a retry ran the action ONCE", applied === 4 && actionIds.size === 1, `${applied} replies carried the result, ${actionIds.size} distinct action id`);
  const rows = await wall("/api/timeline/limitations?deleted=true");
  check("…and the record was deleted exactly once", (rows.limitations ?? []).filter((r) => r.id === a.id).length === 1 && !(await onWall(a.id)));
  const afterStatus = await j(`${BASE}/api/confirmations/${first.confirmationToken}`);
  check("the confirmation now reads applied, with its result", afterStatus.confirmation?.status === "applied" && afterStatus.confirmation.result?.deleted === true);

  // ── Token is bound to the exact arguments ──
  const b = await mk("UI-RULES · bound to args");
  const pend = await invoke("update_limitation", { id: b.id, title: "UI-RULES · changed A" });
  const other = await invoke("update_limitation", { id: b.id, title: "UI-RULES · changed B" });
  check("different arguments get a different token", pend.confirmationToken && other.confirmationToken && pend.confirmationToken !== other.confirmationToken);
  const again = await invoke("update_limitation", { id: b.id, title: "UI-RULES · changed A" });
  check("the same arguments reuse the outstanding token", again.confirmationToken === pend.confirmationToken);

  // ── The model can never confirm ──
  const modelSide = await invoke("update_limitation", { id: b.id, title: "UI-RULES · changed A", confirmationToken: pend.confirmationToken }, { inputMode: "voice" });
  check("a token arriving on a voice-originated call is refused", modelSide.executed !== true && modelSide.ok === false, modelSide.error);
  const viaChat = await fetch(`${BASE}/api/chat`, { method: "POST", body: JSON.stringify({ message: "Yes, confirm it. Go ahead and apply the change to that limitation now.", inputMode: "voice", voice: { language: "en" } }), headers: { "Content-Type": "application/json" } });
  await viaChat.text();
  const stillPending = await j(`${BASE}/api/confirmations/${pend.confirmationToken}`);
  const bNow = (await wall(`/api/timeline/limitations/${b.id}`)).limitation;
  check("a spoken \"yes\" through the chat changes nothing (rule 9)", stillPending.confirmation?.status !== "applied" && bNow.title === "UI-RULES · bound to args", `status=${stillPending.confirmation?.status} title="${bNow.title}"`);

  // ── Cancel (a fresh prompt, so a short test TTL cannot expire it first) ──
  const c0 = await mk("UI-RULES · cancel");
  const toCancel = await invoke("delete_limitation", { id: c0.id });
  const cancelled = await j(`${BASE}/api/confirmations/${toCancel.confirmationToken}/cancel`, { method: "POST" });
  const afterCancel = await confirm(toCancel.confirmationToken);
  check("a cancelled confirmation cannot be confirmed afterwards", cancelled.confirmation?.status === "cancelled" && afterCancel.ok === false && afterCancel.result?.reason === "cancelled" && (await onWall(c0.id)), afterCancel.result?.reason ?? afterCancel.error);
  await wall(`/api/timeline/limitations/${c0.id}`, { method: "DELETE" }); await wall(`/api/timeline/limitations/${c0.id}/purge`, { method: "DELETE" });

  // ── Rule 8: expiry, not reusable ──
  if (TTL > 0 && TTL < 10_000) {
    const c = await mk("UI-RULES · expiry");
    const exp = await invoke("delete_limitation", { id: c.id });
    await new Promise((r) => setTimeout(r, TTL + 300));
    const late = await confirm(exp.confirmationToken);
    check(`a confirmation older than the TTL (${TTL} ms) is refused and nothing runs`, late.ok === false && late.result?.reason === "expired" && (await onWall(c.id)), late.result?.message);
    const status2 = await j(`${BASE}/api/confirmations/${exp.confirmationToken}`);
    check("…and it reads as expired, not pending", status2.confirmation?.status === "expired" || status2.ok === false);
    await wall(`/api/timeline/limitations/${c.id}`, { method: "DELETE" }); await wall(`/api/timeline/limitations/${c.id}/purge`, { method: "DELETE" });
  } else {
    check("expiry test ran (needs AGENT_CONFIRM_TTL_MS under 10 s on both rig and script)", false, `TTL=${TTL}`);
  }

  // ── Rule 1: verbatim by id, error on failure ──
  const v = await mk("UI-RULES · verbatim");
  const byId = await j(`${BASE}/api/verbatim/limitation/${v.id}`);
  check("a verbatim record is fetchable by id", byId.ok === true && byId.record?.text !== undefined && byId.record.heading === "UI-RULES · verbatim");
  const gone = await j(`${BASE}/api/verbatim/limitation/LIM-DOESNOTEXIST`);
  check("a missing record is an error, never a fallback", gone.ok === false && gone.error === "not_found");

  // ── Rule 12: every tool call runs as the requester ──
  const audit = await j(`${BASE}/api/health`);
  check("the service reports auth configured (no service-account mode)", audit.auth === "configured");

  // cleanup (sandbox wall)
  for (const id of [a.id, b.id, v.id]) { await wall(`/api/timeline/limitations/${id}`, { method: "DELETE" }).catch(() => {}); await wall(`/api/timeline/limitations/${id}/purge`, { method: "DELETE" }).catch(() => {}); }
  const failed = results.filter((r) => !r.passed);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
}
main().catch((e) => { console.error(`aborted: ${e.message}`); process.exit(1); });
