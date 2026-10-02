// Type 1 (scheduled flights): what happens to a message classified as a provider's flight notification.
//
// The notification is a TRIGGER and a KEY. Its ten lines are never turned into flights: times in it are local
// with no date per leg, there is no arrival time and no crew count. The data is the provider's record.
//
//   1. Link. A message with the calendar UID (or the reference) of a request we already have is that request's
//      update, another copy of it, or its cancellation, by the calendar METHOD and SEQUENCE. Never a second
//      request. UNVERIFIED AGAINST REAL MAIL: built against fictional invites (rig/fixtures/cnair/invite-*.eml);
//      whether a real Exchange invite keeps its calendar part through Resend, and whether the provider really
//      sends updates with the same UID, is not proven until a real invite has come through.
//   2. Look up. Does the reference resolve to a record in the provider's system? This is the first step of the
//      pipeline ("Collecting data"), not part of classification, so stray mail never causes a portal login.
//      An empty answer is legitimate (records appear days after their quote date): it is retried on a schedule
//      and then a person is asked. It never falls through to a handling request.
//   3. Stop. Collecting the legs and loading them into Leon is NOT BUILT. The stage says so and the request
//      waits for a person. The "Process?" confirmation (E1) is not built either.
import { rest } from "../knowledge/retrieval.mjs";
import { audit } from "../store.mjs";
import { freshStages, setStage } from "./pipeline.mjs";
import { notificationChanges } from "./classify.mjs";
import { resolveReference, lookupState } from "./providers/cnair.mjs";

/** Minutes after the first look-up at which it is tried again; then a person is asked. */
const schedule = () => { const env = String(process.env.INTAKE_LOOKUP_SCHEDULE_MIN ?? "").split(",").map((x) => Number(x.trim())).filter((n) => Number.isFinite(n) && n >= 0); return env.length ? env : [0, 15, 60, 180, 360, 720, 1440]; };
const hm = (iso) => `${new Date(iso).toISOString().slice(11, 16)}Z`;
const span = (min) => (min >= 60 ? `${Math.round(min / 60)} h` : `${Math.round(min)} min`);
const patchRequest = (id, patch) => rest(`intake_requests?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }) });
const patchMessage = (id, patch) => rest(`intake_messages?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(patch) });
const routeText = (n) => (n?.route ?? []).join(" → ");
const checksOf = (decision) => (decision?.evidence ?? []).filter((e) => e.test !== "hint" || e.found).map((e) => [({ reference: "Provider reference", block: "Notification block", calendar: "Calendar part", subject: "Subject", sender: "Sender", asks: "Asks us for something", schedule: "Own schedule", reading: "The agent's reading" })[e.signal] ?? e.signal, e.found ? "yes" : "none", e.detail]);

async function findExisting(message, notification) {
  const own = (await rest(`intake_requests?select=*&message_id=eq.${message.id}`))?.[0];
  if (own) return { request: own, by: "message" };
  const uid = notification.calendar?.uid;
  if (uid) {
    const m = (await rest(`intake_messages?select=request_id&direction=eq.inbound&request_id=not.is.null&id=neq.${message.id}&understood->calendar->>uid=eq.${encodeURIComponent(uid)}&order=received_at.desc&limit=1`).catch(() => []))?.[0];
    const r = m ? (await rest(`intake_requests?select=*&id=eq.${m.request_id}`))?.[0] : null;
    // The reference is the key. The same calendar event with a DIFFERENT reference is not an update of that
    // request: fall through to the reference (or a new request) rather than attach it to the wrong flight.
    if (r && (!notification.reference || !r.reference || r.reference === notification.reference)) return { request: r, by: "calendar UID" };
  }
  if (notification.reference) {
    const r = (await rest(`intake_requests?select=*&request_type=eq.scheduled&reference=eq.${encodeURIComponent(notification.reference)}&order=created_at.desc&limit=1`))?.[0];
    if (r) return { request: r, by: "reference" };
  }
  return null;
}

/**
 * A message classified as a notification. Creates the request, or attaches the message to the one it belongs to.
 * `decision` is the classification (type, confidence, evidence); `actor` is set when a person chose the type.
 */
