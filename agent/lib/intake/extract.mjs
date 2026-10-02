// Extraction: the model reads the email and its attachments and fills EXTRACTION_SCHEMA — nothing else.
// Code then does everything that is arithmetic or lookup, and sets the states the model is not allowed to:
//   airports  → Leon's airport table (IATA → ICAO "converted"; ICAO+IATA agreeing "cross_checked"; unknown "invalid")
//   times     → UTC from the stated zone; UTC and local both given are cross-checked with Leon's zone for the airport;
//               no zone anywhere → tz_unknown (blocks; the agent never guesses)
//   counts    → TBA / ----- → unknown (never 0); an explicit 0 → zero
//   confidence< 0.7 → low_confidence (warns, does not block)
// There is no per-sender parser and no template: the two samples are examples, not formats.
import { converseOnce } from "../bedrock.mjs";
import { EXTRACTION_SCHEMA, UNKNOWN_WORDS, validateExtraction } from "./schema.mjs";
import { airport, aircraftByRegistration, checklistDefinitions, localToUtcChecked, offsetMinutes } from "./leon-lookup.mjs";
import { tzVersion } from "../tzdata.mjs";

export const LOW_CONFIDENCE = 0.7;
const TEXT_LIMIT = 60_000;

/**
 * Attachments the code can tell are noise from their CONTENT alone: tiny images with no text (signature
 * icons, spacer pixels, logos). Everything else goes to the model, which classifies by what it reads.
 */
export function preclassify(att) {
  const isImage = /^image\//.test(att.sniffedType);
  if (isImage && att.bytes <= 12 * 1024) {
    const dim = imageSize(att.content);
    return { role: "noise", kind: "image", why: `A ${att.bytes < 1024 ? `${att.bytes}-byte` : `${Math.round(att.bytes / 1024)} KB`} image${dim ? ` (${dim.w}×${dim.h} px)` : ""}${att.inline ? " embedded in the message body" : ""}, no text: a logo or signature graphic. Ignored.`, read: false, byCode: true };
  }
  return null;
}
function imageSize(buf) {
  if (!buf || buf.length < 24) return null;
  if (buf.readUInt32BE(0) === 0x89504e47) return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  if (buf.subarray(0, 6).toString("latin1").startsWith("GIF8")) return { w: buf.readUInt16LE(6), h: buf.readUInt16LE(8) };
  return null;
}

