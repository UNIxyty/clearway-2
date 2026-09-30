// The intake extraction schema: what the model is allowed to fill, and nothing else.
//
// Every extracted field is a Field:
//   { value, said, source, confidence, state }
//     value       — normalised value, or null
//     said        — the source's own words, verbatim ("TBA", "14:30LT", "2 PAX + 1 INF")
//     source      — where it came from: "Email · INBOUND", "crew-pax-list.pdf · page 1"
//     confidence  — 0..1, the model's own
//     state       — see STATES. `unknown` (the source said TBA / ----- / "to be advised") is NOT `not_given`
//                   (the source said nothing) and neither is ever 0.
//
// The model returns this JSON; `validateExtraction` rejects anything off-shape. Converted and cross-checked
// states are set by CODE after extraction (our airport lookup, the GenDec cross-check), never by the model.

export const STATES = [
  "extracted",       // read from the source
  "converted",       // code converted it (IATA → ICAO via our lookup, local → UTC with a stated zone)
  "cross_checked",   // body and attachment agree
  "low_confidence",  // extracted, confidence < 0.7 — warns, does not block
  "unknown",         // the source says TBA / ----- / to be advised — blocks where Leon needs a value
  "not_given",       // the source does not mention it — blocks where Leon needs a value
  "zero",            // the source explicitly said 0 / nil / none
  "edited",          // a person changed it (with what it was and who) — permanent
  "invalid",         // code could not accept it (unknown airport, impossible time)
  "tz_unknown",      // a time with no explicit time zone — blocks
  "not_read",        // an attachment that could not be read yet
  "leon_refused",    // Leon rejected the value — carries Leon's reason
  "extra",           // present in the source, no place in Leon — shown, not sent
  "conflict",        // body and attachment disagree — shown side by side, blocks until chosen
];
export const BLOCKING = new Set(["unknown", "not_given", "invalid", "tz_unknown", "leon_refused", "conflict"]);
export const UNKNOWN_WORDS = /^\s*(tba|tbc|tbd|n\/?a|to be (advised|confirmed)|-{2,}|\?+|unknown)\s*$/i;

const FIELD = {
  type: "object", additionalProperties: false, required: ["value", "said", "source", "confidence", "state"],
  properties: {
    value: {}, said: { type: ["string", "null"] }, source: { type: ["string", "null"] },
    confidence: { type: ["number", "null"], minimum: 0, maximum: 1 },
    state: { enum: ["extracted", "unknown", "not_given", "zero", "tz_unknown", "not_read", "extra", "conflict", "low_confidence"] },
  },
};
const TIME = { ...FIELD, properties: { ...FIELD.properties, value: { type: ["object", "null"], additionalProperties: false, properties: { local: { type: ["string", "null"] }, date: { type: ["string", "null"] }, tzStated: { type: ["string", "null"] }, utc: { type: ["string", "null"] } } } } };
const SERVICE = { type: "object", additionalProperties: false, required: ["name", "requested", "said", "source", "conditional"], properties: { name: { type: "string" }, requested: { enum: ["provide", "to_confirm", "decline", "unclear"] }, said: { type: ["string", "null"] }, source: { type: ["string", "null"] }, conditional: { type: "boolean" } } };

/** JSON Schema given to the model as the ONLY allowed output shape. */
export const EXTRACTION_SCHEMA = {
  type: "object", additionalProperties: false, required: ["requestType", "requester", "legs", "notes", "attachments"],
  properties: {
    requestType: { enum: ["handling", "scheduled", "other"] },
    requester: { type: "object", additionalProperties: false, required: ["company", "contact"], properties: { company: FIELD, contact: FIELD } },
    operator: FIELD,
    legs: {
      type: "array", minItems: 0, maxItems: 20,
      items: {
        type: "object", additionalProperties: false,
        required: ["departure", "arrival", "std", "sta", "aircraftType", "registration", "flightNumber", "crewCount", "pax", "services"],
        properties: {
          departure: FIELD, arrival: FIELD,            // value: the code AS GIVEN; code converts to ICAO
          std: TIME, sta: TIME,
          aircraftType: FIELD, registration: FIELD, flightNumber: FIELD,
          flightType: FIELD,                            // e.g. positioning / ferry / private / commercial, as stated
          crewCount: FIELD,
          pax: { type: "object", additionalProperties: false, required: ["total", "adults", "children", "infants"], properties: { total: FIELD, adults: FIELD, children: FIELD, infants: FIELD } },
          services: { type: "array", items: SERVICE },
        },
      },
    },
    notes: { type: "array", items: { type: "object", additionalProperties: false, required: ["text", "source"], properties: { text: { type: "string" }, source: { type: ["string", "null"] } } } },
    attachments: { type: "array", items: { type: "object", additionalProperties: false, required: ["name", "read", "role"], properties: { name: { type: "string" }, read: { type: "boolean" }, role: { enum: ["gendec", "crew_list", "pax_list", "permit", "other"] }, pages: { type: ["integer", "null"] } } } },
    conflicts: { type: "array", items: { type: "object", additionalProperties: false, required: ["field", "body", "attachment"], properties: { field: { type: "string" }, body: { type: ["string", "null"] }, attachment: { type: ["string", "null"] } } } },
    // Identities (crew / pax names, document numbers, dates of birth) — stored apart, masked by the API, purged by retention.
    personal: { type: "object", additionalProperties: false, properties: { crew: { type: "array", items: { type: "object" } }, pax: { type: "array", items: { type: "object" } } } },
  },
};

/** Minimal strict validator for the schema above (shape, required keys, no extra keys, enums). */
export function validateExtraction(x, schema = EXTRACTION_SCHEMA, at = "$") {
  const errs = [];
  const t = (v) => (v === null ? "null" : Array.isArray(v) ? "array" : Number.isInteger(v) ? "integer" : typeof v);
  const check = (v, s, p) => {
    if (!s || Object.keys(s).length === 0) return;
    if (s.enum && !s.enum.includes(v)) { errs.push(`${p}: ${JSON.stringify(v)} not one of ${s.enum.join("|")}`); return; }
    if (s.type) { const types = [].concat(s.type); const vt = t(v); if (!types.includes(vt) && !(vt === "integer" && types.includes("number"))) { errs.push(`${p}: expected ${types.join("|")}, got ${vt}`); return; } }
    if (s.type === "number" || (Array.isArray(s.type) && typeof v === "number")) { if (s.minimum != null && v < s.minimum) errs.push(`${p}: below ${s.minimum}`); if (s.maximum != null && v > s.maximum) errs.push(`${p}: above ${s.maximum}`); }
    if (t(v) === "object" && s.properties) {
      for (const k of s.required ?? []) if (!(k in v)) errs.push(`${p}.${k}: missing`);
      for (const k of Object.keys(v)) { if (!(k in s.properties)) { if (s.additionalProperties === false) errs.push(`${p}.${k}: not in the schema`); } else check(v[k], s.properties[k], `${p}.${k}`); }
    }
    if (t(v) === "array" && s.items) { if (s.maxItems != null && v.length > s.maxItems) errs.push(`${p}: more than ${s.maxItems}`); v.forEach((it, i) => check(it, s.items, `${p}[${i}]`)); }
  };
  check(x, schema, at);
  return errs;
}
