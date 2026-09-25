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

const CLASSIFIER = `You classify a flight dispatcher's request for a routing system. You never answer the request.

Reply with ONE word, nothing else: fast, standard, or reasoning.

fast — ONLY a single factual lookup with one obvious source and no judgement:
       "what's the METAR for EVRA", "show today's flights", "is the wall up",
       "list the limitations", "where is YL-ABC".

standard — the normal case. Standard whenever the request:
       - changes, adds, deletes, restores or undoes ONE thing
       - is vague, incomplete, or you are not sure what it refers to
       - needs two sources, or a simple comparison between them
       - asks what something MEANS or what to worry about, not just what it says
       - involves one document, manual, AIP section, briefing or file

reasoning — ONLY when the task is genuinely heavy and a wrong answer would be
       costly. Examples:
       - a full briefing or report that must combine MANY sources (several
         airports, NOTAMs + weather + limitations + documents together)
       - reconciling conflicting sources, regulations or manuals and saying
         which applies and why
       - a change that touches MANY records, or a plan with several dependent
         steps
       - safety or legality questions where the answer must be argued, not
         looked up
       - the dispatcher explicitly asks for a thorough, careful or "think hard"
         answer

If you hesitate between fast and standard, answer standard. Reasoning is a
claim that the request is heavy; make that claim only when it plainly is.`;

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
    "delet", "remov", "purge", "destroy", "undo", "restore", "revert",
    "add ", "creat", "updat", "chang", "edit", "set ", "disable", "enable",
    "hide", "show .* on the wall", "send", "email", "export", "generate",
    "удали", "добав", "измен", "восстанов", "отмени", "отправ",
  ].join("|"),
  "i",
);

/** Keep the classifier's answer inside the set it was asked for. */
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
export async function routeTurn({ question, hasHistory = false, allowReasoning = true }) {
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
      maxTokens: 8,
      temperature: 0,
    });
    const tier = parseTier(result?.text, allowReasoning);
    if (!tier) return decision("standard", `router returned "${String(result?.text ?? "").slice(0, 40)}"`, "unparsed", started);
    if (tier === "fast" && notReadOnly) {
      return decision("standard", "router said fast, but the request is not read-only", "floor", started, result?.modelId);
    }
    return decision(tier, tier === "reasoning" ? "classified by router as heavy" : "classified by router", "router", started, result?.modelId);
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
