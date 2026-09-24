// Destructive write tools (Part 8).
//
// The shape every one of these follows, in this order and no other:
//
//     authorized request → immutable before-state snapshot → execute → audit
//
// The snapshot is taken BEFORE the change and the read failing stops the write,
// because a deletion whose before-state was never captured is a deletion that
// cannot be undone, and finding that out afterwards is finding out too late.
//
// DELETION IS SOFT. The wall moves the record to a recycle bin rather than
// destroying it, so a restore puts back the record itself — same id, same
// fields — instead of a reconstruction from a snapshot. Permanent limitations
// are refused by the wall's store, so the rule holds for the console and the
// agent alike and cannot be bypassed by whoever adds the next caller.
//
// NO CONFIRMATION FOR REVERSIBLE WORK. A confirmation habit trains people to
// click through the confirmations that matter. The check for reversible work is
// that it is reversible, visibly attributed, and in the changelog. Only the
// genuinely irreversible path — purging the bin — asks first, and the token it
// asks with is issued by this backend, not by the model.

import { defineTool, S } from "./framework.mjs";
import { wallGet } from "./http.mjs";
import { InvalidInput, NotFound } from "./errors.mjs";
import { recordAction } from "../actions.mjs";
import { requireConfirmation, consumeConfirmation } from "../confirm.mjs";

const UNDO_NOTE =
  "The complete previous record is snapshotted first, so this can be undone with undo_action, or the record restored by id.";

/** Read the whole record first. No snapshot, no write. */
async function snapshotLimitation(id, user) {
  const existing = await wallGet(`/api/timeline/limitations/${encodeURIComponent(id)}`, user, { timeoutMs: 20_000 })
    .catch(() => null);
  const before = existing?.limitation;
  if (!before) {
    throw NotFound(
      `No limitation ${id} on the wall. Limitation ids look like LIM-XXXXXXXX — if you are holding an action id ` +
      `(a uuid from list_recent_actions), that is a different thing. Call list_limitations to find the record.`,
    );
  }
  return before;
}

defineTool({
  name: "delete_limitation",
  description:
    "Remove a limitation from the ops wall. The record is kept and can be restored — nothing is destroyed. Executes directly when the instruction is clear. " +
    UNDO_NOTE + " Permanent limitations cannot be deleted by anyone; deactivate those instead.",
  permission: "user",
  sourceTier: "internal",
  sourceLabel: (input) => `Internal · limitation deleted · ${input.id}`,
  timeoutMs: 30_000,
  // By voice this is read back before it runs. The readback names the record
  // rather than the id, because "LIM-MUFQ632C" spoken aloud confirms nothing.
  destructive: true,
  readback: async (input, { user }) => {
    const found = await wallGet(`/api/timeline/limitations/${encodeURIComponent(input.id)}`, user, { timeoutMs: 10_000 }).catch(() => null);
    return found?.limitation?.title ?? null;
  },
  input: {
    type: "object",
    required: ["id"],
    additionalProperties: false,
    properties: { id: { type: "string", minLength: 1, maxLength: 64 } },
  },
  output: {
    type: "object",
    required: ["deleted", "actionId"],
    properties: {
      deleted: { type: "boolean" },
      actionId: { type: ["string", "null"], description: "Give this to the user so they can ask you to undo it." },
      id: { type: "string" },
      title: { type: ["string", "null"] },
      undoable: { type: "boolean" },
      warning: { type: ["string", "null"] },
    },
  },
  async handler(input, { user, conversationId }) {
    const before = await snapshotLimitation(input.id, user);

    // The wall enforces this too; refusing here as well means the agent never
    // spends a call finding out, and the reason reaches the user as written.
    if (before.isPermanent) {
      throw InvalidInput(
        `"${before.title}" is a permanent limitation and cannot be deleted by anyone, including you. ` +
        "Offer to deactivate it with update_limitation instead, which is reversible.",
      );
    }

    await wallGet(`/api/timeline/limitations/${encodeURIComponent(input.id)}`, user, { method: "DELETE", timeoutMs: 25_000 });

    const actionId = await recordAction({
      user, conversationId, toolName: "delete_limitation", args: input,
      targetKind: "limitation", targetId: input.id, targetLabel: before.title,
      // Complete record in, nothing out. The undo is a restore.
      beforeState: before, afterState: null,
    });
    return {
      deleted: true, actionId, id: input.id, title: before.title,
      undoable: actionId !== null,
      warning: actionId === null
        ? "The deletion succeeded but could NOT be recorded, so I cannot undo it for you. The record is still in the wall's recycle bin — say so, and point the user at restore_limitation with this id."
        : null,
    };
  },
});

defineTool({
  name: "list_deleted_limitations",
  description:
    "List limitations that were deleted and can still be restored, newest first. Use this to find the id when someone asks to bring back a limitation that is no longer on the wall.",
  permission: "user",
  sourceTier: "internal",
  sourceLabel: (input, result) => `Internal · ${result.count ?? 0} restorable limitation(s)`,
  timeoutMs: 20_000,
  input: { type: "object", additionalProperties: false, properties: { limit: S.limit(20, 10) } },
  output: {
    type: "object",
    required: ["count", "limitations"],
    properties: {
      count: { type: "integer" },
      limitations: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            title: { type: ["string", "null"] },
            deletedAt: { type: ["string", "null"] },
            deletedBy: { type: ["string", "null"] },
          },
        },
      },
    },
  },
  async handler({ limit }, { user }) {
    const payload = await wallGet("/api/timeline/limitations?deleted=true", user, { timeoutMs: 15_000 });
    const rows = Array.isArray(payload?.limitations) ? payload.limitations : [];
    return {
      count: rows.length,
      limitations: rows.slice(0, limit ?? 20).map((row) => ({
        id: row.id,
        title: row.title ?? null,
        deletedAt: row.deletedAt ?? null,
        deletedBy: row.deletedBy ?? null,
      })),
    };
  },
});

