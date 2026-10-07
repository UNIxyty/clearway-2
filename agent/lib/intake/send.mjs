// The Leon write path (§I10, §I11, §I14.8–9). Every write to Leon goes through here.
//
//  prepareSend  — builds each leg's FlightCreate with THE LINE (leon-payload.mjs) from the REVIEWED values,
//                 plans the checklist from the service decisions and Leon's live definitions, and issues a
//                 one-time confirmation token bound to the hash of exactly those payloads (confirm.mjs).
//  confirmSend  — spends the token (single use; a double click shares one execution), re-checks for
//                 duplicates, then per leg:  1. writes the attempt to intake_leon_writes (state 'sending',
//                 payload + hash) BEFORE calling Leon;  2. calls Leon;  3. records the outcome.
//                 A refusal is 'not_in_leon' with Leon's own words; a network error, timeout or 5xx is
//                 'unknown' and STOPS the send — nothing is retried automatically, ever.
//  services     — NEVER written as checklist statuses: every checklist item stays at Leon's default ("?"),
//                 because a status claims work has happened and that is ops' call (decided 2026-10-03). The
//                 client's requested services go, in the requester's own words with the review decisions, into
//                 the flight's OPS NOTES (`opsNotes` in FlightCreate: the field Leon shows on the flight, the
//                 same one that carries our marker), as part of the create itself. Nothing in it reads as done.
//  people       — a leg's crew go IN its FlightCreate, as a block in the OPS notes (the operator's crew, not assigned:
//                 no read-back of the notes ever, so no dispatcher edit can be overwritten); its passengers go to
//                 Leon's passenger list (text) right after Leon confirms the flight. leon-people.mjs says why. Bound
//                 to the confirmation like the payload; recorded before each call; the send log keeps no names.
//  recoverOnStart — a row still 'sending' after a restart becomes 'unknown': a person checks Leon.
import { createHash } from "node:crypto";
import { rest } from "../knowledge/retrieval.mjs";
import { audit } from "../store.mjs";
import { issueConfirmation, beginConfirmation, settleConfirmation, failConfirmation, getConfirmation, argsHash } from "../confirm.mjs";
import { buildFlightCreate } from "./leon-payload.mjs";
import { leonGraphql } from "./leon-client.mjs";
import { aircraftByRegistration, flightsBetween } from "./leon-lookup.mjs";
import { blockersFor, builderLeg } from "./review.mjs";
import { findDuplicates, setStage } from "./pipeline.mjs";
import { composeOutcome, sendIntakeEmail } from "./notify.mjs";
import { peoplePlan, peopleHash, writeLegPeople, recoverPeopleOnStart, outcomeWords, peopleForLeg, crewNoteFor, payloadForLog, recordCrewAttempt, settleCrew, settleCrewForLeg } from "./leon-people.mjs";
import { personalTokens, scrubString } from "./personal.mjs";

