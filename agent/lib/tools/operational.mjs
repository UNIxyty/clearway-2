// Operational content: limitations, IMPORTANT entries, CAA records.
//
// THE VERBATIM RULE. These tools return the EXACT STORED TEXT, with its source
// and effective dates. They do not summarise, truncate, re-order sentences or
// normalise wording. A dispatcher acting on a limitation is acting on what the
// authority wrote; a paraphrase that loses "except" or "not before" is a
// different instruction. Whether the model paraphrases when it answers is a
// Part 4 concern — the tool layer's job is to deliver the original intact.
//
// Consequences of that rule, visible below:
//  - no maxLength on any text field
//  - pagination caps the number of RECORDS, never the length of one
//  - an over-size page is an error (the framework's TOO_LARGE), so the model
//    narrows the filter rather than silently receiving half a limitation.

import { defineTool, S } from "./framework.mjs";
import { wallGet } from "./http.mjs";

const RECORD_LIMIT = S.limit(200, 100);

function matchesQuery(haystack, needle) {
  if (!needle) return true;
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

defineTool({
  name: "list_limitations",
  description:
    "Operational limitations currently configured on the ops wall — standing restrictions that apply to flights, airports or countries. Returns each limitation's full original text plus the criteria that decide which flights it matches. Use when asked what restrictions apply to a flight, airport or country.",
  permission: "user",
  maxResultBytes: 256 * 1024,
  input: {
    type: "object",
    additionalProperties: false,
    properties: {
      query: { type: "string", maxLength: 120, description: "Free text filter over title and body." },
      icao: { ...S.icao, description: "Only limitations whose match criteria include this airport." },
      country: { type: "string", maxLength: 60 },
      includeInactive: { type: "boolean", default: false },
      limit: RECORD_LIMIT,
    },
  },
  output: {
    type: "object",
    required: ["count", "limitations"],
    properties: {
      count: { type: "integer" },
      truncated: { type: "boolean" },
      source: { type: "string" },
      limitations: {
        type: "array",
        items: {
          type: "object",
          required: ["id", "title", "verbatim"],
          properties: {
            id: { type: "string" },
            title: { type: "string", description: "Exactly as stored." },
            description: { type: ["string", "null"], description: "Exactly as stored — not summarised." },
            verbatim: { type: "boolean", description: "Always true: this text is the stored original." },
            isActive: { type: "boolean" },
            isPermanent: { type: "boolean" },
            effectiveFrom: { type: ["string", "null"] },
            effectiveTo: { type: ["string", "null"] },
            matchCriteria: {
              type: "object",
              properties: {
                airportIcaos: { type: "array", items: { type: "string" } },
                countries: { type: "array", items: { type: "string" } },
                flights: { type: "array", items: { type: "object" } },
              },
            },
            updatedAt: { type: ["string", "null"] },
          },
        },
      },
    },
  },
  async handler({ query, icao, country, includeInactive, limit }, { user }) {
    const data = await wallGet(`/api/timeline/limitations?includeInactive=${includeInactive ? "true" : "false"}`, user, { timeoutMs: 20_000 });
    let rows = Array.isArray(data?.limitations) ? data.limitations : [];

    if (icao) {
      const code = String(icao).toUpperCase();
      rows = rows.filter((r) => (r.match?.airportIcaos ?? []).some((a) => String(a).toUpperCase() === code));
    }
    if (country) {
      rows = rows.filter((r) => (r.match?.countries ?? []).some((c) => matchesQuery(String(c), country)));
    }
    if (query) {
      rows = rows.filter((r) => matchesQuery(`${r.title ?? ""} ${r.description ?? ""}`, query));
    }

    return {
      count: rows.length,
      truncated: rows.length > limit,
      source: "digital-wall limitations store",
      limitations: rows.slice(0, limit).map((r) => ({
        id: String(r.id ?? ""),
        title: String(r.title ?? ""),
        description: r.description == null ? null : String(r.description),
        verbatim: true,
        isActive: r.isActive !== false,
        isPermanent: Boolean(r.isPermanent),
        effectiveFrom: r.startDate ?? null,
        effectiveTo: r.endDate ?? null,
        matchCriteria: {
          airportIcaos: (r.match?.airportIcaos ?? []).map(String),
          countries: (r.match?.countries ?? []).map(String),
          flights: Array.isArray(r.match?.flights) ? r.match.flights : [],
        },
        updatedAt: r.updatedAt ?? null,
      })),
    };
  },
});

defineTool({
  name: "list_important",
  description:
    "IMPORTANT entries (class IMP) on the ops wall — standing operational bulletins the dispatcher must know, such as seasonal openings, customs restrictions or permit rules. Returns each entry's full original text and its match criteria. Use when asked what a crew or dispatcher must be aware of for an airport or country.",
  permission: "user",
  maxResultBytes: 256 * 1024,
  input: {
    type: "object",
    additionalProperties: false,
    properties: {
      query: { type: "string", maxLength: 120 },
      icao: S.icao,
      country: { type: "string", maxLength: 60 },
      includeInactive: { type: "boolean", default: false },
      limit: RECORD_LIMIT,
    },
  },
  output: {
    type: "object",
    required: ["count", "entries"],
    properties: {
      count: { type: "integer" },
      truncated: { type: "boolean" },
      source: { type: "string" },
      entries: {
        type: "array",
        items: {
          type: "object",
          required: ["id", "title", "verbatim"],
          properties: {
            id: { type: "string" },
            title: { type: "string", description: "Exactly as stored." },
            body: { type: ["string", "null"], description: "Exactly as stored — not summarised." },
            verbatim: { type: "boolean" },
            isActive: { type: "boolean" },
            effectiveFrom: { type: ["string", "null"] },
            effectiveTo: { type: ["string", "null"] },
            matchCriteria: {
              type: "object",
              properties: {
                airportIcaos: { type: "array", items: { type: "string" } },
                countries: { type: "array", items: { type: "string" } },
              },
            },
            addedBy: { type: ["string", "null"] },
            reviewedBy: { type: ["string", "null"] },
            attachments: { type: "array", items: { type: "object" } },
            updatedAt: { type: ["string", "null"] },
          },
        },
      },
    },
  },
  async handler({ query, icao, country, includeInactive, limit }, { user }) {
    const data = await wallGet(`/api/important?includeInactive=${includeInactive ? "true" : "false"}`, user, { timeoutMs: 20_000 });
    let rows = Array.isArray(data?.entries) ? data.entries : [];

    if (icao) {
      const code = String(icao).toUpperCase();
      rows = rows.filter((r) => (r.match?.airportIcaos ?? r.airportIcaos ?? []).some((a) => String(a).toUpperCase() === code));
    }
    if (country) {
      rows = rows.filter((r) => (r.match?.countries ?? r.countries ?? []).some((c) => matchesQuery(String(c), country)));
    }
    if (query) rows = rows.filter((r) => matchesQuery(`${r.title ?? ""} ${r.body ?? ""}`, query));

    return {
      count: rows.length,
      truncated: rows.length > limit,
      source: "digital-wall IMPORTANT store",
      entries: rows.slice(0, limit).map((r) => ({
        id: String(r.id ?? ""),
        title: String(r.title ?? ""),
        body: r.body == null ? null : String(r.body),
        verbatim: true,
        isActive: r.isActive !== false,
        effectiveFrom: r.startDate ?? null,
        effectiveTo: r.endDate ?? null,
        matchCriteria: {
          airportIcaos: (r.match?.airportIcaos ?? r.airportIcaos ?? []).map(String),
          countries: (r.match?.countries ?? r.countries ?? []).map(String),
        },
        addedBy: r.addedBy ?? null,
        reviewedBy: r.reviewedBy ?? null,
        attachments: Array.isArray(r.attachments) ? r.attachments : [],
        updatedAt: r.updatedAt ?? null,
      })),
    };
  },
});

defineTool({
  name: "list_caa",
  description:
    "Civil aviation authority contact records: which authority to contact for a country, for what (overflight permits, landing permissions), how, and the validity or lead time. Returns each record's full original text. Use when asked who to contact or how long a permit takes.",
  permission: "user",
  maxResultBytes: 256 * 1024,
  input: {
    type: "object",
    additionalProperties: false,
    properties: {
      query: { type: "string", maxLength: 120, description: "Free text over country, authority and function." },
      country: { type: "string", maxLength: 60 },
      includeInactive: { type: "boolean", default: false },
      limit: RECORD_LIMIT,
    },
  },
  output: {
    type: "object",
    required: ["count", "entries"],
    properties: {
      count: { type: "integer" },
      truncated: { type: "boolean" },
      source: { type: "string" },
      entries: {
        type: "array",
        items: {
          type: "object",
          required: ["id", "country", "verbatim"],
          properties: {
            id: { type: "string" },
            country: { type: "string" },
            authorityName: { type: ["string", "null"], description: "Exactly as stored." },
            functionText: { type: ["string", "null"], description: "Exactly as stored — not summarised." },
            functionKinds: { type: "array", items: { type: "string" } },
            validity: { type: ["string", "null"], description: "Exactly as stored, e.g. '72HRS'." },
            email: { type: ["string", "null"] },
            phone: { type: ["string", "null"] },
            website: { type: ["string", "null"] },
            remarks: { type: ["string", "null"], description: "Exactly as stored." },
            verbatim: { type: "boolean" },
            isActive: { type: "boolean" },
            updatedAt: { type: ["string", "null"] },
          },
        },
      },
    },
  },
  async handler({ query, country, includeInactive, limit }, { user }) {
    const data = await wallGet(`/api/caa?includeInactive=${includeInactive ? "true" : "false"}`, user, { timeoutMs: 20_000 });
    let rows = Array.isArray(data?.entries) ? data.entries : [];
    if (country) rows = rows.filter((r) => matchesQuery(String(r.country ?? ""), country));
    if (query) rows = rows.filter((r) => matchesQuery(`${r.country ?? ""} ${r.authorityName ?? ""} ${r.functionText ?? ""} ${r.remarks ?? ""}`, query));

    return {
      count: rows.length,
      truncated: rows.length > limit,
      source: "digital-wall CAA store",
      entries: rows.slice(0, limit).map((r) => ({
        id: String(r.id ?? ""),
        country: String(r.country ?? ""),
        authorityName: r.authorityName == null ? null : String(r.authorityName),
        functionText: r.functionText == null ? null : String(r.functionText),
        functionKinds: Array.isArray(r.functionKinds) ? r.functionKinds.map(String) : [],
        validity: r.validity == null ? null : String(r.validity),
        email: r.email ?? null,
        phone: r.phone ?? null,
        website: r.website ?? null,
        remarks: r.remarks == null ? null : String(r.remarks),
        verbatim: true,
        isActive: r.isActive !== false,
        updatedAt: r.updatedAt ?? null,
      })),
    };
  },
});
