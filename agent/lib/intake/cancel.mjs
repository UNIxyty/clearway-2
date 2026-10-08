// Type 1 cancellations: the provider cancels a flight we loaded, and ops decide whether Leon follows.
//
//   Cancellation received (classified by the calendar METHOD:CANCEL — never by a subject prefix or a body line, which
//   change with the sender's locale) → matched to our request by REFERENCE (the calendar UID is a cross-check; a
//   different UID is recorded, not fatal) → ops are asked by the same E1 email and answer page as "Process?", here
//   "Cancel in Leon?" (buttons open the one-tap page; "or just reply yes or no") → Yes: every leg of that reference
//   still to fly is cancelled in Leon; No: nothing is touched; no answer: nothing is cancelled and the request waits,
//   its deadline shown → the completion email says which legs were cancelled and which were not.
//
// Leon's flightDelete CANCELS a flight; Leon keeps it (isCnl), it is not removed — every text says "cancelled in Leon".
// We cannot un-cancel from here, so the approval gate is not optional. Each cancel is written to the send log
// (intake_leon_writes, action 'cancel') BEFORE the call; an unknown outcome stops and asks a person; nothing is retried
// on its own. The agent never sends a calendar response and never touches a calendar item.
//
// The cases that are not a simple cancel, each told plainly, none guessed: no matching request (needs a decision, in
// notification.mjs); nothing ever reached Leon (declined at the gate, or never loaded: closed); already cancelled in
// Leon (no call); more than one of our requests has flights in Leon for the reference (stop and ask); a leg that has
// departed (shown, flagged, never cancelled by the agent); a partial failure (red, legs named, successes not retried).
import { createHash } from "node:crypto";
import { rest } from "../knowledge/retrieval.mjs";
import { audit } from "../store.mjs";
import { leonGraphql } from "./leon-client.mjs";
import { setStage } from "./pipeline.mjs";
import { composeProcess, composeCancelOutcome, sendIntakeEmail, notifyTo } from "./notify.mjs";
import { issueTokens, loadRequest, patchRequest, patchMessage, stagesOf, hm, approvalHours, routeText } from "./notification.mjs";

export const CANCEL_STAGE = "Cancellation";
const sha = (s) => createHash("sha256").update(s).digest("hex");
const withStage = (stages) => { if (!stages.some((s) => s.name === CANCEL_STAGE)) stages.push({ name: CANCEL_STAGE, state: "none", at: null, ms: null, note: null }); return stages; };
const timeout = () => ({ timeoutMs: Number(process.env.INTAKE_LEON_TIMEOUT_MS || 30000) });
const legWords = (ns) => (ns.length === 1 ? `leg ${ns[0]}` : `legs ${ns.join(", ")}`);

/** The latest CREATE row per leg (the leg's state in Leon as our send log knows it). */
async function createdLegs(requestId) {
  const rows = (await rest(`intake_leon_writes?select=leg_index,state,leon_flight_nid,payload&request_id=eq.${requestId}&action=eq.create&order=created_at.asc`)) ?? [];
  const by = new Map(); for (const w of rows) by.set(w.leg_index, w);
  return [...by.values()];
}
/** Leon's own view of one flight: is it already cancelled, when does it depart. Read-only. */
async function leonFlight(nid) {
  const r = await leonGraphql(`query($n:FlightNid!){ flight(flightNid:$n){ flightNid isCnl startTimeUTC } }`, { n: Number(nid) }, timeout());
  if (r.errors?.length || !r.data?.flight) throw new Error(String(r.errors?.[0]?.message ?? "Leon returned no flight").slice(0, 160));
  return r.data.flight;
}

/**
 * A calendar CANCEL matched to a request (notification.mjs found it by reference, else UID). Decides which case it is
 * and, when Leon has flights to cancel, asks ops. → { cancellation: true, requestId, case }
 */