export const TOOL = "intake.leon_send";
export const PEOPLE_STAGE = "Passengers and crew";
const canonical = (v) => Array.isArray(v) ? `[${v.map(canonical).join(",")}]` : v && typeof v === "object" ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}` : JSON.stringify(v ?? null);
export const payloadHash = (p) => createHash("sha256").update(canonical(p)).digest("hex");
export const markerFor = (requestId, legIndex) => `CWY-INTAKE ${requestId}/${legIndex}`;
/** The flight's OPS notes: our marker on the first line (the look-ups search for it), then the services note. */
export const opsNotesFor = (marker, note) => (note ? `${marker}\n\n${note}` : marker);
const tripStatus = () => (["CONFIRMED", "OPTION", "OPPORTUNITY"].includes(String(process.env.INTAKE_LEON_TRIP_STATUS || "").toUpperCase()) ? String(process.env.INTAKE_LEON_TRIP_STATUS).toUpperCase() : "CONFIRMED");


async function loadRequest(id) { const r = (await rest(`intake_requests?select=*&id=eq.${id}`))?.[0]; if (!r) throw Object.assign(new Error("No such request."), { status: 404 }); return r; }
/** The request's people (names and documents) — read only to send them to Leon; never logged or returned. */
async function peopleOf(req) { return req.current_extraction_id ? (await rest(`intake_extractions?select=personal&id=eq.${req.current_extraction_id}`))?.[0]?.personal?.people ?? [] : []; }
const crewCountOf = (leg) => { const f = leg.fields.find((x) => x.key === "crewCount"); return f && f.value !== "" && f.value != null ? String(f.value) : null; };
/** The leg's crew block (or null) and the OPS notes it is created with: marker, services note, then the crew. */
function crewOf(people, leg, req) { return crewNoteFor(peopleForLeg(people, leg.index).crew, { marker: markerFor(req.id, leg.index), crewCount: crewCountOf(leg) }); }
const notesWithCrew = (base, crew) => (crew ? `${base}\n\n${crew.text}` : base);
function legPeoplePlan(people, leg, req, payload) {
  return peoplePlan(people, leg, { reference: req.reference, marker: markerFor(req.id, leg.index), paxNumber: payload.paxNumber, crewCount: crewCountOf(leg) });
}
async function writesOf(id) { return (await rest(`intake_leon_writes?select=*&request_id=eq.${id}&order=created_at.asc`)) ?? []; }
/** Current Leon state per leg from the send log: the latest row for that leg decides. */
export function legStates(writes) {
  const out = {};
  for (const w of writes) out[w.leg_index] = w;
  return out;
}

async function lookupsFor(review) {
  const m = new Map();
  for (const l of review.legs) { const r = l.fields.find((f) => f.key === "registration"); if (r?.value && r.state !== "not_given" && r.state !== "invalid") { const a = r.aircraft ?? (await aircraftByRegistration(r.value).catch(() => null)); if (a?.nid) m.set(String(r.value).toUpperCase().replace(/[^A-Z0-9]/g, ""), a.nid); } }
  return { aircraftNidByRegistration: m };
}

const DECISION_WORDS = { provide: "PROVIDE", to_confirm: "TO CONFIRM", decline: "DECLINED", note: "NOTE" };
const q = (v) => `"${String(v ?? "").replace(/\s+/g, " ").trim()}"`;
/**
 * The client's request for one leg, as a note for ops: every service in the requester's own words, the decision
 * made on the review screen, any answer typed, the detail that would otherwise be lost (quantities, conditions),
 * the free-text remarks, and the parties the request names. Marked as recorded by the agent and NOT actioned.
 * → { text, lines: [{ said, name, detail, decision, answer, condition, kind }], remarks, parties }
 */
export function servicesNote(leg, { reference, receivedAt, requester } = {}) {
  const lines = [], remarks = [], parties = [];
  for (const s of leg.services) {
    const said = s.added ? null : s.said ?? s.name;
    if (s.kind === "party") { parties.push({ said: said ?? s.name, name: s.name }); continue; }
    if (s.isNote) { remarks.push({ said: said ?? s.name }); continue; }
    lines.push({ said, name: s.name, detail: s.detail ?? null, decision: s.decision, answer: s.answer?.trim() || null, condition: s.conditional ? s.condition ?? null : null, added: !!s.added, decidedBy: s.decided?.by ?? null });
  }
  const when = receivedAt ? `${receivedAt.slice(0, 10)} ${receivedAt.slice(11, 16)}Z` : null;
  const out = [`CLIENT'S REQUEST, recorded by the Clearway Ops Agent${reference ? ` · ${reference}` : ""}${when ? ` · received ${when}` : ""}${requester ? ` · from ${requester}` : ""}`,
    "NOT ACTIONED: nothing below has been arranged, ordered or confirmed by the agent. Checklist statuses are left for ops."];
  if (lines.length) {
    out.push("", `Services requested (the requester's words) and the review decision${lines.some((l) => l.decidedBy) ? " (a name = decided by that person; no name = the agent's reading)" : ""}:`);
    for (const l of lines) out.push(`- ${l.added ? `${l.name} (added on review)` : q(l.said)}${l.detail && !String(l.said ?? "").includes(l.detail) ? ` · ${l.detail}` : ""} → ${DECISION_WORDS[l.decision] ?? l.decision}${l.condition ? ` · condition: ${l.condition}` : ""}${l.answer ? ` · our answer: ${q(l.answer)}` : ""}${l.decidedBy ? ` · by ${l.decidedBy}` : ""}`);
  } else out.push("", "No services were requested for this leg.");
  if (remarks.length) { out.push("", "Remarks in the request (not services):"); for (const r of remarks) out.push(`- ${q(r.said)}`); }
  if (parties.length) { out.push("", "Parties the request names (not services):"); for (const p of parties) out.push(`- ${q(p.said)}`); }
  return { text: out.join("\n"), lines, remarks, parties };
}
/** Kept for the page: the plan is empty by design (no checklist item is ever written); the note is what goes to Leon. */
export function checklistPlan(leg, defs, ctx) { return { plan: [], skipped: [], note: servicesNote(leg, ctx) }; }

