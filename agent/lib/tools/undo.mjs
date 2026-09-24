// Undo.
//
// "Undo the limitation you added earlier" has to work from the logs, without the
// user knowing an id. So `list_recent_actions` lets the agent find the action by
// description, and `undo_action` restores the recorded BEFORE state.
//
// Restoring a recorded state rather than computing an inverse is the whole
// reason actions store complete states: an inverse has to be derived, and a
// derivation can be wrong in ways nobody notices until the wall is wrong.
//
// An undo is itself a new action. The original row is marked undone but never
// edited or deleted — "what did the agent do" and "what did we do about it" are
// both permanent.

import { defineTool, S } from "./framework.mjs";
import { wallGet } from "./http.mjs";
import { InvalidInput, NotFound, ServiceUnavailable } from "./errors.mjs";
import { getAction, listUndoable, markUndone, recordAction } from "../actions.mjs";

defineTool({
  name: "list_recent_actions",
  description:
    "List changes you have made for this user recently, newest first, with what each one touched. Use this to find an action when the user says something like 'undo the limitation you added earlier' — match on the description, then call undo_action with its id.",
  permission: "user",
  sourceTier: "internal",
  sourceLabel: (input, result) => `Internal · ${result.count ?? 0} recent action(s)`,
  input: {
    type: "object",
    additionalProperties: false,
    properties: {
      thisConversationOnly: { type: "boolean", default: false },
      limit: S.limit(20, 10),
    },
  },
  output: {
    type: "object",
    required: ["count", "actions"],
    properties: {
      count: { type: "integer" },
      actions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            actionId: { type: "string" },
            what: { type: "string" },
            target: { type: ["string", "null"] },
            targetKind: { type: "string" },
            at: { type: "string" },
          },
        },
      },
    },
  },
  async handler({ thisConversationOnly, limit }, { user, conversationId }) {
    const rows = await listUndoable({
      user,
      conversationId: thisConversationOnly ? conversationId : null,
      limit,
    });
    return {
      count: rows.length,
      actions: rows.map((r) => ({
        actionId: r.id,
        what: describe(r),
        target: r.target_label ?? r.target_id ?? null,
        targetKind: r.target_kind,
        at: r.created_at,
      })),
    };
  },
});

function describe(row) {
  const label = row.target_label ?? row.target_id ?? row.target_kind;
  switch (row.tool_name) {
    case "create_limitation": return `Added limitation "${label}"`;
    case "update_limitation": return `Changed limitation "${label}"`;
    case "create_important": return `Added IMPORTANT entry "${label}"`;
    case "create_report": return `Raised report "${label}"`;
    case "update_display_settings": return `Changed ${label}`;
    case "set_operator_active": return `${row.after_state?.isActive === false ? "Disabled" : "Enabled"} operator ${label}`;
    case "set_aircraft_visible": return `${row.after_state ? "Changed visibility of" : "Changed"} aircraft ${label}`;
    default: return `${row.tool_name} on ${label}`;
  }
}

