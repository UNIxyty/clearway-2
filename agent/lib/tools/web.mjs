// Web search (rebuilt 2026-11-03: two providers, two passes, citations from the API).
//
// THE RULE THIS FILE EXISTS TO ENFORCE: web content is never Clearway's approved operational guidance, and a claim
// from outside the approved sources is marked on the claim, not on the answer.
//
// Providers (Settings › Web search, agent_settings web:provider — lib/web-sources.mjs): "both" (the default), the
// Anthropic API's own web search (a server tool the model calls inside its response; agent/lib/bedrock.mjs adds it), or
// Tavily (tavily_search below). Both return citations: Anthropic's as web_search_result_location, Tavily's because its
// results go back to the model as search_result blocks (search_result_location).
//
// Two passes, one per turn: pass one searches only the approved sources (official + industry, web:sources). Only when
// that found nothing useful for a part of the question does the model call widen_web_search, and from then on, in this
// turn, both providers search unrestricted. Every cited source is classed by its domain; the console marks a claim
// resting only on an unapproved one.

import { defineTool, S } from "./framework.mjs";
import { ServiceUnavailable, InvalidInput } from "./errors.mjs";
import { webSettings, approvedDomains, classifyUrl, hostOf } from "../web-sources.mjs";
import { checkCeiling, recordExtraUsd } from "../spend.mjs";

const TIMEOUT_MS = 20_000;
// Tavily's basic search is one credit; at the pay-as-you-go rate that is $0.008. Counted against the daily ceiling so a
// loop of searches stops like a loop of model calls does.
const TAVILY_USD_PER_SEARCH = 0.008;

function braveKey() { return String(process.env.BRAVE_SEARCH_API_KEY || "").trim(); }
function tavilyKey() { return String(process.env.TAVILY_API_KEY || "").trim(); }
const tavilyBase = () => String(process.env.TAVILY_BASE_URL || "https://api.tavily.com").replace(/\/+$/, "");

export function webSearchProvider() {
  if (braveKey()) return "brave";
  if (tavilyKey()) return "tavily";
  return null;
}

async function braveSearch(query, { count, domains }) {
  // Brave takes site: filters inline; more than a handful makes the query unusable, so the list is trimmed.
  const scoped = domains?.length ? `${query} (${domains.slice(0, 8).map((d) => `site:${d}`).join(" OR ")})` : query;
  const response = await fetch(
    `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(scoped)}&count=${count}`,
    { headers: { accept: "application/json", "x-subscription-token": braveKey() }, signal: AbortSignal.timeout(TIMEOUT_MS) }
  );
  if (!response.ok) throw new Error(`Brave ${response.status}: ${(await response.text()).slice(0, 160)}`);
  const body = await response.json();
  return (body.web?.results ?? []).map((r) => ({ title: r.title, url: r.url, snippet: r.description ?? "", published: r.age ?? null }));
}

