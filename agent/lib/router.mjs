// Tier routing: which model should answer this turn.
//
// Built LAST on purpose. Routing chosen before usage data exists is guesswork,
// and the measurement that justifies each piece of this is in the status file.
//
// Two rules shape everything here:
//
//  1. THE ROUTER NEVER ANSWERS THE USER. It emits a tier and a reason, nothing
//     else. A cheap classifier that is allowed to answer will eventually answer
//     something it should have escalated, and nobody will notice because the
//     reply looks fine.
//  2. ESCALATION IS ONE-WAY. Standard may escalate to reasoning; nothing ever
//     silently downgrades a turn to a cheaper model mid-flight. A wrong
//     escalation costs money. A wrong downgrade costs a right answer, and does
//     it invisibly.
//
// Three tiers since 2026-09-25 (operator decision): the router reads every
// request and picks fast, standard or reasoning by task. The deterministic
// floor still applies — anything that can change data never runs on fast — and
// the reasoning tier can be switched off in Agent settings ("High-knowledge
// model"), which puts the router back to fast/standard.
//
// Failure is not a stall: if the router is unavailable, slow or incoherent, the
// turn runs on `standard`. Falling back to the default is the safe direction —
// falling back to `fast` would let an outage quietly degrade every answer.

import { converseOnce } from "./bedrock.mjs";

export const TIERS_BY_COST = ["fast", "standard", "reasoning"];

const CLASSIFIER = `You route a flight dispatcher's request to one of three models. You never answer the request.

Reply with exactly one line: the tier, a space, and your confidence from 0.0 to 1.0.
Example replies: "fast 0.9", "standard 0.7", "reasoning 0.8".

fast — a direct lookup or a simple list; one source, no judgement. Most everyday questions are fast:
  "what's the METAR for EVRA" · "show today's flights" · "flights for ABC tomorrow" · "is the wall up" ·
  "list the limitations for EVRA" · "where is YL-ABC" · "open the AD 2 for LFPG" · "NOTAMs for EGLL" ·
  "what time is it in UTC" · "what does GEN 1.2 say about permits for Latvia" (one document, read out)

standard — a normal task that needs a few steps or some interpretation:
  combining two or three sources ("weather and NOTAMs for tomorrow's EVRA departures"),
  explaining what a rule MEANS for a flight, a single change to a record (add, edit, remove, show on the wall),
  a short briefing for one flight, drafting an email, comparing two things.

reasoning — heavy work where a wrong answer would mislead a dispatcher:
  a full briefing across many flights or airports, reconciling sources that disagree, changes to MANY records,
  legality or safety questions that must be argued, or the user explicitly asks for a careful or thorough answer.

Pick the lowest tier that will answer correctly. Confidence is how sure you are of the tier.`;

// Tools whose mere possibility should keep a turn off the cheap tier. Matched
// on the REQUEST, not the model's plan, because the point is to decide before
// any model has reasoned about it.
//
// This is a deterministic floor under a probabilistic classifier. Measured on
// the 69-query reference set, Nova Micro routed "Delete everything" and "Change
// the flight status of YL-ABC" to the cheapest model available. A classifier
// that is wrong 33% of the time in the dangerous direction cannot be the only
// thing standing between a destructive request and the weakest model.
const NOT_TRIVIAL = new RegExp(
  [
    // Imperative write requests, at the start of the request or after a polite lead-in.
    "^(please |pls |can you |could you |kindly )?(delete|remove|purge|destroy|undo|restore|revert|add|create|update|change|edit|set|disable|enable|hide|send|email|export|generate|mark|approve|reject|retire)\\b",
    "\\b(show|put|display|hide) .{0,40}\\bon the wall\\b",
    "^(удали|добав|измен|восстанов|отмени|отправ)",
  ].join("|"),
  "i",
);

/** Keep the classifier's answer inside the set it was asked for. */
/** "fast 0.9" → { tier: "fast", confidence: 0.9 }. Confidence null when the router gave none. */
export function parseRoute(text, allowReasoning) {
  const t = String(text ?? "").toLowerCase();
  const tier = parseTier(t, allowReasoning);
  const m = /([01](?:\.\d+)?|\.\d+)/.exec(t.replace(tier ?? "", ""));
  const confidence = m ? Math.max(0, Math.min(1, Number(m[1]))) : null;
  return { tier, confidence };
}

