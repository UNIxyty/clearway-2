// Monitoring tools: webhook health, console reports, platform service status.
//
// Permission note. Webhook state and console reports are console-operator
// surfaces, not things an ordinary signed-in user manages, so these require
// admin. get_service_status is `user` — the service-status board is already
// visible to every signed-in user in the portal, and the standing rule is that
// the agent may do what the caller could do themselves.

import { defineTool, S } from "./framework.mjs";
import { portalGet, wallGet } from "./http.mjs";
import { NotFound } from "./errors.mjs";

defineTool({
  name: "get_webhook_states",
  description:
    "Registration state of the Leon webhooks per operator: which events are subscribed, whether registration succeeded, and the last failure if any. Use when flights are not updating and you need to know whether the live feed is wired up.",
  permission: "admin",
  sourceTier: "internal",
  sourceLabel: () => "Internal · Leon webhooks",
  input: { type: "object", additionalProperties: false, properties: { operatorId: { type: "string", maxLength: 40 } } },
  output: {
    type: "object",
    required: ["count", "operators"],
    properties: {
      count: { type: "integer" },
      operators: {
        type: "array",
        items: {
          type: "object",
          properties: {
            operatorId: { type: "string" },
            enabled: { type: "boolean" },
            events: { type: "array", items: { type: "string" } },
            registeredAt: { type: ["string", "null"] },
            lastError: { type: ["string", "null"] },
            lastErrorAt: { type: ["string", "null"] },
          },
        },
      },
    },
  },
  async handler({ operatorId }, { user }) {
    const data = await wallGet("/api/webhooks", user, { timeoutMs: 20_000 });
    const raw = data?.webhooks ?? data?.operators ?? data?.tenants ?? {};
    let rows = Array.isArray(raw)
      ? raw
      : Object.entries(raw).map(([key, value]) => ({ operatorId: key, ...(value ?? {}) }));
    if (operatorId) {
      rows = rows.filter((r) => String(r.operatorId ?? "").toLowerCase() === operatorId.toLowerCase());
      if (rows.length === 0) throw NotFound(`No webhook state for operator ${operatorId}.`);
    }
    return {
      count: rows.length,
      operators: rows.map((r) => ({
        operatorId: String(r.operatorId ?? ""),
        enabled: r.enabled !== false,
        events: Array.isArray(r.events) ? r.events.map(String) : Object.keys(r.events ?? {}),
        registeredAt: r.registeredAt ?? r.updatedAt ?? null,
        lastError: r.lastError ?? null,
        lastErrorAt: r.lastErrorAt ?? null,
      })),
    };
  },
});

defineTool({
  name: "get_webhook_history",
  description:
    "Recent Leon webhook deliveries for one operator and event type, newest first, including failures and their reasons. Use to investigate why a specific flight did not update.",
  permission: "admin",
  sourceTier: "internal",
  sourceLabel: (input) => `Internal · webhook log · ${input.operator}`,
  input: {
    type: "object",
    required: ["operator"],
    additionalProperties: false,
    properties: {
      operator: { type: "string", minLength: 1, maxLength: 40, description: "Operator (Leon tenant) id." },
      event: { type: "string", maxLength: 60, description: "Event type; omit for all events." },
      limit: S.limit(100, 30),
    },
  },
  output: {
    type: "object",
    required: ["operator", "count", "entries"],
    properties: {
      operator: { type: "string" },
      event: { type: ["string", "null"] },
      count: { type: "integer" },
      truncated: { type: "boolean" },
      entries: {
        type: "array",
        items: {
          type: "object",
          properties: {
            at: { type: ["string", "null"] },
            event: { type: ["string", "null"] },
            ok: { type: ["boolean", "null"] },
            flightNids: { type: "array", items: { type: ["string", "number"] } },
            error: { type: ["string", "null"] },
          },
        },
      },
    },
  },
  async handler({ operator, event, limit }, { user }) {
    const data = await wallGet("/api/webhooks/log", user, { timeoutMs: 20_000 });
    const raw = Array.isArray(data?.log) ? data.log : Array.isArray(data?.entries) ? data.entries : [];
    // The wall's tenant keys are case-sensitive (a known fragility), so match
    // case-insensitively here rather than silently returning nothing.
    const wanted = operator.toLowerCase();
    let rows = raw.filter((e) => String(e.oprId ?? e.operatorId ?? e.tenant ?? "").toLowerCase() === wanted);
    if (event) rows = rows.filter((e) => String(e.event ?? e.type ?? "").toLowerCase() === event.toLowerCase());
    return {
      operator,
      event: event ?? null,
      count: rows.length,
      truncated: rows.length > limit,
      entries: rows.slice(0, limit).map((e) => ({
        at: e.at ?? e.receivedAt ?? null,
        event: e.event ?? e.type ?? null,
        ok: typeof e.ok === "boolean" ? e.ok : e.error ? false : null,
        flightNids: Array.isArray(e.flightNids) ? e.flightNids : [],
        error: e.error ?? null,
      })),
    };
  },
});