export async function handleCancellation({ message, n, found, base, search, provider }) {
  const ref = n.reference;
  const at = new Date().toISOString();
  // Every request of ours with flights in Leon for this reference: more than one is a question, never a guess.
  const sameRef = ref ? ((await rest(`intake_requests?select=id,reference,status&request_type=eq.scheduled&reference=eq.${encodeURIComponent(ref)}`)) ?? []) : [found.request];
  const withLeon = [];
  for (const q of sameRef) if ((await createdLegs(q.id)).some((w) => w.state === "in_leon")) withLeon.push(q);
  const r = withLeon.length === 1 ? await loadRequest(withLeon[0].id) : found.request;
  const review = r.review ?? {}; const stages = withStage(stagesOf(r));
  const receipt = { receivedAt: at, messageId: message.id, matchedBy: found.by, uidDiffers: !!found.uidDiffers, sequence: n.calendar?.sequence ?? null };
  const done = async (kase, { status, reason, closed = false, stage, stageState, title, body }) => {
    setStage(stages, CANCEL_STAGE, stageState, stage);
    review.cancellation = { ...(review.cancellation ?? {}), ...receipt, case: kase };
    await patchRequest(r.id, { review, stages, ...(status ? { status, status_reason: reason } : {}), ...(closed ? { closed_reason: "cancelled" } : {}) });
    await patchMessage(message.id, { status: "processed", status_reason: `Cancellation of ${ref ?? "a flight notification"}`, request_id: r.id, search_text: search,
      understood: { ...base, kind: "processed", title, body: `${body}${receipt.uidDiffers ? " The calendar UID differs from the one on file (recorded; the reference matched)." : ""}`, refState: reason ?? r.status_reason ?? "" } });
    await audit({ kind: "intake.cancellation_received", success: true, confirmationStatus: "not_required", detail: { requestId: r.id, messageId: message.id, matchedBy: found.by, uidDiffers: receipt.uidDiffers, case: kase } }).catch(() => {});
    return { cancellation: true, requestId: r.id, case: kase };
  };

  if (withLeon.length > 1) {
    for (const q of withLeon.filter((x) => x.id !== r.id)) await patchRequest(q.id, { status: "needs_you", status_reason: `Cancellation for ${ref} received · more than one request has flights in Leon · nothing cancelled` });
    return done("ambiguous", { status: "needs_you", reason: `Cancellation for ${ref} received · more than one request has flights in Leon · nothing cancelled`, stageState: "hold",
      stage: `The provider cancelled ${ref}, but ${withLeon.length} of our requests have flights in Leon for that reference (${withLeon.map((q) => q.id.slice(0, 8)).join(", ")}). The agent does not choose: nothing was cancelled. Cancel the right flights in Leon by hand.`,
      title: `A cancellation of ${ref} that matches more than one request with flights in Leon`, body: "Nothing was cancelled: the agent does not guess which flights are meant." });
  }
  const legs = await createdLegs(r.id);
  const inLeon = legs.filter((w) => w.state === "in_leon");
  if (legs.some((w) => w.state === "sending" || w.state === "unknown")) {
    return done("leon-unknown", { status: "needs_you", reason: "Cancellation received · a leg's Leon state is unknown · nothing cancelled", stageState: "hold",
      stage: "The provider cancelled this flight, but whether one of its legs exists in Leon is unknown. Settle that first (Check Leon on this page); nothing was cancelled.",
      title: `A cancellation of flight notification ${ref}`, body: "A leg's Leon state is unknown, so nothing was cancelled." });
  }
  if (!inLeon.length) {
    const declined = r.closed_reason === "declined";
    return done(declined ? "declined-at-gate" : "never-loaded", { status: "closed", closed: true, reason: declined ? "Cancelled by the provider · it had been declined, nothing was in Leon" : "Cancelled by the provider before anything reached Leon", stageState: "done",
      stage: declined ? "Cancelled by the provider. Ops had declined this flight at the approval question, so nothing ever reached Leon: nothing to cancel." : "Cancelled by the provider before any leg reached Leon: nothing to cancel. The request is closed.",
      title: `A cancellation of flight notification ${ref}`, body: declined ? "Ops had declined it, so nothing was ever in Leon. Closed." : "Nothing had reached Leon, so the request was closed as cancelled." });
  }
  // What Leon holds for each leg now (read-only).
  let plan;
  try {
    plan = [];
    for (const w of inLeon) { const f = await leonFlight(w.leon_flight_nid); plan.push({ index: w.leg_index, flightNid: String(w.leon_flight_nid), std: f.startTimeUTC ?? w.payload?.startTimeUTC ?? null, alreadyCancelled: !!f.isCnl, departed: Date.parse(f.startTimeUTC ?? w.payload?.startTimeUTC) <= Date.now() }); }
  } catch (e) {
    return done("leon-unreadable", { status: "needs_you", reason: "Cancellation received · Leon could not be read · nothing cancelled", stageState: "hold",
      stage: `The provider cancelled this flight, but Leon could not be read to see the flights' state (${String(e.message).slice(0, 120)}). Nothing was cancelled.`,
      title: `A cancellation of flight notification ${ref}`, body: "Leon could not be read, so nothing was cancelled." });
  }
  if (plan.every((l) => l.alreadyCancelled)) {
    review.cancellation = { ...(review.cancellation ?? {}), legs: plan };
    return done("already-cancelled", { status: "closed", closed: true, reason: "Cancelled by the provider · already cancelled in Leon", stageState: "done",
      stage: `The provider cancelled this flight. ${plan.length === 1 ? "Its flight is" : `All ${plan.length} flights are`} already cancelled in Leon (${plan.map((l) => l.flightNid).join(", ")}): no call was made.`,
      title: `A cancellation of flight notification ${ref}`, body: "Leon already has every leg cancelled; nothing was sent." });
  }
  // A real cancel: ask ops (the same E1 question and answer page, as "Cancel in Leon?").
  review.cancellation = { ...(review.cancellation ?? {}), ...receipt, case: "ask", legs: plan, approval: null, outcome: null };
  await patchRequest(r.id, { review, stages });
  await patchMessage(message.id, { status: "processed", status_reason: `Cancellation of ${ref}`, request_id: r.id, search_text: search,
    understood: { ...base, kind: "processed", title: `A cancellation of flight notification ${ref}`, body: `Matched by ${found.by}. Ops are asked whether to cancel ${plan.filter((l) => !l.alreadyCancelled).length === 1 ? "its flight" : "its flights"} in Leon; nothing is cancelled before they say yes.${receipt.uidDiffers ? " The calendar UID differs from the one on file (recorded; the reference matched)." : ""}`, refState: "Cancellation · asking ops" } });
  await audit({ kind: "intake.cancellation_received", success: true, confirmationStatus: "not_required", detail: { requestId: r.id, messageId: message.id, matchedBy: found.by, uidDiffers: receipt.uidDiffers, case: "ask", legs: plan.length } }).catch(() => {});
  await askCancel(r.id);
  return { cancellation: true, requestId: r.id, case: "ask" };
}

