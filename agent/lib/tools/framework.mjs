// The controlled tool framework.
//
// Every tool declares, up front: input schema, OUTPUT schema, the description
// the model uses to choose it, the permission it requires, a timeout, and a
// result-size limit. The framework does the rest — validation in, execution
// under timeout, validation out, size enforcement, the standard error
// vocabulary, and one audit row per call.
//
// The division of labour is the point: THE MODEL SELECTS THE TOOL; THE BACKEND
// VALIDATES AND EXECUTES IT. A tool handler receives only a validated input
// object and the caller's identity. It cannot be handed a URL, a query, or a
// credential, because no tool declares one.

import { validate, SchemaError } from "./schema.mjs";
import { ToolError, InvalidInput, Timeout } from "./errors.mjs";
import { audit } from "../store.mjs";
import { requireConfirmation, consumeConfirmation } from "../confirm.mjs";

/** Permission levels, least to most privileged. */
export const PERMISSIONS = ["user", "admin", "developer"];

/**
 * Where a tool's facts come from. The panel colours source chips by this, and
 * — the point — it is declared on the TOOL, so attribution is derived from
 * what actually ran rather than from the model saying what it used. A model
 * cannot invent a source tier it was never given.
 *
 *   company  — Clearway's own approved operational content (limitations, IMP, CAA)
 *   internal — platform systems of record (Leon, the wall, the portal, AIP cache)
 *   web      — anything fetched from outside the platform
 */
export const SOURCE_TIERS = {
  company: { label: "Company", fg: "#6d28d9", bg: "#ede9fe", icon: "book-open" },
  internal: { label: "Internal", fg: "#1d4ed8", bg: "#dbeafe", icon: "database" },
  web: { label: "Web", fg: "#b45309", bg: "#fef3e2", icon: "globe" },
  // Something a user asked the agent to remember. Deliberately its own tier:
  // a remembered note is not approved knowledge, and colouring it as "Company"
  // would let a dispatcher's aside sit beside a Tier 1 limitation looking
  // equally authoritative.
  memory: { label: "Remembered", fg: "#0e7490", bg: "#cffafe", icon: "bookmark" },
};

const registry = new Map();

export function defineTool(spec) {
  const required = ["name", "description", "permission", "input", "output", "handler"];
  for (const key of required) {
    if (!spec[key]) throw new Error(`Tool "${spec.name ?? "?"}" is missing ${key}`);
  }
  if (!PERMISSIONS.includes(spec.permission)) throw new Error(`Tool "${spec.name}" has unknown permission ${spec.permission}`);
  if (registry.has(spec.name)) throw new Error(`Tool "${spec.name}" is already registered`);
  const tool = {
    timeoutMs: 20_000,
    maxResultBytes: 128 * 1024,
    sourceTier: "internal",
    ...spec,
  };
  if (!SOURCE_TIERS[tool.sourceTier]) throw new Error(`Tool "${tool.name}" has unknown sourceTier ${tool.sourceTier}`);
  // A destructive tool always accepts a voice readback token, injected here so
  // no tool author can forget it and so the key is spelled the same everywhere.
  // Typed input ignores it entirely.
  if (tool.destructive) {
    tool.input.properties = {
      ...tool.input.properties,
      voiceConfirmationToken: {
        type: "string", maxLength: 64,
        description: "Only ever a token returned by a previous refused call. Never invent one.",
      },
    };
  }
  registry.set(tool.name, tool);
  return tool;
}

export function getTool(name) {
  return registry.get(name) ?? null;
}

export function allTools() {
  return [...registry.values()];
}

/** Does this caller's role satisfy a tool's requirement? */
export function roleSatisfies(role, permission) {
  // Developer is a FLAG, not the top of a ladder (the platform's rule — see
  // lib/admin-auth.ts). A developer can reach admin tools; an admin cannot
  // reach developer tools.
  if (permission === "user") return true;
  if (permission === "admin") return role === "admin" || role === "developer";
  if (permission === "developer") return role === "developer";
  return false;
}

