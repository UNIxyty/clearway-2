// Operators and aircraft.
//
// Operator records carry Leon refresh tokens. The wall's API already strips
// them from its responses, and this layer additionally allow-lists the fields
// it returns rather than spreading the upstream object — so a future upstream
// change cannot leak a credential into a model's context by accident.

import { defineTool, S } from "./framework.mjs";
import { wallGet } from "./http.mjs";

defineTool({
  name: "list_operators",
  description:
    "Aircraft operators configured on the ops wall, with their Leon tenant id, whether they are active, and the health of their last schedule sync. Use when asked which operators exist, or why one operator's flights are missing.",
  permission: "user",
  input: {
    type: "object",
    additionalProperties: false,
    properties: { includeInactive: { type: "boolean", default: true }, limit: S.limit(200, 100) },
  },
  output: {
    type: "object",
    required: ["count", "operators"],
    properties: {
      count: { type: "integer" },
      truncated: { type: "boolean" },
      operators: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: ["string", "number", "null"] },
            name: { type: ["string", "null"] },
            operatorId: { type: ["string", "null"], description: "Leon tenant id (oprId)." },
            isActive: { type: "boolean" },
            lastSyncAt: { type: ["string", "null"] },
            lastSyncStatus: { type: ["string", "null"] },
            lastSyncError: { type: ["string", "null"] },
          },
        },
      },
    },
  },
  async handler({ includeInactive, limit }, { user }) {
    const data = await wallGet(`/api/operators?includeInactive=${includeInactive ? "true" : "false"}`, user, { timeoutMs: 20_000 });
    const rows = Array.isArray(data?.operators) ? data.operators : [];
    return {
      count: rows.length,
      truncated: rows.length > limit,
      // Explicit field list — never a spread. Credentials must not be able to
      // reach the model even if the upstream shape changes.
      operators: rows.slice(0, limit).map((o) => ({
        id: o.id ?? null,
        name: o.name ?? null,
        operatorId: o.oprId ?? null,
        isActive: o.isActive !== false,
        lastSyncAt: o.lastSyncAt ?? null,
        lastSyncStatus: o.lastSyncStatus ?? null,
        lastSyncError: o.lastSyncError ?? null,
      })),
    };
  },
});

defineTool({
  name: "list_aircraft",
  description:
    "Aircraft known to the ops wall, with registration, type, operator and whether they are hidden from the wall display. Use when asked what is in the fleet, or whether a specific registration is shown on the wall.",
  permission: "user",
  input: {
    type: "object",
    additionalProperties: false,
    properties: {
      registration: { type: "string", maxLength: 16, description: "Filter to one registration (exact, case-insensitive)." },
      operatorId: { type: "string", maxLength: 40 },
      includeHidden: { type: "boolean", default: true },
      limit: S.limit(300, 150),
    },
  },
  output: {
    type: "object",
    required: ["count", "aircraft"],
    properties: {
      count: { type: "integer" },
      truncated: { type: "boolean" },
      aircraft: {
        type: "array",
        items: {
          type: "object",
          properties: {
            registration: { type: ["string", "null"] },
            type: { type: ["string", "null"] },
            operatorId: { type: ["string", "null"] },
            hidden: { type: "boolean" },
            flightCount: { type: ["integer", "null"] },
          },
        },
      },
    },
  },
  async handler({ registration, operatorId, includeHidden, limit }, { user }) {
    const [schedule, visibility] = await Promise.all([
      wallGet("/api/aircraft/schedule", user, { timeoutMs: 20_000 }).catch(() => null),
      wallGet("/api/aircraft/visibility", user, { timeoutMs: 15_000 }).catch(() => null),
    ]);
    const hiddenKeys = new Set(
      (Array.isArray(visibility?.hidden) ? visibility.hidden : visibility?.hiddenKeys ?? []).map((k) => String(k).toUpperCase())
    );
    let rows = Array.isArray(schedule?.aircraft) ? schedule.aircraft : [];

    const reg = registration ? registration.toUpperCase() : null;
    rows = rows
      .map((a) => {
        const regUpper = String(a.registration ?? "").toUpperCase();
        return {
          registration: a.registration ?? null,
          type: a.type ?? a.aircraftType ?? null,
          operatorId: a.oprId ?? null,
          hidden: hiddenKeys.has(regUpper) || hiddenKeys.has(`${a.oprId}:${regUpper}`) || a.isHidden === true,
          flightCount: Array.isArray(a.flights) ? a.flights.length : null,
        };
      })
      .filter((a) => (reg ? String(a.registration ?? "").toUpperCase() === reg : true))
      .filter((a) => (operatorId ? a.operatorId === operatorId : true))
      .filter((a) => (includeHidden ? true : !a.hidden));

    return { count: rows.length, truncated: rows.length > limit, aircraft: rows.slice(0, limit) };
  },
});