/** Sends the "Cancel in Leon?" question to every notification address, each with its own single-use links. */
export async function askCancel(requestId) {
  const r = await loadRequest(requestId); const review = r.review ?? {}; const c = review.cancellation; const stages = withStage(stagesOf(r));
  const to = await notifyTo();
  const deadlineAt = new Date(Date.now() + approvalHours() * 3600_000).toISOString();
  const approval = { askedAt: new Date().toISOString(), deadlineAt, to, tokens: [], answer: null, late: [], sent: [] };
  const results = [];
  for (const addr of to.length ? to : [null]) {
    const issued = addr ? issueTokens(r.id, addr, "cancel") : { tokens: [], links: { yes: null, no: null } };
    approval.tokens.push(...issued.tokens);
    const sent = await sendIntakeEmail(r, composeProcess(r, review, { links: issued.links, deadlineAt, question: "cancel" }), addr ? { to: [addr] } : {}).catch((e) => ({ ok: false, error: e.message }));
    approval.sent.push({ to: addr, ok: sent.ok, messageId: sent.messageId ?? null, error: sent.error ?? null, mode: sent.mode });
    results.push(sent);
  }
  c.approval = approval; review.cancellation = c;
  const ok = results.some((s) => s.ok);
  const departed = c.legs.filter((l) => l.departed && !l.alreadyCancelled).map((l) => l.index + 1);
  setStage(stages, CANCEL_STAGE, "wait", `The provider cancelled this flight. Ops ${ok ? "were asked by email" : "could not be emailed"} whether to cancel it in Leon; answer by ${hm(deadlineAt)}. Nothing is cancelled until someone says yes.${departed.length ? ` ${legWords(departed)} ${departed.length === 1 ? "has" : "have"} already departed: the agent will not cancel ${departed.length === 1 ? "it" : "them"}.` : ""}`);
  await patchRequest(r.id, { review, stages, status: "needs_you", status_reason: `Cancellation received · asking ops whether to cancel in Leon · by ${hm(deadlineAt)}` });
  return { ok };
}

