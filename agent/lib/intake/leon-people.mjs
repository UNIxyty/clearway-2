// Passengers and crew to Leon. Every value is the request's own, as the review holds it (intake_extractions.personal);
// nothing is invented, reformatted or completed.
//
// What Leon's API takes (live schema, cwy-cwy):
//   Passengers — into Leon's passenger DATABASE as contacts with passports (leon-pax.mjs, decided 2026-10-08). The
//     request's own list, as it gave it, is recorded in the flight's OPS notes (passengerBlockFor, part of the create):
//     Leon's TEXT tab and DATABASE tab cannot both hold data (contacts clear the text), so the provenance lives there.
//   Crew — Leon assigns crew to a flight only by its own crew-member id (crewPanel.crew.assign: loginNid), and a crew
//     member exists only as a full Leon user record (crewMember.create). The agent creates none. There is no crew-count
//     field on FlightCreate / FlightUpdate (Flight.crewProperty counts are derived from assignments). So the operator's
//     crew — names and details as the request gave them, and the count — go into the flight's OPS notes, under a
//     heading that says they are the operator's crew per the request and NOT assigned in Leon. The block is part of the
//     FlightCreate itself (send.mjs): Leon's only notes write is a full replace (FlightUpdate.opsNotes, no append), so
//     adding it later would mean reading the notes and writing them back — and a dispatcher's edit made in between
//     would be lost. Written with the create, there is nothing to read back and nothing to overwrite.
//
// Each write follows the rule of every Leon write: the attempt is recorded (intake_leon_people_writes, state 'sending')
// BEFORE the call, then the outcome. The row holds a hash and a count — never a name, date or document number — and so
// do the audit rows. A row still 'sending' after a restart becomes 'unknown'; nothing is retried automatically.
import { createHash } from "node:crypto";
import { rest } from "../knowledge/retrieval.mjs";
import { audit } from "../store.mjs";
import { leonGraphql } from "./leon-client.mjs";
import { personalTokens, scrubString } from "./personal.mjs";
import { contactPlan, paxPlanHash, writeLegPax } from "./leon-pax.mjs";

export const KINDS = ["pax", "crew"];
const sha = (s) => createHash("sha256").update(String(s)).digest("hex");
/** The hash recorded for a passenger-list write: the text and the count Leon was given. The manifest compares Leon's list with it. */
export const paxContentHash = (text, count) => sha(`${text ?? ""}\u0000${count ?? ""}`);
const timeout = () => ({ timeoutMs: Number(process.env.INTAKE_LEON_TIMEOUT_MS || 30000) });
const clean = (v) => (v == null ? "" : String(v).trim());

/** The people the request gives for one leg: that leg's rows plus rows for every leg (leg null), in the request's order. */
export function peopleForLeg(people = [], legIndex) {
  const on = (p) => p.leg === legIndex || p.leg == null;
  return { pax: people.filter((p) => p.list === "pax" && on(p)), crew: people.filter((p) => p.list === "crew" && on(p)) };
}

/** One person, every value verbatim; a value the request did not give is left out (never a placeholder). */
function personLine(p, n, { role = false } = {}) {
  const parts = [];
  if (role && clean(p.role)) parts.push(clean(p.role));
  parts.push([clean(p.salutation), clean(p.name)].filter(Boolean).join(" "));
  if (clean(p.sex)) parts.push(clean(p.sex));
  if (!role && clean(p.type)) parts.push(clean(p.type));
  if (clean(p.dob)) parts.push(`DOB ${clean(p.dob)}`);
  if (clean(p.nationality)) parts.push(clean(p.nationality));
  if (clean(p.passport)) parts.push(`Passport ${clean(p.passport)}`);
  if (clean(p.expiry)) parts.push(`Expires ${clean(p.expiry)}`);
  return `${n}. ${parts.filter(Boolean).join(" · ")}`;
}

export const paxHeading = (marker) => `PASSENGERS per the handling request · ${marker}`;
/** The request's passenger list for the flight's OPS notes: the client's own words, as the agent recorded them. */
export function passengerBlockFor(pax, { marker, reference } = {}) {
  if (!pax.length) return null;
  const lines = [paxHeading(marker), `The client's passenger list as the request${reference ? ` ${reference}` : ""} gave it, recorded by the Clearway Ops Agent (not checked against documents). The passengers are in the flight's passenger database (PAX → DATABASE).`,
    ...pax.map((p, i) => personLine(p, i + 1))];
  return { text: lines.join("\n"), people: pax.length };
}
/** The request's list as text, for comparing with a text list in Leon (the manifest's intake fallback). count = the reviewed passenger total (what paxNumber carries), else the names listed. */
export function passengerTextFor(pax, { reference, paxNumber } = {}) {
  if (!pax.length) return null;
  const text = [`Passengers as given in handling request ${reference ?? ""}`.trim() + " — recorded by the Clearway Ops Agent from the request, not checked against documents.", "",
    ...pax.map((p, i) => personLine(p, i + 1))].join("\n");
  return { text, count: Number.isInteger(paxNumber) ? paxNumber : pax.length, people: pax.length };
}