const SYSTEM = `You read handling-request emails for Clearway, an aviation ground-handling and operations company, and fill a strict JSON schema. You never write anything for Leon (the ops system) — code does that from what you fill, after a person reviews it.

Rules, all mandatory:
1. Copy, never invent. Every field has "said": the source's own words, verbatim. If the source does not mention something, state "not_given", value null, said null.
2. "TBA", "TBC", "-----", "to be advised", "?" etc. mean UNKNOWN: state "unknown", value null, said = the words. Unknown is never 0 and never empty.
3. An explicit zero ("PAX 0", "0 pax", "nil") is state "zero", value 0.
4. Times: copy the clock reading into utcTime ONLY if the source marks it UTC/Z/GMT, itself or through a heading that covers it (e.g. "Schedule (all UTC times)"). Copy into localTime if it is marked local (LT/local) or has no zone at all. Put the exact zone words in zoneWords ("Z", "LT", "Schedule (all UTC times)"), or null when nothing states a zone. Do NOT convert between zones. If the source gives a time in UTC anywhere (even beside a local time), utcTime MUST carry it: a UTC time is used as it is, a local time has to be converted and is the last resort. date is YYYY-MM-DD for that time.
5. Airports: value is the code exactly as given (ICAO or IATA). If both are given ("EYVI VNO"), put the ICAO in value and both in said.
6. Aircraft type: if an ICAO designator is given, value = it; else the name as written.
7. Registration: as written (e.g. "YU-LSA"). A callsign or flight number goes in flightNumber (e.g. "AMQ5V", "YULSA").
8. Legs in time order. direction: inbound (arriving at the handling station), outbound (leaving it), ferry (positioning / empty), or null.
9. Services: one entry per requested line, per leg. If the email gives one service list for several legs, repeat it on each leg it covers ("SERVICES (INBOUND)" → the inbound leg). requested: "provide" for a plain request; "to_confirm" when the line asks us to confirm or is conditional ("if needed", "please confirm availability", "on request"); "decline" when the line says it is not needed ("none required"); set conditional and condition accordingly. A line that is too open to be a service ("Other services, if crew requests") is isNote true. Lines that are statements rather than services (billing, confidentiality, dangerous-goods declarations) are notes, not services. checklistNid: the nid from the Leon checklist list below that this service would be recorded under, or null if none fits; lower confidence when unsure.
10. Attachments: classify EVERY attachment by what it contains, not by its name: "request" (it is itself the handling request, e.g. an attached original email), "supporting" (GenDec, crew/pax list, permit, form), "noise" (logo, signature image, disclaimer), "unreadable" (you could not read it). Say why in one sentence, naming what you saw. Attachments already classified as noise by code are listed; keep that classification. In facts, copy what the attachment ITSELF states for each flight it covers (airport codes, date YYYY-MM-DD, registration, UTC times HH:MM, the crew and passenger TOTALS it prints), null for anything it does not state. Copy totals exactly as printed, even when they look wrong.
11. Reading order: read the email body first. For anything the request needs that the body does not give (schedule, aircraft, services, crew and passenger counts, people), look in the attachments: first an attached EMAIL (an Outlook .msg or .eml forwarded as an attachment — it is usually the original request), then the files inside it and the other files, and analyse them. When the body is only a cover note ("see attached", "FYI", a forward, a signature), the attached email or document IS the request: set requestSource.attachment to its exact name and read everything from it. Otherwise the body is the request and attachments only fill gaps and support it. Say which, and why, in requestSource. Never read values from the subject line alone when an attachment carries them.
12. Conflicts: when the body and an attachment disagree about a value (a count, a time, a registration), set that field's state to "conflict", keep the BODY's value in value, and add an entry to conflicts with both versions and the attachment name. Do not silently prefer either.
13. People (crew and passenger identities) go ONLY in personal.people, one entry each, with leg (0-based) or null for all legs. Names, dates of birth, nationalities, passport numbers and expiry exactly as written. Placeholder rows ("-----", "TBA") are not people — do not list them. Never put identities anywhere else, including notes and said.
14. crewCount and pax.total: the counts the request states. Infants: fill pax.infants as stated; do not fold them into adults.
15. confidence 0..1 per field: your own certainty that value is what the source means.
16. requestType, typeConfidence and ask. A message is "handling" ONLY when it ASKS us to provide or arrange something (handling, ground services, fuel, a permit, a slot…) for specific flights AND carries the flight details itself. Put the words that ask, copied verbatim from the message, in ask.said (and where they are in ask.source); if nothing in the message asks us for anything, ask.said is null and it is NOT "handling", however many flight details it has. "scheduled" is a provider's notification that a flight exists (it informs; the data lives in the provider's system). "other" is anything else (quote request, invoice, price bulletin, newsletter, chat). typeConfidence is how sure you are of requestType, 0 to 1: use 0.9 or more only when it is plain; below 0.7 when a careful colleague could read it differently. Give the reason in whyType in one sentence. Never choose "handling" because the message merely mentions flights.
Return ONLY the JSON object. No prose, no code fences.`;

/** Builds the user turn: body, attachment texts, noise list, the live Leon checklist list, the schema. */
async function buildMessages({ message, bodyText, attachments, defs }) {
  const blocks = [];
  const head = [`From: ${message.from ?? "?"}`, `To: ${(message.to ?? []).join(", ")}`, `Date: ${message.date ?? "?"}`, `Subject: ${message.subject ?? ""}`].join("\n");
  blocks.push({ text: `THE EMAIL\n${head}\n\n--- body ---\n${String(bodyText ?? "").slice(0, TEXT_LIMIT)}\n--- end of body ---` });
  for (const a of attachments) {
    if (a.pre) { blocks.push({ text: `ATTACHMENT "${a.name}" — already classified by code as noise: ${a.pre.why}` }); continue; }
    if (a.text) blocks.push({ text: `ATTACHMENT "${a.name}" (${a.sniffedType}${a.pages ? `, ${a.pages} page${a.pages === 1 ? "" : "s"}` : ""})\n--- text ---\n${String(a.text).slice(0, TEXT_LIMIT)}\n--- end ---` });
    else if (a.docBlock) { blocks.push({ text: `ATTACHMENT "${a.name}" (${a.sniffedType}) — no text layer; the document follows.` }); blocks.push(a.docBlock); }
    else blocks.push({ text: `ATTACHMENT "${a.name}" (${a.sniffedType}) — could not be read: ${a.readNote ?? "no readable content"}.` });
  }
  blocks.push({ text: `LEON OPS CHECKLIST DEFINITIONS (nid | section | label) — choose checklistNid only from these:\n${defs.map((d) => `${d.nid} | ${d.section} | ${d.label}`).join("\n")}` });
  blocks.push({ text: `THE JSON SCHEMA YOUR ANSWER MUST MATCH EXACTLY:\n${JSON.stringify(EXTRACTION_SCHEMA)}` });
  return [{ role: "user", content: blocks }];
}

