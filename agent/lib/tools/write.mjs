// Reversible write tools.
//
// SCOPE IS DELIBERATELY NARROW: display settings, limitations, IMPORTANT
// entries, reports, and enable/disable toggles. Everything here can be put back
// exactly as it was. Anything that cannot — deleting a record outright, sending
// something to a crew, acknowledging a safety check — is Part 8's problem, and
// is not reachable from these tools at all.
//
// NO CONFIRMATION SCREENS. The brief is explicit: an authorized reversible
// action with a clear instruction is executed. The safety is not a dialog, it
// is that the backend re-checks permission on every call, the wall shows the
// record as AI-authored, and the action can be undone.
//
// THE AGENT ACTS AS THE USER: every write goes through the wall's own HTTP API
// carrying the caller's session, so the agent cannot write anything its caller
// could not write themselves in the console.

import { defineTool, S } from "./framework.mjs";
import { wallGet } from "./http.mjs";
import { InvalidInput, NotFound } from "./errors.mjs";
import { markAiAuthored, recordAction } from "../actions.mjs";

const AI_NOTE = "Records the agent creates or edits are marked as AI-authored, so staff can see at a glance that a person did not write them.";

// Does the record actually appear on the wall?
//
// The wall's view is narrower than the console's: active AND inside its date
// window. A limitation dated outside that window is accepted, is listed on the
// Limitations page, and never appears on the wall — which reads to a dispatcher
// exactly like the write having failed. So ask the wall's own view rather than
// re-deriving its window rule here, where it would drift out of step.
//
// null means the check itself did not answer; the caller must not turn that
// into a claim either way.
async function showsOnWall(id, user) {
  const view = await wallGet("/api/timeline/limitations?includeInactive=false", user, { timeoutMs: 15_000 })
    .catch(() => null);
  if (!Array.isArray(view?.limitations)) return null;
  return view.limitations.some((row) => row?.id === id);
}

const WALL_VISIBILITY_NOTE =
  "false means the record was saved and is on the Limitations page, but does NOT appear on the wall — normally because its dates are outside the wall's window. Say so plainly and offer to correct the dates; do not report the change as done and visible.";

// ── Limitations ────────────────────────────────────────────────────────────

defineTool({
  name: "create_limitation",
  description:
    "Add an operational limitation to the ops wall — a standing restriction on flights, airports or countries. Executes directly when the user's instruction is clear. " + AI_NOTE + " It can be undone later.",
  permission: "user",
  sourceTier: "internal",
  sourceLabel: (input) => `Internal · limitation created · ${String(input.title).slice(0, 40)}`,
  timeoutMs: 30_000,
  input: {
    type: "object",
    required: ["title"],
    additionalProperties: false,
    properties: {
      title: { type: "string", minLength: 3, maxLength: 200 },
      description: { type: "string", maxLength: 4000 },
      airportIcaos: { type: "array", items: S.icao, maxItems: 40 },
      countries: { type: "array", items: { type: "string", maxLength: 60 }, maxItems: 20 },
      startDate: S.isoDate,
      endDate: S.isoDate,
      isPermanent: { type: "boolean", default: false },
    },
  },
  output: {
    type: "object",
    required: ["created", "actionId"],
    properties: {
      created: { type: "boolean" },
      actionId: { type: ["string", "null"], description: "Give this to the user so they can ask you to undo it." },
      id: { type: ["string", "null"] },
      title: { type: ["string", "null"] },
      aiAuthored: { type: "boolean" },
      visibleOnWall: { type: ["boolean", "null"], description: WALL_VISIBILITY_NOTE },
    },
  },
  async handler(input, { user, conversationId }) {
    const payload = markAiAuthored({
      title: input.title,
      description: input.description ?? "",
      isPermanent: input.isPermanent === true,
      startDate: input.startDate ?? null,
      endDate: input.endDate ?? null,
      match: {
        airportIcaos: (input.airportIcaos ?? []).map((a) => String(a).toUpperCase()),
        countries: input.countries ?? [],
        flights: [],
      },
    }, user);

    const result = await wallGet("/api/timeline/limitations", user, { method: "POST", body: payload, timeoutMs: 25_000 });
    const created = result?.limitation;
    if (!created?.id) throw NotFound("The wall did not return the created limitation.");

    const actionId = await recordAction({
      user, conversationId, toolName: "create_limitation", args: input,
      targetKind: "limitation", targetId: created.id, targetLabel: created.title,
      // A creation has no before state; the undo is a delete.
      beforeState: null, afterState: created,
    });
    return {
      created: true, actionId, id: created.id, title: created.title, aiAuthored: true,
      visibleOnWall: await showsOnWall(created.id, user),
    };
  },
});

