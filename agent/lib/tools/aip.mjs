// AIP tools. Every one wraps an existing portal endpoint — the source-selection
// logic (ASECNA -> scraper -> USA -> EAD) lives in /api/aip/resolve and is NOT
// reimplemented here, so the agent and the AIP page can never disagree.

import { defineTool, S } from "./framework.mjs";
import { portalGet } from "./http.mjs";
import { NotFound } from "./errors.mjs";

const up = (icao) => String(icao).toUpperCase();

defineTool({
  name: "get_aip_document",
  description:
    "Find the official AD 2 aerodrome document (AIP) for one airport by ICAO code. Returns which national source serves it, whether a PDF is already cached, and a link to open it. Use this when asked about an airport's published aerodrome information, procedures, runways or contacts. It does NOT return the document text — it locates the document.",
  permission: "user",
  sourceTier: "internal",
  sourceLabel: (input, result) => `Internal · AIP ${result.source ?? ""} · ${input.icao}`,
  input: {
    type: "object",
    required: ["icao"],
    additionalProperties: false,
    properties: { icao: S.icao },
  },
  output: {
    type: "object",
    required: ["icao", "source", "cached", "available"],
    properties: {
      icao: { type: "string" },
      source: { type: "string", description: "ead | scraper | usa | asecna" },
      available: { type: "boolean" },
      cached: { type: "boolean", description: "True when a PDF is already in the shared cache (no scrape needed)." },
      eadSupported: { type: "boolean" },
      documentPath: { type: ["string", "null"], description: "Portal path that serves the PDF." },
      note: { type: ["string", "null"] },
    },
  },
  async handler({ icao }, { user }) {
    const code = up(icao);
    const data = await portalGet(`/api/aip/resolve?icao=${encodeURIComponent(code)}`, user, { timeoutMs: 25_000 });
    if (!data?.source) throw NotFound(`No AIP source serves ${code}.`);
    return {
      icao: code,
      source: String(data.source),
      available: true,
      cached: Boolean(data.cached),
      eadSupported: Boolean(data.eadSupported),
      documentPath: data.cached && data.filesPath ? String(data.filesPath) : (data.pdfPath ? String(data.pdfPath) : null),
      note: data.cached
        ? null
        : "Not cached yet — opening it will trigger a download from the national source, which can take a while.",
    };
  },
});

defineTool({
  name: "get_gen_document",
  description:
    "Locate the country-level GEN 1.2 document (entry, transit and departure rules) that applies to an airport, by ICAO code. Use for questions about national requirements — permits, customs, overflight — rather than the airport itself.",
  permission: "user",
  sourceTier: "internal",
  sourceLabel: (input) => `Internal · GEN 1.2 · ${input.icao}`,
  input: {
    type: "object",
    required: ["icao"],
    additionalProperties: false,
    properties: { icao: S.icao },
  },
  output: {
    type: "object",
    required: ["icao", "available"],
    properties: {
      icao: { type: "string" },
      available: { type: "boolean" },
      cached: { type: "boolean" },
      source: { type: ["string", "null"], description: "ead | non-ead, when a cached copy exists." },
      documentPath: { type: ["string", "null"] },
      note: { type: ["string", "null"] },
    },
  },
  async handler({ icao }, { user }) {
    const code = up(icao);
    // exists-probe first: it derives the country prefix from the ICAO and only
    // checks storage, so asking "is there a GEN for this country" never
    // triggers a download.
    const probe = await portalGet(`/api/aip/gen/pdf/exists?icao=${encodeURIComponent(code)}`, user, { timeoutMs: 15_000 }).catch(() => null);
    const cached = Boolean(probe?.exists);
    return {
      icao: code,
      available: true,
      cached,
      source: probe?.source ?? null,
      documentPath: `/api/aip/gen/pdf?icao=${encodeURIComponent(code)}`,
      note: cached ? null : "No cached copy — opening it will fetch from the national source.",
    };
  },
});

defineTool({
  name: "get_web_aip_link",
  description:
    "Get the public web AIP (eAIP) website link for the country that serves an airport, by ICAO code. Use when the user wants to browse the official source themselves rather than open a single document.",
  permission: "user",
  sourceTier: "internal",
  sourceLabel: (input) => `Internal · airports database · ${input.icao}`,
  input: {
    type: "object",
    required: ["icao"],
    additionalProperties: false,
    properties: { icao: S.icao },
  },
  output: {
    type: "object",
    required: ["icao", "found"],
    properties: {
      icao: { type: "string" },
      found: { type: "boolean" },
      country: { type: ["string", "null"] },
      url: { type: ["string", "null"] },
      airportName: { type: ["string", "null"] },
    },
  },
  async handler({ icao }, { user }) {
    const code = up(icao);
    const data = await portalGet(`/api/search?q=${encodeURIComponent(code)}`, user, { timeoutMs: 25_000 });
    const match = (data?.results ?? []).find((r) => String(r.icao || "").toUpperCase() === code) ?? null;
    if (!match) throw NotFound(`${code} is not in the airports database.`);
    return {
      icao: code,
      found: Boolean(match.webAipUrl),
      country: match.country ?? null,
      url: match.webAipUrl ?? null,
      airportName: match.name ?? null,
    };
  },
});

defineTool({
  name: "get_aip_service_status",
  description:
    "Per-country health of AIP document retrieval: which countries are working, in trouble, or not yet checked, with any operator note. Use when a document fails to load, or when asked whether a country's AIP is reliable right now. Omit `country` for the whole board.",
  permission: "user",
  sourceTier: "internal",
  sourceLabel: () => "Internal · country service status",
  input: {
    type: "object",
    additionalProperties: false,
    properties: {
      country: { type: "string", minLength: 2, maxLength: 60, description: "Country name as the platform spells it. Omit for all." },
      limit: S.limit(200, 200),
    },
  },
  output: {
    type: "object",
    required: ["countries", "count"],
    properties: {
      count: { type: "integer" },
      truncated: { type: "boolean" },
      countries: {
        type: "array",
        items: {
          type: "object",
          properties: {
            country: { type: "string" },
            status: { type: "string" },
            note: { type: ["string", "null"] },
            updatedAt: { type: ["string", "null"] },
            debugRunning: { type: "boolean" },
          },
        },
      },
    },
  },
  async handler({ country, limit }, { user }) {
    const data = await portalGet("/api/country-service-status", user, { timeoutMs: 20_000 });
    let rows = Array.isArray(data?.countries) ? data.countries : [];
    if (country) {
      const needle = country.toLowerCase();
      rows = rows.filter((r) => String(r.country || "").toLowerCase().includes(needle));
      if (rows.length === 0) throw NotFound(`No country matching "${country}".`);
    }
    const total = rows.length;
    return {
      count: total,
      truncated: total > limit,
      countries: rows.slice(0, limit).map((r) => ({
        country: String(r.country ?? ""),
        status: String(r.status ?? "not_checked"),
        note: r.note ?? null,
        updatedAt: r.updatedAt ?? r.updated_at ?? null,
        debugRunning: Boolean(r.debugRunning),
      })),
    };
  },
});
