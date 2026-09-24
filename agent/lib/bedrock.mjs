// Bedrock client. Streaming by default; tier in, tokens out. Knows nothing
// about who is asking — authorization happened before this is called.

import { BedrockRuntimeClient, ConverseStreamCommand, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { loadModelConfig, modelCandidates, resolveTier } from "./models.mjs";
import { classifyBedrockError, ModelUnavailable } from "./errors.mjs";
import { executeTool, toolSpecsFor } from "./tools/index.mjs";

// A turn that keeps calling tools without producing an answer is a loop. The
// cap is on ROUNDS of tool use, not individual calls, so a model that fans out
// three lookups in one round is not punished for being efficient.
const MAX_TOOL_ROUNDS = Number(process.env.AGENT_MAX_TOOL_ROUNDS || 6);

const DEFAULT_TIMEOUT_MS = Number(process.env.AGENT_MODEL_TIMEOUT_MS || 120_000);

let client = null;
function runtime() {
  if (!client) client = new BedrockRuntimeClient({ region: loadModelConfig().region });
  return client;
}

function toBedrockMessages(messages) {
  return messages.map((m) => {
    // Messages already in Bedrock content-block form (tool use / tool results
    // from an earlier round of THIS turn) pass through untouched.
    if (Array.isArray(m.content)) return { role: m.role === "assistant" ? "assistant" : "user", content: m.content };
    return { role: m.role === "assistant" ? "assistant" : "user", content: [{ text: String(m.content ?? "") }] };
  });
}

function inferenceConfig(tierConfig, overrides = {}) {
  return {
    maxTokens: overrides.maxTokens ?? tierConfig.maxTokens ?? 4096,
    ...(overrides.temperature != null ? { temperature: overrides.temperature } : {}),
  };
}

/**
 * Stream a conversation. Yields { type: "delta", text } chunks, then a final
 * { type: "done", ... } with usage and the model actually used.
 *
 * Model fallback: when the primary id is UNAVAILABLE (not throttled, not timed
 * out) the next candidate is tried. Throttling and timeouts are surfaced to the
 * caller instead — silently retrying them on a different model would hide load
 * problems and change which model answered without anyone knowing.
 */
export async function* streamConversation({ tier = "standard", system, messages, ...overrides }) {
  const { requested, effective, config } = resolveTier(tier);
  const candidates = modelCandidates(tier);
  if (candidates.length === 0) {
    throw ModelUnavailable(`No model is configured for tier "${effective}".`);
  }

  let lastUnavailable = null;
  for (const modelId of candidates) {
    const startedAt = Date.now();
    try {
      const response = await runtime().send(
        new ConverseStreamCommand({
          modelId,
          ...(system ? { system: [{ text: system }] } : {}),
          messages: toBedrockMessages(messages),
          inferenceConfig: inferenceConfig(config, overrides),
        }),
        { abortSignal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS) }
      );

      let usage = null;
      let stopReason = null;
      let text = "";
      for await (const event of response.stream ?? []) {
        if (event.contentBlockDelta?.delta?.text) {
          const chunk = event.contentBlockDelta.delta.text;
          text += chunk;
          yield { type: "delta", text: chunk };
        }
        if (event.messageStop?.stopReason) stopReason = event.messageStop.stopReason;
        if (event.metadata?.usage) usage = event.metadata.usage;
      }
      yield {
        type: "done",
        modelId,
        requestedTier: requested,
        effectiveTier: effective,
        stopReason,
        text,
        latencyMs: Date.now() - startedAt,
        inputTokens: usage?.inputTokens ?? null,
        outputTokens: usage?.outputTokens ?? null,
      };
      return;
    } catch (error) {
      const classified = classifyBedrockError(error);
      // Only an unavailable model earns a second attempt on another id.
      if (classified.code === "model_unavailable" && modelId !== candidates[candidates.length - 1]) {
        lastUnavailable = classified;
        continue;
      }
      throw classified;
    }
  }
  throw lastUnavailable ?? ModelUnavailable("Every configured model for this tier is unavailable.");
}