/** The answer page's view of a cancel token (never personal data). */
export function peekCancel(r, p, summary) {
  const a = r.review?.cancellation?.approval;
  const legs = (r.review.cancellation.legs ?? []).map((l) => ({ leg: l.index + 1, flightNid: l.flightNid, departed: l.departed, alreadyCancelled: l.alreadyCancelled }));
  const s = { ...summary, question: "cancel", deadlineAt: a.deadlineAt, cancelLegs: legs };
  if (a.answer) return { state: "already", answer: p.answer, answered: { value: a.answer.value, by: a.answer.by, at: a.answer.at }, ...s };
  if (Date.parse(a.deadlineAt) <= Date.now()) return { state: "expired", answer: p.answer, ...s };
  return { state: "open", answer: p.answer, ...s };
}

/** Ops' answer to "Cancel in Leon?", however it arrived. Yes → cancel; no → nothing is touched. Late answers change nothing. */
export async function recordCancelAnswer(requestId, { value, by, how }) {
  const r = await loadRequest(requestId); const review = r?.review ?? {}; const c = review.cancellation; const a = c?.approval;
  if (!r || !a) return { state: "invalid" };
  const at = new Date().toISOString();
  const late = async (state) => { (a.late ??= []).push({ at, value, by, how }); await patchRequest(r.id, { review }); return { state, answered: a.answer ?? null }; };
  if (a.answer) return late("already");
  if (Date.parse(a.deadlineAt) <= Date.now() && how !== "intake page") return late("expired");
  a.answer = { value, by, at, how };
  const stages = withStage(stagesOf(r));
  await audit({ kind: "intake.cancel_approval", success: true, userEmail: /@/.test(by) ? by : null, confirmationStatus: "confirmed", detail: { requestId: r.id, answer: value, how } }).catch(() => {});
  if (value === "no") {
    setStage(stages, CANCEL_STAGE, "done", `The provider's cancellation was declined by ${by} (${how}) at ${hm(at)}: nothing was touched in Leon. The cancellation stays recorded on this request.`);
    await patchRequest(r.id, { review, stages, status: "loaded", status_reason: `Cancellation declined by ${by} · flights unchanged in Leon` });
    return { state: "recorded", answer: a.answer };
  }
  setStage(stages, CANCEL_STAGE, "prog", `Approved by ${by} (${how}) at ${hm(at)}. Cancelling in Leon.`);
  await patchRequest(r.id, { review, stages, status: "in_progress", status_reason: "Cancellation approved · cancelling in Leon" });
  void runCancel(r.id, { by, how }).catch(async (e) => {
    const r2 = await loadRequest(r.id); const st = withStage(stagesOf(r2));
    setStage(st, CANCEL_STAGE, "fail", `The cancel stopped: ${String(e.message).slice(0, 200)}. Check the flights in Leon.`);
    await patchRequest(r.id, { stages: st, status: "needs_you", status_reason: "Cancellation stopped · check Leon" }).catch(() => {});
  });
  return { state: "recorded", answer: a.answer };
}

async function insertCancelAttempt(row) {
  const ins = await rest("intake_leon_writes?on_conflict=request_id,leg_index,payload_sha256", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=representation" }, body: JSON.stringify([row]) });
  if (Array.isArray(ins) && ins.length) return { row: ins[0], fresh: true };
  const prior = (await rest(`intake_leon_writes?select=*&request_id=eq.${row.request_id}&leg_index=eq.${row.leg_index}&payload_sha256=eq.${row.payload_sha256}`))?.[0];
  if (prior?.state === "not_cancelled") { // refused before, and a person approved again: take it, conditionally
    const taken = await rest(`intake_leon_writes?id=eq.${prior.id}&state=eq.not_cancelled`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ state: "sending", leon_error: null, sent_by_email: row.sent_by_email, updated_at: new Date().toISOString() }) });
    if (Array.isArray(taken) && taken.length) return { row: taken[0], fresh: true };
  }
  return { row: prior, fresh: false };
}

