// The agent's model calls on the Anthropic API (2026-11-02): agent/lib/anthropic-runtime.mjs turns the Converse-shaped
// requests agent/lib/bedrock.mjs builds into Messages API calls, and the answers back into Converse events. Against a
// local stand-in for /v1/messages (no key, no network): what goes out, what comes back, how errors are classified, and
// (2026-11-03) what the 5.5 models refuse — temperature, a forced tool, edited thinking — never reaching them.
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
  if (mode === "loop" && body.stream) {
    const last = body.messages.at(-1);
    if (last?.content?.some?.((c) => c.type === "tool_result")) return sse(res, [
      { type: "message_start", message: { usage: { input_tokens: 50, output_tokens: 1 } } },
      { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
      { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Tracking is not enabled." } },
      { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 6 } },
    ]);
    return sse(res, [
      { type: "message_start", message: { usage: { input_tokens: 40, output_tokens: 1 } } },
      { type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "", signature: "" } },
      { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "Check the tracker." } },
      { type: "content_block_delta", index: 0, delta: { type: "signature_delta", signature: "sig-rig-abc" } },
      { type: "content_block_start", index: 1, content_block: { type: "redacted_thinking", data: "redacted-rig" } },
      { type: "content_block_start", index: 2, content_block: { type: "tool_use", id: "toolu_loop1", name: "get_flight_tracking", input: {} } },
      { type: "content_block_delta", index: 2, delta: { type: "input_json_delta", partial_json: "{\"callsign\":\"RIG1\"}" } },
      { type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { output_tokens: 20 } },
    ]);
  }
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
  ok(sent.body.model === "claude-sonnet-5" && sent.body.max_tokens === 8192 && sent.body.temperature === undefined && sent.body.stream === true, "model, max tokens and streaming carried over; temperature left out (Sonnet 5 refuses it)");
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

  // 4. the 5.5 generation (2026-11-03): what each model refuses, measured on the production key, never reaches it
  const t55 = toMessagesRequest({ modelId: "claude-sonnet-5-5", messages: [{ role: "user", content: [{ text: "x" }] }], inferenceConfig: { maxTokens: 64, temperature: 0 }, additionalModelRequestFields: { thinking: { type: "adaptive", display: "summarized" }, output_config: { effort: "medium" } } }, { stream: false });
  ok(t55.temperature === undefined && t55.thinking?.type === "adaptive" && t55.output_config?.effort === "medium", "Sonnet 5.5: temperature left out (the API refuses it); the tier's thinking and effort sent");
  ok(toMessagesRequest({ modelId: "claude-haiku-5-5", messages: [], inferenceConfig: { temperature: 0 } }, { stream: false }).temperature === undefined && toMessagesRequest({ modelId: "claude-sonnet-5", messages: [], inferenceConfig: { temperature: 0 } }, { stream: false }).temperature === undefined && toMessagesRequest({ modelId: "claude-sonnet-4-6", messages: [], inferenceConfig: { temperature: 0 } }, { stream: false }).temperature === 0 && toMessagesRequest({ modelId: "claude-haiku-4-5-20251001", messages: [], inferenceConfig: { temperature: 0 } }, { stream: false }).temperature === 0 && toMessagesRequest({ modelId: "claude-future-9", messages: [], inferenceConfig: { temperature: 0 } }, { stream: false }).temperature === undefined, "temperature only to the models that take it: not Haiku 5.5, not Sonnet 5 (a fallback), not an unknown model; still Sonnet 4.6 and Haiku 4.5");
  let refused = null; const before = seen.length;
  try { await anthropicRuntime.send(new ConverseCommand({ modelId: "claude-opus-5-5", messages: [{ role: "user", content: [{ text: "x" }] }], toolConfig: { tools: input.toolConfig.tools, toolChoice: { tool: { name: "get_flights" } } } }), {}); } catch (e) { refused = e; }
  ok(refused && seen.length === before, "Opus 5.5 with a forced tool: refused here, before any request (never silently turned into a free choice)", refused?.message?.slice(0, 80));
  const back = toMessagesRequest({ modelId: "claude-opus-5-5", messages: [{ role: "assistant", content: [{ reasoningContent: { reasoningText: { text: "", signature: "sig-x" } } }, { reasoningContent: { redactedContent: "red-x" } }, { toolUse: { toolUseId: "t1", name: "get_flights", input: {} } }] }] }, { stream: false }).messages[0].content;
  ok(back[0]?.type === "thinking" && back[0].thinking === "" && back[0].signature === "sig-x" && back[1]?.type === "redacted_thinking" && back[1].data === "red-x" && back[2]?.type === "tool_use", "thinking and redacted thinking go back as they came, in order, empty text kept");

  // 5. a whole tool round on the tier's model: thinking comes back unmodified with the tool result; a pinned tool is
  //    written by the agent, not forced on the model
  mode = "loop";
  const { streamConversationWithTools } = await import("../agent/lib/bedrock.mjs");
  const user = { userId: "00000000-0000-4000-8000-0000000000aa", email: "rig-runtime@rig.invalid", agentRole: "user" };
  const drain = async (gen) => { const evs = []; for await (const e of gen) evs.push(e); return evs; };
  const from = seen.length;
  const evs = await drain(streamConversationWithTools({ tier: "standard", system: "rig", messages: [{ role: "user", content: "Where is RIG1?" }], user, conversationId: null }));
  const reqs = seen.slice(from).map((x) => x.body), r2 = reqs[1];
  const echoed = r2?.messages?.find((m) => m.role === "assistant")?.content ?? [];
  ok(reqs[0]?.model === "claude-sonnet-5-5" && reqs[0].temperature === undefined && reqs[0].thinking?.type === "adaptive" && reqs[0].output_config?.effort === "medium", "the standard tier runs Sonnet 5.5 with its thinking and effort, no temperature", reqs[0]?.model);
  ok(echoed[0]?.type === "thinking" && echoed[0].thinking === "Check the tracker." && echoed[0].signature === "sig-rig-abc" && echoed[1]?.type === "redacted_thinking" && echoed[1].data === "redacted-rig" && echoed[2]?.type === "tool_use" && echoed[2].input?.callsign === "RIG1", "round 2 carries round 1's thinking unmodified (text, signature, redacted block), then the tool call", JSON.stringify(echoed.map((c) => c.type)));
  const done = evs.find((e) => e.type === "done"), thought = evs.find((e) => e.type === "thought");
  ok(done?.stopReason === "end_turn" && evs.some((e) => e.type === "tool" && e.name === "get_flight_tracking") && thought?.text === "Check the tracker.", "the turn ends on the answer; the thinking summary is shown as the thought between tool calls, not in the reply");
  const from2 = seen.length;
  await drain(streamConversationWithTools({ tier: "reasoning", system: "rig", messages: [{ role: "user", content: "pinned" }], user, conversationId: null, pinTool: { name: "get_flight_tracking", input: { callsign: "PIN1" } } }));
  const p1 = seen.slice(from2).map((x) => x.body)[0];
  const pinned = p1?.messages?.find((m) => m.role === "assistant")?.content?.[0];
  ok(p1?.model === "claude-opus-5-5" && !p1.tool_choice && pinned?.type === "tool_use" && pinned.name === "get_flight_tracking" && pinned.input?.callsign === "PIN1" && p1.messages.at(-1).content[0]?.type === "tool_result", "a pinned tool on Opus 5.5: the agent writes the call with the pinned input, the model's first request already holds its result, no forced tool_choice", p1?.model);
  mode = "ok";
} finally { server.close(); }
console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