defineTool({
  name: "restore_limitation",
  description:
    "Put a deleted limitation back on the wall, exactly as it was, with the same id. Use list_deleted_limitations to find the id. Anyone who may edit limitations may restore one.",
  permission: "user",
  sourceTier: "internal",
  sourceLabel: (input) => `Internal · limitation restored · ${input.id}`,
  timeoutMs: 30_000,
  input: {
    type: "object",
    required: ["id"],
    additionalProperties: false,
    properties: { id: { type: "string", minLength: 1, maxLength: 64 } },
  },
  output: {
    type: "object",
    required: ["restored", "actionId"],
    properties: {
      restored: { type: "boolean" },
      actionId: { type: ["string", "null"] },
      id: { type: "string" },
      title: { type: ["string", "null"] },
    },
  },
  async handler(input, { user, conversationId }) {
    const result = await wallGet(`/api/timeline/limitations/${encodeURIComponent(input.id)}/restore`, user, {
      method: "POST", body: {}, timeoutMs: 25_000,
    });
    const restored = result?.limitation;
    if (!restored?.id) throw NotFound(`Nothing deleted with id ${input.id} — it may have been restored already.`);

    // A restore is a change in its own right and is logged as one. It is NOT
    // recorded as an undo: undo_action owns that relationship, and a restore
    // asked for directly has no original action to point at.
    const actionId = await recordAction({
      user, conversationId, toolName: "restore_limitation", args: input,
      targetKind: "limitation", targetId: input.id, targetLabel: restored.title,
      beforeState: null, afterState: restored,
    });
    return { restored: true, actionId, id: input.id, title: restored.title ?? null };
  },
});

defineTool({
  name: "purge_deleted_limitation",
  description:
    "Permanently destroy a deleted limitation so it can no longer be restored. THIS CANNOT BE UNDONE. Only for records that must genuinely be gone. The first call never destroys anything — it returns a confirmation token to relay to the user.",
  permission: "admin",
  sourceTier: "internal",
  sourceLabel: (input) => `Internal · purge requested · ${input.id}`,
  timeoutMs: 30_000,
  destructive: true,
  readback: async (input, { user }) => {
    const bin = await wallGet("/api/timeline/limitations?deleted=true", user, { timeoutMs: 10_000 }).catch(() => null);
    return (bin?.limitations ?? []).find((r) => r?.id === input.id)?.title ?? null;
  },
  input: {
    type: "object",
    required: ["id"],
    additionalProperties: false,
    properties: {
      id: { type: "string", minLength: 1, maxLength: 64 },
      confirmationToken: {
        type: "string", maxLength: 64,
        description: "Only ever a token returned by a previous call to this tool. Never invent one.",
      },
    },
  },
  output: {
    type: "object",
    required: ["executed"],
    properties: {
      executed: { type: "boolean" },
      confirmationRequired: { type: "boolean" },
      confirmationToken: { type: ["string", "null"] },
      message: { type: ["string", "null"] },
      what: { type: ["string", "null"] },
      actionId: { type: ["string", "null"] },
    },
  },
  async handler(input, { user, conversationId }) {
    const payload = await wallGet("/api/timeline/limitations?deleted=true", user, { timeoutMs: 15_000 });
    const target = (payload?.limitations ?? []).find((row) => row?.id === input.id);
    if (!target) throw NotFound(`Nothing deleted with id ${input.id}. Only a deleted record can be purged.`);

    if (!consumeConfirmation({ user, toolName: "purge_deleted_limitation", targetId: input.id, token: input.confirmationToken })) {
      // Asking is itself worth a trail: it shows what was proposed even when
      // the user said no, and a refusal is not visible anywhere else.
      await recordAction({
        user, conversationId, toolName: "purge_deleted_limitation", args: { id: input.id },
        targetKind: "limitation", targetId: input.id, targetLabel: target.title,
        beforeState: target, afterState: null,
        kind: "write", reversible: false,
        irreversibleReason: "A purge destroys the record outright; there is nothing left to restore.",
        success: false, error: "awaiting_confirmation",
        confirmationStatus: "pending",
      });
      return requireConfirmation({
        user, toolName: "purge_deleted_limitation", targetId: input.id, targetLabel: target.title,
        why: `"${target.title}" would be destroyed outright and could not be restored by you, by me, or by an administrator.`,
      });
    }

    await wallGet(`/api/timeline/limitations/${encodeURIComponent(input.id)}/purge`, user, { method: "DELETE", timeoutMs: 25_000 });

    const actionId = await recordAction({
      user, conversationId, toolName: "purge_deleted_limitation", args: { id: input.id },
      targetKind: "limitation", targetId: input.id, targetLabel: target.title,
      // The snapshot outlives the record: the audit row is the only remaining
      // evidence of what was destroyed, which is the point of keeping it.
      beforeState: target, afterState: null,
      reversible: false,
      irreversibleReason: "Purged from the recycle bin — the record no longer exists anywhere.",
      confirmationStatus: "confirmed",
    });
    return {
      executed: true, confirmationRequired: false, confirmationToken: null, actionId,
      what: target.title ?? input.id,
      message: `Purged "${target.title}". This cannot be undone.`,
    };
  },
});
