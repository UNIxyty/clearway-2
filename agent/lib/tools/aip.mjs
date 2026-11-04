// AIP tools. Every one wraps an existing portal endpoint — the source-selection
// logic (ASECNA -> scraper -> USA -> EAD) lives in /api/aip/resolve and is NOT
// reimplemented here, so the agent and the AIP page can never disagree.

import { defineTool, S } from "./framework.mjs";
import { portalGet, portalGetBytes } from "./http.mjs";
import { NotFound } from "./errors.mjs";
import { REVISION_SCHEMA, revisionFromPortal, revisionNotice } from "../knowledge/revision.mjs";

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
      revision: REVISION_SCHEMA,
      revisionNote: { type: ["string", "null"], description: "Say this next to any claim drawn from the document. Null only when the copy is current." },
      note: { type: ["string", "null"] },
    },
  },
  async handler({ icao }, { user }) {
    const code = up(icao);
    const data = await portalGet(`/api/aip/resolve?icao=${encodeURIComponent(code)}`, user, { timeoutMs: 25_000 });
    if (!data?.source) throw NotFound(`No AIP source serves ${code}.`);
    const revision = revisionFromPortal(data.revision, data.cached);
    return {
      icao: code,
      source: String(data.source),
      available: true,
      cached: Boolean(data.cached),
      eadSupported: Boolean(data.eadSupported),
      documentPath: data.cached && data.filesPath ? String(data.filesPath) : (data.pdfPath ? String(data.pdfPath) : null),
      revision,
      revisionNote: revisionNotice(revision, { name: `The AD 2 document for ${code}` }),
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
      revision: REVISION_SCHEMA,
      revisionNote: { type: ["string", "null"] },
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
    const revision = revisionFromPortal(probe?.revision, cached);
    return {
      icao: code,
      available: true,
      cached,
      source: probe?.source ?? null,
      documentPath: `/api/aip/gen/pdf?icao=${encodeURIComponent(code)}`,
      revision,
      revisionNote: revisionNotice(revision, { name: `The GEN 1.2 document for ${code}` }),
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

// Reading the GEN 1.2, not only finding it (2026-11-04): question 7 held the LBBG GEN 1.2 and could not open it, because
// get_gen_document only locates. This fetches it (from the national source when it is not cached — the portal's own
// route does that), reads its text, and returns the pages that bear on the question as citable search results.
const GEN_WORDS = ["permit", "permission", "authori", "non-scheduled", "charter", "private", "landing", "overflight", "flight plan", "entry", "customs", "immigration", "passenger", "api", "advance", "notice", "hours", "days", "application", "general aviation", "commercial"];
defineTool({
  name: "read_gen_document",
  description:
    "Read the country-level GEN 1.2 (entry, transit and departure of aircraft: permits, landing and overflight authorisation, customs, passenger data) for an airport, by ICAO code, and return the pages that bear on the question as citable text. Use it whenever a permit, entry or overflight question turns on the state's own rules: this is the state's AIP, the official source. Slow when no copy is cached (it fetches from the national source).",
  permission: "user",
  sourceTier: "internal",
  noSource: true,   // its pages are cited one by one (lib/citations.mjs)
  sourceLabel: (input) => `Internal · GEN 1.2 text · ${input.icao}`,
  timeoutMs: 150_000,
  input: {
    type: "object",
    required: ["icao"],
    additionalProperties: false,
    properties: { icao: S.icao, about: { type: "string", maxLength: 200, description: "What the question needs from it, e.g. 'landing permit for a non-scheduled commercial flight'." } },
  },
  output: {
    type: "object",
    required: ["icao", "read"],
    properties: { icao: { type: "string" }, read: { type: "boolean" }, pages: { type: "integer" }, returned: { type: "array" }, revision: REVISION_SCHEMA, revisionNote: { type: ["string", "null"] }, note: { type: ["string", "null"] }, message: { type: "string" }, searchResults: { type: "array" } },
  },
  async handler({ icao, about }, { user }) {
    const code = up(icao);
    const probe = await portalGet(`/api/aip/gen/pdf/exists?icao=${encodeURIComponent(code)}`, user, { timeoutMs: 15_000 }).catch(() => null);
    const bytes = await portalGetBytes(`/api/aip/gen/pdf?icao=${encodeURIComponent(code)}`, user);
    const revision = revisionFromPortal(probe?.revision, Boolean(probe?.exists));
    if (!bytes) return { icao: code, read: false, revision, revisionNote: revisionNotice(revision, { name: `The GEN 1.2 document for ${code}` }), note: `No GEN 1.2 could be fetched for ${code}: the national source did not give one. Say that the state's own rules could not be read.`, message: "GEN 1.2 not available" };
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: new Uint8Array(bytes) });
    let pages = [];
    try { const r = await parser.getText(); pages = (r.pages ?? []).map((p) => ({ num: p.num, text: String(p.text ?? "").replace(/[ \t]+/g, " ").trim() })); }
    finally { await parser.destroy().catch(() => {}); }
    const want = [...new Set([...GEN_WORDS, ...String(about ?? "").toLowerCase().split(/[^a-z0-9-]+/).filter((w) => w.length > 3)])];
    const scored = pages.map((p) => ({ ...p, score: want.reduce((n, w) => n + (p.text.toLowerCase().split(w).length - 1), 0) })).filter((p) => p.text.length > 40);
    const chosen = [...scored].sort((a, b) => b.score - a.score).slice(0, 6).sort((a, b) => a.num - b.num);
    const label = revision?.label ?? "revision unknown";
    if (!chosen.length) return { icao: code, read: false, pages: pages.length, revision, note: "The GEN 1.2 has no text layer the agent can read (a scanned document). Say so; the dispatcher can open it.", message: "GEN 1.2 has no readable text" };
    return {
      icao: code, read: true, pages: pages.length, returned: chosen.map((p) => p.num), revision,
      revisionNote: revisionNotice(revision, { name: `The GEN 1.2 document for ${code}` }),
      note: "The state's own AIP: an official source. Cite the page you rely on, and say its revision next to the claim.",
      message: `GEN 1.2 read · ${chosen.length} of ${pages.length} pages`,
      searchResults: chosen.map((p) => ({ source: `cw:gen:${code}#p${p.num}`, title: `GEN 1.2 · ${code} · p. ${p.num} · ${label}`, text: p.text.slice(0, 6000) })),
    };
  },
});