export const crewHeading = (marker) => `OPERATOR'S CREW per the handling request · ${marker}`;
/** The crew block for the flight's OPS notes. Written when the request names crew or states a crew count. */
export function crewNoteFor(crew, { marker, crewCount } = {}) {
  const count = clean(crewCount);
  if (!crew.length && !/^\d+$/.test(count)) return null;
  const lines = [crewHeading(marker),
    "Recorded by the Clearway Ops Agent from the request. NOT assigned in Leon: Leon assigns crew only from its own crew records, and the agent creates none.",
    count ? `Crew count per the request: ${count}` : `Crew count: not stated in the request (${crew.length} named)`];
  if (crew.length) lines.push(...crew.map((p, i) => personLine(p, i + 1, { role: true })));
  else lines.push("No crew names in the request.");
  return { text: lines.join("\n"), count: count || null, people: crew.length };
}

/** What will happen to a leg's people, for the confirm dialog and the page: counts only; hashes bind a confirmation. */
export function peoplePlan(people, leg, { marker, crewCount, nameOrder = null }) {
  const { pax, crew } = peopleForLeg(people, leg.index);
  const plans = pax.map((p) => contactPlan(p, nameOrder)); const c = crewNoteFor(crew, { marker, crewCount });
  return { pax: pax.length ? { people: pax.length, count: pax.length, undeclaredSplits: plans.filter((x) => x.splitHow === "undeclared" || x.splitHow === "single").length, sha: paxPlanHash(plans) } : null, crew: c ? { people: c.people, count: c.count, sha: sha(c.text) } : null };
}
/** One hash per leg for everything about its people, so a confirmation is bound to them as to the flight payload. */
export const peopleHash = (plan) => sha(`${plan.pax?.sha ?? "-"}|${plan.crew?.sha ?? "-"}`);

/** Leon's reason in plain words with every personal value removed (a validation message can echo the input). */
function refusalWords(errors, tokens) {
  const e = errors?.[0] ?? {}; const msg = String(e.message ?? "Leon refused it.");
  const reason = (/with reason '([^']+)'/.exec(msg)?.[1] ?? msg).replace(/got invalid value "[^"]*"/g, "got an invalid value");
  return { words: `Leon: ${scrubString(reason, tokens).slice(0, 300)}`, category: e.extensions?.category ?? null };
}

async function insertAttempt(row) {
  const ins = await rest("intake_leon_people_writes?on_conflict=request_id,leg_index,kind,content_sha256", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=representation" }, body: JSON.stringify([row]) });
  if (Array.isArray(ins) && ins.length) return { row: ins[0], fresh: true };
  const prior = (await rest(`intake_leon_people_writes?select=*&request_id=eq.${row.request_id}&leg_index=eq.${row.leg_index}&kind=eq.${row.kind}&content_sha256=eq.${row.content_sha256}`))?.[0];
  if (prior?.state === "not_in_leon") {
    const taken = await rest(`intake_leon_people_writes?id=eq.${prior.id}&state=eq.not_in_leon`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ state: "sending", leon_error: null, leon_flight_nid: row.leon_flight_nid, sent_by_email: row.sent_by_email, updated_at: new Date().toISOString() }) });
    if (Array.isArray(taken) && taken.length) return { row: taken[0], fresh: true };
  }
  return { row: prior, fresh: false };
}

/** The crew block is sent inside the leg's FlightCreate: its attempt row is written before that call, settled after. */
export async function recordCrewAttempt({ requestId, leg, crew, user }) {
  const { row, fresh } = await insertAttempt({ request_id: requestId, leg_index: leg.index, kind: "crew", leon_flight_nid: "(with the flight)", content_sha256: sha(crew.text), people_count: crew.people, state: "sending", sent_by_email: user.email });
  return fresh ? row.id : null;
}
export async function settleCrew(rowId, { state, flightNid = null, error = null, httpStatus = null, ms = null }) {
  if (!rowId) return;
  await rest(`intake_leon_people_writes?id=eq.${rowId}`, { method: "PATCH", body: JSON.stringify({ state, ...(flightNid ? { leon_flight_nid: String(flightNid) } : {}), leon_error: error, http_status: httpStatus, answered_ms: ms, updated_at: new Date().toISOString() }) }).catch(() => {});
}
/** A person settled an unknown leg: its crew block went (or did not go) with it. */
export async function settleCrewForLeg(requestId, legIndex, state, flightNid = null) {
  await rest(`intake_leon_people_writes?request_id=eq.${requestId}&leg_index=eq.${legIndex}&kind=eq.crew&state=eq.unknown`, { method: "PATCH", body: JSON.stringify({ state, ...(flightNid ? { leon_flight_nid: String(flightNid) } : {}), updated_at: new Date().toISOString() }) }).catch(() => {});
}
/** The stored copy of a payload: the crew and passenger blocks replaced by a line that says what each was (no names in
 *  the send log). */