defineTool({
  name: "list_reports",
  description:
    "Console reports raised by operators — issues logged from the ops console, with status and category. Use when asked what has been reported or what is outstanding.",
  permission: "admin",
  sourceTier: "internal",
  sourceLabel: () => "Internal · console reports",
  maxResultBytes: 256 * 1024,
  input: {
    type: "object",
    additionalProperties: false,
    properties: {
      status: { type: "string", enum: ["untouched", "under_process", "done", "impossible"] },
      category: { type: "string", maxLength: 40 },
      query: { type: "string", maxLength: 120 },
      limit: S.limit(200, 50),
    },
  },
  output: {
    type: "object",
    required: ["count", "reports"],
    properties: {
      count: { type: "integer" },
      truncated: { type: "boolean" },
      categories: { type: "array", items: { type: "string" } },
      reports: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            title: { type: "string", description: "Exactly as written by the reporter." },
            body: { type: ["string", "null"], description: "Exactly as written by the reporter." },
            category: { type: ["string", "null"] },
            status: { type: ["string", "null"] },
            createdAt: { type: ["string", "null"] },
            createdBy: { type: ["string", "null"] },
            updatedAt: { type: ["string", "null"] },
          },
        },
      },
    },
  },
  async handler({ status, category, query, limit }, { user }) {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (category) params.set("category", category);
    if (query) params.set("q", query);
    const data = await wallGet(`/api/reports${params.toString() ? `?${params}` : ""}`, user, { timeoutMs: 20_000 });
    const rows = Array.isArray(data?.reports) ? data.reports : [];
    return {
      count: rows.length,
      truncated: rows.length > limit,
      categories: Array.isArray(data?.categories) ? data.categories.map(String) : [],
      reports: rows.slice(0, limit).map((r) => ({
        id: String(r.id ?? ""),
        title: String(r.title ?? ""),
        body: r.body == null ? null : String(r.body),
        category: r.category ?? null,
        status: r.status ?? null,
        createdAt: r.createdAt ?? null,
        createdBy: r.createdBy ?? null,
        updatedAt: r.updatedAt ?? null,
      })),
    };
  },
});

defineTool({
  name: "get_service_status",
  description:
    "Health of every platform service the portal monitors — the portal itself, the AIP/NOTAM/weather paths, the sync workers, the ops wall, the Leon feed and cache freshness. Use when something seems broken, or when asked whether the platform is healthy.",
  permission: "user",
  sourceTier: "internal",
  sourceLabel: () => "Internal · service checks",
  timeoutMs: 30_000,
  input: {
    type: "object",
    additionalProperties: false,
    properties: { onlyProblems: { type: "boolean", default: false, description: "Return only checks that are not operational." } },
  },
  output: {
    type: "object",
    required: ["checks", "summary"],
    properties: {
      summary: {
        type: "object",
        properties: {
          operational: { type: "integer" },
          degraded: { type: "integer" },
          down: { type: "integer" },
          unknown: { type: "integer" },
        },
      },
      checkedAt: { type: ["string", "null"] },
      checks: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            label: { type: "string" },
            state: { type: "string" },
            error: { type: ["string", "null"] },
            latencyMs: { type: ["integer", "null"] },
            lastCheckedAt: { type: ["string", "null"] },
          },
        },
      },
    },
  },
  async handler({ onlyProblems }, { user }) {
    const data = await portalGet("/api/service-checks", user, { timeoutMs: 25_000 });
    const all = Array.isArray(data?.checks) ? data.checks : [];
    const summary = { operational: 0, degraded: 0, down: 0, unknown: 0 };
    for (const c of all) {
      const state = String(c.state ?? "unknown");
      if (state in summary) summary[state] += 1;
      else summary.unknown += 1;
    }
    const rows = onlyProblems ? all.filter((c) => c.state !== "operational") : all;
    return {
      summary,
      checkedAt: data?.updatedAt ?? data?.checkedAt ?? null,
      checks: rows.map((c) => ({
        id: String(c.id ?? ""),
        label: String(c.label ?? ""),
        state: String(c.state ?? "unknown"),
        error: c.lastError ?? c.error ?? null,
        latencyMs: typeof c.latencyMs === "number" ? Math.round(c.latencyMs) : null,
        lastCheckedAt: c.lastCheckedAt ?? c.checkedAt ?? null,
      })),
    };
  },
});