export async function prepareSend(requestId, user) {
  const req = await loadRequest(requestId);
  const review = req.review; if (!review) throw Object.assign(new Error("Nothing has been read from this request yet."), { status: 409 });
  const writes = legStates(await writesOf(requestId));
  if (Object.values(writes).some((w) => w.state === "unknown" || w.state === "sending")) throw Object.assign(new Error("A leg's Leon state is unknown. Check Leon for it first; nothing is resent while any leg is unknown."), { status: 409 });
  for (const l of review.legs) l.inLeon = writes[l.index]?.state === "in_leon";
  const lookups = await lookupsFor(review);
  const { blockers, warnings } = blockersFor(review, req, { lookups });
  if (blockers.length) return { ok: false, blockers, warnings };
  const noteCtx = { reference: req.reference, receivedAt: req.created_at, requester: req.sender_name ?? null };
  const people = await peopleOf(req);
  const legs = [];
  for (const leg of review.legs.filter((l) => !l.removed && !l.inLeon)) {
    const note = servicesNote(leg, noteCtx);
    const crew = crewOf(people, leg, req);
    const built = buildFlightCreate(builderLeg(leg), lookups, notesWithCrew(opsNotesFor(markerFor(requestId, leg.index), note.text), crew));
    if (!built.ok) return { ok: false, blockers: built.reasons.map((r) => `Leg ${leg.index + 1}: ${r}.`), warnings };
    const plan = legPeoplePlan(people, leg, req, built.payload);
    legs.push({ index: leg.index, payload: payloadForLog(built.payload, crew), payloadSha256: payloadHash(built.payload), peopleSha256: peopleHash(plan), people: { pax: plan.pax && { people: plan.pax.people, count: plan.pax.count }, crew: plan.crew && { people: plan.crew.people, count: plan.crew.count } }, note: note.text, checklist: [], skipped: [] });
  }
  const resend = Object.values(writes).some((w) => w.state === "in_leon" || w.state === "not_in_leon");
  const input = { requestId, legs: legs.map((l) => ({ index: l.index, payloadSha256: l.payloadSha256, peopleSha256: l.peopleSha256, checklist: argsHash([]) })) };
  const conf = issueConfirmation({ user, toolName: TOOL, input, level: "write", summary: `${resend ? "Resend" : "Create"} ${legs.length} flight${legs.length === 1 ? "" : "s"} in Leon for ${req.reference}`, targetId: requestId, targetLabel: req.reference });
  const edited = review.legs.flatMap((l) => l.fields.filter((f) => f.edited && !l.removed).map((f) => ({ leg: l.index, label: f.label, value: f.value || (f.state === "unknown" ? "Unknown (TBA)" : "not given") })));
  const notChecked = review.legs.flatMap((l) => l.fields.filter((f) => f.state === "low_confidence" && !l.removed).map((f) => ({ leg: l.index, label: f.label, value: f.value })));
  return { ok: true, runsAs: user.name || user.email, confirmation: conf, resend, warnings, legs: legs.map((l) => ({ index: l.index, payload: l.payload, people: l.people, note: l.note, checklist: l.checklist, skipped: l.skipped })), edited, notChecked, tripStatus: tripStatus() };
}

/** Leon's refusal, in plain words, and which review field it points at. */
function refusal(errors, tokens = []) {
  const e = errors?.[0] ?? {}; const msg = scrubString(String(e.message ?? "Leon refused the request."), tokens);
  const reason = /with reason '([^']+)'/.exec(msg)?.[1] ?? msg;
  const path = /at "[^"]*?\.(\w+)"/.exec(msg)?.[1] ?? /Argument '(\w+)'/.exec(msg)?.[1] ?? null;
  const value = /got invalid value "([^"]*)"/.exec(msg)?.[1] ?? null;
  const field = { adepCode: "departure", adesCode: "arrival", startTimeUTC: "std", endTimeUTC: "sta", aircraftNid: "registration", flightNo: "flightNumber", paxNumber: "paxTotal" }[path] ?? null;
  return { words: `Leon: ${reason.replace(/^Its/, "It's")}${value ? ` (${value})` : ""}.`, field, category: e.extensions?.category ?? null, raw: msg.slice(0, 400) };
}

