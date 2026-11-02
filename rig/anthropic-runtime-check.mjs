// The agent's model calls on the Anthropic API (2026-11-02): agent/lib/anthropic-runtime.mjs turns the Converse-shaped
// requests agent/lib/bedrock.mjs builds into Messages API calls, and the answers back into Converse events. Against a
// local stand-in for /v1/messages (no key, no network): what goes out, what comes back, how errors are classified.
//   node rig/anthropic-runtime-check.mjs
import http from "node:http";
let failures = 0; const ok = (c, what, d = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${what}${d ? `  · ${String(d).slice(0, 200)}` : ""}`); if (!c) failures += 1; };

const seen = []; let mode = "ok";
const sse = (res, events) => { res.writeHead(200, { "content-type": "text/event-stream" }); for (const e of events) res.write(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`); res.end(); };
const server = http.createServer(async (req, res) => {
  let b = ""; for await (const c of req) b += c; const body = JSON.parse(b || "{}"); seen.push({ headers: req.headers, body });
  if (mode === "404") { res.writeHead(404, { "content-type": "application/json" }); return res.end(JSON.stringify({ type: "error", error: { type: "not_found_error", message: "model: claude-nope" } })); }
  if (mode === "429") { res.writeHead(429, { "content-type": "application/json" }); return res.end(JSON.stringify({ type: "error", error: { type: "rate_limit_error", message: "slow down" } })); }
  if (mode === "529") { res.writeHead(529, { "content-type": "application/json" }); return res.end(JSON.stringify({ type: "error", error: { type: "overloaded_error", message: "overloaded" } })); }
  if (!body.stream) { res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify({ content: [{ type: "text", text: "OK" }], stop_reason: "end_turn", usage: { input_tokens: 11, output_tokens: 2 } })); }
  sse(res, [
    { type: "message_start", message: { usage: { input_tokens: 120, output_tokens: 1, cache_read_input_tokens: 900, cache_creation_input_tokens: 0 } } },
    { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
    { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Checking " } },
    { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "the wall." } },
    { type: "content_block_stop", index: 0 },
    { type: "content_block_start", index: 1, content_block: { type: "tool_use", id: "toolu_rig1", name: "get_flights", input: {} } },
    { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: "{\"icao\":" } },
    { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: "\"EVRA\"}" } },
    { type: "content_block_stop", index: 1 },
    { type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { output_tokens: 42 } },
    { type: "message_stop" },
  ]);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${server.address().port}`;
process.env.ANTHROPIC_API_KEY = "rig-anthropic-stand-in";   // not a key: the stand-in accepts anything
const { anthropicRuntime, toMessagesRequest } = await import("../agent/lib/anthropic-runtime.mjs");
const { ConverseStreamCommand, ConverseCommand } = await import("@aws-sdk/client-bedrock-runtime");
const { classifyBedrockError } = await import("../agent/lib/errors.mjs");

try {
  // 1. a streamed turn with tools, cache points, a forced tool, an image, a PDF and an earlier tool result
  const input = {
    modelId: "claude-sonnet-5",
    system: [{ text: "You are the dispatcher's agent." }, { cachePoint: { type: "default" } }],
    messages: [
      { role: "user", content: [{ text: "Flights at EVRA?" }, { image: { format: "jpg", source: { bytes: Buffer.from("img") } } }, { document: { format: "pdf", name: "AIP EVRA", source: { bytes: Buffer.from("%PDF") }, citations: { enabled: true } } }] },
      { role: "assistant", content: [{ toolUse: { toolUseId: "toolu_0", name: "get_time", input: {} } }] },
      { role: "user", content: [{ toolResult: { toolUseId: "toolu_0", content: [{ json: { utc: "12:00Z" } }], status: "error" } }] },
    ],
    inferenceConfig: { maxTokens: 8192, temperature: 0.2 },
    toolConfig: { tools: [{ toolSpec: { name: "get_flights", description: "Flights", inputSchema: { json: { type: "object", properties: { icao: { type: "string" } } } } } }, { cachePoint: { type: "default" } }], toolChoice: { tool: { name: "get_flights" } } },
  };
  const out = await anthropicRuntime.send(new ConverseStreamCommand(input), {});
  const events = []; for await (const e of out.stream) events.push(e);
  const sent = seen.at(-1);
  ok(sent.headers["x-api-key"] === "rig-anthropic-stand-in" && sent.headers["anthropic-version"] === "2023-06-01", "the key goes in the x-api-key header, with the API version");
  ok(sent.body.model === "claude-sonnet-5" && sent.body.max_tokens === 8192 && sent.body.temperature === 0.2 && sent.body.stream === true, "model, max tokens, temperature and streaming carried over");
  ok(sent.body.system?.[0]?.cache_control?.type === "ephemeral", "the system prompt's cache point becomes cache_control on it");
  ok(sent.body.tools?.[0]?.input_schema?.properties?.icao && sent.body.tools[0].cache_control?.type === "ephemeral", "tools: the schema carried over, the cache point on the last tool");
  ok(sent.body.tool_choice?.type === "tool" && sent.body.tool_choice.name === "get_flights", "a pinned tool (/blank-manifest) becomes tool_choice");
  const u0 = sent.body.messages[0].content;
  ok(u0[1]?.type === "image" && u0[1].source.media_type === "image/jpeg" && u0[1].source.data === Buffer.from("img").toString("base64"), "an image block: base64, jpg read as image/jpeg");
  ok(u0[2]?.type === "document" && u0[2].source.media_type === "application/pdf" && u0[2].title === "AIP EVRA" && u0[2].citations?.enabled === true, "a PDF block: base64 document with its title and citations");
  ok(sent.body.messages[1].content[0]?.type === "tool_use" && sent.body.messages[2].content[0]?.type === "tool_result" && sent.body.messages[2].content[0].is_error === true, "an earlier tool call and its error result carried over");
  const text = events.filter((e) => e.contentBlockDelta?.delta?.text).map((e) => e.contentBlockDelta.delta.text).join("");
  const tool = events.find((e) => e.contentBlockStart?.start?.toolUse)?.contentBlockStart;
  const toolJson = events.filter((e) => e.contentBlockDelta?.delta?.toolUse).map((e) => e.contentBlockDelta.delta.toolUse.input).join("");
  ok(text === "Checking the wall.", "streamed text comes back as Converse text deltas", text);
  ok(tool?.start?.toolUse?.toolUseId === "toolu_rig1" && tool.start.toolUse.name === "get_flights" && tool.contentBlockIndex === 1 && JSON.parse(toolJson).icao === "EVRA", "a tool call comes back as Converse tool-use start and input deltas", toolJson);
  const stop = events.find((e) => e.messageStop)?.messageStop?.stopReason, usage = events.find((e) => e.metadata)?.metadata?.usage;
  ok(stop === "tool_use" && usage?.inputTokens === 120 && usage.outputTokens === 42 && usage.cacheReadInputTokens === 900, "stop reason, and usage with the cache reads counted apart", JSON.stringify(usage));
  // 2. a single call (the router, extraction, the health probe)
  const once = await anthropicRuntime.send(new ConverseCommand({ modelId: "claude-haiku-4-5-20251001", messages: [{ role: "user", content: [{ text: "Say OK" }] }], inferenceConfig: { maxTokens: 16 } }), {});
  ok(once.output.message.content[0].text === "OK" && once.stopReason === "end_turn" && once.usage.inputTokens === 11 && seen.at(-1).body.stream === undefined, "a single call: text, stop reason, usage; no streaming asked");
  // 3. errors land where the agent already handles them
  for (const [m, want, what] of [["404", "model_unavailable", "a model the account lacks → unavailable (the next fallback is tried)"], ["429", "model_throttled", "rate limited → throttled (said, not hidden behind another model)"], ["529", "model_throttled", "overloaded → throttled"]]) {
    mode = m; let code = null;
    try { await anthropicRuntime.send(new ConverseCommand({ modelId: "claude-nope", messages: [{ role: "user", content: [{ text: "x" }] }] }), {}); } catch (e) { code = classifyBedrockError(e).code; }
    ok(code === want, what, code);
  }
  mode = "ok";
  const saved = process.env.ANTHROPIC_API_KEY; delete process.env.ANTHROPIC_API_KEY; let code = null;
  try { await anthropicRuntime.send(new ConverseCommand({ modelId: "claude-sonnet-5", messages: [{ role: "user", content: [{ text: "x" }] }] }), {}); } catch (e) { code = classifyBedrockError(e).code; }
  ok(code === "model_unavailable", "no key in this service's environment → unavailable, and no request is made", code);
  process.env.ANTHROPIC_API_KEY = saved;
  ok(toMessagesRequest({ modelId: "m", messages: [{ role: "user", content: [{ text: "" }, { text: "hi" }] }] }, { stream: false }).messages[0].content.length === 1, "empty text blocks are dropped (the API refuses them)");
} finally { server.close(); }
console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
