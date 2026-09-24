// Confirmation for actions that genuinely cannot be undone.
//
// Reversible actions are executed directly — the brief is explicit that a
// confirmation habit trains people to click through the confirmations that
// matter. So confirmation is reserved for the few operations where there is no
// way back, and where it is therefore the only check that exists.
//
// THE TOKEN IS ISSUED BY THE BACKEND, NEVER BY THE MODEL. A tool that asked the
// model to "set confirmed: true once the user agrees" would be a permission the
// model grants itself, and a model that misreads a reply would grant it wrongly.
// Instead the first call executes nothing and returns a token; the destructive
// path runs only on a second call carrying a token this process issued, for
// this user, this tool and this exact target, within the window. The model can
// relay a token but cannot invent one.
//
// In memory on purpose: a token must not outlive the conversation that earned
// it, and a restart losing a pending confirmation is the safe direction to fail.

import { randomUUID } from "node:crypto";

const TTL_MS = 10 * 60 * 1000;
const pending = new Map();

function key(userId, toolName, targetId) {
  return `${userId}\u0000${toolName}\u0000${targetId ?? ""}`;
}

function sweep(now) {
  for (const [k, entry] of pending) if (entry.expiresAt <= now) pending.delete(k);
}

/**
 * Issue a token for a specific user + tool + target. Returns what the caller
 * should hand back to the user, verbatim.
 */
export function requireConfirmation({ user, toolName, targetId, targetLabel, why }) {
  const now = Date.now();
  sweep(now);
  const k = key(user.userId, toolName, targetId);
  // An outstanding token is REUSED rather than replaced. Minting a new one on
  // every ask means a single bad attempt — the model retrying with a token it
  // garbled or invented — silently invalidates the token the user is about to
  // confirm with, and their "yes" then fails for no reason they can see. The
  // expiry is not extended either, so repeating the question cannot keep the
  // window open indefinitely.
  const existing = pending.get(k);
  const token = existing && existing.expiresAt > now ? existing.token : randomUUID();
  pending.set(k, { token, expiresAt: existing && existing.expiresAt > now ? existing.expiresAt : now + TTL_MS });
  return {
    confirmationRequired: true,
    confirmationToken: token,
    executed: false,
    what: targetLabel ?? targetId ?? null,
    why,
    // Written for the model to relay. It has to be unmistakable that nothing
    // has happened yet, or it will report the action as done.
    message:
      `NOT DONE YET — this cannot be undone. ${why} Tell the user exactly what will be destroyed and ask them to confirm. ` +
      `If they confirm, call ${toolName} again with the same arguments plus confirmationToken. If they decline, do nothing and say so.`,
  };
}

/**
 * Spend a token. Single use: a confirmed action that the model retries must
 * ask again rather than firing twice off one agreement.
 */
export function consumeConfirmation({ user, toolName, targetId, token }) {
  const now = Date.now();
  sweep(now);
  const k = key(user.userId, toolName, targetId);
  const entry = pending.get(k);
  if (!entry || !token || entry.token !== token) return false;
  pending.delete(k);
  return true;
}

/** Test seam: the pending set is process state, so tests must be able to clear it. */
export function _resetConfirmations() {
  pending.clear();
}