/** Cancels the approved legs in Leon, one by one: attempt row first, then the call, then the outcome. */
export async function runCancel(requestId, { by, how }) {
  const r = await loadRequest(requestId); const review = r.review; const c = review.cancellation;
  const outcome = []; let stopped = false;
  for (const l of c.legs) {
    const base = { index: l.index, flightNid: l.flightNid };
    if (l.departed) { outcome.push({ ...base, state: "departed" }); continue; }
    if (stopped) { outcome.push({ ...base, state: "not_sent", error: "Not sent: an earlier leg's result is unknown." }); continue; }
    const { row, fresh } = await insertCancelAttempt({ request_id: r.id, leg_index: l.index, action: "cancel", payload: { action: "cancel", flightNid: l.flightNid }, payload_sha256: sha(`cancel:${r.id}:${l.index}:${l.flightNid}`), marker: `CWY-INTAKE ${r.id}/${l.index}`, state: "sending", leon_flight_nid: l.flightNid, sent_by: null, sent_by_email: /@/.test(by) ? by : null });
    if (!fresh) {
      if (row?.state === "cancelled") { outcome.push({ ...base, state: "cancelled", already: true }); continue; }
      outcome.push({ ...base, state: "unknown", error: "An earlier cancel of this leg is unfinished or its result is unknown. Nothing was sent again; check Leon." }); stopped = true; continue;
    }
    await audit({ kind: "intake.leon_cancel_attempt", success: true, confirmationStatus: "confirmed", toolName: "intake.leon_cancel", toolArgs: { requestId: r.id, leg: l.index, flightNid: l.flightNid }, detail: { writeId: row.id, approvedBy: by, how } }).catch(() => {});
    const t0 = Date.now(); let res = null, thrown = null;
    try {
      // Leon's state right before the call: cancelled since we asked → no call.
      const now = await leonFlight(l.flightNid);
      if (now.isCnl) {
        await rest(`intake_leon_writes?id=eq.${row.id}`, { method: "PATCH", body: JSON.stringify({ state: "cancelled", leon_error: "Already cancelled in Leon when the agent came to cancel it; no call was made.", answered_ms: Date.now() - t0, updated_at: new Date().toISOString() }) });
        outcome.push({ ...base, state: "cancelled", already: true }); continue;
      }
      res = await leonGraphql(`mutation($n:FlightNid!){ flightDelete(flightNid:$n) }`, { n: Number(l.flightNid) }, timeout());
    } catch (e) { thrown = e; }
    const ms = Date.now() - t0;
    let o;
    if (res?.data?.flightDelete === true && !res.errors?.length) o = { ...base, state: "cancelled" };
    else if (!thrown && res && res.httpStatus < 500 && (res.errors?.length || res.data?.flightDelete === false)) o = { ...base, state: "not_cancelled", error: `Leon: ${String(res.errors?.[0]?.message ?? "it answered that the flight was not cancelled").slice(0, 200)}` };
    else { o = { ...base, state: "unknown", error: thrown ? `Leon did not answer (${/abort|timeout/i.test(String(thrown.message)) ? "timed out" : String(thrown.message).slice(0, 120)})` : `Leon answered HTTP ${res?.httpStatus} without confirming` }; stopped = true; }
    await rest(`intake_leon_writes?id=eq.${row.id}`, { method: "PATCH", body: JSON.stringify({ state: o.state, leon_error: o.error ?? null, http_status: res?.httpStatus ?? null, answered_ms: ms, updated_at: new Date().toISOString() }) });
    await audit({ kind: `intake.leon_${o.state === "cancelled" ? "cancelled" : o.state === "not_cancelled" ? "cancel_refused" : "cancel_unknown"}`, success: o.state === "cancelled", error: o.error ?? null, confirmationStatus: "confirmed", toolName: "intake.leon_cancel", toolArgs: { requestId: r.id, leg: l.index, flightNid: l.flightNid }, latencyMs: ms }).catch(() => {});
    outcome.push(o);
  }
  return finishCancel(r.id, outcome, { by });
}