async function insertAttempt(row) {
  const ins = await rest("intake_leon_writes?on_conflict=request_id,leg_index,payload_sha256", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=representation" }, body: JSON.stringify([row]) });
  if (Array.isArray(ins) && ins.length) return { row: ins[0], fresh: true };
  const prior = (await rest(`intake_leon_writes?select=*&request_id=eq.${row.request_id}&leg_index=eq.${row.leg_index}&payload_sha256=eq.${row.payload_sha256}`))?.[0];
  if (prior?.state === "not_in_leon") {
    // The same payload was refused before and a person has confirmed sending it again: reuse the row, but
    // only if it is still refused (a conditional update — two confirms cannot both take it).
    const taken = await rest(`intake_leon_writes?id=eq.${prior.id}&state=eq.not_in_leon`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ state: "sending", leon_error: null, confirmation_token: row.confirmation_token, sent_by: row.sent_by, sent_by_email: row.sent_by_email, updated_at: new Date().toISOString() }) });
    if (Array.isArray(taken) && taken.length) return { row: taken[0], fresh: true };
  }
  return { row: prior, fresh: false };
}

export async function confirmSend(token, user) {
  const pending = getConfirmation(token, user);
  if (!pending || pending.toolName !== TOOL) throw Object.assign(new Error("No such confirmation for you. It may have expired."), { status: 404 });
  const begun = beginConfirmation({ token, user, toolName: TOOL, input: pending.input });
  if (begun.error) throw Object.assign(new Error(begun.error === "expired" ? "This confirmation expired. Nothing was sent. Review and confirm again." : begun.error === "cancelled" ? "This confirmation was cancelled." : "This confirmation does not match."), { status: 409 });
  const requestId = pending.input.requestId;
  if (begun.replay || begun.inFlight) return { accepted: true, requestId, already: true };
  const entry = begun.entry;
  // The request shows "Sending to Leon" at once; the page does not wait for Leon (it polls the request).
  await rest(`intake_requests?id=eq.${requestId}`, { method: "PATCH", body: JSON.stringify({ status: "in_progress", status_reason: "Sending to Leon · waiting for Leon", updated_at: new Date().toISOString(), updated_by: user.email }) }).catch(() => {});
  entry.executing = run(entry, user).then(
    (result) => { settleConfirmation(entry, result); return result; },
    async (e) => { failConfirmation(entry); await sendFailed(requestId, user, e); return { failed: String(e.message) }; },
  );
  return { accepted: true, requestId };
}

/** The send stopped (before Leon, or crashed during it): say so on the request; unfinished legs become unknown. */
async function sendFailed(requestId, user, e) {
  const msg = String(e?.message ?? e).slice(0, 300);
  const stuck = await rest(`intake_leon_writes?request_id=eq.${requestId}&state=eq.sending`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ state: "unknown", leon_error: `The send stopped: ${msg}`, updated_at: new Date().toISOString() }) }).catch(() => []);
  const req = (await rest(`intake_requests?select=stages&id=eq.${requestId}`).catch(() => []))?.[0];
  const stages = (req?.stages ?? []).map((x) => ({ ...x }));
  if ((stuck ?? []).length) setStage(stages, "Sent to Leon", "fail", `Stopped during the send: ${msg}. Check Leon before resending.`);
  else setStage(stages, "Reviewed and confirmed", "fail", `Not sent to Leon: ${msg}`);
  await rest(`intake_requests?id=eq.${requestId}`, { method: "PATCH", body: JSON.stringify({ stages, status: "needs_you", status_reason: (stuck ?? []).length ? "Leon did not answer · a leg's result is unknown · check Leon" : `Not sent to Leon · ${msg}`.slice(0, 200), updated_at: new Date().toISOString() }) }).catch(() => {});
  await audit({ kind: "intake.send_failed", userId: user.userId, userEmail: user.email, actorId: user.userId, actorEmail: user.email, toolName: TOOL, success: false, error: msg, confirmationStatus: "confirmed", detail: { requestId, unknownLegs: (stuck ?? []).map((w) => w.leg_index) } }).catch(() => {});
}

/** Where a confirmed send stands, for callers that want the outcome (tests; the page reads the request). */
export function sendStatus(token, user) {
  const e = getConfirmation(token, user);
  if (!e || e.toolName !== TOOL) return null;
  return { status: e.status === "applied" ? "done" : e.executing ? "running" : e.status, result: e.status === "applied" ? e.result : null };
}