export async function handleNotification({ message, signals, decision, senderName, actor = null }) {
  const n = signals.notification; const ref = n.reference; const provider = signals.provider.name;
  const method = n.calendar?.method ?? "REQUEST";
  const classification = { ...decision, at: new Date().toISOString(), by: actor?.name ?? null };
  const base = { classification, calendar: n.calendar ? { uid: n.calendar.uid, method: n.calendar.method, sequence: n.calendar.sequence } : null, ref, checks: checksOf(decision) };
  const search = `${message.from_addr ?? ""}\n${message.subject ?? ""}\n${ref ?? ""}\n${(n.route ?? []).join(" ")}`;
  const found = await findExisting(message, n);

  // ── A cancellation ────────────────────────────────────────────────────────────────────────────────────────
  if (method === "CANCEL") {
    if (!found) {
      await patchMessage(message.id, { status: "not_recognised", status_reason: `A cancellation for ${ref}, but the agent has no request for it`, search_text: search,
        understood: { ...base, kind: "notrec", title: `Needs a decision: a cancellation for ${provider} reference ${ref}, which the agent has no request for`, body: "If that flight is in Leon, it may need cancelling there. The agent did nothing.", hint: "Check Leon for this flight, then mark this message as ignored." } });
      return { cancellation: true, requestId: null };
    }
    const r = found.request; const review = r.review ?? {};
    const inLeon = (await rest(`intake_leon_writes?select=leg_index&request_id=eq.${r.id}&state=in.(in_leon,sending,unknown)`)) ?? [];
    const stages = (r.stages?.length ? r.stages : freshStages("scheduled")).map((s) => ({ ...s }));
    review.cancelled = { at: classification.at, messageId: message.id, matchedBy: found.by };
    if (inLeon.length) { setStage(stages, "Collecting data", "hold", `Cancelled by the provider. ${inLeon.length} leg${inLeon.length === 1 ? " is" : "s are"} in Leon (or may be): cancel ${inLeon.length === 1 ? "it" : "them"} there.`); await patchRequest(r.id, { status: "needs_you", status_reason: "Cancelled by the provider · legs are in Leon", stages, review }); }
    else { setStage(stages, "Collecting data", "skip", "Cancelled by the provider before anything was loaded."); await patchRequest(r.id, { status: "closed", closed_reason: "cancelled", status_reason: "Cancelled by the provider", stages, review }); }
    await patchMessage(message.id, { status: "processed", status_reason: `Cancellation of ${ref}`, request_id: r.id, search_text: search,
      understood: { ...base, kind: "processed", title: `A cancellation of flight notification ${ref}`, body: inLeon.length ? "The flight is in Leon: a person must cancel it there." : "Nothing had been loaded, so the request was closed as cancelled.", refState: inLeon.length ? "Needs you" : "Cancelled" } });
    await audit({ kind: "intake.notification_cancelled", success: true, confirmationStatus: "not_required", detail: { requestId: r.id, messageId: message.id, matchedBy: found.by, inLeon: inLeon.length } }).catch(() => {});
    return { cancellation: true, requestId: r.id };
  }

  // ── An update to, or another copy of, a request we already have ───────────────────────────────────────────
  if (found && found.by !== "message") {
    const r = found.request; const review = r.review ?? { kind: "notification", legs: [], updates: [] };
    const prev = review.notification ?? {};
    const changes = notificationChanges(prev, n);
    const newer = (n.calendar?.sequence ?? 0) > (prev.calendar?.sequence ?? 0);
    if (!changes.length && !newer) {
      review.copies = (review.copies ?? 0) + 1;
      await patchRequest(r.id, { review });
      await patchMessage(message.id, { status: "processed", status_reason: `Another copy of ${ref}`, request_id: r.id, search_text: search, understood: { ...base, kind: "processed", title: `Another copy of flight notification ${ref}`, body: `The agent already has this notification (matched by ${found.by}). Nothing changed.`, refState: r.status_reason ?? "" } });
      return { copy: true, requestId: r.id };
    }
    const what = changes.length ? changes.join("; ") : "the invite was re-sent with a higher sequence; the notification lines are the same";
    review.notification = n; (review.updates = review.updates ?? []).push({ at: classification.at, messageId: message.id, sequence: n.calendar?.sequence ?? null, changes, matchedBy: found.by });
    const inLeon = (await rest(`intake_leon_writes?select=leg_index&request_id=eq.${r.id}&state=in.(in_leon,sending,unknown)`)) ?? [];
    const stages = (r.stages?.length ? r.stages : freshStages("scheduled")).map((s) => ({ ...s }));
    let patch;
    if (inLeon.length) { setStage(stages, "Collecting data", "hold", `Changed by the provider after loading: ${what}. A person decides what to do in Leon.`); patch = { status: "needs_you", status_reason: "Changed by the provider after it was loaded" }; }
    else { review.lookup = { attempts: [], nextAt: classification.at }; delete review.cancelled; setStage(stages, "Collecting data", "prog", `Updated by the provider: ${what}. Looking the reference up again.`); patch = { status: "collecting", status_reason: "Updated by the provider · looking up the reference", closed_reason: null }; }
    await patchRequest(r.id, { ...patch, stages, review, route: routeText(n) || r.route, legs_count: n.etd?.length || r.legs_count });
    await patchMessage(message.id, { status: "processed", status_reason: `Update to ${ref}`, request_id: r.id, search_text: search, understood: { ...base, kind: "processed", title: `An update to flight notification ${ref}`, body: `Matched by ${found.by}. ${changes.length ? `Changed: ${what}.` : "Re-sent with a higher sequence."}`, refState: patch.status_reason } });
    await audit({ kind: "intake.notification_updated", success: true, confirmationStatus: "not_required", detail: { requestId: r.id, messageId: message.id, matchedBy: found.by, changes: changes.length } }).catch(() => {});
    if (!inLeon.length) void runLookup(r.id).catch(() => {});
    return { update: true, requestId: r.id };
  }

  // ── A new notification (or this same message read again) ──────────────────────────────────────────────────
  const stages = freshStages("scheduled");
  setStage(stages, "Request received", "done", `From ${senderName ?? message.from_addr ?? "an unknown sender"} · read as a ${provider} flight notification${actor ? ` (chosen by ${actor.name})` : ""}`, message.received_at);
  setStage(stages, "Confirmation sent", "skip", "The “Process?” email to ops is not built yet.");
  setStage(stages, "Confirmation received", "skip", null);
  setStage(stages, "Collecting data", "prog", `Looking up ${ref} in the ${provider} portal.`);
  const review = { kind: "notification", legs: [], notification: n, lookup: { attempts: [], nextAt: classification.at }, updates: [], copies: 0 };
  const row = { request_type: "scheduled", status: "collecting", status_reason: "Looking up the reference in the provider's portal", stages, review, reference: ref, reference_built: false, sender_name: senderName ?? null, route: routeText(n) || null, legs_count: n.etd?.length || Math.max(0, (n.route?.length ?? 1) - 1) || null, first_std: null, closed_reason: null };
  let req = found?.request ?? null;
  if (req) await patchRequest(req.id, row);
  else req = (await rest("intake_requests?on_conflict=message_id", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=representation" }, body: JSON.stringify([{ message_id: message.id, ...row }]) }))?.[0] ?? (await rest(`intake_requests?select=*&message_id=eq.${message.id}`))?.[0];
  await patchMessage(message.id, { status: "processed", status_reason: "Flight notification", request_id: req.id, search_text: search,
    understood: { ...base, kind: "processed", title: "Read as a flight notification", body: `${provider} reference ${ref}${routeText(n) ? ` · ${routeText(n)}` : ""}. The flight's data is in the provider's portal, not in this message.`, refState: "Looking up the reference" } });
  await audit({ kind: "intake.notification_received", success: true, userEmail: actor?.email ?? null, confirmationStatus: actor ? "confirmed" : "not_required", detail: { requestId: req.id, messageId: message.id, provider: signals.provider.id, confidence: decision.confidence, decidedBy: decision.decidedBy } }).catch(() => {});
  void runLookup(req.id).catch((e) => process.stderr.write(`[intake] reference look-up for ${req.id} failed: ${e?.message}\n`));
  return { scheduled: true, requestId: req.id };
}

// ── The look-up: does the reference resolve? ─────────────────────────────────────────────────────────────────
const running = new Set();
/** One look-up attempt for a scheduled request. `manual` = a person pressed "Look up now". */
export async function runLookup(requestId, { manual = false, actor = null } = {}) {
  if (running.has(requestId)) return { busy: true }; running.add(requestId);
  try {
    const r = (await rest(`intake_requests?select=*&id=eq.${requestId}`))?.[0];
    if (!r || r.request_type !== "scheduled") throw Object.assign(new Error("Not a scheduled-flight request."), { status: 409 });
    if (r.status === "closed") throw Object.assign(new Error("This request is closed."), { status: 409 });
    const review = r.review ?? {}; const lookup = review.lookup ?? { attempts: [] }; const n = review.notification ?? {};
    if (lookup.found && !manual) return { state: "found" };
    const sched = schedule(); const attempt = (lookup.attempts?.length ?? 0) + 1;
    const res = await resolveReference(r.reference, { attempt });
    const at = new Date().toISOString(); const provider = n.providerName ?? "provider";
    lookup.attempts = [...(lookup.attempts ?? []), { at, state: res.state, why: res.why ?? null, listed: res.listed ?? null, by: manual ? actor?.name ?? "a person" : null }];
    const stages = (r.stages ?? []).map((s) => ({ ...s })); let patch;
    const first = Date.parse(lookup.attempts[0].at); const nextOffset = sched[attempt]; // minutes after the first try
    if (res.state === "found") {
      lookup.found = { at, row: res.row }; lookup.nextAt = null;
      setStage(stages, "Collecting data", "hold", `Record ${r.reference} found in the ${provider} portal (flight date ${res.row.flightDate}, ${res.row.aircraft}). Collecting its legs is not built yet, so nothing was loaded: enter this flight in Leon by hand, then mark it handled.`);
      patch = { status: "needs_you", status_reason: "Reference found · collecting the legs is not built" };
    } else if (res.notConfigured) {
      lookup.nextAt = null;
      setStage(stages, "Collecting data", "wait", `${res.why} A person checks the portal for ${r.reference}.`);
      patch = { status: "needs_you", status_reason: "Reference not checked · portal look-up is off" };
    } else if (nextOffset != null) {
      lookup.nextAt = new Date(first + nextOffset * 60000).toISOString();
      setStage(stages, "Collecting data", "prog", `${res.state === "not_found" ? `${r.reference} is not in the ${provider} portal yet` : `The portal could not be read (${res.why})`}. Try ${attempt} of ${sched.length}; next at ${hm(lookup.nextAt)}.`);
      patch = { status: "collecting", status_reason: res.state === "not_found" ? "Reference not in the portal yet · will look again" : "Provider portal not readable · will try again" };
    } else {
      lookup.nextAt = null;
      const over = span(sched[Math.min(attempt, sched.length) - 1] ?? 0);
      setStage(stages, "Collecting data", "fail", res.state === "not_found" ? `${r.reference} was not found in the ${provider} portal after ${attempt} ${attempt === 1 ? "try" : `tries over ${over}`}. A person decides: it may appear later, or the reference may be wrong. It was NOT treated as a handling request.` : `The ${provider} portal could not be read after ${attempt} ${attempt === 1 ? "try" : "tries"}: ${res.why}`);
      patch = { status: "needs_you", status_reason: res.state === "not_found" ? "Reference not found in the provider's portal" : "Provider portal could not be read" };
    }
    review.lookup = lookup;
    await patchRequest(r.id, { ...patch, stages, review });
    await audit({ kind: "intake.reference_lookup", success: res.state === "found", userEmail: actor?.email ?? null, confirmationStatus: "not_required", detail: { requestId: r.id, attempt, state: res.state, manual } }).catch(() => {});
    return { state: res.state, attempt };
  } finally { running.delete(requestId); }
}

/** Every 30 s: scheduled requests whose next look-up is due. Survives restarts because the due time is in the row. */
export function startLookupTicker() {
  let busy = false;
  const tick = async () => {
    if (busy) return; busy = true;
    try {
      const rows = (await rest("intake_requests?select=id,review&request_type=eq.scheduled&status=eq.collecting&limit=50").catch(() => [])) ?? [];
      for (const r of rows) { const next = r.review?.lookup?.nextAt; if (next && Date.parse(next) <= Date.now()) await runLookup(r.id).catch(() => {}); }
    } finally { busy = false; }
  };
  setInterval(tick, 30000).unref(); void tick();
}
export { lookupState };
