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

/** Permission levels, least to most privileged. */
export const PERMISSIONS = ["user", "admin", "developer"];

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
    ...spec,
  };
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
export async function executeTool({ name, input, user, conversationId }) {
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

/** Shared schema fragments, so every tool spells these the same way. */
export const S = {
  icao: { type: "string", pattern: "^[A-Za-z0-9]{4}$", description: "4-character ICAO code, e.g. EVRA." },
  isoDate: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", description: "Date as YYYY-MM-DD." },
  limit: (max = 100, dflt = 50) => ({ type: "integer", minimum: 1, maximum: max, default: dflt }),
  nullableString: { type: ["string", "null"] },
};
