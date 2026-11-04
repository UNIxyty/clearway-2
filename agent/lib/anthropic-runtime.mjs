// The Anthropic API behind the agent's Bedrock-shaped client (2026-11-02). The AWS account that carried Bedrock is gone;
// agent/lib/bedrock.mjs keeps building Converse requests (system, messages, tool config, cache points, image and PDF
// blocks) and reading Converse stream events, and this file turns them into Anthropic Messages API calls and back. One
// translation layer, so the agent's turns, tools, caching, fallback and error vocabulary do not change.
//
// The key is ANTHROPIC_API_KEY in this service's environment; it is sent in a header and never logged or printed.
// ANTHROPIC_BASE_URL points the rig at its mock (rig/mock-anthropic.mjs) when no rig key is set.

import { checkCeiling, recordUsage } from "./spend.mjs";

const API_VERSION = "2023-06-01";
const base = () => String(process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com").replace(/\/+$/, "");
const key = () => String(process.env.ANTHROPIC_API_KEY || "").trim();

/** An error named the way agent/lib/errors.mjs › classifyBedrockError already understands. */
function apiError(status, type, message) {
  const name = status === 429 || status === 529 || type === "overloaded_error" || type === "rate_limit_error" ? "ThrottlingException"
    : status === 404 || type === "not_found_error" ? "ResourceNotFoundException"
    : status === 401 || status === 403 || type === "authentication_error" || type === "permission_error" ? "AccessDeniedException"
    : status === 400 || type === "invalid_request_error" ? "ValidationException"
    : "InternalServerException";
  return Object.assign(new Error(`Anthropic API ${status} ${type ?? ""}: ${String(message ?? "").slice(0, 400)}`), { name, status }); // public-error-ok: for the log; classifyBedrockError gives the person our words
}

// control characters (not tab or newline) never reach the API in a search result: it refuses the whole request
const clean = (s) => String(s ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ");
const b64 = (bytes) => Buffer.from(bytes ?? []).toString("base64");

// What a model refuses, measured against the production key on 2026-11-03 (each refused with a 400):
//   temperature — every model from Opus 4.7 on, Sonnet 5 and Opus 5 included ("deprecated for this model"); Haiku 4.5,
//                 Sonnet 4.5, Sonnet 4.6 and Opus 4.6 still take it. Sent only to those (an allow-list: a model not on
//                 it gets none, rather than a refused call). Found because extraction and ingest asked Sonnet 5 for 0
//                 and every such call had failed since the move on 2026-11-02.
//   a forced tool_choice ("tool"/"any") — Sonnet 5.5 and Opus 5.5. Not dropped: refused here, before the call, because
//                 silently letting the model choose would change what the caller asked for (bedrock.mjs writes the
//                 pinned call itself instead of forcing it).
const TAKES_TEMPERATURE = /^claude-(haiku-4-5|sonnet-4-5|sonnet-4-6|opus-4-6|opus-4-5|opus-4-1|opus-4|sonnet-4)(-\d{8})?$/;
const NO_FORCED_TOOL = /^claude-(sonnet|opus)-5-5$/;
const TEXT_DOCS = { txt: "text/plain", csv: "text/plain", md: "text/plain", html: "text/plain" };

/** Converse content blocks → Anthropic content blocks. A cachePoint marks the block before it. */
function blocks(list) {
  const out = [];
  for (const b of list ?? []) {
    if (b.cachePoint) { if (out.length) out[out.length - 1].cache_control = { type: "ephemeral" }; continue; }
    if (b.text != null) { if (String(b.text).length) out.push({ type: "text", text: String(b.text) }); continue; }
    // thinking from an earlier round of this turn, sent back exactly as it came (the API refuses edited thinking)
    if (b.reasoningContent) {
      const r = b.reasoningContent;
      out.push(r.redactedContent != null ? { type: "redacted_thinking", data: String(r.redactedContent) } : { type: "thinking", thinking: r.reasoningText?.text ?? "", signature: r.reasoningText?.signature ?? "" });
      continue;
    }
    // the API's own blocks from an earlier round (server_tool_use, web_search_tool_result), sent back exactly as they came:
    // their encrypted content is what lets a later answer cite them (2026-11-03)
    if (b.raw) { out.push(b.raw); continue; }
    if (b.toolUse) { out.push({ type: "tool_use", id: b.toolUse.toolUseId, name: b.toolUse.name, input: b.toolUse.input ?? {} }); continue; }
    if (b.toolResult) {
      // a tool's search results (the knowledge base) go back as search_result blocks, so the answer cites them
      // with search_result_location citations next to the claim — the same as the API's own web search (2026-11-03)
      const content = (b.toolResult.content ?? []).map((c) => (c.searchResult ? { type: "search_result", source: clean(c.searchResult.source), title: clean(c.searchResult.title ?? c.searchResult.source).slice(0, 500), content: [{ type: "text", text: clean(c.searchResult.text).trim() || "(no text)" }], citations: { enabled: true } } : c.json !== undefined ? { type: "text", text: JSON.stringify(c.json) } : c.text != null ? { type: "text", text: String(c.text) } : null)).filter(Boolean);
      out.push({ type: "tool_result", tool_use_id: b.toolResult.toolUseId, content: content.length ? content : [{ type: "text", text: "" }], ...(b.toolResult.status === "error" ? { is_error: true } : {}) });
      continue;
    }
    if (b.image) { const fmt = String(b.image.format ?? "png").toLowerCase(); out.push({ type: "image", source: { type: "base64", media_type: `image/${fmt === "jpg" ? "jpeg" : fmt}`, data: b64(b.image.source?.bytes) } }); continue; }
    if (b.document) {
      const fmt = String(b.document.format ?? "pdf").toLowerCase();
      const common = { ...(b.document.name ? { title: String(b.document.name) } : {}), ...(b.document.citations?.enabled ? { citations: { enabled: true } } : {}) };
      if (fmt === "pdf") out.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: b64(b.document.source?.bytes) }, ...common });
      else if (TEXT_DOCS[fmt]) out.push({ type: "document", source: { type: "text", media_type: "text/plain", data: Buffer.from(b.document.source?.bytes ?? []).toString("utf8") }, ...common });
      else throw apiError(400, "invalid_request_error", `document format ${fmt} is not supported`); // the file's fault: classified as attachment_rejected
      continue;
    }
  }
  return out;
}

