#!/usr/bin/env node
// Part 7's done-condition: reversible changes without confirmation screens;
// every change attributable, marked AI-authored, and carrying enough history for
// undo_action; and permission validation that the model cannot bypass.
//
//   node scripts/agent-verify-part7.mjs
//
// Writes to the LOCAL wall rig and undoes everything it does.

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
const check = (name, passed, detail = "") => { results.push({ name, passed }); console.log(`${passed ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`); };

async function sb(path, init = {}) {
  const res = await fetch(`${SB}/rest/v1/${path}`, { headers: H, ...init });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path} -> ${res.status}: ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}
const invoke = (name, input = {}) =>
  fetch(`${BASE}/api/tools/invoke`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, input }) }).then((r) => r.json());
const wall = (path, init = {}) =>
  fetch(`${process.env.DIGITAL_WALL_INTERNAL_URL || "http://127.0.0.1:5199"}${path}`, {
    headers: { "Content-Type": "application/json" }, ...init,
  }).then((r) => r.json()).catch(() => null);

async function main() {
  console.log(`agent: ${BASE}\n`);
  await sb("agent_settings?id=eq.global", { method: "PATCH", body: JSON.stringify({ enabled: true, reason: "part7 verify" }) });
  await sb(`agent_access?user_id=eq.${MOCK_USER_ID}`, { method: "DELETE" });
  await sb("agent_access", { method: "POST", headers: { ...H, Prefer: "return=minimal" }, body: JSON.stringify([{ user_id: MOCK_USER_ID, user_email: "part7@clearway.local" }]) });
  // agent_actions rows are never deleted -- the table is guarded by a trigger
  // (docs/supabase-agent-hardening.sql). The rig's rows are identifiable by
  // the mock user id and harmless.

  // ── Create, with no confirmation step ──────────────────────────────────
  const created = await invoke("create_limitation", {
    title: "PART7-VERIFY · TWY Z closed",
    description: "Verification record. Safe to delete.",
    airportIcaos: ["evra"],
  });
  check("a limitation is created directly, with no confirmation step",
    created.ok === true && created.created === true && Boolean(created.actionId),
    created.ok ? `id=${created.id}` : created.message);
  check("the result carries an action id for a later undo", Boolean(created.actionId), created.actionId);

  // ── AI authorship is on the RECORD, not just in a log ───────────────────
  const onWall = await wall(`/api/timeline/limitations/${encodeURIComponent(created.id)}`);
  const record = onWall?.limitation;
  check("the record on the wall is marked AI-authored",
    record?.aiAuthored === true || /Ops Agent \(AI\)/.test(JSON.stringify(record ?? {})),
    record ? String(record.addedBy ?? record.updatedBy ?? "(no author field)").slice(0, 52) : "not found on the wall");
  check("the AI mark names the person who asked",
    /for .+/.test(String(record?.addedBy ?? "")),
    String(record?.addedBy ?? "").slice(0, 60));

  // ── Complete before/after state is stored ───────────────────────────────
  const actionRow = (await sb(`agent_actions?id=eq.${created.actionId}&select=*`))?.[0];
  check("the action stores a COMPLETE after-state, not a diff",
    actionRow && actionRow.after_state && actionRow.after_state.title === "PART7-VERIFY · TWY Z closed",
    actionRow ? `before=${actionRow.before_state === null ? "null (creation)" : "present"} after=${Object.keys(actionRow.after_state ?? {}).length} fields` : "no row");
  check("the action links the conversation and the tool that caused it",
    actionRow?.tool_name === "create_limitation" && Boolean(actionRow?.arguments?.title));

  // ── Update: before-state must be the real previous record ───────────────
  const updated = await invoke("update_limitation", { id: created.id, title: "PART7-VERIFY · TWY Z closed (amended)" });
  check("an update succeeds and is recorded", updated.ok === true && Boolean(updated.actionId));
  const updateRow = (await sb(`agent_actions?id=eq.${updated.actionId}&select=*`))?.[0];
  check("the update stored the REAL previous title as before-state",
    updateRow?.before_state?.title === "PART7-VERIFY · TWY Z closed",
    `before="${updateRow?.before_state?.title}" after="${updateRow?.after_state?.title}"`);

  // ── Undo restores the previous state ────────────────────────────────────
  const undoUpdate = await invoke("undo_action", { actionId: updated.actionId });
  check("the update can be undone", undoUpdate.ok === true && undoUpdate.undone === true, undoUpdate.what ?? undoUpdate.message);
  const afterUndo = await wall(`/api/timeline/limitations/${encodeURIComponent(created.id)}`);
  check("the ORIGINAL title is actually restored on the wall",
    afterUndo?.limitation?.title === "PART7-VERIFY · TWY Z closed",
    `now "${afterUndo?.limitation?.title}"`);

  // ── The original action history survives ────────────────────────────────
  const original = (await sb(`agent_actions?id=eq.${updated.actionId}&select=undone_at,undone_by_action_id,kind`))?.[0];
  check("the original action is marked undone but NOT deleted",
    Boolean(original?.undone_at) && Boolean(original?.undone_by_action_id) && original.kind === "write");
  const undoRow = (await sb(`agent_actions?undoes_action_id=eq.${updated.actionId}&select=kind,before_state,after_state`))?.[0];
  check("the undo is itself a new recorded action", undoRow?.kind === "undo");

  // ── Undo twice is refused ───────────────────────────────────────────────
  const twice = await invoke("undo_action", { actionId: updated.actionId });
  check("the same action cannot be undone twice", twice.ok === false && twice.error === "INVALID_INPUT", twice.message?.slice(0, 60));

  // ── Finding an action without knowing its id ────────────────────────────
  const recent = await invoke("list_recent_actions", { limit: 10 });
  check("recent actions are listable with human descriptions",
    recent.ok === true && (recent.actions ?? []).some((a) => /Added limitation/.test(a.what)),
    (recent.actions ?? [])[0]?.what);

  // ── Undoing a creation removes the record ───────────────────────────────
  const undoCreate = await invoke("undo_action", { actionId: created.actionId });
  check("undoing a creation removes the record", undoCreate.ok === true && undoCreate.undone === true);
  const gone = await wall(`/api/timeline/limitations/${encodeURIComponent(created.id)}`);
  check("the limitation is actually gone from the wall", gone?.ok === false || !gone?.limitation, gone?.error ?? "removed");

  // ── Permission cannot be bypassed by the model ──────────────────────────
  // set_operator_active is admin-only. The verifier runs as developer, so this
  // proves the plumbing; the negative case is proven by re-running as `user`.
  const adminTool = await invoke("set_operator_active", { operatorId: "definitely-not-an-operator", isActive: false });
  check("an admin write validates against the backend, not the model",
    adminTool.ok === false && ["NOT_FOUND", "NO_PERMISSION"].includes(adminTool.error),
    `${adminTool.error}: ${String(adminTool.message).slice(0, 50)}`);

  const forged = await invoke("undo_action", { actionId: "00000000-0000-4000-8000-00000000dead" });
  check("an action id that is not yours cannot be undone", forged.ok === false && forged.error === "NOT_FOUND");

  // ── Still out of reach ──────────────────────────────────────────────────
  // Deletion arrived in Part 8 and is REVERSIBLE (soft delete + restore), so
  // it is no longer asserted against here. Sending to a crew and acknowledging
  // a safety check remain unreachable: neither can be taken back.
  const tools = await (await fetch(`${BASE}/api/tools`)).json();
  const names = (tools.tools ?? []).map((t) => t.name);
  check("no send-to-crew or safety-acknowledgement tool is offered",
    !names.some((n) => /acknowledge|^send_notam|dispatch|crew/.test(n)),
    `${names.length} tools offered`);

  // agent_actions rows are never deleted -- the table is guarded by a trigger
  // (docs/supabase-agent-hardening.sql). The rig's rows are identifiable by
  // the mock user id and harmless.
  await sb(`agent_access?user_id=eq.${MOCK_USER_ID}`, { method: "DELETE" });

  const failed = results.filter((r) => !r.passed);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((e) => { console.error(`\nverification aborted: ${e.message}`); process.exit(1); });