/**
 * The tools THIS user may use, as Bedrock toolSpec entries.
 *
 * Permission scoping happens HERE, before the model is told anything: a tool
 * the caller cannot use is never offered, rather than offered and then refused.
 * That matters beyond tidiness — an offered-then-refused tool teaches the model
 * the capability exists, and it will keep trying and narrating it to the user.
 */
export function toolSpecsFor(user) {
  return allTools()
    .filter((tool) => roleSatisfies(user.agentRole, tool.permission))
    .map((tool) => ({
      toolSpec: {
        name: tool.name,
        description: tool.description,
        inputSchema: { json: tool.input },
      },
    }));
}

export function toolNamesFor(user) {
  return allTools().filter((t) => roleSatisfies(user.agentRole, t.permission)).map((t) => t.name);
}

function byteSize(value) {
  return Buffer.byteLength(JSON.stringify(value ?? null), "utf8");
}

/**
 * Run one tool call. Never throws: every outcome becomes a result object the
 * model can read, and an audit row. The returned shape is the tool's declared
 * output on success, or { ok: false, error: <CODE>, message } on failure.
 */
export async function executeTool({ name, input, user, conversationId, inputMode = "text" }) {
  const startedAt = Date.now();
  const tool = getTool(name);

  const record = async (result, ok, error) => {
    await audit({
      kind: "tool.call",
      userId: user?.userId ?? null,
      userEmail: user?.email ?? null,
      conversationId,
      toolName: name,
      toolArgs: input ?? null,
      // The full result is logged, capped so one huge payload cannot bloat the
      // audit table; the cap is recorded rather than silently applied.
      toolResult: byteSize(result) > 32 * 1024 ? { truncatedForAudit: true, bytes: byteSize(result) } : result,
      confirmationStatus: "not_required", // read-only tools never need one
      success: ok,
      error: error ?? null,
      latencyMs: Date.now() - startedAt,
      detail: { permission: tool?.permission ?? null, role: user?.agentRole ?? null },
    });
  };

  if (!tool) {
    const result = { ok: false, error: "NOT_FOUND", message: `No tool named "${name}".` };
    await record(result, false, "NOT_FOUND");
    return result;
  }

  // Belt and braces: the model was never offered this tool, but a crafted
  // request must still be refused by the backend rather than by omission.
  if (!roleSatisfies(user.agentRole, tool.permission)) {
    const result = { ok: false, error: "NO_PERMISSION", message: `Your account cannot use ${name}.` };
    await record(result, false, "NO_PERMISSION");
    return result;
  }

  let validInput;
  try {
    validInput = validate(input ?? {}, tool.input, name);
  } catch (error) {
    const message = error instanceof SchemaError ? error.errors.join("; ") : String(error?.message || error);
    const result = { ok: false, error: "INVALID_INPUT", message };
    await record(result, false, `INVALID_INPUT: ${message}`);
    return result;
  }

  // ── Voice is the exception to the no-confirmation rule ──────────────────
  //
  // Parts 7 and 8 drop confirmation for authorized reversible actions, and that
  // is right for typed input: the dispatcher has SEEN exactly what they asked
  // for. Voice has not got that. A noisy ops room, second-language speakers and
  // an STT model that can mishear one ICAO code for another mean the agent may
  // be about to act on a sentence nobody actually said. So a destructive action
  // arriving by voice is read back first and executed on the second call.
  //
  // Enforced HERE rather than in each tool, and keyed on inputMode from the
  // request rather than anything the model says, so it cannot be prompted away.
  if (inputMode === "voice" && tool.destructive) {
    const token = validInput.voiceConfirmationToken;
    if (!consumeConfirmation({ user, toolName: `voice:${name}`, targetId: validInput.id ?? null, token })) {
      const what = tool.readback ? await tool.readback(validInput, { user }).catch(() => null) : null;
      const issued = requireConfirmation({
        user, toolName: `voice:${name}`, targetId: validInput.id ?? null,
        targetLabel: what,
        why: "This was asked by voice, and a misheard word here changes which record is affected.",
      });
      const result = {
        ok: true,
        executed: false,
        readbackRequired: true,
        voiceConfirmationToken: issued.confirmationToken,
        what,
        message:
          `NOT DONE YET. Read back exactly what will happen — ${what ? `"${what}"` : `${name} on ${validInput.id ?? "this record"}`} ` +
          "— and ask the dispatcher to confirm out loud. Only if they confirm, call this tool again with the same " +
          "arguments plus voiceConfirmationToken. If you are not certain you heard the record correctly, say so and ask again.",
      };
      await record(result, true, null);
      return result;
    }
  }

  let output;
  try {
    output = await Promise.race([
      tool.handler(validInput, { user, conversationId }),
      new Promise((_, reject) =>
        setTimeout(() => reject(Timeout(`${name} timed out after ${Math.round(tool.timeoutMs / 1000)}s.`)), tool.timeoutMs)
      ),
    ]);
  } catch (error) {
    const toolError = error instanceof ToolError ? error : new ToolError("INTERNAL", String(error?.message || error));
    const result = toolError.toResult();
    await record(result, false, `${toolError.code}: ${toolError.message}`);
    return result;
  }

  const size = byteSize(output);
  if (size > tool.maxResultBytes) {
    // Deliberately an error rather than a silent trim: a truncated operational
    // record read as complete is worse than no record at all.
    const result = {
      ok: false,
      error: "TOO_LARGE",
      message: `${name} produced ${Math.round(size / 1024)}KB, over its ${Math.round(tool.maxResultBytes / 1024)}KB limit. Narrow the query — use a filter or a smaller limit.`,
    };
    await record({ error: "TOO_LARGE", bytes: size }, false, "TOO_LARGE");
    return result;
  }

  // The OUTPUT schema is enforced too. A tool whose upstream changed shape
  // must fail loudly here rather than hand the model a plausible-looking
  // object with a field quietly missing.
  try {
    const validated = validate(output, tool.output, `${name} result`);
    const result = { ok: true, ...validated };
    await record(result, true, null);
    return result;
  } catch (error) {
    const message = error instanceof SchemaError ? error.errors.join("; ") : String(error?.message || error);
    const result = { ok: false, error: "INTERNAL", message: `${name} returned an unexpected shape: ${message}` };
    await record(result, false, `OUTPUT_SCHEMA: ${message}`);
    return result;
  }
}

