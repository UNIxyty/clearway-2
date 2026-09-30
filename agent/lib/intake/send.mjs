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
//  checklist    — only for legs in Leon: reads what is already on the flight (Leon auto-adds items), then
//                 updates those and adds the rest. Its outcome never changes a leg's Leon state.
//  recoverOnStart — a row still 'sending' after a restart becomes 'unknown': a person checks Leon.
import { createHash } from "node:crypto";
import { rest } from "../knowledge/retrieval.mjs";
import { audit } from "../store.mjs";
import { issueConfirmation, beginConfirmation, settleConfirmation, failConfirmation, getConfirmation, argsHash } from "../confirm.mjs";
import { buildFlightCreate } from "./leon-payload.mjs";
import { leonGraphql } from "./leon-client.mjs";
import { aircraftByRegistration, checklistDefinitions, flightChecklist, flightsBetween } from "./leon-lookup.mjs";
import { blockersFor, builderLeg } from "./review.mjs";
import { findDuplicates, setStage } from "./pipeline.mjs";
import { composeOutcome, sendIntakeEmail } from "./notify.mjs";

export const TOOL = "intake.leon_send";
const canonical = (v) => Array.isArray(v) ? `[${v.map(canonical).join(",")}]` : v && typeof v === "object" ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}` : JSON.stringify(v ?? null);
export const payloadHash = (p) => createHash("sha256").update(canonical(p)).digest("hex");
export const markerFor = (requestId, legIndex) => `CWY-INTAKE ${requestId}/${legIndex}`;
const tripStatus = () => (["CONFIRMED", "OPTION", "OPPORTUNITY"].includes(String(process.env.INTAKE_LEON_TRIP_STATUS || "").toUpperCase()) ? String(process.env.INTAKE_LEON_TRIP_STATUS).toUpperCase() : "CONFIRMED");

// Decision → checklist status: the first status the DEFINITION itself offers from this preference list.
// Read against Leon's live statuses per definition; nothing is assumed to exist.
const STATUS_PREF = { provide: ["RQS", "YES", "CNF", "OKI", "ACK"], to_confirm: ["QSM", "PND", "UNT"], note: ["QSM", "UNT"] };
function statusFor(def, decision) { const ids = new Set(def.statuses.map((s) => s.id)); const id = STATUS_PREF[decision]?.find((x) => ids.has(x)) ?? def.defaultStatus; return { id, caption: def.statuses.find((s) => s.id === id)?.caption ?? id }; }

async function loadRequest(id) { const r = (await rest(`intake_requests?select=*&id=eq.${id}`))?.[0]; if (!r) throw Object.assign(new Error("No such request."), { status: 404 }); return r; }
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

/** The checklist plan for one leg: [{ defNid, label, decision, statusId, statusCaption, note, serviceId }]. */
export function checklistPlan(leg, defs) {
  const byNid = new Map(defs.map((d) => [d.nid, d]));
  const plan = []; const skipped = [];
  for (const s of leg.services) {
    if (s.decision === "decline") { skipped.push({ serviceId: s.id, name: s.name, why: "declined, not added" }); continue; }
    if (s.isNote && s.noteOnChecklist === false) { skipped.push({ serviceId: s.id, name: s.name, why: "kept as a note on this page" }); continue; }
    let def = s.checklistNid ? byNid.get(s.checklistNid) : null;
    if (!def && s.isNote) { const side = leg.direction === "outbound" ? "ADEP" : "ADES"; def = defs.find((d) => /additional service/i.test(d.label) && d.label.toUpperCase().includes(side)) ?? defs.find((d) => /additional service/i.test(d.label)); }
    if (!def) { skipped.push({ serviceId: s.id, name: s.name, why: "no Leon checklist item chosen" }); continue; }
    const decision = s.isNote ? "note" : s.decision;
    const st = statusFor(def, decision);
    const note = [s.isNote ? s.said ?? s.name : null, s.answer?.trim() || null].filter(Boolean).join(" · ") || null;
    const existing = plan.find((p) => p.defNid === def.nid);
    if (existing) { existing.note = [existing.note, note ?? s.name].filter(Boolean).join(" · "); existing.services.push(s.name); continue; }
    plan.push({ defNid: def.nid, label: def.label, decision, statusId: st.id, statusCaption: st.caption, note, services: [s.name], serviceId: s.id });
  }
  return { plan, skipped };
}

/** Builds everything the confirmation dialog shows, and issues the token. Refuses while anything blocks. */
export async function prepareSend(requestId, user) {
  const req = await loadRequest(requestId);
  const review = req.review; if (!review) throw Object.assign(new Error("Nothing has been read from this request yet."), { status: 409 });
  const writes = legStates(await writesOf(requestId));
  if (Object.values(writes).some((w) => w.state === "unknown" || w.state === "sending")) throw Object.assign(new Error("A leg's Leon state is unknown. Check Leon for it first; nothing is resent while any leg is unknown."), { status: 409 });
  for (const l of review.legs) l.inLeon = writes[l.index]?.state === "in_leon";
  const lookups = await lookupsFor(review);
  const { blockers, warnings } = blockersFor(review, req, { lookups });
  if (blockers.length) return { ok: false, blockers, warnings };
  const defs = await checklistDefinitions();
  const legs = [];
  for (const leg of review.legs.filter((l) => !l.removed && !l.inLeon)) {
    const built = buildFlightCreate(builderLeg(leg), lookups, markerFor(requestId, leg.index));
    if (!built.ok) return { ok: false, blockers: built.reasons.map((r) => `Leg ${leg.index + 1}: ${r}.`), warnings };
    const { plan, skipped } = checklistPlan(leg, defs);
    legs.push({ index: leg.index, payload: built.payload, payloadSha256: payloadHash(built.payload), checklist: plan, skipped });
  }
  const resend = Object.values(writes).some((w) => w.state === "in_leon" || w.state === "not_in_leon");
  const input = { requestId, legs: legs.map((l) => ({ index: l.index, payloadSha256: l.payloadSha256, checklist: argsHash(l.checklist) })) };
  const conf = issueConfirmation({ user, toolName: TOOL, input, level: "write", summary: `${resend ? "Resend" : "Create"} ${legs.length} flight${legs.length === 1 ? "" : "s"} in Leon for ${req.reference}`, targetId: requestId, targetLabel: req.reference });
  const edited = review.legs.flatMap((l) => l.fields.filter((f) => f.edited && !l.removed).map((f) => ({ leg: l.index, label: f.label, value: f.value || (f.state === "unknown" ? "Unknown (TBA)" : "not given") })));
  const notChecked = review.legs.flatMap((l) => l.fields.filter((f) => f.state === "low_confidence" && !l.removed).map((f) => ({ leg: l.index, label: f.label, value: f.value })));
  return { ok: true, runsAs: user.name || user.email, confirmation: conf, resend, warnings, legs: legs.map((l) => ({ index: l.index, payload: l.payload, checklist: l.checklist, skipped: l.skipped })), edited, notChecked, tripStatus: tripStatus() };
}

/** Leon's refusal, in plain words, and which review field it points at. */
function refusal(errors) {
  const e = errors?.[0] ?? {}; const msg = String(e.message ?? "Leon refused the request.");
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

async function fillChecklist(flightNid, leg, plan) {
  const results = [];
  let existing;
  try { existing = new Map((await flightChecklist(flightNid)).map((i) => [i.cdNid, i])); }
  catch (e) { return plan.map((p) => ({ leg: leg.index, defNid: p.defNid, label: p.label, decision: p.decision, statusId: p.statusId, statusCaption: p.statusCaption, note: p.note, filled: false, reason: `Could not read the flight's checklist first: ${e.message}` })); }
  const tries = Number(process.env.INTAKE_CHECKLIST_TRIES || 3); const gap = Number(process.env.INTAKE_CHECKLIST_RETRY_MS || 60000);
  for (const p of plan) {
    const had = existing.get(p.defNid);
    let ok = false, reason = null;
    for (let i = 0; i < tries && !ok; i += 1) {
      if (i) await new Promise((r) => setTimeout(r, gap));
      try {
        if (had) {
          const a = await leonGraphql(`mutation($f:FlightNid!,$c:ChecklistDefinitionNid!,$s:String!){ checklist{ opsItemStatusUpdate(flightNid:$f, checklistItemNid:$c, checklistStatusId:$s) } }`, { f: Number(flightNid), c: p.defNid, s: p.statusId });
          if (a.errors) { reason = refusal(a.errors).words; continue; }
          if (p.note) { const b = await leonGraphql(`mutation($f:FlightNid!,$c:ChecklistDefinitionNid!,$n:String){ checklist{ opsItemNoteUpdate(flightNid:$f, checklistItemNid:$c, note:$n) } }`, { f: Number(flightNid), c: p.defNid, n: p.note }); if (b.errors) { reason = refusal(b.errors).words; continue; } }
        } else {
          const a = await leonGraphql(`mutation($f:FlightNid!,$i:[ChecklistItemInput!]!){ checklist{ addOrUpdateOpsItems(flightNid:$f, checklistItems:$i) } }`, { f: Number(flightNid), i: [{ checklistDefinitionNid: p.defNid, checklistStatusId: p.statusId, ...(p.note ? { note: p.note } : {}) }] });
          if (a.errors) { reason = refusal(a.errors).words; continue; }
          if (a.data?.checklist?.addOrUpdateOpsItems === false) { reason = "Leon answered false (item not added)."; continue; }
        }
        ok = true; reason = null;
      } catch (e) { reason = `Leon did not answer: ${e.message}`; }
    }
    results.push({ leg: leg.index, defNid: p.defNid, label: p.label, decision: p.decision, statusId: p.statusId, statusCaption: p.statusCaption, note: p.note, filled: ok, reason, wasOnFlight: !!had });
  }
  return results;
}

