// Write actions: recording, AI-authorship, and undo.
//
// Three rules live here rather than in each tool, because a rule repeated in
// six places is a rule that will be missed in the seventh:
//
//  1. EVERY agent-written record is marked AI-authored. Staff must be able to
//     tell agent-authored content from human-authored at a glance, on the wall
//     and in the console, without consulting a log.
//  2. EVERY write records the COMPLETE before and after state. Not a diff — an
//     undo should restore a known state rather than re-derive one, and a
//     reviewer months later should not need the record's current shape to read
//     the history.
//  3. An undo is a NEW action referencing the original. History is never
//     rewritten; "what did the agent do" and "what did we do about it" are both
//     permanent.

import { audit } from "./store.mjs";

const REST_TIMEOUT_MS = 10_000;

function url() { return String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, ""); }
function key() { return String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim(); }

async function rest(pathAndQuery, init = {}) {
  const headers = { apikey: key(), Authorization: `Bearer ${key()}`, "Content-Type": "application/json", ...(init.headers ?? {}) };
  const response = await fetch(`${url()}/rest/v1/${pathAndQuery}`, { ...init, headers, signal: AbortSignal.timeout(REST_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`${init.method ?? "GET"} ${pathAndQuery} -> ${response.status}: ${(await response.text()).slice(0, 240)}`);
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

/** The marker staff see. Stable string — the console and wall match on it. */
export const AI_AUTHOR_MARK = "Ops Agent (AI)";

/**
 * Stamp a record as AI-authored on behalf of a named person.
 *
 * Both halves matter: "AI" so nobody mistakes it for a colleague's judgement,
 * and the person's name so there is always a human accountable for it. An
 * unattributed AI edit is the thing an ops department cannot accept.
 */
export function markAiAuthored(payload, user, { field = "addedBy" } = {}) {
  return {
    ...payload,
    [field]: `${AI_AUTHOR_MARK} for ${user.name || user.email || "a dispatcher"}`,
    aiAuthored: true,
  };
}

/** True when a record carries our marker — used to decide what an undo may touch. */
export function isAiAuthored(record) {
  if (!record) return false;
  if (record.aiAuthored === true) return true;
  return ["addedBy", "createdBy", "updatedBy", "reviewedBy", "statusUpdatedBy"]
    .some((f) => String(record[f] ?? "").startsWith(AI_AUTHOR_MARK));
}

/**
 * Record one write. Returns the action id, which the tool returns to the model
 * so the user can later say "undo that".
 *
 * Never throws: a write that succeeded must not be reported as failed because
 * its bookkeeping row did not save. It IS surfaced loudly, because an
 * unrecorded write is an un-undoable one.
 */
export async function recordAction({
  user, conversationId, toolName, args,
  targetKind, targetId, targetLabel,
  beforeState, afterState,
  kind = "write", undoesActionId = null,
  reversible = true, irreversibleReason = null,
  success = true, error = null,
}) {
  const row = {
    user_id: user.userId,
    user_email: user.email ?? null,
    conversation_id: /^[0-9a-f-]{36}$/i.test(String(conversationId ?? "")) ? conversationId : null,
    tool_name: toolName,
    arguments: args ?? {},
    target_kind: targetKind,
    target_id: targetId != null ? String(targetId) : null,
    target_label: targetLabel ?? null,
    before_state: beforeState ?? null,
    after_state: afterState ?? null,
    kind,
    undoes_action_id: undoesActionId,
    reversible,
    irreversible_reason: irreversibleReason,
    success,
    error,
  };

  let actionId = null;
  try {
    const rows = await rest("agent_actions", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify([row]) });
    actionId = rows?.[0]?.id ?? null;
  } catch (e) {
    process.stderr.write(`[agent-actions] FAILED to record ${toolName} on ${targetKind}/${targetId}: ${e.message}\n`);
  }

  await audit({
    kind: kind === "undo" ? "action.undone" : "action.write",
    userId: user.userId, userEmail: user.email, conversationId,
    toolName,
    toolArgs: args ?? null,
    toolResult: { actionId, targetKind, targetId },
    // Reversible writes are executed directly — the brief is explicit that
    // authorized reversible actions do not get a confirmation screen.
    confirmationStatus: "not_required",
    success, error,
    detail: { targetLabel, reversible, undoesActionId },
  });

  return actionId;
}

/** Mark an action as undone by another. */
export async function markUndone(originalId, undoActionId) {
  await rest(`agent_actions?id=eq.${encodeURIComponent(originalId)}`, {
    method: "PATCH",
    body: JSON.stringify({ undone_at: new Date().toISOString(), undone_by_action_id: undoActionId }),
  }).catch((e) => process.stderr.write(`[agent-actions] could not mark ${originalId} undone: ${e.message}\n`));
}

/**
 * A user's undoable actions, newest first. Scoped to the caller in the query:
 * one dispatcher can never undo another's action, even by id.
 */
export async function listUndoable({ user, conversationId = null, limit = 20 }) {
  const parts = [
    `user_id=eq.${encodeURIComponent(user.userId)}`,
    "kind=eq.write", "success=eq.true", "reversible=eq.true", "undone_at=is.null",
    "select=id,tool_name,target_kind,target_id,target_label,before_state,after_state,created_at,arguments",
    "order=created_at.desc", `limit=${Math.min(limit, 50)}`,
  ];
  if (conversationId && /^[0-9a-f-]{36}$/i.test(conversationId)) parts.push(`conversation_id=eq.${conversationId}`);
  return (await rest(`agent_actions?${parts.join("&")}`)) ?? [];
}

export async function getAction(id, user) {
  if (!/^[0-9a-f-]{36}$/i.test(String(id))) return null;
  const rows = await rest(
    `agent_actions?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(user.userId)}&select=*&limit=1`
  ).catch(() => null);
  return rows?.[0] ?? null;
}
