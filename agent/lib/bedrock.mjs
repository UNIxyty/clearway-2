// Bedrock client. Streaming by default; tier in, tokens out. Knows nothing
// about who is asking — authorization happened before this is called.

import { BedrockRuntimeClient, ConverseStreamCommand, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { loadModelConfig, modelCandidates, resolveTier } from "./models.mjs";
import { classifyBedrockError, ModelUnavailable } from "./errors.mjs";

const DEFAULT_TIMEOUT_MS = Number(process.env.AGENT_MODEL_TIMEOUT_MS || 120_000);

let client = null;
function runtime() {
  if (!client) client = new BedrockRuntimeClient({ region: loadModelConfig().region });
  return client;
}

function toBedrockMessages(messages) {
  return messages.map((m) => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: [{ text: String(m.content ?? "") }],
  }));
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
