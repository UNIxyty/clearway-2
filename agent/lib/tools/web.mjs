// Web search (rebuilt 2026-11-03; one provider since 2026-11-05).
//
// THE RULE THIS FILE EXISTS TO ENFORCE: web content is never Clearway's approved operational guidance, and a claim
// from outside the approved sources is marked on the claim, not on the answer.
//
// The provider is the Anthropic API's own web search: a server tool the model calls inside its response
// (agent/lib/bedrock.mjs adds it; lib/web-sources.mjs › anthropicWebTool). Its citations come back as
// web_search_result_location. Tavily was removed on 2026-11-05 (Dmitry's decision, after the side-by-side), and with it
// the provider switch: there is nothing left to choose. The steps line still names the search that ran.
//
// Two passes, one per turn: pass one searches only the approved sources (official + industry, web:sources). Only when
// that found nothing useful for a part of the question does the model call widen_web_search, and from then on, in this
// turn, the search is unrestricted. Every cited source is classed by its domain; the console marks a claim resting only
// on an unapproved one.

import { defineTool } from "./framework.mjs";
import { InvalidInput } from "./errors.mjs";

defineTool({
  name: "widen_web_search",
  description:
    "Pass two of web search. Call ONLY after searching the approved sources found nothing useful for a part of the question; say which part. From then on in this turn, web_search is unrestricted. Claims from outside the approved sources are marked in the console.",
  permission: "user",
  sourceTier: "web",
  noSource: true,
  sourceLabel: () => "Web · widened",
  timeoutMs: 5_000,
  input: {
    type: "object",
    required: ["reason"],
    additionalProperties: false,
    properties: { reason: { type: "string", minLength: 3, maxLength: 300, description: "Which part of the question the approved sources did not answer." } },
  },
  output: { type: "object", required: ["widened"], properties: { widened: { type: "boolean" }, note: { type: "string" } } },
  async handler({ reason }, { turn }) {
    // approved sources first: a turn that has not searched them yet may not widen (pass one is the rule, not a suggestion)
    if (turn && !turn.searches.some((x) => x.pass === 1)) throw InvalidInput("Search the approved sources first (web_search), then widen only if they had nothing.");
    if (turn) { turn.widened = true; turn.widenedFor = String(reason).slice(0, 300); }
    return { widened: true, note: "Widened: the next searches are unrestricted. Cite each claim; a claim from outside the approved sources is marked in the console. Name the site and its date in the sentence." };
  },
});

// ── Flight tracking ────────────────────────────────────────────────────────
//
// The tool is DECLARED but refuses until a provider is configured. The brief
// says to confirm the plan and cost before wiring one, and choosing a paid
// aviation-data subscription on someone's behalf is not a technical decision.
// Declaring it now means the interface, the audit trail and the source tier are
// already in place, and enabling it later is configuration rather than a build.

defineTool({
  name: "get_flight_tracking",
  description:
    "Live position and status for an aircraft by callsign, from an external flight-tracking service. Use only when asked where an aircraft actually is right now — the wall's own schedule (get_flight, search_flights) is the source for planned times, and is authoritative for our own flights.",
  permission: "user",
  sourceTier: "web",
  sourceLabel: (input) => `Web · flight tracking · ${String(input.callsign).toUpperCase()}`,
  timeoutMs: 25_000,
  input: {
    type: "object",
    required: ["callsign"],
    additionalProperties: false,
    properties: {
      callsign: { type: "string", minLength: 2, maxLength: 12, description: "Callsign or registration, e.g. BTI472 or YL-ABC." },
    },
  },
  output: {
    type: "object",
    required: ["callsign", "available"],
    properties: {
      callsign: { type: "string" },
      available: { type: "boolean" },
      provider: { type: ["string", "null"] },
      authoritative: { type: "boolean" },
      position: { type: ["object", "null"] },
      note: { type: ["string", "null"] },
    },
  },
  async handler({ callsign }) {
    const provider = String(process.env.FLIGHT_TRACKING_PROVIDER || "").trim();
    if (!provider) {
      // Not an error the user should chase — a capability that is not bought.
      return {
        callsign: String(callsign).toUpperCase(),
        available: false,
        provider: null,
        authoritative: false,
        note: "Live flight tracking is not enabled on this platform. Say so plainly, and use the wall's own schedule (get_flight / search_flights) for planned times. Do not estimate a position.",
      };
    }
    throw InvalidInput(
      `FLIGHT_TRACKING_PROVIDER is set to "${provider}" but no adapter is implemented for it. See docs/agent-build-status.md — the provider is chosen with the customer, not guessed.`
    );
  },
});
