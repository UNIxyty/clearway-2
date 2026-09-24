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
// Failure is not a stall: if the router is unavailable, slow or incoherent, the
// turn runs on `standard`. Falling back to the default is the safe direction —
// falling back to `fast` would let an outage quietly degrade every answer.

import { converseOnce } from "./bedrock.mjs";

export const TIERS_BY_COST = ["fast", "standard", "reasoning"];

const CLASSIFIER = `You classify a flight dispatcher's request for a routing system. You never answer the request.

Reply with ONE word, nothing else: fast, or standard.

fast — ONLY a single factual lookup with one obvious source and no judgement:
       "what's the METAR for EVRA", "show today's flights", "is the wall up",
       "list the limitations", "where is YL-ABC".

standard — EVERYTHING ELSE. In particular, standard whenever the request:
       - changes, adds, deletes, restores or undoes anything
       - is vague, incomplete, or you are not sure what it refers to
       - needs more than one source, or comparison between sources
       - asks what something MEANS or what to worry about, not just what it says
       - involves documents, manuals, AIP text, briefings or files

If you hesitate at all, answer standard. Answering "fast" is a claim that the
request is trivial; make that claim only when it plainly is.`;

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
function parseTier(text) {
  // "reasoning" is deliberately NOT parseable here. The brief puts Opus on
  // escalation only, and the economics agree: at this deployment's median
  // 18,000-token input, one reasoning route costs what seven fast routes save.
  // A classifier allowed to reach for it would erase the saving by being
  // generous.
  const word = String(text ?? "").toLowerCase().match(/fast|standard/);
  return word ? word[0] : null;
}

/**
 * Choose a tier for one turn.
 *
 * Returns the decision AND why, because both go in the audit log: "which model
 * answered" is not reviewable without "and what made us pick it".
 */
export async function routeTurn({ question, hasHistory = false }) {
  const started = Date.now();

  const text = String(question ?? "").trim();
  if (!text) return decision("standard", "empty question", "skipped", started);

  // Skip the router entirely when the answer is already determined.
  //
  // The router's ONLY job is to confirm that a request is trivial enough for
  // the cheap tier. If the deterministic floor already rules that out, calling
  // it can change nothing — and the call is not free: measured at ~1.1s p50, it
  // is a tax on EVERY turn, paid to reach a conclusion already in hand. Skipping
  // it here removes both the latency and the router's own cost on the turns it
  // could never have helped.
  if (NOT_TRIVIAL.test(text)) {
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
    const tier = parseTier(result?.text);
    if (!tier) return decision("standard", `router returned "${String(result?.text ?? "").slice(0, 40)}"`, "unparsed", started);
    if (tier === "fast" && NOT_TRIVIAL.test(text)) {
      return decision("standard", "router said fast, but the request is not read-only", "floor", started, result?.modelId);
    }
    return decision(tier, "classified by router", "router", started, result?.modelId);
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
