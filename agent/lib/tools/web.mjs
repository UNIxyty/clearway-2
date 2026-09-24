// Web search.
//
// THE RULE THIS FILE EXISTS TO ENFORCE: web content is never authoritative
// operational guidance. It is labelled `web` at the source-tier level, every
// result carries its domain and fetch time, and the tool's own output tells the
// model to prefer internal data where internal data answers the question.
//
// Aviation-filtered BY DEFAULT. A dispatcher asking "what are the slot rules at
// Heathrow" wants EUROCONTROL and the AIP, not a forum thread — so the default
// restricts to a list of authoritative aviation domains, and going wider is an
// explicit choice the model has to make and the user can see.
//
// Provider-agnostic: Brave and Tavily are both implemented because neither is
// installed here yet, and whichever key appears first will work without a code
// change.

import { defineTool, S } from "./framework.mjs";
import { ServiceUnavailable, InvalidInput } from "./errors.mjs";

const TIMEOUT_MS = 20_000;

/**
 * Domains that publish aeronautical information or regulation. Not a quality
 * ranking — a filter that keeps the default answer inside sources an ops
 * department would accept being shown.
 */
const AVIATION_DOMAINS = [
  "eurocontrol.int", "easa.europa.eu", "icao.int", "iata.org",
  "faa.gov", "notams.faa.gov", "aviationweather.gov",
  "ead.eurocontrol.int", "nats.aero", "skybrary.aero",
  "caa.co.uk", "lvc.lv", "pansa.pl", "dfs.de", "enaire.es", "sia.aviation-civile.gouv.fr",
  "austrocontrol.at", "lfv.se", "avinor.no", "fintraffic.fi", "naviair.dk",
  "ans.lv", "oro.navigacija.lt", "eans.ee",
];

function braveKey() { return String(process.env.BRAVE_SEARCH_API_KEY || "").trim(); }
function tavilyKey() { return String(process.env.TAVILY_API_KEY || "").trim(); }

export function webSearchProvider() {
  if (braveKey()) return "brave";
  if (tavilyKey()) return "tavily";
  return null;
}

async function braveSearch(query, { count, domains }) {
  // Brave takes site: filters inline; more than a handful makes the query
  // unusable, so the list is trimmed rather than sent whole.
  const scoped = domains?.length ? `${query} (${domains.slice(0, 8).map((d) => `site:${d}`).join(" OR ")})` : query;
  const response = await fetch(
    `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(scoped)}&count=${count}`,
    { headers: { accept: "application/json", "x-subscription-token": braveKey() }, signal: AbortSignal.timeout(TIMEOUT_MS) }
  );
  if (!response.ok) throw new Error(`Brave ${response.status}: ${(await response.text()).slice(0, 160)}`);
  const body = await response.json();
  return (body.web?.results ?? []).map((r) => ({
    title: r.title, url: r.url, snippet: r.description ?? "", published: r.age ?? null,
  }));
}

async function tavilySearch(query, { count, domains }) {
  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      api_key: tavilyKey(), query, max_results: count,
      ...(domains?.length ? { include_domains: domains } : {}),
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Tavily ${response.status}: ${(await response.text()).slice(0, 160)}`);
  const body = await response.json();
  return (body.results ?? []).map((r) => ({
    title: r.title, url: r.url, snippet: r.content ?? "", published: r.published_date ?? null,
  }));
}

defineTool({
  name: "web_search",
  description:
    "Search the public web. Use ONLY when the platform's own tools cannot answer — for a national authority's published rules, an airport's own notices, or current external events. Results are external and UNVERIFIED: never present them as approved operational guidance, and say plainly that they came from the web. If an internal tool answers the question, use that instead and say so.",
  permission: "user",
  sourceTier: "web",
  sourceLabel: (input, result) => {
    const domains = [...new Set((result.results ?? []).map((r) => r.domain))].slice(0, 2);
    return `Web · ${domains.join(", ") || "search"} · "${String(input.query).slice(0, 40)}"`;
  },
  timeoutMs: 30_000,
  input: {
    type: "object",
    required: ["query"],
    additionalProperties: false,
    properties: {
      query: { type: "string", minLength: 3, maxLength: 300 },
      // The escape hatch is explicit and named, so widening the search is a
      // visible decision rather than a silent default.
      unfiltered: { type: "boolean", default: false, description: "Search the whole web instead of aviation-authority domains. Use only when the aviation-filtered search found nothing relevant." },
      limit: S.limit(10, 5),
    },
  },
  output: {
    type: "object",
    required: ["query", "results", "filtered", "authoritative"],
    properties: {
      query: { type: "string" },
      filtered: { type: "boolean" },
      provider: { type: ["string", "null"] },
      // Always false. Present so the model sees it on every single result set.
      authoritative: { type: "boolean" },
      note: { type: "string" },
      results: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            url: { type: "string" },
            domain: { type: "string" },
            snippet: { type: "string" },
            published: { type: ["string", "null"] },
            retrievedAt: { type: "string" },
          },
        },
      },
    },
  },
  async handler({ query, unfiltered, limit }) {
    const provider = webSearchProvider();
    if (!provider) {
      throw ServiceUnavailable(
        "Web search is not configured on this server (no BRAVE_SEARCH_API_KEY or TAVILY_API_KEY). Say that you could not search the web — do not answer from memory."
      );
    }

    const domains = unfiltered ? null : AVIATION_DOMAINS;
    let raw;
    try {
      raw = provider === "brave"
        ? await braveSearch(query, { count: limit, domains })
        : await tavilySearch(query, { count: limit, domains });
    } catch (error) {
      throw ServiceUnavailable(`The web search failed: ${error.message}`);
    }

    const retrievedAt = new Date().toISOString();
    const results = raw.slice(0, limit).map((r) => ({
      title: String(r.title ?? ""),
      url: String(r.url ?? ""),
      domain: safeDomain(r.url),
      snippet: String(r.snippet ?? "").slice(0, 800),
      published: r.published ?? null,
      retrievedAt,
    }));

    return {
      query,
      filtered: !unfiltered,
      provider,
      authoritative: false,
      note: unfiltered
        ? "UNFILTERED web results. These are not authoritative and may be wrong or out of date. Attribute every claim to its domain, and prefer internal or company sources wherever they answer the question."
        : "Web results from aviation-authority domains. Still EXTERNAL and unverified — attribute them to the site, never present them as Clearway's approved guidance, and prefer internal data where it answers the question.",
      results,
    };
  },
});

function safeDomain(url) {
  try {
    return new URL(String(url)).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

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