function parseJson(text) {
  const t = String(text ?? "").trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  const i = t.indexOf("{"), j = t.lastIndexOf("}");
  if (i < 0 || j < i) throw new Error("the model did not return JSON");
  return JSON.parse(t.slice(i, j + 1));
}

/**
 * Runs the model. Returns { raw, model, usage } or throws with a plain reason. An answer that does not fit the
 * schema is sent back once with the validator's errors; a second miss fails the stage — never half-accepted.
 */
export async function runModel({ message, bodyText, attachments }) {
  const defs = await checklistDefinitions().catch(() => []);
  const messages = await buildMessages({ message, bodyText, attachments, defs });
  const usage = { inputTokens: 0, outputTokens: 0 };
  let res = await converseOnce({ tier: "extraction", system: SYSTEM, messages, maxTokens: 16000, temperature: 0 });
  usage.inputTokens += res.inputTokens ?? 0; usage.outputTokens += res.outputTokens ?? 0;
  let raw, errs;
  try { raw = parseJson(res.text); errs = validateExtraction(raw); } catch (e) { raw = null; errs = [String(e.message)]; }
  if (errs.length) {
    const retry = [...messages, { role: "assistant", content: [{ text: res.text || "{}" }] }, { role: "user", content: [{ text: `That answer does not match the schema:\n${errs.slice(0, 30).join("\n")}\nReturn the corrected JSON object only.` }] }];
    res = await converseOnce({ tier: "extraction", system: SYSTEM, messages: retry, maxTokens: 16000, temperature: 0 });
    usage.inputTokens += res.inputTokens ?? 0; usage.outputTokens += res.outputTokens ?? 0;
    try { raw = parseJson(res.text); errs = validateExtraction(raw); } catch (e) { raw = null; errs = [String(e.message)]; }
    if (errs.length) { const err = new Error(`The model's answer did not fit the extraction schema (${errs.length} problem${errs.length === 1 ? "" : "s"}).`); err.schemaErrors = errs.slice(0, 20); throw err; }
  }
  // A checklist nid the model named must exist in Leon's live list; otherwise it is dropped (never trusted).
  const known = new Set(defs.map((d) => d.nid));
  for (const leg of raw.legs) for (const s of leg.services) if (s.checklistNid != null && !known.has(s.checklistNid)) { s.checklistNid = null; s.confidence = Math.min(s.confidence ?? 1, 0.5); }
  return { raw, modelId: res.modelId, tier: res.effectiveTier, usage, defs };
}

