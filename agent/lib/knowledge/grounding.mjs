// Bedrock Guardrails contextual grounding check.
//
// It verifies that a reply is actually supported by the passages retrieved —
// which is the difference between "the model wrote something plausible" and
// "this is in the source". In an ops tool that is the whole point.
//
// FAILURE POSTURE. If the check cannot run — no guardrail configured, no
// permission, Bedrock unreachable — the answer is NOT silently passed off as
// verified. It is returned with `verified: false` and a reason, the panel shows
// it as unverified, and the retrieval log records it. Claiming grounding that
// did not happen would be worse than having none, because it is invisible.

import { BedrockRuntimeClient, ApplyGuardrailCommand } from "@aws-sdk/client-bedrock-runtime";
import { loadModelConfig } from "../models.mjs";

const TIMEOUT_MS = 20_000;

let client = null;
function runtime() {
  if (!client) client = new BedrockRuntimeClient({ region: loadModelConfig().region });
  return client;
}

function guardrailId() {
  return String(process.env.BEDROCK_GUARDRAIL_ID || "").trim();
}
function guardrailVersion() {
  return String(process.env.BEDROCK_GUARDRAIL_VERSION || "DRAFT").trim();
}
export function groundingConfigured() {
  return Boolean(guardrailId());
}

/**
 * Check `answer` against the `sources` it claims to rest on.
 *
 * Returns { verified, ran, action, scores, reason }.
 *   verified — the guardrail ran AND did not intervene
 *   ran      — whether a check actually happened at all
 */
export async function checkGrounding({ query, answer, sources }) {
  if (!groundingConfigured()) {
    return { verified: false, ran: false, action: null, reason: "No BEDROCK_GUARDRAIL_ID configured — grounding was not checked." };
  }
  if (!answer || !answer.trim()) {
    return { verified: false, ran: false, action: null, reason: "Nothing to check." };
  }
  const grounding = (sources ?? []).map((s) => String(s.text ?? "")).filter(Boolean).join("\n\n").slice(0, 40_000);
  if (!grounding) {
    return { verified: false, ran: false, action: null, reason: "No retrieved source text to check the answer against." };
  }

  try {
    const response = await runtime().send(
      new ApplyGuardrailCommand({
        guardrailIdentifier: guardrailId(),
        guardrailVersion: guardrailVersion(),
        source: "OUTPUT",
        content: [
          { text: { text: grounding, qualifiers: ["grounding_source"] } },
          { text: { text: String(query ?? ""), qualifiers: ["query"] } },
          { text: { text: answer } },
        ],
      }),
      { abortSignal: AbortSignal.timeout(TIMEOUT_MS) }
    );

    const action = response.action ?? "NONE";
    const filters = (response.assessments ?? []).flatMap((a) => a.contextualGroundingPolicy?.filters ?? []);
    const scores = filters.map((f) => ({ type: f.type, score: f.score, threshold: f.threshold, detected: f.detected === true }));
    const intervened = action === "GUARDRAIL_INTERVENED" || scores.some((s) => s.detected);

    return {
      verified: !intervened,
      ran: true,
      action,
      scores,
      reason: intervened
        ? `Guardrail intervened: ${scores.filter((s) => s.detected).map((s) => `${s.type} ${s.score?.toFixed?.(2) ?? "?"} < ${s.threshold}`).join(", ") || action}`
        : null,
    };
  } catch (error) {
    // Deliberately not thrown: an unavailable check must degrade to "not
    // verified", not to a failed answer.
    return { verified: false, ran: false, action: null, reason: `Grounding check could not run: ${error.name}: ${String(error.message).slice(0, 160)}` };
  }
}