defineTool({
  name: "update_limitation",
  description:
    "Change an existing limitation on the ops wall — its text, dates, scope, or whether it is active. Executes directly. " + AI_NOTE + " It can be undone later.",
  permission: "user",
  sourceTier: "internal",
  sourceLabel: (input) => `Internal · limitation updated · ${input.id}`,
  timeoutMs: 30_000,
  input: {
    type: "object",
    required: ["id"],
    additionalProperties: false,
    properties: {
      id: { type: "string", minLength: 1, maxLength: 64 },
      title: { type: "string", minLength: 3, maxLength: 200 },
      description: { type: "string", maxLength: 4000 },
      airportIcaos: { type: "array", items: S.icao, maxItems: 40 },
      countries: { type: "array", items: { type: "string", maxLength: 60 }, maxItems: 20 },
      startDate: S.isoDate,
      endDate: S.isoDate,
      isActive: { type: "boolean" },
    },
  },
  output: {
    type: "object",
    required: ["updated", "actionId"],
    properties: {
      updated: { type: "boolean" }, actionId: { type: ["string", "null"] }, id: { type: "string" }, aiAuthored: { type: "boolean" },
      visibleOnWall: { type: ["boolean", "null"], description: WALL_VISIBILITY_NOTE },
    },
  },
  async handler(input, { user, conversationId }) {
    // Read the complete BEFORE state first. Without it there is nothing to
    // restore, so the read failing must stop the write.
    const existing = await wallGet(`/api/timeline/limitations/${encodeURIComponent(input.id)}`, user, { timeoutMs: 20_000 })
      .catch(() => null);
    const before = existing?.limitation;
    if (!before) throw NotFound(`No limitation ${input.id} on the wall.`);

    const patch = { ...(input.title !== undefined ? { title: input.title } : {}) };
    if (input.description !== undefined) patch.description = input.description;
    if (input.startDate !== undefined) patch.startDate = input.startDate;
    if (input.endDate !== undefined) patch.endDate = input.endDate;
    if (input.isActive !== undefined) patch.isActive = input.isActive;
    if (input.airportIcaos !== undefined) patch.airportIcaos = input.airportIcaos.map((a) => String(a).toUpperCase());
    if (input.countries !== undefined) patch.countries = input.countries;
    if (Object.keys(patch).length === 0) throw InvalidInput("Nothing to change — give at least one field.");

    // markAiAuthored sets updatedBy AND aiAuthored; the wall merges the patch
    // over the existing record, so both survive an edit.
    const result = await wallGet(`/api/timeline/limitations/${encodeURIComponent(input.id)}`, user, {
      method: "PATCH", body: markAiAuthored(patch, user, { field: "updatedBy" }), timeoutMs: 25_000,
    });
    const after = result?.limitation ?? null;

    const actionId = await recordAction({
      user, conversationId, toolName: "update_limitation", args: input,
      targetKind: "limitation", targetId: input.id, targetLabel: before.title,
      beforeState: before, afterState: after,
    });
    return { updated: true, actionId, id: input.id, aiAuthored: true, visibleOnWall: await showsOnWall(input.id, user) };
  },
});

// ── IMPORTANT entries ──────────────────────────────────────────────────────