/**
 * Source attributions for a set of tool calls, in the order they ran. Built
 * from the tool REGISTRY plus each tool's own `sourceLabel`, so a reply's
 * citations describe work that demonstrably happened.
 */
export function sourcesFromToolCalls(calls) {
  const sources = [];
  const seen = new Set();
  for (const call of calls) {
    const tool = getTool(call.name);
    if (!tool || call.ok === false) continue;
    let label;
    try {
      label = tool.sourceLabel ? tool.sourceLabel(call.input ?? {}, call.result ?? {}) : tool.name;
    } catch {
      label = tool.name;
    }
    const key = `${tool.sourceTier}:${label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    // Spread the tier's presentation FIRST so the computed label wins — the
    // tier also carries a `label` ("Company"), and letting it clobber the
    // specific one would make every source chip read the same.
    sources.push({
      ...SOURCE_TIERS[tool.sourceTier],
      n: sources.length + 1,
      tier: tool.sourceTier,
      tierLabel: SOURCE_TIERS[tool.sourceTier].label,
      label: String(label),
      tool: tool.name,
    });
  }
  return sources;
}

/**
 * Verbatim records a set of tool calls returned. The panel renders these in the
 * ink frame. Only records a tool itself marked `verbatim: true` qualify — the
 * model cannot promote its own paraphrase into that frame.
 */
export function verbatimFromToolCalls(calls) {
  const out = [];
  for (const call of calls) {
    if (call.ok === false || !call.result) continue;
    const tool = getTool(call.name);
    if (!tool) continue;
    for (const key of ["limitations", "entries", "reports", "notams"]) {
      for (const record of call.result[key] ?? []) {
        if (record?.verbatim !== true) continue;
        out.push({
          id: String(record.id ?? ""),
          heading: String(record.title ?? record.country ?? record.id ?? ""),
          text: String(record.description ?? record.body ?? record.functionText ?? record.title ?? ""),
          source: call.result.source ?? tool.name,
          effectiveFrom: record.effectiveFrom ?? null,
          effectiveTo: record.effectiveTo ?? null,
          approvedBy: record.reviewedBy ?? record.addedBy ?? null,
          updatedAt: record.updatedAt ?? null,
          tool: tool.name,
        });
      }
    }
  }
  return out;
}

/**
 * Flight cards for the panel, built from the flight tools' results. Same rule
 * as sources and verbatim records: the card describes what a tool returned, so
 * the model cannot render a flight that was never looked up, or change a time
 * on the way past.
 */
export function flightCardsFromToolCalls(calls) {
  const cards = [];
  const seen = new Set();
  const push = (flight, extra = {}) => {
    if (!flight?.flightId || seen.has(flight.flightId)) return;
    seen.add(flight.flightId);
    cards.push({
      flightId: flight.flightId,
      callsign: flight.callsign ?? flight.flightNid ?? null,
      registration: flight.registration ?? null,
      operatorId: flight.operatorId ?? null,
      departureIcao: flight.departureIcao ?? null,
      arrivalIcao: flight.arrivalIcao ?? null,
      scheduledDeparture: flight.scheduledDeparture ?? null,
      scheduledArrival: flight.scheduledArrival ?? null,
      status: flight.status ?? null,
      ...extra,
    });
  };

  for (const call of calls) {
    if (call.ok === false || !call.result) continue;
    if (call.name === "get_flight") push(call.result.flight);
    if (call.name === "get_flight_state") {
      push(call.result.flight, {
        limitationCount: (call.result.limitations ?? []).length,
        importantCount: (call.result.important ?? []).length,
        departure: call.result.departure ?? null,
        arrival: call.result.arrival ?? null,
      });
    }
    // A search can return many; only render cards when it is a short list, so
    // the panel does not turn a fleet-wide query into fifty cards.
    if (call.name === "search_flights" && (call.result.flights ?? []).length <= 3) {
      for (const f of call.result.flights ?? []) push(f);
    }
  }
  return cards;
}

/**
 * Changes the agent actually made this turn, for the panel to show above the
 * reply. Derived from tool RESULTS — a change appears here because a write
 * returned an action id, never because the model said it did something.
 */
export function actionsFromToolCalls(calls) {
  const WRITE_TOOLS = {
    create_limitation: (r) => `Added limitation "${r.title ?? r.id}"`,
    update_limitation: (r) => `Changed limitation ${r.id}`,
    create_important: (r) => `Added IMPORTANT entry ${r.id}`,
    create_report: (r) => `Raised report ${r.id}`,
    update_display_settings: (r) => `Changed display settings (${(r.changed ?? []).join(", ")})`,
    set_operator_active: (r) => `${r.isActive ? "Enabled" : "Disabled"} operator ${r.operatorId}`,
    set_aircraft_visible: (r) => `${r.visible ? "Showed" : "Hid"} aircraft ${r.registration}`,
    undo_action: (r) => `Undid: ${r.what ?? "an earlier change"}`,
  };
  const out = [];
  for (const call of calls) {
    if (call.ok === false || !call.result) continue;
    const describe = WRITE_TOOLS[call.name];
    if (!describe) continue;
    const id = call.result.actionId ?? call.result.undoActionId;
    if (!id) continue;
    out.push({
      actionId: String(id),
      what: describe(call.result),
      targetKind: call.name.replace(/^(create|update|set)_/, "").replace(/_active|_visible$/, ""),
      target: call.result.id ?? call.result.registration ?? call.result.operatorId ?? null,
    });
  }
  return out;
}

/** Shared schema fragments, so every tool spells these the same way. */
export const S = {
  icao: { type: "string", pattern: "^[A-Za-z0-9]{4}$", description: "4-character ICAO code, e.g. EVRA." },
  isoDate: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", description: "Date as YYYY-MM-DD." },
  limit: (max = 100, dflt = 50) => ({ type: "integer", minimum: 1, maximum: max, default: dflt }),
  nullableString: { type: ["string", "null"] },
};