/** A Converse request (the command's input) → an Anthropic Messages request body. */
export function toMessagesRequest(input, { stream }) {
  const system = blocks(input.system ?? []);
  const tools = [];
  for (const t of input.toolConfig?.tools ?? []) {
    if (t.cachePoint) { if (tools.length) tools[tools.length - 1].cache_control = { type: "ephemeral" }; continue; }
    if (t.toolSpec) tools.push({ name: t.toolSpec.name, description: t.toolSpec.description ?? "", input_schema: t.toolSpec.inputSchema?.json ?? { type: "object", properties: {} } });
  }
  // the API's own tools (web search): after the client tools' cache point, since a pass can change them mid-turn
  for (const st of input.serverTools ?? []) tools.push(st);
  const choice = input.toolConfig?.toolChoice?.tool?.name ? { type: "tool", name: input.toolConfig.toolChoice.tool.name } : null;
  if (choice && NO_FORCED_TOOL.test(String(input.modelId))) throw apiError(400, "invalid_request_error", `${input.modelId} does not accept a forced tool_choice`);
  const sampling = TAKES_TEMPERATURE.test(String(input.modelId));
  return {
    model: input.modelId,
    max_tokens: input.inferenceConfig?.maxTokens ?? 4096,
    ...(sampling && input.inferenceConfig?.temperature != null ? { temperature: input.inferenceConfig.temperature } : {}),
    // the tier's own fields (thinking, effort: agent/config/models.json), as Converse's additionalModelRequestFields
    ...(input.additionalModelRequestFields ?? {}),
    ...(system.length ? { system } : {}),
    messages: (input.messages ?? []).map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: blocks(m.content) })),
    ...(tools.length ? { tools, ...(choice ? { tool_choice: choice } : {}) } : {}),
    ...(stream ? { stream: true } : {}),
  };
}

async function post(body, abortSignal) {
  if (!key()) throw apiError(401, "authentication_error", "ANTHROPIC_API_KEY is not set in this service's environment");
  // a check run may keep each request body to replay it (scripts/prod-checks: ONLY=…,dump); never set on a service, and
  // the key is in a header, never in the body
  if (process.env.AGENT_DUMP_REQUESTS) { try { const fs = await import("node:fs"); fs.mkdirSync(process.env.AGENT_DUMP_REQUESTS, { recursive: true }); fs.writeFileSync(`${process.env.AGENT_DUMP_REQUESTS}/${Date.now()}.json`, JSON.stringify(body)); } catch { /* a dump is best-effort */ } }
  await checkCeiling();   // the runaway ceiling (lib/spend.mjs): refused before any request once today's spend reaches it
  const res = await fetch(`${base()}/v1/messages`, { method: "POST", headers: { "x-api-key": key(), "anthropic-version": API_VERSION, "content-type": "application/json" }, body: JSON.stringify(body), signal: abortSignal });
  if (!res.ok) { const j = await res.json().catch(() => ({})); throw apiError(res.status, j?.error?.type, j?.error?.message); }
  return res;
}

const usageOf = (u) => ({ inputTokens: (u?.input_tokens ?? 0), outputTokens: u?.output_tokens ?? 0, cacheReadInputTokens: u?.cache_read_input_tokens ?? 0, cacheWriteInputTokens: u?.cache_creation_input_tokens ?? 0, webSearchRequests: u?.server_tool_use?.web_search_requests ?? 0 });