defineTool({
  name: "create_important",
  description:
    "Add an IMPORTANT bulletin to the ops wall — a standing operational note dispatchers must see, such as a seasonal restriction or a permit rule. Executes directly. " + AI_NOTE + " It can be undone later.",
  permission: "user",
  sourceTier: "internal",
  sourceLabel: (input) => `Internal · IMPORTANT created · ${String(input.title).slice(0, 40)}`,
  timeoutMs: 30_000,
  input: {
    type: "object",
    required: ["title"],
    additionalProperties: false,
    properties: {
      title: { type: "string", minLength: 3, maxLength: 200 },
      body: { type: "string", maxLength: 6000 },
      airportIcaos: { type: "array", items: S.icao, maxItems: 40 },
      countries: { type: "array", items: { type: "string", maxLength: 60 }, maxItems: 20 },
      startDate: S.isoDate,
      endDate: S.isoDate,
    },
  },
  output: {
    type: "object",
    required: ["created", "actionId"],
    properties: { created: { type: "boolean" }, actionId: { type: ["string", "null"] }, id: { type: ["string", "null"] }, aiAuthored: { type: "boolean" } },
  },
  async handler(input, { user, conversationId }) {
    const payload = markAiAuthored({
      title: input.title,
      body: input.body ?? "",
      startDate: input.startDate ?? null,
      endDate: input.endDate ?? null,
      airportIcaos: (input.airportIcaos ?? []).map((a) => String(a).toUpperCase()),
      countries: input.countries ?? [],
    }, user);

    const result = await wallGet("/api/important", user, { method: "POST", body: payload, timeoutMs: 25_000 });
    const created = result?.entry;
    if (!created?.id) throw NotFound("The wall did not return the created entry.");

    const actionId = await recordAction({
      user, conversationId, toolName: "create_important", args: input,
      targetKind: "important", targetId: created.id, targetLabel: created.title,
      beforeState: null, afterState: created,
    });
    return { created: true, actionId, id: created.id, aiAuthored: true };
  },
});

// ── Reports ────────────────────────────────────────────────────────────────

defineTool({
  name: "create_report",
  description:
    "Raise a console report — an issue or observation logged for the ops team. Executes directly. " + AI_NOTE,
  permission: "user",
  sourceTier: "internal",
  sourceLabel: (input) => `Internal · report created · ${String(input.title).slice(0, 40)}`,
  timeoutMs: 30_000,
  input: {
    type: "object",
    required: ["title"],
    additionalProperties: false,
    properties: {
      title: { type: "string", minLength: 3, maxLength: 200 },
      body: { type: "string", maxLength: 6000 },
      category: { type: "string", maxLength: 40 },
    },
  },
  output: {
    type: "object",
    required: ["created", "actionId"],
    properties: { created: { type: "boolean" }, actionId: { type: ["string", "null"] }, id: { type: ["string", "null"] }, aiAuthored: { type: "boolean" } },
  },
  async handler(input, { user, conversationId }) {
    const result = await wallGet("/api/reports", user, {
      method: "POST",
      body: markAiAuthored({ title: input.title, body: input.body ?? "", category: input.category ?? "Other" }, user, { field: "createdBy" }),
      timeoutMs: 25_000,
    });
    const created = result?.report;
    if (!created?.id) throw NotFound("The wall did not return the created report.");

    const actionId = await recordAction({
      user, conversationId, toolName: "create_report", args: input,
      targetKind: "report", targetId: created.id, targetLabel: created.title,
      beforeState: null, afterState: created,
    });
    return { created: true, actionId, id: created.id, aiAuthored: true };
  },
});

// ── Display settings ───────────────────────────────────────────────────────

defineTool({
  name: "update_display_settings",
  description:
    "Change how the ops wall display looks — row height, spacing, hour spacing, scale, colours or timing windows. Executes directly and can be undone. Ask which setting if the user is vague; do not guess at a number.",
  permission: "user",
  sourceTier: "internal",
  sourceLabel: (input) => `Internal · display settings · ${Object.keys(input.settings ?? {}).join(", ")}`,
  timeoutMs: 30_000,
  input: {
    type: "object",
    required: ["settings"],
    additionalProperties: false,
    properties: {
      settings: { type: "object", description: "The setting keys to change and their new values, as the console names them." },
    },
  },
  output: {
    type: "object",
    required: ["updated", "actionId"],
    properties: { updated: { type: "boolean" }, actionId: { type: ["string", "null"] }, changed: { type: "array", items: { type: "string" } } },
  },
  async handler({ settings }, { user, conversationId }) {
    const keys = Object.keys(settings ?? {});
    if (keys.length === 0) throw InvalidInput("Give at least one setting to change.");

    // Whole-object before/after: display settings are one document, and a
    // partial record would make an undo guess at what the rest used to be.
    const before = await wallGet("/api/display/settings", user, { timeoutMs: 20_000 });
    const result = await wallGet("/api/display/settings", user, { method: "PUT", body: settings, timeoutMs: 25_000 });

    const actionId = await recordAction({
      user, conversationId, toolName: "update_display_settings", args: { settings },
      targetKind: "display_settings", targetId: "global", targetLabel: `display settings (${keys.join(", ")})`,
      beforeState: before?.settings ?? before ?? null,
      afterState: result?.settings ?? result ?? null,
    });
    return { updated: true, actionId, changed: keys };
  },
});

