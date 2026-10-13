// The airport sheets' field rule, in code (scripts/airport-sheets/README.md; decided 2026-10-12):
//   · EXTRACTED fields may be written from the AIP (and re-written when the AIP changes);
//   · HUMAN fields are entered by a person and are NEVER overwritten by extraction.
// On 2026-10-09 a merged file was copied over airports.json and silently replaced EYVI's hand-entered contacts, time
// zone, pax handling, ramp access, pax facilities and IATA code, and turned its slot/PPR from "not required" into
// "required". Nothing enforced the rule then. Now:
//   · scripts/airport-sheets-merge.mjs is the way extracted data comes in: it can only write EXTRACTED fields;
//   · scripts/generate-airport-sheets.mjs refuses to run when a human value that is in git has been lost or changed
//     and not committed (humanChanges below), until the change is committed or --accept-human-changes is given.
// Fields not named in either list (the email, images, airport of entry) are treated as human: extraction never
// touches them.

export const EXTRACTED_FIELDS = [
  "country", "airportName",
  "info.customs", "info.fireCategory", "info.runway", "info.elevation", "info.distanceToCity", "info.fuel", "info.hangar",
];
export const HUMAN_FIELDS = [
  "iata", "paxFacilities",
  "info.slotPpr", "info.timeZone", "info.paxHandling", "info.rampAccess",
  "contacts.tel", "contacts.sita", "contacts.aftn",
];

const get = (o, p) => p.split(".").reduce((x, k) => (x == null ? undefined : x[k]), o);
function set(o, p, v) {
  const ks = p.split("."); let x = o;
  for (const k of ks.slice(0, -1)) { if (x[k] == null || typeof x[k] !== "object") x[k] = {}; x = x[k]; }
  x[ks.at(-1)] = v;
}
const blank = (v) => v == null || (typeof v === "string" && !v.trim());

/** Every path with a value in an airport entry (nested objects flattened; "icao" left out). */
export function paths(entry, pre = "") {
  const out = [];
  for (const [k, v] of Object.entries(entry ?? {})) {
    const p = pre ? `${pre}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) out.push(...paths(v, p));
    else if (p !== "icao") out.push(p);
  }
  return out;
}

/**
 * Bring extracted data into the airports. Only EXTRACTED_FIELDS are written; anything else in `extracted` is ignored
 * and reported. A new airport is added with its extracted fields only (its human fields wait for a person).
 * @returns {{ airports: object[], written: string[], ignored: string[], added: string[] }}
 */
export function mergeExtracted(current, extracted) {
  const byIcao = new Map(current.map((a) => [a.icao, structuredClone(a)]));
  const written = [], ignored = [], added = [];
  for (const x of extracted) {
    if (!x?.icao) continue;
    let a = byIcao.get(x.icao);
    if (!a) { a = { icao: x.icao }; byIcao.set(x.icao, a); added.push(x.icao); }
    for (const p of paths(x)) {
      const v = get(x, p);
      if (!EXTRACTED_FIELDS.includes(p)) { if (!blank(v) && get(a, p) !== v) ignored.push(`${x.icao} ${p}`); continue; }
      if (blank(v) || get(a, p) === v) continue;
      set(a, p, v); written.push(`${x.icao} ${p}`);
    }
  }
  return { airports: [...byIcao.values()], written, ignored, added };
}

/**
 * Human values in `baseline` (what is in git) that `current` has lost or changed: every field that is not
 * EXTRACTED. An empty list means no hand-entered value was touched.
 */
export function humanChanges(baseline, current) {
  const now = new Map(current.map((a) => [a.icao, a]));
  const out = [];
  for (const b of baseline) {
    const c = now.get(b.icao);
    for (const p of paths(b)) {
      if (EXTRACTED_FIELDS.includes(p)) continue;
      const was = get(b, p);
      if (blank(was)) continue;
      const is = c ? get(c, p) : undefined;
      if (is !== was) out.push({ icao: b.icao, field: p, was, is: is ?? null });
    }
  }
  return out;
}
