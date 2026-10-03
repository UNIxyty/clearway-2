// The review working copy (intake_requests.review): what the review screen shows and edits, per leg.
// Built from a normalised, enforced extraction. Carries NO personal data (crew/pax identities are read from
// the extraction's `personal`, masked, only by the personal-data endpoint).
//
// Field record: { key, label, value, said, source, state, note, confidence, required, sent, edited?, checked?, conflict? }
//   value is the DISPLAY value the input holds: codes, "HH:MM" (UTC) for times, "DD Mon YYYY" for the date.
//   utc (times) is the ISO instant the value means. States follow the design table (§I6.2).
import { buildFlightCreate } from "./leon-payload.mjs";
import { localToUtc, localToUtcChecked, offsetMinutes } from "./leon-lookup.mjs";
import { tzVersion } from "../tzdata.mjs";
import { BLOCKING } from "./schema.mjs";

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const fmtDate = (iso) => { if (!iso) return ""; const d = new Date(iso); return `${String(d.getUTCDate()).padStart(2, "0")} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
export const fmtTime = (iso) => (iso ? new Date(iso).toISOString().slice(11, 16) : "");
export function parseDate(s) {
  const m = /^(\d{1,2}) ([A-Za-z]{3}) (\d{4})$/.exec(String(s ?? "").trim()); if (!m) return null;
  const mo = MON.findIndex((x) => x.toLowerCase() === m[2].toLowerCase()); if (mo < 0) return null;
  const d = new Date(Date.UTC(+m[3], mo, +m[1])); return d.getUTCDate() === +m[1] ? d.toISOString().slice(0, 10) : null;
}
export const VALID = {
  airport: /^[A-Z]{4}$/, time: /^([01]\d|2[0-3]):[0-5]\d$/, registration: /^[A-Z0-9]{1,2}-[A-Z0-9]{2,5}$/, type: /^[A-Z][A-Z0-9]{1,3}$/, flightNo: /^[A-Z0-9]{3,7}$/,
};
const CORE = [
  ["flightNumber", "Flight no.", "flightNo", true], ["departure", "From", "airport", true], ["arrival", "To", "airport", true], ["date", "Date", "date", true],
  ["std", "STD", "time", true], ["sta", "STA", "time", true], ["aircraftType", "Aircraft type", "type", false], ["registration", "Registration", "registration", false],
  ["crewCount", "Crew", "count", false], ["paxTotal", "Pax", "count", false],
];
export const CORE_FIELDS = CORE.map(([key, label, kind, required]) => ({ key, label, kind, required }));
const SENT = new Set(["flightNumber", "departure", "arrival", "date", "std", "sta", "registration", "paxTotal"]);

function fieldFrom(src, key, label, kind, required) {
  const f = src ?? { value: null, said: null, source: null, confidence: null, state: "not_given" };
  let value = f.value;
  // A local time the code refused to convert (stale tz data, or a time that happens twice or never) shows an
  // EMPTY UTC value: the person types the UTC time; the local reading stays visible under "the source said".
  if (kind === "time") value = f.value?.utc ? fmtTime(f.value.utc) : f.state === "invalid" ? "" : (f.value?.localTime ?? f.value?.utcTime ?? "");
  const out = { key, label, kind, value: value == null ? "" : String(value), said: f.said ?? null, source: f.source ?? null, state: f.state ?? "extracted", note: f.note ?? null, confidence: f.confidence ?? null, required, sent: SENT.has(key) };
  if (kind === "time") { out.utc = f.value?.utc ?? null; out.date = f.value?.date ?? null; out.localTime = f.value?.localTime ?? null; out.zoneWords = f.value?.zoneWords ?? null; }
  if (f.airport) out.airport = f.airport;
  if (f.aircraft) out.aircraft = f.aircraft;
  if (f.conflict) out.conflict = f.conflict;
  if (out.said && String(out.said).trim() === out.value) out.saidSame = true;
  return out;
}

/** Initial review doc from an enforced extraction. `defs` = live checklist definitions (for labels). */
export function reviewFromExtraction(x, defs = []) {
  const defLabel = new Map(defs.map((d) => [d.nid, d.label]));
  const legs = x.legs.map((leg, i) => {
    const date = leg.std?.value?.utc ?? (leg.std?.value?.date ? `${leg.std.value.date}T00:00:00Z` : null);
    const dateField = { key: "date", label: "Date", kind: "date", value: date ? fmtDate(date) : "", said: leg.std?.said ?? null, source: leg.std?.source ?? null, state: date ? (leg.std?.state === "not_given" ? "not_given" : "extracted") : "not_given", note: null, confidence: leg.std?.confidence ?? null, required: true, sent: true };
    const pax = leg.pax?.total;
    const fields = [
      fieldFrom(leg.flightNumber, "flightNumber", "Flight no.", "flightNo", true),
      fieldFrom(leg.departure, "departure", "From", "airport", true),
      fieldFrom(leg.arrival, "arrival", "To", "airport", true),
      dateField,
      fieldFrom(leg.std, "std", "STD", "time", true),
      fieldFrom(leg.sta, "sta", "STA", "time", true),
      fieldFrom(leg.aircraftType, "aircraftType", "Aircraft type", "type", false),
      fieldFrom(leg.registration, "registration", "Registration", "registration", false),
      fieldFrom(leg.crewCount, "crewCount", "Crew", "count", false),
      fieldFrom(pax, "paxTotal", "Pax", "count", false),
    ];
    const extra = [];
    if (leg.flightType?.value) extra.push({ key: "flightType", label: "Flight type", value: String(leg.flightType.value), said: leg.flightType.said, source: leg.flightType.source, state: "extra", note: /position|ferry|empty/i.test(String(leg.flightType.value)) ? "Sent to Leon as an empty leg (no Leon field for the words)" : "No Leon field for this" });
    for (const k of ["adults", "children", "infants"]) { const f = leg.pax?.[k]; if (f && f.state !== "not_given") extra.push({ key: `pax.${k}`, label: k[0].toUpperCase() + k.slice(1), value: f.value == null ? "" : String(f.value), said: f.said, source: f.source, state: "extra", note: "Leon takes one passenger total" }); }
    const services = leg.services.map((s, j) => ({
      id: `s${i}-${j}`, no: String(j + 1), said: s.said, source: s.source, name: s.name, detail: s.detail, conditional: s.conditional, condition: s.condition, isNote: s.isNote,
      requested: s.requested, decision: s.isNote ? "note" : s.requested === "decline" ? "decline" : s.conditional || s.requested === "to_confirm" || s.requested === "unclear" ? "to_confirm" : "provide", kind: s.kind ?? null,
      answer: "", noteOnChecklist: s.isNote ? true : undefined, checklistNid: s.checklistNid, checklistLabel: s.checklistNid ? defLabel.get(s.checklistNid) ?? null : null,
      lowConfidence: !!s.lowConfidence, added: false,
    }));
    for (const s of services) s.agentDecision = s.decision;   // the agent's reading, kept so a person's change can be told apart
    return { index: i, direction: leg.direction ?? null, removed: false, added: false, fields, extra, services, tzChoice: null };
  });
  return { legs, notes: x.notes ?? [], conflicts: x.conflicts ?? [], requestSource: x.requestSource ?? null, version: 1 };
}

// ── Edits ───────────────────────────────────────────────────────────────────────────────────────────────
const KIND = Object.fromEntries(CORE.map(([k, , kind]) => [k, kind]));
export function validateValue(kind, raw) {
  const v = String(raw ?? "").trim();
  if (v === "") return { value: "", state: "not_given" };
  if (/^(tba|tbc|unknown|-{2,})$/i.test(v) && kind === "count") return { value: "", state: "unknown", said: v };
  switch (kind) {
    case "airport": return VALID.airport.test(v.toUpperCase()) ? { value: v.toUpperCase() } : { value: v.toUpperCase(), state: "invalid", note: "Not an ICAO airport code (four letters)" };
    case "time": return VALID.time.test(v) ? { value: v } : { value: v, state: "invalid", note: "Time must be HH:MM, 24-hour" };
    case "date": return parseDate(v) ? { value: v } : { value: v, state: "invalid", note: "Date must be DD Mon YYYY" };
    case "registration": return VALID.registration.test(v.toUpperCase()) ? { value: v.toUpperCase() } : { value: v.toUpperCase(), state: "invalid", note: "Not a registration (e.g. YL-ABC)" };
    case "type": return VALID.type.test(v.toUpperCase()) ? { value: v.toUpperCase() } : { value: v.toUpperCase(), state: "invalid", note: "Not an ICAO type designator" };
    case "flightNo": { const u = v.toUpperCase().replace(/\s+/g, ""); return VALID.flightNo.test(u) ? { value: u } : { value: u, state: "invalid", note: "Flight no. is 3–7 letters and digits" }; }
    case "count": return /^\d{1,3}$/.test(v) ? { value: String(Number(v)), state: Number(v) === 0 ? "zero" : undefined } : { value: v, state: "invalid", note: "A whole number, or Unknown" };
    default: return { value: v };
  }
}

/** Recompute UTC instants of a leg's times from its date and HH:MM values (after an edit or a tz choice). */
export function recomputeTimes(leg) {
  const f = Object.fromEntries(leg.fields.map((x) => [x.key, x]));
  const day = parseDate(f.date?.value);
  for (const k of ["std", "sta"]) {
    const t = f[k]; if (!t) continue;
    if (t.state === "tz_unknown") { t.utc = null; continue; }
    if (!day || !VALID.time.test(t.value)) { t.utc = null; continue; }
    let utc = `${day}T${t.value}:00Z`;
    if (k === "sta" && f.std?.utc && Date.parse(utc) <= Date.parse(f.std.utc)) utc = new Date(Date.parse(utc) + 86400000).toISOString().replace(/\.000Z$/, "Z");
    if (k === "sta" && t.date && t.date !== day && !t.edited && t.utc) continue; // keep an extracted next-day STA
    t.utc = utc;
  }
}

/** Applies the timezone choice (§I6.5): "utc" or "local". Sets both times as edited. */
export function applyTzChoice(leg, choice, who) {
  const f = Object.fromEntries(leg.fields.map((x) => [x.key, x]));
  const day = parseDate(f.date?.value) ?? f.std?.date;
  for (const k of ["std", "sta"]) {
    const t = f[k]; const clock = t.localTime ?? t.value; if (!clock || !day) continue;
    const apt = (k === "std" ? f.departure : f.arrival)?.airport;
    const d = k === "sta" && t.date ? t.date : day;
    const conv = choice === "utc" ? { utc: `${d}T${clock}:00Z`, note: null } : apt?.tz ? localToUtcChecked(d, clock, apt.tz, apt.city ?? apt.icao) : { utc: null, note: null };
    const utc = conv.utc;
    if (!utc) { if (conv.note) t.note = conv.note; continue; }   // not converted: the field stays blocking, with the reason
    t.edited = { was: `${clock} (${t.state === "tz_unknown" ? "timezone unknown" : t.state})`, by: who.name, at: who.at };
    t.state = "edited"; t.utc = utc; t.value = fmtTime(utc);
    t.note = choice === "utc" ? "Set as UTC by a person" : `Set as local time (${apt?.city ?? apt?.icao}, UTC${offsetMinutes(apt.tz, utc) >= 0 ? "+" : "−"}${Math.abs(offsetMinutes(apt.tz, utc) / 60)}) by a person · converted by code (tz data ${tzVersion()})`;
  }
  if (["std", "sta"].some((k) => f[k]?.state === "edited" && f[k]?.edited?.at === who.at)) leg.tzChoice = { choice, by: who.name, at: who.at };
}

/** Options for the timezone block: the UTC reading and the local reading of each time, with departs-in. */
export function tzOptions(leg, now = Date.now()) {
  const f = Object.fromEntries(leg.fields.map((x) => [x.key, x]));
  const day = parseDate(f.date?.value) ?? f.std?.date; if (!day) return null;
  const read = (choice) => {
    const out = {};
    for (const k of ["std", "sta"]) { const t = f[k]; const clock = t.localTime ?? t.value; const apt = (k === "std" ? f.departure : f.arrival)?.airport; out[k] = clock ? (choice === "utc" ? `${day}T${clock}:00Z` : apt?.tz ? localToUtc(day, clock, apt.tz) : null) : null; }
    return out;
  };
  const u = read("utc"), l = read("local");
  const offs = ["departure", "arrival"].map((k) => { const a = f[k]?.airport; return a?.tz && u.std ? { icao: a.icao, off: offsetMinutes(a.tz, u.std) } : null; });
  return { stdClock: f.std?.localTime ?? f.std?.value, staClock: f.sta?.localTime ?? f.sta?.value, utc: { ...u, departsInMin: u.std ? Math.round((Date.parse(u.std) - now) / 60000) : null }, local: { ...l, departsInMin: l.std ? Math.round((Date.parse(l.std) - now) / 60000) : null }, offsets: offs };
}

// ── Blockers and the Leon payload ───────────────────────────────────────────────────────────────────────
/** Maps a review leg onto the builder's input shape (the builder is THE LINE; this only renames). */
export function builderLeg(leg) {
  const f = Object.fromEntries(leg.fields.map((x) => [x.key, x]));
  const st = (x) => (x?.state === "edited" || x?.state === "checked" || x?.state === "converted" || x?.state === "cross_checked" || x?.state === "low_confidence" ? "extracted" : x?.state);
  const field = (x, value = x?.value) => (x ? { value: value === "" ? null : value, said: x.said, state: st(x) } : undefined);
  const flightType = leg.extra.find((e) => e.key === "flightType");
  return {
    departure: field(f.departure), arrival: field(f.arrival), flightNumber: field(f.flightNumber),
    std: f.std ? { ...field(f.std), value: { utc: f.std.utc } } : undefined, sta: f.sta ? { ...field(f.sta), value: { utc: f.sta.utc } } : undefined,
    registration: f.registration && f.registration.state !== "not_given" ? field(f.registration) : f.registration ? { state: "not_given" } : undefined,
    pax: { total: f.paxTotal ? { ...field(f.paxTotal, f.paxTotal.value === "" ? null : Number(f.paxTotal.value)), state: f.paxTotal.state === "zero" ? "zero" : st(f.paxTotal) } : undefined },
    flightType: flightType ? { value: flightType.value } : undefined,
  };
}

/** Every reason the page cannot confirm yet, in the design's words. Low confidence is a warning, not a blocker. */
export function blockersFor(review, request, { lookups } = {}) {
  const out = []; const warnings = [];
  const live = review.legs.filter((l) => !l.removed && !l.inLeon);
  if (request.duplicate && !request.duplicate_resolution) out.push("Resolve the possible duplicate above first.");
  if (!live.length) out.push("No legs left to create.");
  for (const leg of live) {
    const n = leg.index + 1;
    const f = Object.fromEntries(leg.fields.map((x) => [x.key, x]));
    const said = new Set(); // fields already reported for this leg, so the builder's reasons are not repeated
    if (f.std?.state === "tz_unknown" || f.sta?.state === "tz_unknown") { out.push(`Leg ${n}: timezone of STD and STA unknown.`); said.add("std"); said.add("sta"); }
    for (const x of leg.fields) {
      if (x.state === "tz_unknown") continue;
      const before = out.length;
      if (x.state === "not_given" && x.required) out.push(`Leg ${n}: ${x.label} is not given.`);
      else if (x.state === "invalid") out.push(`Leg ${n}: ${x.label} is not valid.`);
      else if (x.state === "conflict" && x.sent) out.push(`Leg ${n}: ${x.label} differs between the email and ${x.conflict?.attachmentName ?? "an attachment"}. Choose one.`);
      else if (x.state === "unknown" && x.sent) out.push(`Leg ${n}: ${x.label} is unknown (TBA). Leon needs a value, or clear it.`);
      else if (x.state === "leon_refused") out.push(`Leg ${n}: ${x.label} was refused by Leon. Change it, or resend it unchanged.`);
      if (out.length > before) said.add(x.key);
      if (x.state === "low_confidence") warnings.push(`Leg ${n}: ${x.label}`);
    }
    for (const s of leg.services) if (s.lowConfidence && !s.checked && s.decision !== "decline") warnings.push(`Leg ${n}: service ${s.name}`);
    // A scheduled flight's portal record names no services: a person chooses them, at least one, before Leon.
    if (request.request_type === "scheduled" && !leg.services.some((s) => !s.isNote && s.decision !== "decline" && s.decision !== "note")) out.push(`Leg ${n}: services are not given. Add at least one.`);
    const built = buildFlightCreate(builderLeg(leg), lookups ?? {}, "x");
    const KEY = { Departure: "departure", Arrival: "arrival", "Flight number": "flightNumber", STD: "std", STA: "sta", Registration: "registration", Passengers: "paxTotal" };
    if (!built.ok) for (const r of built.reasons) { const k = KEY[r.split(":")[0]]; if (k && said.has(k)) continue; if (/^STA is (not after|more than)/.test(r) && (said.has("std") || said.has("sta"))) continue; out.push(`Leg ${n}: ${r}.`.replace(/\.\.$/, ".")); }
  }
  return { blockers: [...new Set(out)], warnings };
}