async function run(entry, user) {
  const { requestId } = entry.input;
  const req = await loadRequest(requestId);
  const review = req.review; const stages = (req.stages ?? []).map((s) => ({ ...s }));
  const who = user.name || user.email;
  const at = new Date().toISOString();
  const lookups = await lookupsFor(review);
  const noteCtx = { reference: req.reference, receivedAt: req.created_at, requester: req.sender_name ?? null };
  const before = legStates(await writesOf(requestId));
  // Rebuild from the CURRENT review and compare with what the token was bound to: if a value changed after
  // the dialog opened, nothing is sent.
  const people = await peopleOf(req);
  const legs = [];
  for (const b of entry.input.legs) {
    const leg = review.legs.find((l) => l.index === b.index);
    const crew = leg && crewOf(people, leg, req);
    const built = leg && buildFlightCreate(builderLeg(leg), lookups, notesWithCrew(opsNotesFor(markerFor(requestId, leg.index), servicesNote(leg, noteCtx).text), crew));
    if (!built?.ok || payloadHash(built.payload) !== b.payloadSha256) throw Object.assign(new Error(`Leg ${b.index + 1} changed after the confirmation was shown. Nothing was sent. Review it and confirm again.`), { status: 409 });
    if (peopleHash(legPeoplePlan(people, leg, req, built.payload)) !== b.peopleSha256) throw Object.assign(new Error(`Leg ${b.index + 1}'s crew or passengers changed after the confirmation was shown. Nothing was sent. Review it and confirm again.`), { status: 409 });
    legs.push({ leg, payload: built.payload, sha: b.payloadSha256, crew });
  }
  // A last duplicate check right before writing (unless a person already said "not a duplicate").
  if (!req.duplicate_resolution) {
    const dup = await findDuplicates(review, req.reference, requestId).catch((e) => ({ error: e.message }));
    if (dup?.error) throw Object.assign(new Error(`Could not check Leon for duplicates just before sending: ${dup.error}. Nothing was sent.`), { status: 503 });
    if (dup) { await rest(`intake_requests?id=eq.${requestId}`, { method: "PATCH", body: JSON.stringify({ duplicate: dup, status: "needs_you", status_reason: "Stopped: possible duplicate found just before sending", updated_at: new Date().toISOString() }) }); throw Object.assign(new Error(`Leon now has matching flight${dup.leonIds.length === 1 ? "" : "s"} ${dup.leonIds.join(", ")}. Nothing was sent. The page shows the match.`), { status: 409 }); }
  }
  { const aw = stages.find((x) => x.name === "Awaiting review"); if (aw && aw.state !== "done") setStage(stages, "Awaiting review", "done", `${aw.note ?? ""}`.trim() || null, at); }
  setStage(stages, "Reviewed and confirmed", "done", `Confirmed by ${who}`, at);
  setStage(stages, "Building Leon request", "done", null, at);
  setStage(stages, "Leon request built", "done", `${legs.length} flight${legs.length === 1 ? "" : "s"} · built by code from the reviewed values`, at);
  setStage(stages, "Sent to Leon", "prog", "Waiting for Leon. No leg is shown as created until Leon confirms it with a flight ID.", at);
  await rest(`intake_requests?id=eq.${requestId}`, { method: "PATCH", body: JSON.stringify({ status: "in_progress", status_reason: "Sent to Leon · waiting for Leon", stages, updated_at: at, updated_by: user.email }) });

  let tripNid = Object.values(before).find((w) => w.leon_trip_nid)?.leon_trip_nid ?? null;
  const outcome = []; let stopped = false;
  const tokens = personalTokens(people);
  for (const { leg, payload, sha, crew } of legs) {
    if (stopped) { outcome.push({ index: leg.index, state: "not_sent", error: "Not sent: an earlier leg's result is unknown." }); continue; }
    // 1. The attempt, written BEFORE the call.
    const { row, fresh } = await insertAttempt({ request_id: requestId, leg_index: leg.index, payload_sha256: sha, payload: payloadForLog(payload, crew), marker: markerFor(requestId, leg.index), state: "sending", confirmation_token: entry.token, sent_by: user.userId, sent_by_email: user.email, leon_trip_nid: tripNid });
    if (!fresh) {
      if (row?.state === "in_leon") { outcome.push({ index: leg.index, state: "in_leon", flightNid: row.leon_flight_nid, already: true }); continue; }
      outcome.push({ index: leg.index, state: "unknown", error: "Another send of this exact leg is in progress or its result is unknown. Nothing was sent again." }); stopped = true; continue;
    }
    await audit({ kind: "intake.leon_attempt", userId: user.userId, userEmail: user.email, actorId: user.userId, actorEmail: user.email, toolName: TOOL, toolArgs: { requestId, leg: leg.index, payloadSha256: sha }, success: true, confirmationStatus: "confirmed", detail: { writeId: row.id, marker: row.marker } }).catch(() => {});
    // The crew block travels in this create: its own attempt row too, before the call.
    const crewRow = crew ? await recordCrewAttempt({ requestId, leg, crew, user }).catch(() => null) : null;
    const crewOutcome = (state, error = null) => (crew ? { kind: "crew", state, people: crew.people, count: crew.count, ...(error ? { error } : {}) } : { kind: "crew", state: "none", people: 0 });
    // 2. The call.
    let res, thrown = null; const t0 = Date.now();
    try {
      res = tripNid
        ? await leonGraphql(`mutation($n:TripNid!,$f:FlightCreate!){ flightCreate(tripNid:$n, flight:$f){ flightNid tripNid } }`, { n: Number(tripNid), f: payload }, { timeoutMs: Number(process.env.INTAKE_LEON_TIMEOUT_MS || 30000) })
        : await leonGraphql(`mutation($t:TripCreate!){ createTrip(trip:$t){ tripNid flightList{ flightNid tripNid } } }`, { t: { flights: [payload], status: tripStatus() } }, { timeoutMs: Number(process.env.INTAKE_LEON_TIMEOUT_MS || 30000) });
    } catch (e) { thrown = e; }
    const ms = Date.now() - t0;
    // 3. The outcome.
    const flight = res?.data?.flightCreate ?? res?.data?.createTrip?.flightList?.[0] ?? null;
    if (flight?.flightNid) {
      tripNid = String(flight.tripNid ?? res?.data?.createTrip?.tripNid ?? tripNid);
      await rest(`intake_leon_writes?id=eq.${row.id}`, { method: "PATCH", body: JSON.stringify({ state: "in_leon", leon_flight_nid: String(flight.flightNid), leon_trip_nid: tripNid, http_status: res.httpStatus, answered_ms: ms, updated_at: new Date().toISOString() }) });
      await audit({ kind: "intake.leon_created", userId: user.userId, userEmail: user.email, actorId: user.userId, actorEmail: user.email, toolName: TOOL, toolArgs: { requestId, leg: leg.index }, toolResult: { flightNid: flight.flightNid, tripNid }, success: true, confirmationStatus: "confirmed", latencyMs: ms }).catch(() => {});
      await settleCrew(crewRow, { state: "in_leon", flightNid: flight.flightNid, httpStatus: res.httpStatus, ms });
      // Its passengers, now that the flight exists. A failure here is shown and emailed; the flight stands.
      const ppl = await writeLegPeople({ requestId, leg, flightNid: flight.flightNid, people, reference: req.reference, paxNumber: payload.paxNumber, user });
      outcome.push({ index: leg.index, state: "in_leon", flightNid: String(flight.flightNid), tripNid, ms, people: [...ppl, crewOutcome("in_leon")] });
    } else if (!thrown && res && res.httpStatus < 500 && res.errors?.length) {
      const r = refusal(res.errors, tokens);
      await settleCrew(crewRow, { state: "not_in_leon", error: "Leon refused the flight, so its crew block was not written.", httpStatus: res.httpStatus, ms });
      await rest(`intake_leon_writes?id=eq.${row.id}`, { method: "PATCH", body: JSON.stringify({ state: "not_in_leon", leon_error: r.words, http_status: res.httpStatus, answered_ms: ms, updated_at: new Date().toISOString() }) });
      await audit({ kind: "intake.leon_refused", userId: user.userId, userEmail: user.email, actorId: user.userId, actorEmail: user.email, toolName: TOOL, toolArgs: { requestId, leg: leg.index }, toolResult: { refused: r.words, category: r.category }, success: false, error: r.words, confirmationStatus: "confirmed", latencyMs: ms }).catch(() => {});
      outcome.push({ index: leg.index, state: "not_in_leon", error: r.words, field: r.field, ms });
    } else {
      await settleCrew(crewRow, { state: "unknown", error: "Leon did not answer for the flight; whether its crew block exists is unknown.", httpStatus: res?.httpStatus ?? null, ms });
      const why = thrown ? `Leon did not answer (${thrown.name === "TimeoutError" || /abort|timeout/i.test(String(thrown.message)) ? "timed out" : String(thrown.message).slice(0, 120)})` : `Leon answered HTTP ${res?.httpStatus} without a flight`;
      await rest(`intake_leon_writes?id=eq.${row.id}`, { method: "PATCH", body: JSON.stringify({ state: "unknown", leon_error: why, http_status: res?.httpStatus ?? null, answered_ms: ms, updated_at: new Date().toISOString() }) });
      await audit({ kind: "intake.leon_unknown", userId: user.userId, userEmail: user.email, actorId: user.userId, actorEmail: user.email, toolName: TOOL, toolArgs: { requestId, leg: leg.index }, success: false, error: why, confirmationStatus: "confirmed", latencyMs: ms }).catch(() => {});
      outcome.push({ index: leg.index, state: "unknown", error: `${why}. The agent could not confirm whether leg ${leg.index + 1} exists in Leon. Check Leon before resending.` });
      stopped = true;
    }
  }

  // Review: in-Leon legs become read-only; a refusal marks the field Leon pointed at.
  const fresh = await loadRequest(requestId); const rv = fresh.review;
  for (const o of outcome) {
    const l = rv.legs.find((x) => x.index === o.index); if (!l) continue;
    l.inLeon = o.state === "in_leon"; l.leonFlightNid = o.flightNid ?? null;
    if (o.state === "not_in_leon" && o.field) { const f = l.fields.find((x) => x.key === o.field); if (f) { f.state = "leon_refused"; f.note = o.error; } }
  }
  const inN = outcome.filter((o) => o.state === "in_leon").length, allLegs = outcome.length;
  const anyUnknown = outcome.some((o) => o.state === "unknown");
  setStage(stages, "Sent to Leon", inN === allLegs ? "done" : inN ? "part" : "fail", `${inN} of ${allLegs} created${outcome.filter((o) => o.state === "not_in_leon").length ? ` · ${outcome.filter((o) => o.state === "not_in_leon").map((o) => `leg ${o.index + 1} refused`).join(", ")}` : ""}${anyUnknown ? " · a leg's result is unknown" : ""}`);

  // Passengers and crew: what Leon took, per created leg. Older requests' stage lists gain the stage here.
  if (!stages.some((x) => x.name === PEOPLE_STAGE)) { const i = stages.findIndex((x) => x.name === "Sent to Leon"); stages.splice(i + 1, 0, { name: PEOPLE_STAGE, state: "none", at: null, ms: null, note: null }); }
  const pplAll = outcome.filter((o) => o.state === "in_leon" && o.people).flatMap((o) => o.people.map((p) => ({ ...p, leg: o.index })));
  const pplFailed = pplAll.filter((p) => p.state !== "in_leon" && p.state !== "none");
  if (!inN) setStage(stages, PEOPLE_STAGE, "skip", "No leg is in Leon.");
  else if (!pplAll.some((p) => p.state !== "none")) setStage(stages, PEOPLE_STAGE, "skip", "The request names no passengers and no crew.");
  else setStage(stages, PEOPLE_STAGE, pplFailed.length ? (pplAll.some((p) => p.state === "in_leon") ? "part" : "fail") : "done", pplAll.filter((p) => p.state !== "none").map((p) => `Leg ${p.leg + 1}: ${outcomeWords(p)}`).join(" · "));

  // Services: already in each created flight's OPS notes (part of the create). Checklist statuses: deliberately
  // not set, ever. Both stages say so; the second exists so the next person does not go looking for the write.
  const items = [];
  if (inN) {
    setStage(stages, "Services noted", "done", `The client's requested services are in the OPS notes of ${inN === 1 ? "the created flight" : `each of the ${inN} created flights`}, in the requester's words with the review decisions, marked NOT ACTIONED.`);
    setStage(stages, "Checklist left to ops", "done", "No checklist status was set: every item stays at Leon's default (?). A status would claim work that has not happened; that is ops' call.");
  } else { setStage(stages, "Services noted", "skip", "No leg is in Leon."); setStage(stages, "Checklist left to ops", "skip", null); }

  const allIn = rv.legs.filter((l) => !l.removed).every((l) => l.inLeon);
  const pplWords = pplFailed.length ? `${[...new Set(pplFailed.map((p) => (p.kind === "pax" ? "passengers" : "crew")))].join(" and ")} NOT in Leon for leg ${[...new Set(pplFailed.map((p) => p.leg + 1))].join(", ")}` : null;
  const status = allIn && !pplFailed.length ? "loaded" : inN ? "partly_loaded" : "needs_you";
  const reason = allIn ? (pplWords ? `Loaded · ${pplWords}` : "Loaded") : anyUnknown ? "Sent to Leon · a leg's result is unknown" : inN ? `Sent to Leon · ${allLegs - inN} of ${allLegs} legs NOT in Leon${pplWords ? ` · ${pplWords}` : ""}` : "Sent to Leon · nothing created";
  const result = { legs: outcome, checklist: { items, filled: 0, total: 0, statusesLeftToOps: true }, by: who, at };
  const mail = composeOutcome({ ...fresh, reference: fresh.reference }, rv, result);
  const sent = await sendIntakeEmail(fresh, mail).catch((e) => ({ ok: false, error: e.message }));
  setStage(stages, "Notification sent", sent.ok ? "done" : "fail", sent.ok ? `${mail.kind.split(" · ")[0]} ${mail.kind.includes("Loaded") ? "Loaded" : "Needs you"} email ${sent.mode === "capture" ? "captured (not sent)" : "sent"} to ${sent.to?.join(", ")}` : `Email not sent: ${sent.error}`);
  const nsent = stages.find((s) => s.name === "Notification sent"); if (nsent) nsent.email = sent.messageId ?? null;
  await rest(`intake_requests?id=eq.${requestId}`, { method: "PATCH", body: JSON.stringify({ review: rv, stages, status: status === "partly_loaded" ? "needs_you" : status, status_reason: reason, updated_at: new Date().toISOString(), updated_by: user.email }) });
  return { ...result, status, email: { kind: mail.kind, ok: sent.ok, mode: sent.mode, error: sent.error ?? null } };
}

