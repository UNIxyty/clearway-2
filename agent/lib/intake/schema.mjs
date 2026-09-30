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
    // What the MODEL may say. converted / cross_checked / invalid / tz_unknown / low_confidence are set by code.
    state: { enum: ["extracted", "unknown", "not_given", "zero", "conflict", "extra"] },
  },
};
// A time as the source wrote it. The model never converts: it copies the clock readings and the words that
// fix the zone; code does the arithmetic with Leon's time zone for the airport, and cross-checks.
const TIME = { ...FIELD, properties: { ...FIELD.properties, value: { type: ["object", "null"], additionalProperties: false, required: ["date", "utcTime", "localTime", "zoneWords"], properties: {
  date: { type: ["string", "null"] },        // YYYY-MM-DD, the calendar date the source gives for this time
  utcTime: { type: ["string", "null"] },     // HH:MM only if the source marks it UTC / Z / GMT (itself or by a heading such as "all UTC times")
  localTime: { type: ["string", "null"] },   // HH:MM only if the source marks it local (LT / local) — or gives it with no zone at all
  zoneWords: { type: ["string", "null"] },   // the exact words that fix the zone ("Z", "LT", "Schedule (all UTC times)"), or null when none
} } } };
const SERVICE = { type: "object", additionalProperties: false, required: ["name", "requested", "said", "source", "conditional", "condition", "detail", "isNote", "checklistNid", "confidence"], properties: {
  name: { type: "string" },                  // short service name ("GPU", "Fuel")
  requested: { enum: ["provide", "to_confirm", "decline", "unclear"] },
  said: { type: ["string", "null"] },        // the line verbatim
  source: { type: ["string", "null"] },
  conditional: { type: "boolean" },          // "if needed", "please confirm availability", "on request"
  condition: { type: ["string", "null"] },   // the condition in plain words
  detail: { type: ["string", "null"] },      // "Jet A-1 · approx. 3,000 kg"
  isNote: { type: "boolean" },               // too open to be a service ("Other services, if crew requests")
  checklistNid: { type: ["integer", "null"] }, // a Leon OPS checklist definition nid FROM THE LIST GIVEN, or null
  confidence: { type: ["number", "null"], minimum: 0, maximum: 1 },
} };
const PERSON = { type: "object", additionalProperties: false, required: ["leg", "list", "name"], properties: {
  leg: { type: ["integer", "null"] },        // 0-based leg index; null = all legs
  list: { enum: ["crew", "pax"] }, role: { type: ["string", "null"] }, type: { type: ["string", "null"] },
  name: { type: ["string", "null"] }, dob: { type: ["string", "null"] }, nationality: { type: ["string", "null"] },
  passport: { type: ["string", "null"] }, expiry: { type: ["string", "null"] }, source: { type: ["string", "null"] },
} };

/** JSON Schema given to the model as the ONLY allowed output shape. */
export const EXTRACTION_SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["requestType", "whyType", "reference", "requester", "operator", "legs", "notes", "attachments", "requestSource", "conflicts", "personal"],
  properties: {
    requestType: { enum: ["handling", "scheduled", "other"] },
    whyType: { type: "string" },               // one sentence: why this is (or is not) a handling request
    reference: FIELD,                          // the sender's own reference, if any ("Ref: CIMOG1")
    requester: { type: "object", additionalProperties: false, required: ["company", "contact"], properties: { company: FIELD, contact: FIELD } },
    operator: FIELD,
    legs: {
      type: "array", minItems: 0, maxItems: 20,
      items: {
        type: "object", additionalProperties: false,
        required: ["direction", "departure", "arrival", "std", "sta", "aircraftType", "registration", "flightNumber", "flightType", "crewCount", "pax", "services"],
        properties: {
          direction: { enum: ["inbound", "outbound", "ferry", null] },
          departure: FIELD, arrival: FIELD,            // value: the code AS GIVEN (ICAO or IATA); code converts
          std: TIME, sta: TIME,
          aircraftType: FIELD, registration: FIELD, flightNumber: FIELD, flightType: FIELD,
          crewCount: FIELD,
          pax: { type: "object", additionalProperties: false, required: ["total", "adults", "children", "infants"], properties: { total: FIELD, adults: FIELD, children: FIELD, infants: FIELD } },
          services: { type: "array", items: SERVICE },
        },
      },
    },
    notes: { type: "array", items: { type: "object", additionalProperties: false, required: ["text", "source"], properties: { text: { type: "string" }, source: { type: ["string", "null"] } } } },
    // Every attachment, classified by what it CONTAINS (not its name): the request itself, supporting
    // (GenDec, crew/pax list, permit, form) or noise (logos, signature images) — with the reason.
    attachments: { type: "array", items: { type: "object", additionalProperties: false, required: ["name", "role", "kind", "why", "read", "facts"], properties: {
      name: { type: "string" }, role: { enum: ["request", "supporting", "noise", "unreadable"] },
      kind: { enum: ["gendec", "crew_list", "pax_list", "permit", "form", "image", "schedule", "other"] },
      why: { type: "string" }, read: { type: "boolean" },
      // What THIS attachment itself states, per flight it covers, copied as written. Code compares these with
      // the body; the model does not decide what counts as a conflict.
      facts: { type: "array", items: { type: "object", additionalProperties: false, required: ["departure", "arrival", "date", "registration", "stdUtc", "staUtc", "crewTotal", "paxTotal"], properties: {
        departure: { type: ["string", "null"] }, arrival: { type: ["string", "null"] }, date: { type: ["string", "null"] }, registration: { type: ["string", "null"] },
        stdUtc: { type: ["string", "null"] }, staUtc: { type: ["string", "null"] }, crewTotal: { type: ["integer", "null"] }, paxTotal: { type: ["integer", "null"] },
      } } },
    } } },
    // Which document the values were read from: the body, unless an attachment clearly supersedes it.
    requestSource: { type: "object", additionalProperties: false, required: ["attachment", "why"], properties: { attachment: { type: ["string", "null"] }, why: { type: "string" } } },
    conflicts: { type: "array", items: { type: "object", additionalProperties: false, required: ["field", "leg", "body", "attachment", "attachmentName"], properties: {
      field: { type: "string" }, leg: { type: ["integer", "null"] }, body: { type: ["string", "null"] }, attachment: { type: ["string", "null"] }, attachmentName: { type: ["string", "null"] },
    } } },
    // Identities (names, document numbers, dates of birth): stored apart, masked by the API, purged by retention.
    personal: { type: "object", additionalProperties: false, required: ["people"], properties: { people: { type: "array", items: PERSON } } },
  },
};

/** Minimal strict validator for the schema above (shape, required keys, no extra keys, enums). */
export function validateExtraction(x, schema = EXTRACTION_SCHEMA, at = "$") {
  const errs = [];
  const t = (v) => (v === null ? "null" : Array.isArray(v) ? "array" : Number.isInteger(v) ? "integer" : typeof v);
  const check = (v, s, p) => {
    if (!s || Object.keys(s).length === 0) return;
    if (s.enum && !s.enum.includes(v ?? null)) { errs.push(`${p}: ${JSON.stringify(v)} not one of ${s.enum.join("|")}`); return; }
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