/** The Anthropic SSE stream → Converse stream events, as bedrock.mjs reads them. */
async function* converseEvents(res, model) {
  const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = "";
  let usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }; let stop = null;
  for (;;) {
    const { value, done } = await reader.read(); if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const frame = buf.slice(0, i); buf = buf.slice(i + 2);
      const data = frame.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("");
      if (!data) continue;
      let ev; try { ev = JSON.parse(data); } catch { continue; }
      if (ev.type === "message_start") usage = { ...usage, ...(ev.message?.usage ?? {}) };
      else if (ev.type === "content_block_start" && ev.content_block?.type === "thinking" && (ev.content_block.thinking || ev.content_block.signature)) yield { contentBlockDelta: { contentBlockIndex: ev.index, delta: { reasoningContent: { text: ev.content_block.thinking ?? "", signature: ev.content_block.signature ?? "" } } } };
      else if (ev.type === "content_block_start" && ev.content_block?.type === "thinking") yield { contentBlockDelta: { contentBlockIndex: ev.index, delta: { reasoningContent: { text: "" } } } };
      else if (ev.type === "content_block_start" && ev.content_block?.type === "redacted_thinking") yield { contentBlockDelta: { contentBlockIndex: ev.index, delta: { reasoningContent: { redactedContent: ev.content_block.data ?? "" } } } };
      else if (ev.type === "content_block_delta" && ev.delta?.type === "thinking_delta") yield { contentBlockDelta: { contentBlockIndex: ev.index, delta: { reasoningContent: { text: ev.delta.thinking ?? "" } } } };
      else if (ev.type === "content_block_delta" && ev.delta?.type === "signature_delta") yield { contentBlockDelta: { contentBlockIndex: ev.index, delta: { reasoningContent: { signature: ev.delta.signature ?? "" } } } };
      // the API's own web search: the call and its results, kept whole for the next round and for the citations' sources
      else if (ev.type === "content_block_start" && (ev.content_block?.type === "server_tool_use" || ev.content_block?.type === "web_search_tool_result")) yield { rawStart: { contentBlockIndex: ev.index, block: ev.content_block } };
      else if (ev.type === "content_block_delta" && ev.delta?.type === "citations_delta") yield { contentBlockDelta: { contentBlockIndex: ev.index, delta: { citation: ev.delta.citation } } };
      else if (ev.type === "content_block_start" && ev.content_block?.type === "tool_use") yield { contentBlockStart: { contentBlockIndex: ev.index, start: { toolUse: { toolUseId: ev.content_block.id, name: ev.content_block.name } } } };
      else if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta") yield { contentBlockDelta: { contentBlockIndex: ev.index, delta: { text: ev.delta.text } } };
      else if (ev.type === "content_block_delta" && ev.delta?.type === "input_json_delta") yield { contentBlockDelta: { contentBlockIndex: ev.index, delta: { toolUse: { input: ev.delta.partial_json ?? "" } } } };
      else if (ev.type === "message_delta") { if (ev.delta?.stop_reason) stop = ev.delta.stop_reason; if (ev.usage) usage = { ...usage, ...Object.fromEntries(Object.entries(ev.usage).filter(([, v]) => v != null)) }; }
      else if (ev.type === "error") throw apiError(ev.error?.type === "overloaded_error" ? 529 : 500, ev.error?.type, ev.error?.message);
    }
  }
  yield { messageStop: { stopReason: stop } };
  recordUsage(model, usageOf(usage));
  yield { metadata: { usage: usageOf(usage) } };
}

/** One plain Messages API call (the web search smoke): the ceiling, the key and the usage ledger as every other call. */
export async function messagesOnce(body, { timeoutMs = 90_000 } = {}) {
  const res = await post(body, AbortSignal.timeout(timeoutMs));
  const j = await res.json();
  recordUsage(body.model, usageOf(j.usage));
  return j;
}

/** The same `send(command, { abortSignal })` as BedrockRuntimeClient, for ConverseStreamCommand and ConverseCommand. */
export const anthropicRuntime = {
  async send(command, { abortSignal } = {}) {
    // by name, not instanceof: two copies of the SDK (the agent's own and the repo's) are two different classes
    const stream = command?.constructor?.name === "ConverseStreamCommand";
    const res = await post(toMessagesRequest(command.input, { stream }), abortSignal);
    if (stream) return { stream: converseEvents(res, command.input.modelId) };
    const j = await res.json();
    recordUsage(command.input.modelId, usageOf(j.usage));
    const content = (j.content ?? []).map((c) => (c.type === "text" ? { text: c.text } : c.type === "tool_use" ? { toolUse: { toolUseId: c.id, name: c.name, input: c.input } } : null)).filter(Boolean);
    return { output: { message: { role: "assistant", content } }, stopReason: j.stop_reason ?? null, usage: usageOf(j.usage) };
  },
};
