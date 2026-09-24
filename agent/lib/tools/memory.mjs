// Memory: what the user asked the agent to remember.
//
// SCOPED PER USER. A recall never returns another dispatcher's notes unless
// they were explicitly shared, and the scoping is part of the query rather
// than a filter applied afterwards.
//
// A memory is NOT company knowledge. It carries the `memory` source tier so an
// answer shows it as "Remembered", never beside an approved limitation looking
// equally authoritative. That distinction is the whole point: a note saying
// "EPWA handling is slow before 0600" is a useful recollection and not a rule.

import { defineTool, S } from "./framework.mjs";
import { InvalidInput, NotFound, ServiceUnavailable } from "./errors.mjs";

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

const MEMORY_SCHEMA = {
  type: "object",
  properties: {
    id: { type: "string" },
    content: { type: "string" },
    relatesTo: { type: ["string", "null"] },
    relatesToKind: { type: ["string", "null"] },
    isShared: { type: "boolean" },
    isMine: { type: "boolean" },
    author: { type: ["string", "null"] },
    createdAt: { type: "string" },
  },
};

function mapMemory(row, user) {
  return {
    id: row.id,
    content: row.content,
    relatesTo: row.relates_to ?? null,
    relatesToKind: row.relates_to_kind ?? null,
    isShared: row.is_shared === true,
    isMine: row.user_id === user.userId,
    author: row.user_email ?? null,
    createdAt: row.created_at,
  };
}

defineTool({
  name: "remember",
  description:
    "Store something the user asks you to remember — a preference, a local quirk, a standing instruction. Use ONLY when they explicitly ask you to remember, note or save something. Do not store facts you looked up; those come from tools each time and would go stale here.",
  permission: "user",
  sourceTier: "memory",
  sourceLabel: (input) => `Remembered · ${String(input.content).slice(0, 48)}`,
  input: {
    type: "object",
    required: ["content"],
    additionalProperties: false,
    properties: {
      content: { type: "string", minLength: 3, maxLength: 1000, description: "In the user's own words, as close as possible." },
      relatesToKind: { type: "string", enum: ["airport", "flight", "operator", "country", "general"], default: "general" },
      relatesTo: { type: "string", maxLength: 60, description: "e.g. an ICAO code, a registration, an operator id." },
      tags: { type: "array", items: { type: "string", maxLength: 30 }, maxItems: 8 },
      share: { type: "boolean", default: false, description: "Share with colleagues. Only when the user explicitly says so." },
    },
  },
  output: { type: "object", required: ["memory"], properties: { memory: MEMORY_SCHEMA } },
  async handler({ content, relatesToKind, relatesTo, tags, share }, { user, conversationId }) {
    try {
      const rows = await rest("agent_memories", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify([{
          user_id: user.userId,
          user_email: user.email ?? null,
          content,
          relates_to_kind: relatesToKind ?? "general",
          relates_to: relatesTo ? String(relatesTo).toUpperCase() : null,
          tags: tags ?? [],
          is_shared: share === true,
          shared_at: share === true ? new Date().toISOString() : null,
          shared_by: share === true ? user.userId : null,
          source_conversation_id: /^[0-9a-f-]{36}$/i.test(String(conversationId ?? "")) ? conversationId : null,
        }]),
      });
      return { memory: mapMemory(rows[0], user) };
    } catch (error) {
      throw ServiceUnavailable(`The note could not be saved: ${error.message}`);
    }
  },
});

defineTool({
  name: "recall",
  description:
    "Look up things the user previously asked you to remember. Use when they refer to something they told you before, or when a question is about an airport, flight or operator they may have left a note on. Remembered notes are the user's own words — they are NOT approved company rules, so never present one as a regulation.",
  permission: "user",
  sourceTier: "memory",
  sourceLabel: (input, result) => `Remembered · ${result.count ?? 0} note${result.count === 1 ? "" : "s"}${input.relatesTo ? ` · ${input.relatesTo}` : ""}`,
  input: {
    type: "object",
    additionalProperties: false,
    properties: {
      query: { type: "string", maxLength: 200, description: "Free text over the note contents." },
      relatesTo: { type: "string", maxLength: 60 },
      includeShared: { type: "boolean", default: true, description: "Include notes colleagues have shared." },
      limit: S.limit(50, 20),
    },
  },
  output: {
    type: "object",
    required: ["count", "memories"],
    properties: {
      count: { type: "integer" },
      memories: { type: "array", items: MEMORY_SCHEMA },
      note: { type: ["string", "null"] },
    },
  },
  async handler({ query, relatesTo, includeShared, limit }, { user }) {
    // Scoping is in the QUERY: own notes, plus shared ones only when asked for.
    // Filtering after the fact would mean another user's note reached this
    // process at all, which is the kind of thing that leaks by accident later.
    const scope = includeShared === false
      ? `user_id=eq.${encodeURIComponent(user.userId)}`
      : `or=(user_id.eq.${encodeURIComponent(user.userId)},is_shared.eq.true)`;
    const parts = [scope, "forgotten_at=is.null", "select=*", "order=created_at.desc", `limit=${Math.min(limit * 3, 150)}`];
    if (relatesTo) parts.push(`relates_to=eq.${encodeURIComponent(String(relatesTo).toUpperCase())}`);

    let rows;
    try {
      rows = await rest(`agent_memories?${parts.join("&")}`);
    } catch (error) {
      throw ServiceUnavailable(`Notes could not be read: ${error.message}`);
    }

    let memories = (rows ?? []).map((r) => mapMemory(r, user));
    if (query) {
      const needle = query.toLowerCase();
      memories = memories.filter((m) => m.content.toLowerCase().includes(needle) || String(m.relatesTo ?? "").toLowerCase().includes(needle));
    }
    memories = memories.slice(0, limit);

    return {
      count: memories.length,
      memories,
      note: memories.length
        ? "These are the user's own notes, not approved company rules. Attribute them as remembered."
        : null,
    };
  },
});

defineTool({
  name: "forget",
  description:
    "Remove something the user previously asked you to remember. Use only when they ask you to forget or delete a note.",
  permission: "user",
  sourceTier: "memory",
  sourceLabel: () => "Remembered · note removed",
  input: {
    type: "object",
    required: ["id"],
    additionalProperties: false,
    properties: { id: { type: "string", minLength: 8, maxLength: 64 } },
  },
  output: { type: "object", required: ["forgotten"], properties: { forgotten: { type: "boolean" }, id: { type: "string" } } },
  async handler({ id }, { user }) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw InvalidInput("That is not a note id. Use recall first to find it.");
    // Ownership is in the query: a user can only forget their OWN note, even
    // if a shared one is visible to them.
    const rows = await rest(
      `agent_memories?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(user.userId)}&forgotten_at=is.null`,
      { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ forgotten_at: new Date().toISOString() }) }
    );
    if (!rows || rows.length === 0) throw NotFound("No note of yours with that id.");
    return { forgotten: true, id };
  },
});