async function tavilySearch(query, { count, domains }) {
  const response = await fetch(`${tavilyBase()}/search`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ api_key: tavilyKey(), query, max_results: count, ...(domains?.length ? { include_domains: domains } : {}) }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Tavily ${response.status}: ${(await response.text()).slice(0, 160)}`);
  const body = await response.json();
  return (body.results ?? []).map((r) => ({ title: r.title, url: r.url, snippet: r.content ?? "", published: r.published_date ?? null }));
}

/** One search on the key-configured provider (Brave or Tavily) — the smoke check's call (lib/smoke.mjs). */
export async function searchWeb(query, { count = 3, domains = null } = {}) {
  const provider = webSearchProvider();
  if (!provider) throw new Error("no web search provider key is configured");
  const d = domains ?? approvedDomains(await webSettings());
  return provider === "brave" ? braveSearch(query, { count, domains: d }) : tavilySearch(query, { count, domains: d });
}

defineTool({
  name: "tavily_search",
  description:
    "Search the public web through Tavily. Use when the platform's own tools cannot answer: a state's published rules, an authority's bulletin, an airport's or handler's own notice, current events. The first searches of a turn cover only the approved sources (regulators, air navigation service providers, state AIS, and the industry references Clearway works from). Cite what you use; the results come back as citable search results. If the approved sources have nothing for a part of the question, call widen_web_search, then search again.",
  permission: "user",
  sourceTier: "web",
  noSource: true,   // the sources of an answer are what it CITES (server.mjs builds them from the citations), not every hit
  sourceLabel: (input) => `Web · Tavily · "${String(input.query).slice(0, 40)}"`,
  timeoutMs: 30_000,
  input: {
    type: "object",
    required: ["query"],
    additionalProperties: false,
    properties: {
      query: { type: "string", minLength: 3, maxLength: 300 },
      limit: S.limit(10, 5),
    },
  },
  output: {
    type: "object",
    required: ["query", "results", "pass"],
    properties: {
      query: { type: "string" },
      pass: { type: "integer", description: "1: approved sources only. 2: unrestricted (after widen_web_search)." },
      provider: { type: ["string", "null"] },
      authoritative: { type: "boolean" },
      note: { type: "string" },
      message: { type: "string" },
      results: { type: "array", items: { type: "object" } },
      searchResults: { type: "array", items: { type: "object" } },
    },
  },
  async handler({ query, limit }, { turn }) {
    if (!tavilyKey()) {
      throw ServiceUnavailable("Tavily is not set up on this server. Say that this search could not run — do not answer from memory.", "TAVILY_API_KEY is not set");
    }
    const settings = await webSettings();
    const widened = turn?.widened === true;
    await checkCeiling();   // a search-heavy turn at the ceiling stops here and says so, never answers unsearched
    let raw;
    try { raw = await tavilySearch(query, { count: limit, domains: widened ? null : approvedDomains(settings) }); }
    catch (error) {
      throw ServiceUnavailable("The web search service did not answer. Say that you could not search the web for this — do not answer from memory.", String(error?.message ?? error));
    }
    recordExtraUsd(TAVILY_USD_PER_SEARCH, "tavily");
    const retrievedAt = new Date().toISOString();
    const results = raw.slice(0, limit).map((r) => ({
      title: String(r.title ?? ""), url: String(r.url ?? ""), domain: hostOf(r.url), domainClass: classifyUrl(r.url, settings),
      snippet: String(r.snippet ?? "").slice(0, 1500), published: r.published ?? null, retrievedAt,
    }));
    if (turn) turn.searches.push({ provider: "tavily", query, pass: widened ? 2 : 1, results: results.length, hosts: [...new Set(results.map((r) => r.domain))].slice(0, 8) });
    return {
      query, pass: widened ? 2 : 1, provider: "tavily", authoritative: false,
      message: `Tavily search · pass ${widened ? 2 : 1} · ${results.length} result${results.length === 1 ? "" : "s"}`,   // the steps line names the provider
      note: results.length === 0
        ? (widened ? "Nothing found, on the whole web. Say plainly that this could not be established — do not answer from memory." : "Nothing on the approved sources. If this part of the question needs an answer, call widen_web_search and search again; otherwise say it could not be established.")
        : (widened ? "Unrestricted results (pass two). Cite each claim. A claim resting on a source outside the approved list is marked in the console; name the site and its date in your sentence." : "Results from the approved sources (pass one). Cite each claim. Name an industry reference (OPSGROUP, Universal, AC-U-KWIK…) as such."),
      results,
      // what the model receives as citable search_result blocks (agent/lib/bedrock.mjs › toolResult)
      searchResults: results.map((r) => ({ source: r.url, title: `${r.domain} — ${r.title}`.slice(0, 300), text: `${r.snippet}${r.published ? `\n(published ${r.published})` : ""}` })),
    };
  },
});

defineTool({
  name: "widen_web_search",
  description:
    "Pass two of web search. Call ONLY after searching the approved sources found nothing useful for a part of the question; say which part. From then on in this turn, web searches (web_search and tavily_search) are unrestricted. Claims from outside the approved sources are marked in the console.",
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
    if (turn && !turn.searches.some((x) => x.pass === 1)) throw InvalidInput("Search the approved sources first (web_search or tavily_search), then widen only if they had nothing.");
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