function parseTier(text, allowReasoning) {
  // Part 10 measured that a classifier allowed to reach for reasoning made
  // routing 43% dearer than flat Sonnet on the 69-query reference set. The
  // operator chose the three-way router anyway (2026-09-25) with a tighter
  // definition of "reasoning" and a settings switch to turn it back off.
  const word = String(text ?? "").toLowerCase().match(allowReasoning ? /reasoning|standard|fast/ : /standard|fast/);
  return word ? word[0] : null;
}

/**
 * Choose a tier for one turn.
 *
 * Returns the decision AND why, because both go in the audit log: "which model
 * answered" is not reviewable without "and what made us pick it".
 */
export async function routeTurn({ question, hasHistory = false, allowReasoning = true, lowConfidenceBelow = 0.6 }) {
  const started = Date.now();

  const text = String(question ?? "").trim();
  if (!text) return decision("standard", "empty question", "skipped", started);

  // The deterministic floor: a request that can change data never runs on the
  // cheap tier. With the three-way router it no longer short-circuits — the
  // router still decides between standard and reasoning for such turns; only
  // "fast" is ruled out. (When reasoning is switched off, the floor's answer is
  // the only possible one and the ~1.1 s router call is skipped as before.)
  const notReadOnly = NOT_TRIVIAL.test(text);
  if (notReadOnly && !allowReasoning) {
    return decision("standard", "not read-only; the cheap tier is not eligible", "floor", started);
  }

  try {
    const result = await converseOnce({
      tier: "router",
      system: CLASSIFIER,
      messages: [{ role: "user", content: `${hasHistory ? "[continuing a conversation] " : ""}${text.slice(0, 2000)}` }],
      maxTokens: 12,
      temperature: 0,
    });
    const { tier, confidence } = parseRoute(result?.text, allowReasoning);
    if (!tier) return decision("standard", `router returned "${String(result?.text ?? "").slice(0, 40)}"`, "unparsed", started);
    let chosen = tier; let reason = tier === "reasoning" ? "classified by router as heavy" : "classified by router"; let source = "router";
    // Low confidence: go one step up (never down) rather than trust a guess.
    if (confidence != null && confidence < lowConfidenceBelow && allowReasoning !== false) {
      const up = { fast: "standard", standard: "reasoning", reasoning: "reasoning" }[tier];
      if (up !== tier) { chosen = up; reason = `router said ${tier} with low confidence ${confidence}`; source = "low-confidence"; }
    }
    if (chosen === "fast" && notReadOnly) { chosen = "standard"; reason = "router said fast, but the request asks for a change"; source = "floor"; }
    return { ...decision(chosen, reason, source, started, result?.modelId), routerTier: tier, confidence };
  } catch (error) {
    // An outage must not change what the dispatcher gets, only what it costs.
    return decision("standard", `router unavailable: ${String(error?.message ?? error).slice(0, 80)}`, "fallback", started);
  }
}

function decision(tier, reason, source, started, modelId = null) {
  return { tier, reason, source, routerModelId: modelId, routerLatencyMs: Date.now() - started };
}

/**
 * Apply an escalation, refusing any move down.
 *
 * Enforced here rather than trusted to the caller: "escalation is one-way" is
 * the kind of rule that holds until one call site passes a lower tier by
 * accident, and a silent downgrade is invisible in the output.
 */
export function escalate(fromTier, toTier) {
  const from = TIERS_BY_COST.indexOf(fromTier);
  const to = TIERS_BY_COST.indexOf(toTier);
  if (from === -1 || to === -1) return { tier: fromTier, applied: false, reason: "unknown tier" };
  if (to <= from) return { tier: fromTier, applied: false, reason: "downgrades are not permitted" };
  return { tier: toTier, applied: true, reason: `escalated ${fromTier} -> ${toTier}` };
}