/** Stage, status and the completion email for a cancel run. */
async function finishCancel(requestId, outcome, { by }) {
  const r = await loadRequest(requestId); const review = r.review; const c = review.cancellation; const stages = withStage(stagesOf(r));
  const at = new Date().toISOString();
  c.outcome = { at, by, legs: outcome };
  const done = outcome.filter((o) => o.state === "cancelled"), bad = outcome.filter((o) => o.state === "not_cancelled" || o.state === "unknown" || o.state === "not_sent"), dep = outcome.filter((o) => o.state === "departed");
  const ns = (xs) => xs.map((o) => o.index + 1);
  const note = [done.length ? `${legWords(ns(done))} cancelled in Leon (${done.map((o) => o.flightNid).join(", ")}): Leon keeps ${done.length === 1 ? "it" : "them"} as cancelled, not removed.` : null,
    bad.length ? `${legWords(ns(bad))} NOT cancelled: ${bad.map((o) => `leg ${o.index + 1} — ${o.error ?? o.state}`).join("; ")}.` : null,
    dep.length ? `${legWords(ns(dep))} had already departed: not cancelled by the agent; a person decides.` : null].filter(Boolean).join(" ");
  setStage(stages, CANCEL_STAGE, bad.length ? (done.length ? "part" : "fail") : dep.length ? "part" : "done", note, at);
  const status = bad.length || dep.length ? "needs_you" : "closed";
  const reason = bad.length ? `Cancellation: ${legWords(ns(bad))} NOT cancelled in Leon${done.length ? ` · ${legWords(ns(done))} cancelled` : ""}` : dep.length ? (done.length ? `Cancelled in Leon except ${legWords(ns(dep))} (already departed) · a person decides` : `Not cancelled: ${legWords(ns(dep))} already departed · a person decides`) : "Cancelled in Leon (kept as cancelled, not removed)";
  await patchRequest(r.id, { review, stages, status, status_reason: reason, ...(status === "closed" ? { closed_reason: "cancelled" } : {}) });
  const mail = composeCancelOutcome(r, review, { outcome, by, at });
  const sent = await sendIntakeEmail(r, mail).catch((e) => ({ ok: false, error: e.message }));
  return { outcome, status, email: { kind: mail.kind, ok: sent.ok, error: sent.error ?? null } };
}

/** The ticker: a cancel question nobody answered by its deadline. Nothing is cancelled; the request keeps waiting, visibly. */
export async function cancelDeadlines() {
  const rows = (await rest("intake_requests?select=id,review,stages&request_type=eq.scheduled&status=eq.needs_you&limit=100").catch(() => [])) ?? [];
  for (const r of rows) {
    const a = r.review?.cancellation?.approval; if (!a || a.answer || a.expiredNoted || Date.parse(a.deadlineAt) > Date.now()) continue;
    const stages = withStage(stagesOf(r)); a.expiredNoted = new Date().toISOString();
    setStage(stages, CANCEL_STAGE, "hold", `No answer by ${hm(a.deadlineAt)}: nothing was cancelled in Leon. The cancellation waits here for someone to decide (Cancel in Leon / Keep the flights).`);
    await patchRequest(r.id, { review: r.review, stages, status_reason: `Cancellation: no answer by ${hm(a.deadlineAt)} · nothing cancelled · decide on this page` });
    await audit({ kind: "intake.cancel_approval_expired", success: true, confirmationStatus: "not_required", detail: { requestId: r.id, deadlineAt: a.deadlineAt } }).catch(() => {});
  }
}

/** On start: a cancel attempt that never recorded its outcome is unknown; a person checks Leon. */
export async function recoverCancelsOnStart() {
  const rows = await rest(`intake_leon_writes?action=eq.cancel&state=eq.sending`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ state: "unknown", leon_error: "The service stopped during the cancel; the result was never recorded. Check the flight in Leon.", updated_at: new Date().toISOString() }) }).catch(() => []);
  for (const w of rows ?? []) {
    const r = await loadRequest(w.request_id); if (!r) continue; const st = withStage(stagesOf(r));
    setStage(st, CANCEL_STAGE, "fail", `The service stopped while cancelling leg ${w.leg_index + 1} (flight ${w.leon_flight_nid}): whether Leon cancelled it is unknown. Check Leon; nothing is retried.`);
    await patchRequest(r.id, { stages: st, status: "needs_you", status_reason: `Cancellation: leg ${w.leg_index + 1} unknown · check Leon` }).catch(() => {});
  }
  return (rows ?? []).length;
}