export function payloadForLog(payload, crew, paxBlock = null) {
  if (typeof payload?.opsNotes !== "string") return payload;
  let notes = payload.opsNotes;
  if (crew?.text && notes.includes(crew.text)) notes = notes.replace(crew.text, `${crew.text.split("\n")[0]}\n[${crew.people ? `${crew.people} crew` : "crew count"}${crew.count ? ` · count ${crew.count}` : ""} · sent to Leon in these notes; names and documents are not kept in the send log]`);
  if (paxBlock?.text && notes.includes(paxBlock.text)) notes = notes.replace(paxBlock.text, `${paxBlock.text.split("\n")[0]}\n[${paxBlock.people} passengers as the request gave them · sent to Leon in these notes; names and documents are not kept in the send log]`);
  return notes === payload.opsNotes ? payload : { ...payload, opsNotes: notes };
}

/** One created leg's passengers into Leon's passenger database (leon-pax.mjs); its crew went with the create. */
export async function writeLegPeople({ requestId, leg, flightNid, people, nameOrder = null, user }) {
  return [await writeLegPax({ requestId, leg, flightNid, pax: peopleForLeg(people, leg.index).pax, nameOrder, user, people })];
}

/** On start: a passenger/crew write that never recorded its outcome is unknown. Nothing retries. */
export async function recoverPeopleOnStart() {
  const rows = await rest(`intake_leon_people_writes?state=eq.sending`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ state: "unknown", leon_error: "The service stopped during the write; the result was never recorded. Check Leon.", updated_at: new Date().toISOString() }) }).catch(() => []);
  for (const w of rows ?? []) {
    await rest(`intake_requests?id=eq.${w.request_id}`, { method: "PATCH", body: JSON.stringify({ status: "needs_you", status_reason: `Leon did not answer · leg ${w.leg_index + 1} ${w.kind === "crew" ? "crew" : w.kind === "contact" ? "a passenger's contact" : "passengers"} unknown · check Leon`, updated_at: new Date().toISOString() }) }).catch(() => {});
    await audit({ kind: `intake.leon_${w.kind}_unknown`, success: false, error: "service restarted during a write", confirmationStatus: "not_required", detail: { requestId: w.request_id, leg: w.leg_index, writeId: w.id } }).catch(() => {});
  }
  return (rows ?? []).length;
}

/** Plain words for one outcome, for the page, the stage and the email. Counts only. */
export function outcomeWords(o) {
  const n = (k, c) => `${c} ${k === "pax" ? (c === 1 ? "passenger" : "passengers") : "crew"}`;
  if (o.kind === "pax") {
    if (o.state === "none") return "No passenger names in the request: nothing written to Leon's passenger database.";
    if (o.state === "in_leon") return `${n("pax", o.people)} in the flight's passenger database in Leon (PAX → DATABASE): ${o.created ?? 0} new contact${o.created === 1 ? "" : "s"}, ${o.reused ?? 0} existing contact${o.reused === 1 ? "" : "s"} reused${o.differs?.length ? `; ${o.differs.length} reused contact${o.differs.length === 1 ? " differs" : "s differ"} from the request (${o.differs.map((d) => `passenger ${d.row}: ${d.fields.join(", ")}`).join("; ")}) — the contacts were not changed, a person decides` : ""}${o.notes?.length ? `; left out where the request gave nothing usable (${o.notes.map((x) => `passenger ${x.row}: ${x.notes.join(", ")}`).join("; ")})` : ""}${o.already ? " (already there)" : ""}.`;
    return `Passengers NOT in Leon's passenger database: ${o.error ?? "no answer"}`;
  }
  if (o.state === "none") return "No crew in the request.";
  if (o.state === "in_leon") return `${o.people ? n("crew", o.people) : "The crew count"} written into the flight's OPS notes with the flight, as the operator's crew — NOT assigned in Leon.`;
  return `Crew NOT recorded in Leon: ${o.error ?? "no answer"}`;
}