/**
 * Spends the token. Returns the outcome per leg. Throws (with .status) for token problems. Never retries a
 * leg whose outcome is unknown.
 */
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
  const defs = await checklistDefinitions();
  const before = legStates(await writesOf(requestId));
  // Rebuild from the CURRENT review and compare with what the token was bound to: if a value changed after
  // the dialog opened, nothing is sent.
  const legs = [];
  for (const b of entry.input.legs) {
    const leg = review.legs.find((l) => l.index === b.index);
    const built = leg && buildFlightCreate(builderLeg(leg), lookups, markerFor(requestId, leg.index));
    if (!built?.ok || payloadHash(built.payload) !== b.payloadSha256) throw Object.assign(new Error(`Leg ${b.index + 1} changed after the confirmation was shown. Nothing was sent. Review it and confirm again.`), { status: 409 });
    legs.push({ leg, payload: built.payload, sha: b.payloadSha256, checklist: checklistPlan(leg, defs).plan });
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
  for (const { leg, payload, sha, checklist } of legs) {
    if (stopped) { outcome.push({ index: leg.index, state: "not_sent", error: "Not sent: an earlier leg's result is unknown." }); continue; }
    // 1. The attempt, written BEFORE the call.
    const { row, fresh } = await insertAttempt({ request_id: requestId, leg_index: leg.index, payload_sha256: sha, payload, marker: markerFor(requestId, leg.index), state: "sending", confirmation_token: entry.token, sent_by: user.userId, sent_by_email: user.email, leon_trip_nid: tripNid });
    if (!fresh) {
      if (row?.state === "in_leon") { outcome.push({ index: leg.index, state: "in_leon", flightNid: row.leon_flight_nid, already: true }); continue; }
      outcome.push({ index: leg.index, state: "unknown", error: "Another send of this exact leg is in progress or its result is unknown. Nothing was sent again." }); stopped = true; continue;
    }
    await audit({ kind: "intake.leon_attempt", userId: user.userId, userEmail: user.email, actorId: user.userId, actorEmail: user.email, toolName: TOOL, toolArgs: { requestId, leg: leg.index, payloadSha256: sha }, success: true, confirmationStatus: "confirmed", detail: { writeId: row.id, marker: row.marker } }).catch(() => {});
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
      outcome.push({ index: leg.index, state: "in_leon", flightNid: String(flight.flightNid), tripNid, ms, checklistPlan: checklist });
    } else if (!thrown && res && res.httpStatus < 500 && res.errors?.length) {
      const r = refusal(res.errors);
      await rest(`intake_leon_writes?id=eq.${row.id}`, { method: "PATCH", body: JSON.stringify({ state: "not_in_leon", leon_error: r.words, http_status: res.httpStatus, answered_ms: ms, updated_at: new Date().toISOString() }) });
      await audit({ kind: "intake.leon_refused", userId: user.userId, userEmail: user.email, actorId: user.userId, actorEmail: user.email, toolName: TOOL, toolArgs: { requestId, leg: leg.index }, toolResult: { refused: r.words, category: r.category }, success: false, error: r.words, confirmationStatus: "confirmed", latencyMs: ms }).catch(() => {});
      outcome.push({ index: leg.index, state: "not_in_leon", error: r.words, field: r.field, ms });
    } else {
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

  // Checklist, only for legs in Leon.
  const items = [];
  if (inN) {
    setStage(stages, "Filling checklist", "prog", null);
    await rest(`intake_requests?id=eq.${requestId}`, { method: "PATCH", body: JSON.stringify({ review: rv, stages, status_reason: "Filling checklist", updated_at: new Date().toISOString() }) });
    for (const o of outcome.filter((x) => x.state === "in_leon" && !x.already)) {
      const leg = rv.legs.find((x) => x.index === o.index);
      const res = await fillChecklist(o.flightNid, leg, o.checklistPlan ?? []);
      items.push(...res);
      const w = (await rest(`intake_leon_writes?select=id&request_id=eq.${requestId}&leg_index=eq.${o.index}&state=eq.in_leon&order=created_at.desc&limit=1`))?.[0];
      if (w) await rest(`intake_leon_writes?id=eq.${w.id}`, { method: "PATCH", body: JSON.stringify({ checklist: res, updated_at: new Date().toISOString() }) });
      for (const it of res) await audit({ kind: it.filled ? "intake.checklist_set" : "intake.checklist_failed", userId: user.userId, userEmail: user.email, actorId: user.userId, actorEmail: user.email, toolName: TOOL, toolArgs: { requestId, leg: o.index, flightNid: o.flightNid, item: it.defNid, status: it.statusId }, success: it.filled, error: it.reason, confirmationStatus: "confirmed" }).catch(() => {});
    }
    const bad = items.filter((i) => !i.filled).length;
    setStage(stages, "Filling checklist", bad ? "part" : "done", `${items.length - bad} of ${items.length} items filled`);
    setStage(stages, bad ? "Checklist filled" : "Checklist filled", bad ? "fail" : "done", bad ? `${bad} not filled` : `${items.length} of ${items.length}`);
  } else { setStage(stages, "Filling checklist", "skip", "No leg is in Leon."); setStage(stages, "Checklist filled", "skip", null); }

  const allIn = rv.legs.filter((l) => !l.removed).every((l) => l.inLeon);
  const unfilled = items.filter((i) => !i.filled).length;
  const status = allIn && !unfilled ? "loaded" : inN ? "partly_loaded" : "needs_you";
  const reason = allIn && !unfilled ? "Loaded" : allIn ? `Checklist · ${unfilled} not filled` : anyUnknown ? "Sent to Leon · a leg's result is unknown" : inN ? `Sent to Leon · ${allLegs - inN} of ${allLegs} legs NOT in Leon` : "Sent to Leon · nothing created";
  const result = { legs: outcome.map(({ checklistPlan: _, ...o }) => o), checklist: { items, filled: items.length - unfilled, total: items.length }, by: who, at };
  const mail = composeOutcome({ ...fresh, reference: fresh.reference }, rv, result);
  const sent = await sendIntakeEmail(fresh, mail).catch((e) => ({ ok: false, error: e.message }));
  setStage(stages, "Notification sent", sent.ok ? "done" : "fail", sent.ok ? `${mail.kind.split(" · ")[0]} ${mail.kind.includes("Loaded") ? "Loaded" : "Needs you"} email ${sent.mode === "capture" ? "captured (not sent)" : "sent"} to ${sent.to?.join(", ")}` : `Email not sent: ${sent.error}`);
  const nsent = stages.find((s) => s.name === "Notification sent"); if (nsent) nsent.email = sent.messageId ?? null;
  await rest(`intake_requests?id=eq.${requestId}`, { method: "PATCH", body: JSON.stringify({ review: rv, stages, status: status === "partly_loaded" ? "needs_you" : status, status_reason: reason, updated_at: new Date().toISOString(), updated_by: user.email }) });
  return { ...result, status, email: { kind: mail.kind, ok: sent.ok, mode: sent.mode, error: sent.error ?? null } };
}

/** On start: an attempt that never recorded an outcome is unknown. A person checks Leon; nothing retries. */
export async function recoverOnStart() {
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
    return { found: true, flightNid: String(found.nid) };
  }
  if (action === "not_in_leon") {
    await rest(`intake_leon_writes?id=eq.${w.id}`, { method: "PATCH", body: JSON.stringify({ state: "not_in_leon", leon_error: `Marked not in Leon by ${user.name || user.email} after checking Leon.`, resolved_by: user.email, updated_at: new Date().toISOString() }) });
    await audit({ kind: "intake.leon_marked_absent", userId: user.userId, userEmail: user.email, actorId: user.userId, actorEmail: user.email, success: true, confirmationStatus: "not_required", detail: { requestId, leg: legIndex } }).catch(() => {});
    return { ok: true };
  }
  throw Object.assign(new Error("Unknown action."), { status: 400 });
}