// ── Enable / disable toggles ───────────────────────────────────────────────

defineTool({
  name: "set_operator_active",
  description:
    "Enable or disable an operator on the ops wall. Disabling stops its flights appearing. Executes directly and can be undone.",
  permission: "admin",
  sourceTier: "internal",
  sourceLabel: (input) => `Internal · operator ${input.isActive ? "enabled" : "disabled"} · ${input.operatorId}`,
  timeoutMs: 30_000,
  input: {
    type: "object",
    required: ["operatorId", "isActive"],
    additionalProperties: false,
    properties: { operatorId: { type: "string", minLength: 1, maxLength: 64 }, isActive: { type: "boolean" } },
  },
  output: {
    type: "object",
    required: ["updated", "actionId"],
    properties: { updated: { type: "boolean" }, actionId: { type: ["string", "null"] }, operatorId: { type: "string" }, isActive: { type: "boolean" } },
  },
  async handler({ operatorId, isActive }, { user, conversationId }) {
    const found = await wallGet(`/api/operators/${encodeURIComponent(operatorId)}`, user, { timeoutMs: 20_000 }).catch(() => null);
    const before = found?.operator;
    if (!before) throw NotFound(`No operator ${operatorId}.`);

    const result = await wallGet(`/api/operators/${encodeURIComponent(before.id ?? operatorId)}`, user, {
      method: "PATCH", body: { isActive }, timeoutMs: 25_000,
    });

    const actionId = await recordAction({
      user, conversationId, toolName: "set_operator_active", args: { operatorId, isActive },
      targetKind: "operator", targetId: String(before.id ?? operatorId), targetLabel: before.name ?? operatorId,
      beforeState: before, afterState: result?.operator ?? null,
    });
    return { updated: true, actionId, operatorId, isActive };
  },
});

defineTool({
  name: "set_aircraft_visible",
  description:
    "Show or hide an aircraft on the ops wall display by registration. Executes directly and can be undone.",
  permission: "user",
  sourceTier: "internal",
  sourceLabel: (input) => `Internal · aircraft ${input.visible ? "shown" : "hidden"} · ${input.registration}`,
  timeoutMs: 30_000,
  input: {
    type: "object",
    required: ["registration", "visible"],
    additionalProperties: false,
    properties: {
      registration: { type: "string", minLength: 2, maxLength: 16 },
      operatorId: { type: "string", maxLength: 64 },
      visible: { type: "boolean" },
    },
  },
  output: {
    type: "object",
    required: ["updated", "actionId"],
    properties: { updated: { type: "boolean" }, actionId: { type: ["string", "null"] }, registration: { type: "string" }, visible: { type: "boolean" } },
  },
  async handler({ registration, operatorId, visible }, { user, conversationId }) {
    const reg = String(registration).toUpperCase();
    const before = await wallGet("/api/aircraft/visibility", user, { timeoutMs: 20_000 });
    const result = await wallGet("/api/aircraft/visibility", user, {
      method: "PUT",
      body: { registration: reg, oprId: operatorId ?? null, isHidden: visible === false },
      timeoutMs: 25_000,
    });

    const actionId = await recordAction({
      user, conversationId, toolName: "set_aircraft_visible", args: { registration: reg, operatorId, visible },
      targetKind: "aircraft", targetId: reg, targetLabel: reg,
      beforeState: before ?? null, afterState: result ?? null,
    });
    return { updated: true, actionId, registration: reg, visible };
  },
});
