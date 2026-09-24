// Server-verified confirmations (design spec §3 rules 6–9).
//
// Nothing that changes data executes until the person confirms in the UI, and
// the confirmation is a fact this process checks, never something the model
// asserts. The token is:
//
//   · bound to the exact tool AND the exact arguments shown (a hash of the
//     canonical JSON), so a confirmation cannot be replayed against different
//     arguments;
//   · single-use, and idempotent on replay: the first confirm executes and
//     caches the result; a second click, a held Enter or a retried request
//     returns that same result without running the action again;
//   · expired 5 minutes after it is issued, and never reusable — an expired
//     prompt is answered with "the wall may have changed since";
//   · only spendable through the UI confirmation endpoint. A token that
//     arrives inside a model tool call is refused, which is what makes a
//     spoken "yes" — or the model deciding on the user's behalf — do nothing.
//
// In memory on purpose: a token must not outlive the process that issued it,
// and losing pending confirmations on restart is the safe direction to fail.

import { createHash, randomUUID } from "node:crypto";

const TTL_MS = Number(process.env.AGENT_CONFIRM_TTL_MS || 5 * 60 * 1000);
const byToken = new Map();
const byKey = new Map();

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`;
  return JSON.stringify(value ?? null);
}
export function argsHash(input) {
  return createHash("sha256").update(canonical(input)).digest("hex").slice(0, 32);
}
function keyOf(userId, toolName, input) {
  return `${userId}\u0000${toolName}\u0000${argsHash(input)}`;
}
// How long an answered or expired prompt stays readable after it can no
// longer be acted on. The console shows "Expired — nothing changed" and
// "Cancelled" records from this, and a replayed confirm keeps answering
// idempotently, so these must outlive the 5-minute action window.
const GRACE_MS = 30 * 60 * 1000;
function sweep(now) {
  for (const [token, e] of byToken) {
    if (e.status === "pending" && e.expiresAt <= now) e.status = "expired";
    const settledAt = e.appliedAt ?? e.cancelledAt ?? e.expiresAt;
    if (e.status !== "pending" && settledAt + GRACE_MS <= now) { byToken.delete(token); byKey.delete(e.key); }
  }
}

/**
 * Issue (or re-issue) the pending confirmation for user + tool + exact input.
 * An outstanding token is reused: minting a fresh one on every ask would let a
 * garbled retry invalidate the token the user is about to click.
 */
export function issueConfirmation({ user, toolName, input, level, summary, targetId = null, targetLabel = null, conversationId = null, channel = "ui" }) {
  const now = Date.now();
  sweep(now);
  const key = keyOf(user.userId, toolName, input);
  const existing = byKey.get(key);
  if (existing && existing.status === "pending" && existing.expiresAt > now) return publicView(existing);
  const entry = {
    token: randomUUID(), key, userId: user.userId, toolName, input, level, summary,
    targetId, targetLabel, conversationId, channel,
    issuedAt: now, expiresAt: now + TTL_MS, status: "pending",
    result: null, appliedAt: null, cancelledAt: null, executing: null,
  };
  byToken.set(entry.token, entry); byKey.set(key, entry);
  return publicView(entry);
}

export function getConfirmation(token, user) {
  sweep(Date.now());
  const e = byToken.get(String(token ?? ""));
  if (!e || e.userId !== user.userId) return null;
  if (e.status === "pending" && e.expiresAt <= Date.now()) e.status = "expired";
  return e;
}

export function publicView(e) {
  const now = Date.now();
  const status = e.status === "pending" && e.expiresAt <= now ? "expired" : e.status;
  return {
    token: e.token, status, level: e.level, toolName: e.toolName, input: e.input, summary: e.summary,
    targetId: e.targetId, targetLabel: e.targetLabel, issuedAt: new Date(e.issuedAt).toISOString(),
    expiresAt: new Date(e.expiresAt).toISOString(), appliedAt: e.appliedAt ? new Date(e.appliedAt).toISOString() : null,
    cancelledAt: e.cancelledAt ? new Date(e.cancelledAt).toISOString() : null,
    result: e.status === "applied" ? e.result : null,
  };
}

/**
 * Spend a token from the UI. Returns { entry, replay } — `replay` when the
 * action already ran for this token (the caller returns the cached result).
 * Two confirms racing share ONE execution: the second awaits the first's
 * promise instead of starting its own.
 */
export function beginConfirmation({ token, user, toolName, input }) {
  const e = getConfirmation(token, user);
  if (!e) return { error: "unknown" };
  if (e.toolName !== toolName || e.key !== keyOf(user.userId, toolName, input)) return { error: "mismatch" };
  if (e.status === "applied") return { entry: e, replay: true };
  if (e.status === "cancelled") return { error: "cancelled" };
  if (e.status === "expired" || (e.status === "pending" && e.expiresAt <= Date.now())) { e.status = "expired"; return { error: "expired" }; }
  if (e.executing) return { entry: e, inFlight: true };
  return { entry: e };
}
export function settleConfirmation(e, result) {
  e.status = "applied"; e.appliedAt = Date.now(); e.result = result; e.executing = null;
}
export function failConfirmation(e) {
  // A failed execution leaves the prompt pending: the user may retry it, and
  // the same token still binds the same arguments.
  e.executing = null;
}
export function cancelConfirmation(token, user) {
  const e = getConfirmation(token, user);
  if (!e || e.status !== "pending") return e ?? null;
  e.status = "cancelled"; e.cancelledAt = Date.now();
  return e;
}

// ── Voice readback tokens (Part 9 groundwork) keep their old, narrower API ──
// A destructive action asked by voice is read back by title first; the token
// here proves the readback happened. It is separate from UI confirmation on
// purpose: readback is a check on WHAT was heard, confirmation is the check
// on WHETHER to do it, and voice can never supply the second (§3 rule 9).
const readback = new Map();
export function requireConfirmation({ user, toolName, targetId, targetLabel, why }) {
  const now = Date.now();
  const k = `${user.userId}\u0000${toolName}\u0000${targetId ?? ""}`;
  const existing = readback.get(k);
  const token = existing && existing.expiresAt > now ? existing.token : randomUUID();
  readback.set(k, { token, expiresAt: existing && existing.expiresAt > now ? existing.expiresAt : now + TTL_MS });
  return { confirmationRequired: true, confirmationToken: token, executed: false, what: targetLabel ?? targetId ?? null, why,
    message: `NOT DONE YET. ${why} Read back exactly what will happen and ask the dispatcher to confirm out loud. If they confirm, call ${toolName} again with the same arguments plus the token. If they decline, do nothing and say so.` };
}
export function consumeConfirmation({ user, toolName, targetId, token }) {
  const k = `${user.userId}\u0000${toolName}\u0000${targetId ?? ""}`;
  const e = readback.get(k);
  if (!e || !token || e.token !== token || e.expiresAt <= Date.now()) return false;
  readback.delete(k);
  return true;
}
export function _resetConfirmations() { byToken.clear(); byKey.clear(); readback.clear(); }