/** Non-streaming single turn — used by the health check's live model probe. */
export async function converseOnce({ tier = "standard", system, messages, ...overrides }) {
  const { requested, effective, config } = resolveTier(tier);
  const candidates = modelCandidates(tier);
  if (candidates.length === 0) throw ModelUnavailable(`No model is configured for tier "${effective}".`);

  let lastUnavailable = null;
  for (const modelId of candidates) {
    const startedAt = Date.now();
    try {
      const res = await runtime().send(
        new ConverseCommand({
          modelId,
          ...(system ? { system: [{ text: system }] } : {}),
          messages: toBedrockMessages(messages),
          inferenceConfig: inferenceConfig(config, overrides),
        }),
        { abortSignal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS) }
      );
      return {
        text: (res.output?.message?.content ?? []).map((c) => c.text ?? "").join(""),
        modelId,
        requestedTier: requested,
        effectiveTier: effective,
        stopReason: res.stopReason ?? null,
        latencyMs: Date.now() - startedAt,
        inputTokens: res.usage?.inputTokens ?? null,
        outputTokens: res.usage?.outputTokens ?? null,
      };
    } catch (error) {
      const classified = classifyBedrockError(error);
      if (classified.code === "model_unavailable" && modelId !== candidates[candidates.length - 1]) {
        lastUnavailable = classified;
        continue;
      }
      throw classified;
    }
  }
  throw lastUnavailable ?? ModelUnavailable("Every configured model for this tier is unavailable.");
}


/**
 * A full agentic turn: stream, run any tools the model selects, feed the
 * results back, repeat until it answers.
 *
 * Yields the same { type: "delta" } text chunks as streamConversation, plus
 * { type: "tool", ... } events so the caller can show what is being looked up.
 *
 * Two invariants, both enforced here rather than trusted to the model:
 *  - the tool list is scoped to THIS user (toolSpecsFor), so a tool the caller
 *    cannot use is never offered;
 *  - every tool result goes back through executeTool, which validates, audits
 *    and returns the standard error vocabulary. The model never gets to run
 *    anything the framework has not approved.
 */