defineTool({
  name: "undo_action",
  description:
    "Reverse a change you made earlier, restoring what was there before. Use list_recent_actions first to find the id. Only the person who made the change can undo it, and only changes that are still reversible.",
  permission: "user",
  sourceTier: "internal",
  sourceLabel: (input) => `Internal · undo ${input.actionId?.slice(0, 8)}`,
  timeoutMs: 40_000,
  input: {
    type: "object",
    required: ["actionId"],
    additionalProperties: false,
    properties: { actionId: { type: "string", minLength: 8, maxLength: 64 } },
  },
  output: {
    type: "object",
    required: ["undone"],
    properties: {
      undone: { type: "boolean" },
      undoActionId: { type: ["string", "null"] },
      what: { type: ["string", "null"] },
      error: { type: ["string", "null"] },
    },
  },
  async handler({ actionId }, { user, conversationId }) {
    // Ownership is in the query, so one dispatcher cannot undo another's work
    // even with a valid id.
    const action = await getAction(actionId, user);
    if (!action) throw NotFound("No action of yours with that id. Use list_recent_actions to find it.");
    if (action.undone_at) throw InvalidInput(`That change was already undone at ${action.undone_at}.`);
    if (action.reversible === false) throw InvalidInput(`That change cannot be undone: ${action.irreversible_reason ?? "it is not reversible"}.`);
    if (action.kind === "undo") throw InvalidInput("That is itself an undo. Undoing an undo is not supported — make the change again instead.");

    const what = describe(action);
    try {
      await restore(action, user);
    } catch (error) {
      // A failed undo is recorded too: "we tried to put it back and could not"
      // is exactly the thing someone needs to find later.
      await recordAction({
        user, conversationId, toolName: "undo_action", args: { actionId },
        targetKind: action.target_kind, targetId: action.target_id, targetLabel: action.target_label,
        beforeState: action.after_state, afterState: null,
        kind: "undo", undoesActionId: actionId,
        success: false, error: String(error?.message ?? error),
      });
      throw error instanceof Error && error.code ? error : ServiceUnavailable(`The change could not be reversed: ${error.message}`);
    }

    const undoActionId = await recordAction({
      user, conversationId, toolName: "undo_action", args: { actionId },
      targetKind: action.target_kind, targetId: action.target_id, targetLabel: action.target_label,
      // The undo's own before/after are the original's after/before.
      beforeState: action.after_state, afterState: action.before_state,
      kind: "undo", undoesActionId: actionId,
    });
    await markUndone(actionId, undoActionId);

    return { undone: true, undoActionId, what, error: null };
  },
});

/** Put the recorded before-state back. */
async function restore(action, user) {
  const { target_kind: kind, target_id: id, before_state: before, after_state: after } = action;

  // A deletion is undone by restoring the soft-deleted record, never by
  // creating a new one from the snapshot: restore brings back the SAME id, so
  // anything still pointing at that record points at the right thing. A
  // re-creation would look identical on the wall and be a different record.
  if (before !== null && after === null) {
    if (kind === "limitation") {
      return void (await wallGet(`/api/timeline/limitations/${encodeURIComponent(id)}/restore`, user, {
        method: "POST", body: {}, timeoutMs: 25_000,
      }));
    }
    throw InvalidInput(`No restore is implemented for a deleted ${kind}.`);
  }

  // A creation is undone by removing the record.
  if (before === null) {
    if (kind === "limitation") return void (await wallGet(`/api/timeline/limitations/${encodeURIComponent(id)}`, user, { method: "DELETE", timeoutMs: 25_000 }));
    if (kind === "important") return void (await wallGet(`/api/important/${encodeURIComponent(id)}`, user, { method: "DELETE", timeoutMs: 25_000 }));
    if (kind === "report") return void (await wallGet(`/api/reports/${encodeURIComponent(id)}`, user, { method: "DELETE", timeoutMs: 25_000 }));
    throw InvalidInput(`Cannot undo the creation of a ${kind}.`);
  }

  // Otherwise put the previous state back, whole.
  if (kind === "limitation") {
    return void (await wallGet(`/api/timeline/limitations/${encodeURIComponent(id)}`, user, {
      method: "PATCH",
      body: { title: before.title, description: before.description, startDate: before.startDate, endDate: before.endDate, isActive: before.isActive, match: before.match },
      timeoutMs: 25_000,
    }));
  }
  if (kind === "important") {
    return void (await wallGet(`/api/important/${encodeURIComponent(id)}`, user, {
      method: "PATCH",
      body: { title: before.title, body: before.body, startDate: before.startDate, endDate: before.endDate, isActive: before.isActive },
      timeoutMs: 25_000,
    }));
  }
  if (kind === "display_settings") {
    return void (await wallGet("/api/display/settings", user, { method: "PUT", body: before, timeoutMs: 25_000 }));
  }
  if (kind === "operator") {
    return void (await wallGet(`/api/operators/${encodeURIComponent(before.id ?? id)}`, user, { method: "PATCH", body: { isActive: before.isActive }, timeoutMs: 25_000 }));
  }
  if (kind === "aircraft") {
    const hidden = (before.hidden ?? before.hiddenKeys ?? []).map((k) => String(k).toUpperCase());
    return void (await wallGet("/api/aircraft/visibility", user, {
      method: "PUT",
      body: { registration: id, isHidden: hidden.includes(String(id).toUpperCase()) },
      timeoutMs: 25_000,
    }));
  }
  throw InvalidInput(`No undo is implemented for ${kind}.`);
}