/** On start: an attempt that never recorded an outcome is unknown. A person checks Leon; nothing retries. */
export async function recoverOnStart() {
  await recoverPeopleOnStart();
  const rows = await rest(`intake_leon_writes?state=eq.sending`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ state: "unknown", leon_error: "The service stopped during the send; the result was never recorded.", updated_at: new Date().toISOString() }) }).catch(() => []);
  for (const w of rows ?? []) {
    await rest(`intake_requests?id=eq.${w.request_id}`, { method: "PATCH", body: JSON.stringify({ status: "needs_you", status_reason: `Leon did not answer · leg ${w.leg_index + 1} unknown · check Leon`, updated_at: new Date().toISOString() }) }).catch(() => {});
    await audit({ kind: "intake.leon_unknown", success: false, error: "service restarted during a send", confirmationStatus: "not_required", detail: { requestId: w.request_id, leg: w.leg_index, writeId: w.id } }).catch(() => {});
  }
  return (rows ?? []).length;
}

/**
 * A person resolves an unknown leg. 'check' is a READ: it looks in Leon for our marker on that day and, if the
 * flight is there, records it as in Leon. 'not_in_leon' is a person's statement after checking Leon.
 * Neither sends anything.
 */
export async function resolveUnknown(requestId, legIndex, user, action) {
  const w = (await rest(`intake_leon_writes?select=*&request_id=eq.${requestId}&leg_index=eq.${legIndex}&state=eq.unknown&order=created_at.desc&limit=1`))?.[0];
  if (!w) throw Object.assign(new Error("That leg is not unknown."), { status: 409 });
  if (action === "check") {
    const std = Date.parse(w.payload?.startTimeUTC);
    const found = (await flightsBetween(new Date(std - 86400000).toISOString().replace(/\.\d+Z$/, "Z"), new Date(std + 86400000).toISOString().replace(/\.\d+Z$/, "Z"))).find((f) => f.opsNotes.includes(w.marker));
    await audit({ kind: "intake.leon_checked", userId: user.userId, userEmail: user.email, success: true, confirmationStatus: "not_required", detail: { requestId, leg: legIndex, found: found?.nid ?? null } }).catch(() => {});
    if (!found) return { found: false, message: `Not found in Leon at ${new Date().toISOString().slice(11, 16)}Z (looked for ${w.marker} on that day). If you have checked Leon yourself and it is not there, mark it as not in Leon.` };
    await rest(`intake_leon_writes?id=eq.${w.id}`, { method: "PATCH", body: JSON.stringify({ state: "in_leon", leon_flight_nid: String(found.nid), leon_trip_nid: String(found.tripNid ?? ""), resolved_by: user.email, resolved_note: "Found in Leon by marker", updated_at: new Date().toISOString() }) });
    await settleCrewForLeg(requestId, legIndex, "in_leon", found.nid);
    return { found: true, flightNid: String(found.nid) };
  }
  if (action === "not_in_leon") {
    await settleCrewForLeg(requestId, legIndex, "not_in_leon");
    await rest(`intake_leon_writes?id=eq.${w.id}`, { method: "PATCH", body: JSON.stringify({ state: "not_in_leon", leon_error: `Marked not in Leon by ${user.name || user.email} after checking Leon.`, resolved_by: user.email, updated_at: new Date().toISOString() }) });
    await audit({ kind: "intake.leon_marked_absent", userId: user.userId, userEmail: user.email, actorId: user.userId, actorEmail: user.email, success: true, confirmationStatus: "not_required", detail: { requestId, leg: legIndex } }).catch(() => {});
    return { ok: true };
  }
  throw Object.assign(new Error("Unknown action."), { status: 400 });
}