// ── Code-side normalisation ─────────────────────────────────────────────────────────────────────────────
const hhmm = (t) => (/^\d{1,2}:\d{2}$/.test(String(t ?? "").trim()) ? String(t).trim().padStart(5, "0") : null);
const fmtOff = (m) => `UTC${m >= 0 ? "+" : "−"}${Math.floor(Math.abs(m) / 60)}${Math.abs(m) % 60 ? `:${String(Math.abs(m) % 60).padStart(2, "0")}` : ""}`;
function lowConf(f) { if (f && f.state === "extracted" && f.confidence != null && f.confidence < LOW_CONFIDENCE) { f.state = "low_confidence"; f.note = f.note ?? "The agent is not sure it read this right."; } }
function countField(f) {
  if (!f) return f;
  if (f.said && UNKNOWN_WORDS.test(String(f.said).replace(/^[^:]*:\s*/, "").replace(/#?\s*(CREW|PAX)\s*/i, ""))) { f.state = "unknown"; f.value = null; }
  if (f.state === "unknown") { f.value = null; f.note = `Stated as ${JSON.stringify(f.said ?? "TBA")}. Not the same as 0.`; }
  else if (f.state === "zero" || (f.value === 0 && f.state === "extracted")) { f.state = "zero"; f.value = 0; f.note = "Zero, stated in the request."; }
  else if (f.value != null && !(Number.isInteger(f.value) && f.value >= 0)) { const n = Number(f.value); if (Number.isInteger(n) && n >= 0) f.value = n; else { f.state = "invalid"; f.note = "Not a whole number."; } }
  lowConf(f);
  return f;
}

async function airportField(f) {
  if (!f || f.state !== "extracted" && f.state !== "low_confidence" && f.state !== "conflict") return f;
  const given = String(f.value ?? "").trim().toUpperCase();
  const a = await airport(given).catch(() => undefined);
  if (a === undefined) { f.note = "Leon did not answer the airport check. Check the code."; f.state = "low_confidence"; return f; }
  if (!a || !a.icao) { f.state = "invalid"; f.note = "Not an airport code Leon knows."; return f; }
  f.airport = { icao: a.icao, iata: a.iata, city: a.city, tz: a.tz };
  const saidCodes = String(f.said ?? "").toUpperCase().match(/\b[A-Z]{3,4}\b/g) ?? [];
  if (given !== a.icao) { f.value = a.icao; f.state = f.state === "conflict" ? "conflict" : "converted"; f.note = "IATA → ICAO"; }
  else if (a.iata && saidCodes.includes(a.iata) && saidCodes.includes(a.icao)) { f.value = a.icao; if (f.state !== "conflict") { f.state = "cross_checked"; f.note = "ICAO and IATA both given, and agree"; } }
  else f.value = a.icao;
  lowConf(f);
  return f;
}

function timeField(f, apt, label) {
  if (!f || !f.value || f.state === "not_given" || f.state === "unknown") return f;
  const v = f.value; const date = /^\d{4}-\d{2}-\d{2}$/.test(String(v.date ?? "")) ? v.date : null;
  const u = hhmm(v.utcTime), l = hhmm(v.localTime);
  const tz = apt?.tz ?? null; const city = apt?.city ?? apt?.icao ?? "the airport";
  if (!date) { f.state = "not_given"; f.note = `No date for ${label}.`; f.value = { ...v, utc: null }; return f; }
  if (u) {
    const utc = `${date}T${u}:00Z`; f.value = { ...v, utc };
    if (l && tz) {
      // The source gave UTC: that is the value. The local reading is only cross-checked, and only when this
      // server's tz data is trusted; otherwise UTC stands and the note says the check was not made.
      const off = offsetMinutes(tz, utc);
      if (off == null) { f.note = `UTC as given. The local time beside it was not cross-checked: this server's time-zone data (${tzVersion()}) is out of date.`; lowConf(f); return f; }
      const expect = new Date(Date.parse(utc) + off * 60000).toISOString().slice(11, 16);
      if (expect === l) { if (f.state !== "conflict") { f.state = "cross_checked"; f.note = `UTC and local agree (${city}, ${fmtOff(off)})`; } }
      else { f.state = "conflict"; f.note = `UTC ${u} and local ${l} do not agree for ${city} (${fmtOff(off)} there on that date).`; }
    } else if (f.state === "extracted" && /all\s+utc|utc\s+times/i.test(String(v.zoneWords ?? ""))) { f.note = `UTC, from "${v.zoneWords}"`; }
    lowConf(f);
    return f;
  }
  if (l && /\b(LT|local)\b/i.test(String(v.zoneWords ?? ""))) {
    if (!tz) { f.state = "tz_unknown"; f.value = { ...v, utc: null }; f.note = `Local time, but the time zone of ${city} is not known.`; return f; }
    // Last resort: the source gave only a local time. Converted by code, marked as converted, with the tz data
    // it was done with; refused (and blocking) when the answer is not certain.
    const c = localToUtcChecked(date, l, tz, city);
    if (!c.utc) { f.state = "invalid"; f.value = { ...v, utc: null }; f.note = c.note; return f; }
    const off = offsetMinutes(tz, c.utc);
    f.value = { ...v, utc: c.utc }; if (f.state !== "conflict") { f.state = "converted"; f.note = `${city} local, ${fmtOff(off)} → UTC · converted by code (tz data ${tzVersion()})`; }
    lowConf(f);
    return f;
  }
  if (l) { f.state = "tz_unknown"; f.value = { ...v, utc: null }; f.note = "No timezone anywhere in the request"; return f; }
  f.state = "not_given"; f.value = { ...v, utc: null }; f.note = `No ${label} time.`; return f;
}

/** Turns a validated model answer into the reviewed-screen shape: code states set, notes in plain words. */
export async function normalise(raw) {
  const x = structuredClone(raw);
  for (const leg of x.legs) {
    await airportField(leg.departure); await airportField(leg.arrival);
    timeField(leg.std, leg.departure?.airport, "STD"); timeField(leg.sta, leg.arrival?.airport, "STA");
    if (leg.std?.value?.utc && leg.sta?.value?.utc && Date.parse(leg.sta.value.utc) <= Date.parse(leg.std.value.utc) && leg.sta.state !== "conflict") { leg.sta.state = "invalid"; leg.sta.note = "STA is not after STD."; }
    for (const k of ["crewCount"]) countField(leg[k]);
    for (const k of ["total", "adults", "children", "infants"]) countField(leg.pax?.[k]);
    if (leg.pax?.infants?.value > 0 && leg.pax.total && leg.pax.total.state !== "unknown") { leg.pax.total.state = leg.pax.total.state === "conflict" ? "conflict" : "low_confidence"; leg.pax.total.note = "The request lists infants. Leon takes one passenger total: check how infants should be counted."; }
    const reg = leg.registration;
    if (reg && (reg.state === "extracted" || reg.state === "low_confidence") && reg.value) {
      reg.value = String(reg.value).toUpperCase().replace(/\s+/g, "");
      const a = await aircraftByRegistration(reg.value).catch(() => undefined);
      if (a === undefined) reg.note = "Leon did not answer the fleet check.";
      else if (!a) { reg.state = "invalid"; reg.note = "Not an aircraft of this operator in Leon."; }
      else { reg.aircraft = { nid: a.nid, type: a.type }; if (reg.state === "extracted") { reg.state = "cross_checked"; reg.note = `In the Leon fleet${a.type ? ` as ${a.type}` : ""}`; } }
    }
    const t = leg.aircraftType;
    if (t && t.value && /^[A-Z][A-Z0-9]{1,3}$/.test(String(t.value)) && t.said && String(t.said).trim().toUpperCase() !== String(t.value).toUpperCase() && t.state === "extracted") { t.state = "converted"; t.note = "Name → ICAO type"; }
    for (const f of [leg.aircraftType, leg.flightNumber, leg.flightType]) lowConf(f);
    if (leg.flightNumber?.value) leg.flightNumber.value = String(leg.flightNumber.value).toUpperCase().replace(/\s+/g, "");
    for (const s of leg.services) s.lowConfidence = s.confidence != null && s.confidence < LOW_CONFIDENCE;
  }
  for (const f of [x.reference, x.operator, x.requester?.company]) lowConf(f);
  return x;
}

/** Our reference for the thread: the sender's, or {callsign}-{DDMONYY} of the first leg (said so on the page). */
export function referenceFor(x, subject) {
  const r = x.reference?.value ? String(x.reference.value).trim().toUpperCase() : null;
  // A reference is a short token (CIMOG1, BJD-2610-044), never a sentence or a subject line.
  if (r && /^[A-Z0-9][A-Z0-9\-\/.]{2,23}$/.test(r) && /\d/.test(r)) return { reference: r, built: false };
  const leg = x.legs[0];
  const cs = leg?.flightNumber?.value ?? String(leg?.registration?.value ?? "").replace(/-/g, "");
  const d = leg?.std?.value?.utc ?? (leg?.std?.value?.date ? `${leg.std.value.date}T00:00:00Z` : null);
  if (cs && d) { const t = new Date(d); return { reference: `${cs}-${String(t.getUTCDate()).padStart(2, "0")}${["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"][t.getUTCMonth()]}${String(t.getUTCFullYear()).slice(2)}`, built: true }; }
  return { reference: (String(subject ?? "").match(/\b[A-Z]{2,5}-?\d{3,}[A-Z0-9-]*\b/) ?? [null])[0] ?? "UNREFERENCED", built: true };
}

/**
 * Code-side enforcement after the model (never trusted to follow rules 12–13 on its own):
 *  - every conflict it listed marks the field it names as `conflict`, with both versions attached;
 *  - a conflict about a personal field is reduced to a count, without values;
 *  - every identity string is scrubbed out of everything except `personal`.
 */
import { personalTokens, scrubDeep } from "./personal.mjs";
export function enforce(x) {
  const people = x.personal?.people ?? [];
  const tokens = personalTokens(people);
  const conflicts = []; let personalConflicts = 0; const personalAtt = new Set();
  for (const c of x.conflicts ?? []) {
    if (/^personal\b|passport|dob|date of birth|\bname\b/i.test(c.field)) { personalConflicts += 1; if (c.attachmentName) personalAtt.add(c.attachmentName); continue; }
    const m = /^legs\[(\d+)\]\.(.+)$/.exec(c.field.replace(/\s.*$/, ""));
    const leg = m ? x.legs[Number(m[1])] : (c.leg != null ? x.legs[c.leg] : null);
    const pathParts = m ? m[2].split(".") : [c.field];
    let f = leg; for (const k of pathParts) f = f?.[k];
    if (f && typeof f === "object" && "state" in f) { f.state = "conflict"; f.conflict = { body: c.body, attachment: c.attachment, attachmentName: c.attachmentName }; f.note = `The email says ${JSON.stringify(c.body)}; ${c.attachmentName ?? "an attachment"} says ${JSON.stringify(c.attachment)}. Choose one.`; }
    conflicts.push(c);
  }
  // Code compares each attachment's own facts with the body's leg values (same route, or same date + one airport).
  const norm = (v) => String(v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  for (const att of x.attachments ?? []) for (const fact of att.facts ?? []) {
    const leg = x.legs.find((l) => { const d = norm(l.departure?.value), a = norm(l.arrival?.value); const fd = norm(fact.departure), fa = norm(fact.arrival); return (fd && fa && ((d === fd && a === fa) || (l.departure?.airport?.iata === fd && l.arrival?.airport?.iata === fa))); });
    if (!leg) continue;
    const check = (f, factValue, label) => {
      if (!f || factValue == null) return;
      const bodyVal = f.state === "unknown" ? "TBA" : f.value;
      const same = f.state === "unknown" ? false : String(bodyVal) === String(factValue);
      if (same || f.state === "conflict") return;
      f.state = "conflict"; f.conflict = { body: f.said ?? String(bodyVal ?? ""), attachment: String(factValue), attachmentName: att.name };
      f.note = `The email says ${JSON.stringify(f.said ?? bodyVal)}; ${att.name} says ${factValue}. Choose one.`;
      conflicts.push({ field: `legs[${x.legs.indexOf(leg)}].${label}`, leg: x.legs.indexOf(leg), body: f.said ?? String(bodyVal ?? ""), attachment: String(factValue), attachmentName: att.name, byCode: true });
    };
    check(leg.crewCount, fact.crewTotal, "crewCount");
    check(leg.pax?.total, fact.paxTotal, "pax.total");
    if (fact.registration && leg.registration?.value && norm(fact.registration) !== norm(leg.registration.value)) check(leg.registration, fact.registration, "registration");
    // Times: compare as HH:MM UTC; on mismatch mark the real field.
    for (const [key, hh] of [["std", fact.stdUtc], ["sta", fact.staUtc]]) {
      const f = leg[key]; if (!hh || !f?.value?.utc) continue;
      if (f.value.utc.slice(11, 16) !== String(hh).padStart(5, "0") && f.state !== "conflict") { f.state = "conflict"; f.conflict = { body: f.said ?? f.value.utc.slice(11, 16), attachment: `${hh} UTC`, attachmentName: att.name }; f.note = `The email says ${f.value.utc.slice(11, 16)} UTC; ${att.name} says ${hh} UTC. Choose one.`; conflicts.push({ field: `legs[${x.legs.indexOf(leg)}].${key}`, leg: x.legs.indexOf(leg), body: f.value.utc.slice(11, 16), attachment: hh, attachmentName: att.name, byCode: true }); }
    }
  }
  if (personalConflicts) x.notes.push({ text: `Crew or passenger details differ between the email body and ${[...personalAtt].join(", ") || "an attachment"} for ${personalConflicts} ${personalConflicts === 1 ? "entry" : "entries"} (not shown here; see Crew and passengers).`, source: "Agent" });
  x.conflicts = conflicts;
  const { personal, ...rest } = x;
  return { ...scrubDeep(rest, tokens), personal: { people } };
}