export async function* streamConversationWithTools({ tier = "standard", system, messages, user, conversationId, inputMode = "text" }) {
  const { requested, effective, config } = resolveTier(tier);
  const candidates = modelCandidates(tier);
  if (candidates.length === 0) throw ModelUnavailable(`No model is configured for tier "${effective}".`);

  const toolSpecs = toolSpecsFor(user);
  const conversation = toBedrockMessages(messages);
  let usedModelId = null;
  let totalIn = 0;
  let totalOut = 0;
  let cacheRead = 0;
  let cacheWrite = 0;
  const toolCalls = [];

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round += 1) {
    const lastRound = round === MAX_TOOL_ROUNDS;
    let assistantBlocks = [];
    let stopReason = null;

    let lastUnavailable = null;
    let streamed = false;
    for (const modelId of candidates) {
      try {
        const response = await runtime().send(
          new ConverseStreamCommand({
            modelId,
            ...(system ? { system: withCachePoint([{ text: system }], modelId) } : {}),
            messages: conversation,
            inferenceConfig: inferenceConfig(config, {}),
            // On the final round the tools are withheld, which forces the model
            // to answer from what it already has instead of asking for more.
            ...(toolSpecs.length > 0 && !lastRound
              ? { toolConfig: { tools: withCachePoint(toolSpecs, modelId) } }
              : {}),
          }),
          { abortSignal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS) }
        );

        const blocks = new Map(); // index -> { type, text?, toolUse? }
        for await (const event of response.stream ?? []) {
          const idx = event.contentBlockStart?.contentBlockIndex ?? event.contentBlockDelta?.contentBlockIndex ?? 0;
          if (event.contentBlockStart?.start?.toolUse) {
            const { toolUseId, name } = event.contentBlockStart.start.toolUse;
            blocks.set(idx, { type: "toolUse", toolUseId, name, inputJson: "" });
          }
          if (event.contentBlockDelta?.delta?.text) {
            const chunk = event.contentBlockDelta.delta.text;
            const existing = blocks.get(idx) ?? { type: "text", text: "" };
            existing.text = (existing.text ?? "") + chunk;
            blocks.set(idx, existing);
            yield { type: "delta", text: chunk };
          }
          if (event.contentBlockDelta?.delta?.toolUse?.input != null) {
            const existing = blocks.get(idx);
            if (existing) existing.inputJson += event.contentBlockDelta.delta.toolUse.input;
          }
          if (event.messageStop?.stopReason) stopReason = event.messageStop.stopReason;
          if (event.metadata?.usage) {
            totalIn += event.metadata.usage.inputTokens ?? 0;
            totalOut += event.metadata.usage.outputTokens ?? 0;
            // Cache hits are billed differently from fresh input, so they are
            // counted separately. Folding them into inputTokens would make the
            // saving invisible in exactly the log used to prove it.
            cacheRead += event.metadata.usage.cacheReadInputTokens ?? 0;
            cacheWrite += event.metadata.usage.cacheWriteInputTokens ?? 0;
          }
        }

        assistantBlocks = [...blocks.values()].map((b) =>
          b.type === "toolUse"
            ? { toolUse: { toolUseId: b.toolUseId, name: b.name, input: safeJson(b.inputJson) } }
            : { text: b.text ?? "" }
        ).filter((b) => (b.text != null ? b.text.length > 0 : true));

        usedModelId = modelId;
        streamed = true;
        break;
      } catch (error) {
        const classified = classifyBedrockError(error);
        if (classified.code === "model_unavailable" && modelId !== candidates[candidates.length - 1]) {
          lastUnavailable = classified;
          continue;
        }
        throw classified;
      }
    }
    if (!streamed) throw lastUnavailable ?? ModelUnavailable("Every configured model for this tier is unavailable.");

    const requestedTools = assistantBlocks.filter((b) => b.toolUse).map((b) => b.toolUse);
    if (stopReason !== "tool_use" || requestedTools.length === 0) {
      yield {
        type: "done",
        modelId: usedModelId,
        requestedTier: requested,
        effectiveTier: effective,
        stopReason,
        inputTokens: totalIn,
        outputTokens: totalOut,
        cacheReadTokens: cacheRead,
        cacheWriteTokens: cacheWrite,
        toolCalls,
      };
      return;
    }

    conversation.push({ role: "assistant", content: assistantBlocks });

    // Tool calls in one round are independent, so they run together.
    const results = await Promise.all(
      requestedTools.map(async (call) => {
        const result = await executeTool({ name: call.name, input: call.input, user, conversationId, inputMode });
        return { call, result };
      })
    );

    const toolResultBlocks = [];
    for (const { call, result } of results) {
      toolCalls.push({ name: call.name, ok: result.ok !== false, error: result.ok === false ? result.error : null });
      yield { type: "tool", name: call.name, input: call.input, ok: result.ok !== false, error: result.ok === false ? result.error : null };
      toolResultBlocks.push({
        toolResult: {
          toolUseId: call.toolUseId,
          content: [{ json: result }],
          ...(result.ok === false ? { status: "error" } : {}),
        },
      });
    }
    conversation.push({ role: "user", content: toolResultBlocks });

    // One round left: tell the model so, rather than letting it discover the
    // cliff by having its next tool request silently ignored. Without this the
    // turn ends mid-sentence, which a dispatcher reads as the agent breaking.
    if (round === MAX_TOOL_ROUNDS - 1) {
      conversation.push({
        role: "user",
        content: [{ text: "You have no tool calls left for this turn. Answer now with what you already have, and say plainly what you could not check." }],
      });
    }
  }
}

/**
 * Mark the end of a block Bedrock may cache.
 *
 * Measured on this deployment's own audit log: input is 92% of spend, at a
 * median 18,000 input tokens against 188 output. Almost none of that is the
 * dispatcher's question — it is the system prompt and 43 tool definitions,
 * resent verbatim on every turn and on every tool round within a turn. Caching
 * that prefix is the largest single reduction available, and unlike routing it
 * needs no judgement about which model a question deserves.
 *
 * The cache point goes LAST, so everything before it is the cached prefix.
 * Ordering matters: anything appended after it is fresh input, which is why the
 * turn's messages are deliberately not cached — they change every turn, and a
 * cache point there would invalidate itself.
 *
 * Silently skipped for models that do not support it. A model that rejects the
 * block would fail the whole turn, and a cost optimisation must never be able
 * to take the agent down.
 */
function withCachePoint(blocks, modelId) {
  return supportsPromptCache(modelId) ? [...blocks, { cachePoint: { type: "default" } }] : blocks;
}

/**
 * Anthropic models on Bedrock support prompt caching; Nova's support differs by
 * model and the router's prompt is far too small to be worth caching anyway.
 * An allowlist rather than a denylist: a new model that turns out not to
 * support it then costs nothing extra instead of erroring on first use.
 */
function supportsPromptCache(modelId) {
  return /anthropic\.claude/.test(String(modelId ?? ""));
}

function safeJson(raw) {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    // A malformed tool input is the model's error to recover from; handing it
    // to the framework produces a clean INVALID_INPUT it can read and retry.
    return { __malformed: String(raw).slice(0, 500) };
  }
}
