// Type 1 (scheduled flights): a provider's flight notification, from the invite to a request ready to confirm.
//
//   Request received → Confirmation sent (E1 "Process?") → Confirmation received (a person says yes or no) →
//   Collecting data (the portal record, read once) → Data collected → Review requested (ops are told to come and
//   confirm) → Reviewed and confirmed → Building Leon request → Leon request built → Sent to Leon → Notification sent
//
// The notification is a TRIGGER and a KEY: its lines are never turned into flights. The flight is the provider's
// record, and NOTHING contacts the provider before a person has approved. Decline closes the request. No answer
// by the deadline closes it too, visibly; anyone can still process it from the intake page. "Look up now" on the
// page is the one manual exception: a person pressing it is that person's approval.
//
// One-shot, on purpose: a schedule arrives, is approved, is loaded, done. Changes the provider makes after the
// import are NOT detected (no re-reading, no polling); the request page and the completion email say so. The
// linking of a later invite with the same calendar UID (update / copy / cancellation) is kept from before and is
// still UNVERIFIED against real mail: it was built on fictional invites (rig/fixtures/cnair/invite-*.eml), and
// whether a real Exchange invite keeps its calendar part through Resend is not proven.
//
// Confirm, Leon payload, send, checklist and the completion email are the type 2 path (send.mjs): one write path.
import { createHash, randomBytes } from "node:crypto";
import { rest } from "../knowledge/retrieval.mjs";
import { audit } from "../store.mjs";
import { freshStages, setStage, findDuplicates } from "./pipeline.mjs";
import { notificationChanges } from "./classify.mjs";
import { readPortal, lookupState } from "./providers/cnair.mjs";
import { normalise, enforce } from "./extract.mjs";
import { reviewFromExtraction } from "./review.mjs";
import { checklistDefinitions } from "./leon-lookup.mjs";
import { composeProcess, composeProcessAnswered, composeProcessExpired, composeProcessUnclear, composeReview, composeStopped, sendIntakeEmail, notifyTo, consoleBase } from "./notify.mjs";

/** Minutes after the first look-up at which it is tried again; then a person is asked. */
const schedule = () => { const env = String(process.env.INTAKE_LOOKUP_SCHEDULE_MIN ?? "").split(",").map((x) => Number(x.trim())).filter((n) => Number.isFinite(n) && n >= 0); return env.length ? env : [0, 15, 60, 180, 360, 720, 1440]; };
/** How long ops have to answer E1. */
const approvalHours = () => { const n = Number(process.env.INTAKE_APPROVAL_HOURS); return Number.isFinite(n) && n > 0 ? n : 4; };
/** Aircraft model names as the portal writes them → ICAO type. Anything else blocks; the agent never guesses a type. */
export const AIRCRAFT_TYPES = { "citation cj4": "C25C", "cessna citation cj4": "C25C", "citation cj4 gen2": "C25C", "cj4": "C25C" };
const hm = (iso) => `${new Date(iso).toISOString().slice(11, 16)}Z`;
const span = (min) => (min >= 60 ? `${Math.round(min / 60)} h` : `${Math.round(min)} min`);
const patchRequest = (id, patch) => rest(`intake_requests?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }) });
const patchMessage = (id, patch) => rest(`intake_messages?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(patch) });
const loadRequest = async (id) => (await rest(`intake_requests?select=*&id=eq.${id}`))?.[0];
const routeText = (n) => (n?.route ?? []).join(" → ");
const checksOf = (decision) => (decision?.evidence ?? []).filter((e) => e.test !== "hint" || e.found).map((e) => [({ reference: "Provider reference", block: "Notification block", calendar: "Calendar part", subject: "Subject", sender: "Sender", asks: "Asks us for something", schedule: "Own schedule", reading: "The agent's reading" })[e.signal] ?? e.signal, e.found ? "yes" : "none", e.detail]);
const sha = (s) => createHash("sha256").update(s).digest("hex");
const stagesOf = (r) => (r.stages?.length ? r.stages : freshStages("scheduled")).map((s) => ({ ...s }));
const isExpired = (r) => r.status === "closed" && r.closed_reason === "expired";

/**
 * The request a later message belongs to. The REFERENCE is the key and is tried first (a real cancellation
 * carries the full block, reference included); the calendar UID is a cross-check, and the way in when the
 * message has no reference. The same UID with a different reference is not linked.
 */
async function findExisting(message, notification) {
  const own = (await rest(`intake_requests?select=*&message_id=eq.${message.id}`))?.[0];
  if (own) return { request: own, by: "message" };
  const uid = notification.calendar?.uid ?? null;
  const byUid = async () => { const m = (await rest(`intake_messages?select=request_id&direction=eq.inbound&request_id=not.is.null&id=neq.${message.id}&understood->calendar->>uid=eq.${encodeURIComponent(uid)}&order=received_at.desc&limit=1`).catch(() => []))?.[0]; return m ? (await rest(`intake_requests?select=*&id=eq.${m.request_id}`))?.[0] ?? null : null; };
  if (notification.reference) {
    const r = (await rest(`intake_requests?select=*&request_type=eq.scheduled&reference=eq.${encodeURIComponent(notification.reference)}&order=created_at.desc&limit=1`))?.[0];
    if (r) {
      const known = r.review?.notification?.calendar?.uid ?? null;
      const uidCheck = !uid || !known ? "no UID to compare" : uid === known ? "UID agrees" : "UID differs from the one on file";
      return { request: r, by: `reference (${uidCheck})`, uidDiffers: !!(uid && known && uid !== known) };
    }
  }
  if (uid) {
    const r = await byUid();
    if (r && (!notification.reference || !r.reference || r.reference === notification.reference)) return { request: r, by: "calendar UID" };
  }
  return null;
}

// ── 1. A notification arrives ────────────────────────────────────────────────────────────────────────────────
/**
 * A message classified as a notification. Creates the request and asks ops (E1), or attaches the message to the
 * request it belongs to. `decision` is the classification; `actor` is set when a person chose the type.
 */
export async function handleNotification({ message, signals, decision, senderName, actor = null }) {
  const n = signals.notification; const ref = n.reference; const provider = signals.provider.name;
  const method = n.calendar?.method ?? "REQUEST";
  const classification = { ...decision, at: new Date().toISOString(), by: actor?.name ?? null };
  const base = { classification, calendar: n.calendar ? { uid: n.calendar.uid, method: n.calendar.method, sequence: n.calendar.sequence } : null, ref, checks: checksOf(decision) };
  const search = `${message.from_addr ?? ""}\n${message.subject ?? ""}\n${ref ?? ""}\n${(n.route ?? []).join(" ")}`;
  const found = await findExisting(message, n);

  // ── A cancellation (unverified against real mail) ─────────────────────────────────────────────────────────
  if (method === "CANCEL") {
    if (!found) {
      await patchMessage(message.id, { status: "not_recognised", status_reason: `A cancellation for ${ref}, but the agent has no request for it`, search_text: search,
        understood: { ...base, kind: "notrec", title: `Needs a decision: a cancellation for ${provider} reference ${ref}, which the agent has no request for`, body: "If that flight is in Leon, it may need cancelling there. The agent did nothing.", hint: "Check Leon for this flight, then mark this message as ignored." } });
      return { cancellation: true, requestId: null };
    }
    const r = found.request; const review = r.review ?? {};
    const inLeon = (await rest(`intake_leon_writes?select=leg_index&request_id=eq.${r.id}&state=in.(in_leon,sending,unknown)`)) ?? [];
    const stages = stagesOf(r);
    review.cancelled = { at: classification.at, messageId: message.id, matchedBy: found.by };
    if (inLeon.length) { setStage(stages, "Collecting data", "hold", `Cancelled by the provider. ${inLeon.length} leg${inLeon.length === 1 ? " is" : "s are"} in Leon (or may be): cancel ${inLeon.length === 1 ? "it" : "them"} there.`); await patchRequest(r.id, { status: "needs_you", status_reason: "Cancelled by the provider · legs are in Leon", stages, review }); }
    else { setStage(stages, "Confirmation received", "skip", "Cancelled by the provider before anything was loaded."); setStage(stages, "Collecting data", "skip", null); await patchRequest(r.id, { status: "closed", closed_reason: "cancelled", status_reason: "Cancelled by the provider", stages, review }); }
    await patchMessage(message.id, { status: "processed", status_reason: `Cancellation of ${ref}`, request_id: r.id, search_text: search,
      understood: { ...base, kind: "processed", title: `A cancellation of flight notification ${ref}`, body: inLeon.length ? "The flight is in Leon: a person must cancel it there." : "Nothing had been loaded, so the request was closed as cancelled.", refState: inLeon.length ? "Needs you" : "Cancelled" } });
    await audit({ kind: "intake.notification_cancelled", success: true, confirmationStatus: "not_required", detail: { requestId: r.id, messageId: message.id, matchedBy: found.by, inLeon: inLeon.length } }).catch(() => {});
    return { cancellation: true, requestId: r.id };
  }

  // ── An update to, or another copy of, a request we already have (unverified against real mail) ───────────
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
    const stages = stagesOf(r);
    // Before approval the question is still open: the request simply carries the newer lines. After it, a person
    // decides: the import is one-shot and the agent does not re-read the portal on its own.
    let patch;
    if (r.status === "awaiting_approval") patch = { route: routeText(n) || r.route, legs_count: n.etd?.length || r.legs_count };
    else if (r.status === "closed") { setStage(stages, "Collecting data", "skip", `The provider sent an update after the request was closed: ${what}.`); patch = {}; }
    else { setStage(stages, "Collecting data", "hold", `The provider sent an update: ${what}. Changes after import are not detected automatically; a person decides what this means for the flight.`); patch = { status: "needs_you", status_reason: "Updated by the provider · a person decides" }; }
    await patchRequest(r.id, { ...patch, stages, review });
    await patchMessage(message.id, { status: "processed", status_reason: `Update to ${ref}`, request_id: r.id, search_text: search, understood: { ...base, kind: "processed", title: `An update to flight notification ${ref}`, body: `Matched by ${found.by}. ${changes.length ? `Changed: ${what}.` : "Re-sent with a higher sequence."} ${r.status === "awaiting_approval" ? "The question to ops is still open." : "A person decides what this means for the flight."}`, refState: patch.status_reason ?? r.status_reason ?? "" } });
    await audit({ kind: "intake.notification_updated", success: true, confirmationStatus: "not_required", detail: { requestId: r.id, messageId: message.id, matchedBy: found.by, changes: changes.length } }).catch(() => {});
    return { update: true, requestId: r.id };
  }

  // ── A new notification (or this same message read again): the request, then the question to ops ──────────
  const stages = freshStages("scheduled");
  setStage(stages, "Request received", "done", `From ${senderName ?? message.from_addr ?? "an unknown sender"} · read as a ${provider} flight notification${actor ? ` (chosen by ${actor.name})` : ""}`, message.received_at);
  const review = { kind: "notification", legs: [], notification: n, lookup: { attempts: [] }, approval: null, updates: [], copies: 0 };
  const row = { request_type: "scheduled", status: "awaiting_approval", status_reason: "Asking ops whether to process it", stages, review, reference: ref, reference_built: false, sender_name: senderName ?? null, route: routeText(n) || null, legs_count: n.etd?.length || Math.max(0, (n.route?.length ?? 1) - 1) || null, first_std: null, closed_reason: null };
  let req = found?.request ?? null;
  if (req) await patchRequest(req.id, row);
  else req = (await rest("intake_requests?on_conflict=message_id", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=representation" }, body: JSON.stringify([{ message_id: message.id, ...row }]) }))?.[0] ?? (await rest(`intake_requests?select=*&message_id=eq.${message.id}`))?.[0];
  await patchMessage(message.id, { status: "processed", status_reason: "Flight notification", request_id: req.id, search_text: search,
    understood: { ...base, kind: "processed", title: "Read as a flight notification", body: `${provider} reference ${ref}${routeText(n) ? ` · ${routeText(n)}` : ""}. Ops are being asked whether to process it. The flight's data is in the provider's portal, not in this message, and nothing is read from the portal before ops say yes.`, refState: "Awaiting approval" } });
  await audit({ kind: "intake.notification_received", success: true, userEmail: actor?.email ?? null, confirmationStatus: actor ? "confirmed" : "not_required", detail: { requestId: req.id, messageId: message.id, provider: signals.provider.id, confidence: decision.confidence, decidedBy: decision.decidedBy } }).catch(() => {});
  await askOps(req.id);
  return { scheduled: true, requestId: req.id };
}

// ── 2. E1: does this schedule need processing? ───────────────────────────────────────────────────────────────
/** One pair of single-use links per recipient, bound to the request, the recipient and the answer; only hashes are stored. */
function issueTokens(requestId, recipient) {
  const to = String(recipient).toLowerCase(); const tokens = []; const links = {};
  for (const answer of ["yes", "no"]) {
    const secret = randomBytes(18).toString("base64url");
    tokens.push({ h: sha(`${requestId}:${to}:${answer}:${secret}`), to, answer });
    links[answer] = `${consoleBase()}/intake/answer?t=${Buffer.from(`${requestId}:${to}:${answer}:${secret}`).toString("base64url")}`;
  }
  return { tokens, links };
}
/** Sends E1 to every notification address, each with its own links, and opens the deadline. */
export async function askOps(requestId) {
  const r = await loadRequest(requestId); if (!r) return null;
  const review = r.review ?? {}; const stages = stagesOf(r);
  const to = await notifyTo();
  const deadlineAt = new Date(Date.now() + approvalHours() * 3600_000).toISOString();
  const approval = { askedAt: new Date().toISOString(), deadlineAt, to, tokens: [], answer: null, late: [], sent: [] };
  const results = [];
  for (const addr of to.length ? to : [null]) {
    const issued = addr ? issueTokens(r.id, addr) : { tokens: [], links: { yes: `${consoleBase()}/agent/intake?r=${r.id}`, no: `${consoleBase()}/agent/intake?r=${r.id}` } };
    approval.tokens.push(...issued.tokens);
    const mail = composeProcess(r, review, { links: issued.links, deadlineAt });
    const sent = await sendIntakeEmail(r, mail, addr ? { to: [addr] } : {}).catch((e) => ({ ok: false, error: e.message }));
    approval.sent.push({ to: addr, ok: sent.ok, messageId: sent.messageId ?? null, error: sent.error ?? null, mode: sent.mode });
    results.push(sent);
  }
  review.approval = approval;
  const ok = results.some((s) => s.ok); const mode = results.find((s) => s.ok)?.mode;
  setStage(stages, "Confirmation sent", ok ? "done" : "fail", ok ? `“Process?” email ${mode === "capture" ? "captured (not sent)" : "sent"} to ${to.length} address${to.length === 1 ? "" : "es"} · answer by ${hm(deadlineAt)}` : `The “Process?” email could not be sent: ${results[0]?.error ?? "no recipient"}`);
  setStage(stages, "Confirmation received", "wait", `Waiting for ops to answer, by ${hm(deadlineAt)}. Nothing is read from the portal until then.`);
  await patchRequest(r.id, { review, stages, status: "awaiting_approval", status_reason: ok ? `Awaiting ops' answer · by ${hm(deadlineAt)}` : `Awaiting ops' answer · the “Process?” email could not be sent` });
  return { ok, results };
}

/** Parses an answer-page token. → { requestId, to, answer, secret } or null. */
export function parseToken(t) { try { const [requestId, to, answer, secret] = Buffer.from(String(t ?? ""), "base64url").toString("utf8").split(":"); return /^[0-9a-f-]{36}$/.test(requestId ?? "") && to && (answer === "yes" || answer === "no") && secret ? { requestId, to, answer, secret } : null; } catch { return null; } }
const tokenValid = (p, approval) => !!approval?.tokens?.some((x) => x.h === sha(`${p.requestId}:${p.to.toLowerCase()}:${p.answer}:${p.secret}`));

/** What the answer page shows before the tap: the question and the answer this link carries. Never personal data. */
export async function peekAnswer(t) {
  const p = parseToken(t); if (!p) return { state: "invalid" };
  const r = await loadRequest(p.requestId); const a = r?.review?.approval;
  if (!r || !tokenValid(p, a)) return { state: "invalid" };
  const n = r.review.notification ?? {};
  const summary = { reference: r.reference, route: routeText(n) || r.route || null, date: n.date ?? null, legs: r.legs_count, provider: n.providerName ?? "the provider", deadlineAt: a.deadlineAt, requestId: r.id };
  if (a.answer) return { state: "already", answer: p.answer, answered: { value: a.answer.value, by: a.answer.by, at: a.answer.at }, ...summary };
  if (isExpired(r)) return { state: "expired", answer: p.answer, ...summary };
  if (r.status !== "awaiting_approval") return { state: "already", answer: p.answer, answered: { value: r.status === "closed" ? "no" : "yes", by: "the intake page", at: r.updated_at }, ...summary };
  return { state: "open", answer: p.answer, ...summary };
}
/** One tap on the answer page. */
export async function answerByToken(t) {
  const peek = await peekAnswer(t); if (peek.state !== "open") return peek;
  const p = parseToken(t);
  const out = await recordAnswer(p.requestId, { value: p.answer, by: p.to, how: "answer page" });
  return out.state === "recorded" ? { ...peek, state: "recorded" } : { ...peek, state: out.state, answered: out.answered ?? null };
}

/**
 * Records ops' answer however it arrived (answer page, reply, intake page). Yes → the record is collected from the
 * portal. No → the request closes. Late or repeated answers change nothing and say so (E1a / E1b).
 */
export async function recordAnswer(requestId, { value, by, how }) {
  const r = await loadRequest(requestId); if (!r || r.request_type !== "scheduled") return { state: "invalid" };
  const review = r.review ?? {}; const a = review.approval ?? { tokens: [], late: [] };
  const at = new Date().toISOString();
  const late = async (state) => { (a.late ??= []).push({ at, value, by, how }); review.approval = a; await patchRequest(r.id, { review }); return { state, answered: a.answer ?? null }; };
  if (a.answer) return late("already");
  if (isExpired(r) && how !== "intake page") return late("expired");
  if (r.status !== "awaiting_approval" && !isExpired(r)) return { state: "already", answered: { value: r.status === "closed" ? "no" : "yes", by: "the intake page", at: r.updated_at } };
  a.answer = { value, by, at, how }; review.approval = a;
  const stages = stagesOf(r);
  if (value === "no") {
    setStage(stages, "Confirmation received", "done", `Declined by ${by} (${how}) at ${hm(at)}.`);
    setStage(stages, "Collecting data", "skip", "Declined: nothing is read from the portal.");
    await patchRequest(r.id, { review, stages, status: "closed", closed_reason: "declined", status_reason: `Declined by ${by}` });
    await audit({ kind: "intake.approval", success: true, userEmail: by, confirmationStatus: "confirmed", detail: { requestId: r.id, answer: "no", how } }).catch(() => {});
    return { state: "recorded", answer: a.answer };
  }
  setStage(stages, "Confirmation received", "done", `Approved by ${by} (${how}) at ${hm(at)}${isExpired(r) ? ", after the deadline" : ""}.`);
  setStage(stages, "Collecting data", "prog", `Reading ${r.reference} from the ${review.notification?.providerName ?? "provider"}'s portal.`);
  review.lookup = { attempts: [] };
  await patchRequest(r.id, { review, stages, status: "collecting", status_reason: "Approved · reading the record from the provider's portal", closed_reason: null });
  await audit({ kind: "intake.approval", success: true, userEmail: by, confirmationStatus: "confirmed", detail: { requestId: r.id, answer: "yes", how } }).catch(() => {});
  void collect(r.id).catch((e) => process.stderr.write(`[intake] collection for ${r.id} failed: ${e?.message}\n`));
  return { state: "recorded", answer: a.answer };
}

/** Fresh links for one recipient (E1c asks again). Added beside the old ones; all stop working once answered. */
async function reissue(requestId, to) {
  const r = await loadRequest(requestId); const review = r?.review ?? {};
  if (!review.approval) return null;
  const { tokens, links } = issueTokens(requestId, to); review.approval.tokens.push(...tokens);
  await patchRequest(requestId, { review }); return links;
}
const YES = /^(yes|y|yep|yeah|ok|okay|approve[d]?|process( it)?|go( ahead)?|sure|si|sí|jā|да)\b/i;
const NO = /^(no|n|nope|skip( it)?|decline[d]?|don'?t|do not|nē|нет)\b/i;
/** An email reply to E1. Returns null when the message is not such a reply; otherwise the reply never becomes a request. */
export async function handleApprovalReply(message, parsed) {
  const m = /\bProcess\?\s+(\d{6,8})\b/.exec(String(message.subject ?? "")); if (!m) return null;
  const r = (await rest(`intake_requests?select=*&request_type=eq.scheduled&reference=eq.${m[1]}&order=created_at.desc&limit=1`))?.[0];
  if (!r) return null;
  const from = String(parsed.from?.value?.[0]?.address ?? "").toLowerCase();
  const allowed = (await notifyTo()).map((x) => x.toLowerCase());
  const first = String(parsed.text ?? "").split(/\r?\n/).map((l) => l.trim()).find((l) => l && !l.startsWith(">") && !/^(on .* wrote:|from:|sent:|to:|subject:|-{3,}|_{3,})/i.test(l)) ?? "";
  const value = YES.test(first) ? "yes" : NO.test(first) ? "no" : null;
  const link = (kind, title, body) => patchMessage(message.id, { status: "reply", status_reason: title, request_id: r.id, search_text: `${from}\n${message.subject ?? ""}\n${r.reference}`, understood: { kind, title, body, ref: r.reference, checks: [["Reply to", "yes", `Process? ${r.reference}`], ["From a notification address", allowed.includes(from) ? "yes" : "no", allowed.includes(from) ? from : "Only the addresses that received the question can answer by email"], ["Answer", value ? "yes" : "none", value ? `“${first.slice(0, 40)}” read as ${value}` : `“${first.slice(0, 60)}” is not a yes or a no`]] } });
  if (!allowed.includes(from)) { await link("replybad", "Reply not from a notification address", "The answer was not applied. Only the addresses that received the “Process?” email can answer by email."); return { reply: true, applied: false }; }
  if (!value) {
    await link("replybad", "Reply not understood: was that a yes or a no?", "The agent did nothing with it and asked again (E1c).");
    if (r.status === "awaiting_approval") { const links = await reissue(r.id, from); if (links) await sendIntakeEmail(r, composeProcessUnclear(r, (await loadRequest(r.id)).review ?? {}, { quoted: first, links }), { to: [from] }).catch(() => {}); }
    return { reply: true, applied: false };
  }
  const out = await recordAnswer(r.id, { value, by: from, how: "email reply" });
  if (out.state === "already") { await link("reply", `Reply read as ${value}, but ${r.reference} was already answered`, `${out.answered?.by ?? "someone"} answered ${out.answered?.value ?? "?"} at ${out.answered?.at ? hm(out.answered.at) : "?"}. This reply changed nothing.`); if (out.answered) await sendIntakeEmail(r, composeProcessAnswered(r, r.review ?? {}, out.answered), { to: [from] }).catch(() => {}); }
  else if (out.state === "expired") { await link("reply", `Reply read as ${value}, but ${r.reference} had expired`, "Nothing was created; the late answer was not acted on. The request is on the intake page, where anyone can still process it."); await sendIntakeEmail(r, composeProcessExpired(r, r.review ?? {}), { to: [from] }).catch(() => {}); }
  else await link("reply", `Reply read as ${value} · applied to ${r.reference}`, value === "yes" ? "Approved: the record is being read from the provider's portal." : "Declined: the request is closed. Nothing was created.");
  return { reply: true, applied: out.state === "recorded", value };
}

// ── 3. Collecting the record (only after approval) ───────────────────────────────────────────────────────────
const running = new Set();
const iso = (ddmmyyyy) => { const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(ddmmyyyy ?? ""); return m ? `${m[3]}-${m[2]}-${m[1]}` : null; };
const F = (value, said) => ({ value, said: said == null ? null : String(said), source: "CNAIR portal record", confidence: 1, state: value == null || value === "" ? "not_given" : "extracted" });
/** The portal record → the extraction shape type 2 uses, so the same review, blockers, payload and send apply. */
export function extractionFromRecord(record) {
  const name = String(record.aircraftName ?? "").trim(); const icao = AIRCRAFT_TYPES[name.toLowerCase()] ?? null;
  const legs = record.legs.map((l) => {
    const depDate = iso(l.zDate); const std = l.zTime.slice(0, 5);
    // The portal gives no arrival time: arrival = Z departure + Estimated Hours (decimal hours), to the minute.
    const minutes = Math.round(Number(String(l.estHours).replace(",", ".")) * 60);
    const arr = new Date(Date.parse(`${depDate}T${std}:00Z`) + minutes * 60000);
    return {
      direction: null,
      departure: F(l.dep, `${l.dep} ${l.depName ?? ""}`.trim()), arrival: F(l.arr, `${l.arr} ${l.arrName ?? ""}`.trim()),
      std: F({ date: depDate, utcTime: std, localTime: l.ltTime.slice(0, 5), zoneWords: "Z and LT columns of the portal" }, `Z ${l.zDate} ${std} · LT ${l.ltDate} ${l.ltTime.slice(0, 5)}`),
      sta: F({ date: arr.toISOString().slice(0, 10), utcTime: arr.toISOString().slice(11, 16), localTime: null, zoneWords: "computed" }, `Estimated Hours ${l.estHours}`),
      aircraftType: F(icao, name || null), registration: F(record.registration, record.registration), flightNumber: F(l.flightNumber, l.flightNumber),
      flightType: F(record.icaoType, `${record.typeCode}${record.icaoType ? ` → ${record.icaoType}` : ""}`),
      crewCount: F(null, null), pax: { total: F(Number(l.pax), `PAX ${l.pax}`), adults: F(null, null), children: F(null, null), infants: F(null, null) },
      services: [],
    };
  });
  return { requestType: "scheduled", whyType: "A CNAIR flight notification; the record was read from the portal.", reference: F(record.quote, `Quote Nº ${record.quote}`), requester: { company: F("CNAIR", "CNAIR"), contact: F(null, null) }, operator: F(null, null), legs, notes: [], attachments: [], requestSource: { attachment: null, why: `Record ${record.quote} in the CNAIR portal, read at ${hm(record.readAt)}.` }, conflicts: [], personal: { people: [] }, typeConfidence: 1, ask: { said: null, source: null } };
}
/** After normalise: the computed arrival is CONVERTED, an unknown aircraft name blocks, the gaps are required. */
function markDerived(x, record) {
  const name = String(record.aircraftName ?? "").trim();
  x.legs.forEach((leg, i) => {
    const l = record.legs[i];
    if (leg.sta?.value?.utc && leg.sta.state !== "conflict" && leg.sta.state !== "invalid") { leg.sta.state = "converted"; leg.sta.note = `Computed by code: Z departure ${l.zTime.slice(0, 5)} + ${l.estHours} h (Estimated Hours) → ${leg.sta.value.utc.slice(11, 16)}Z${leg.sta.value.utc.slice(0, 10) !== leg.std?.value?.utc?.slice(0, 10) ? ", the next day" : ""}. The portal gives no arrival time.`; }
    if (!leg.aircraftType?.value) { leg.aircraftType = { ...leg.aircraftType, value: null, state: "invalid", note: name ? `The portal calls it “${name}”, which is not in the agent's list of aircraft names. Enter the ICAO type; the agent does not guess.` : "The portal gives no aircraft type. Enter the ICAO type." }; }
    else if (leg.aircraftType.state === "extracted" || leg.aircraftType.state === "converted") { leg.aircraftType.state = "converted"; leg.aircraftType.note = `“${name}” → ${leg.aircraftType.value} (the agent's list of aircraft names)`; }
    if (leg.crewCount) { leg.crewCount.state = "not_given"; leg.crewCount.note = "The portal has no crew count (it names a captain and a first officer). Enter it."; }
  });
  return x;
}
/** One read of the portal for a scheduled request; retried on the schedule while the record is not there. */
export async function collect(requestId, { manual = false, actor = null } = {}) {
  if (running.has(requestId)) return { busy: true }; running.add(requestId);
  try {
    const r = await loadRequest(requestId);
    if (!r || r.request_type !== "scheduled") throw Object.assign(new Error("Not a scheduled-flight request."), { status: 409 });
    if (r.status === "closed") throw Object.assign(new Error("This request is closed."), { status: 409 });
    if (r.status === "awaiting_approval") throw Object.assign(new Error("Ops have not approved this request yet."), { status: 409 });
    if (r.review?.legs?.length) return { state: "collected" };
    const review = r.review ?? {}; const lookup = review.lookup ?? { attempts: [] }; const n = review.notification ?? {}; const provider = n.providerName ?? "CNAIR";
    const sched = schedule(); const attempt = (lookup.attempts?.length ?? 0) + 1;
    const events = [];
    const res = await readPortal(r.reference, { withRecord: true, onEvent: (e) => { events.push(e); if (e.event === "login") void audit({ kind: "intake.portal_login", success: true, userEmail: actor?.email ?? null, confirmationStatus: "confirmed", detail: { requestId: r.id, reference: r.reference, attempt, manual, approvedBy: review.approval?.answer?.by ?? null } }).catch(() => {}); } });
    const at = new Date().toISOString();
    lookup.attempts = [...(lookup.attempts ?? []), { at, state: res.state, why: res.why ?? null, listed: res.listed ?? null, by: manual ? actor?.name ?? "a person" : null }];
    const stages = stagesOf(r); let patch; let alert = null;
    const first = Date.parse(lookup.attempts[0].at); const nextOffset = sched[attempt];
    if (res.state === "found" && res.record) {
      lookup.found = { at, row: res.row, fingerprint: res.record.fingerprint }; lookup.nextAt = null;
      let x = enforce(await normalise(extractionFromRecord(res.record)));
      x = markDerived(x, res.record);
      const prev = (await rest(`intake_extractions?select=version&request_id=eq.${r.id}&order=version.desc&limit=1`))?.[0]?.version ?? 0;
      const ex = (await rest("intake_extractions", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify([{ request_id: r.id, version: prev + 1, model_id: "portal:cnair", model_tier: "none", input_tokens: 0, output_tokens: 0, fields: (({ personal, ...f }) => f)(x), personal: null, created_by: actor?.email ?? "intake" }]) }))?.[0];
      const defs = await checklistDefinitions().catch(() => []);
      const rv = reviewFromExtraction(x, defs);
      for (const leg of rv.legs) for (const f of leg.fields) if (f.key === "crewCount") f.required = true;
      Object.assign(rv, { kind: "notification", notification: n, lookup, approval: review.approval ?? null, updates: review.updates ?? [], copies: review.copies ?? 0, requestSource: { attachment: null, attachmentId: null, why: x.requestSource.why, by: null }, extractionId: ex?.id ?? null,
        record: { quote: res.record.quote, quoteDate: res.record.quoteDate, flightDate: res.record.flightDate, registration: res.record.registration, aircraftName: res.record.aircraftName, cabinConfig: res.record.cabinConfig, seats: res.record.seats, crewLinesFilled: res.record.crewLinesFilled, paxRows: res.record.paxRows, totalEstimatedHours: res.record.totalEstimatedHours, readAt: res.record.readAt } });
      const legsN = rv.legs.length;
      setStage(stages, "Collecting data", "done", `Record ${r.reference} read from the ${provider} portal (flight date ${res.record.flightDate}, ${res.record.registration}, ${res.record.aircraftName ?? "type not named"})${events.some((e) => e.event === "signout") ? " · signed out" : ""}.`);
      setStage(stages, "Data collected", "done", `${legsN} leg${legsN === 1 ? "" : "s"} · arrival times computed from Estimated Hours · crew count, passengers and services are not in the portal`);
      let duplicate = null; try { duplicate = await findDuplicates(rv, r.reference, r.id); } catch (e) { duplicate = { error: `Could not check Leon for duplicates: ${String(e.message).slice(0, 160)}` }; }
      const route = rv.legs.map((l, i) => { const f = Object.fromEntries(l.fields.map((y) => [y.key, y])); return i === 0 ? `${f.departure?.value} → ${f.arrival?.value}` : ` → ${f.arrival?.value}`; }).join("");
      const firstStd = rv.legs.map((l) => l.fields.find((f) => f.key === "std")?.utc).filter(Boolean).sort()[0] ?? null;
      let status = "needs_review", reason = "Awaiting review";
      if (duplicate && !duplicate.error) { status = "needs_you"; reason = `Awaiting review · stopped: possible duplicate of ${duplicate.leonIds?.length ? `Leon ${duplicate.leonIds.join(", ")}` : (duplicate.ours ?? []).map((o) => o.reference).join(", ")}`; setStage(stages, "Review requested", "hold", `Stopped before review: matches ${duplicate.leonIds?.length ? `Leon flight${duplicate.leonIds.length === 1 ? "" : "s"} ${duplicate.leonIds.join(", ")}` : `request ${(duplicate.ours ?? []).map((o) => o.reference).join(", ")}`}. Nothing has been sent to Leon.`); }
      else if (duplicate?.error) { duplicate = null; }
      await patchRequest(r.id, { status, status_reason: reason, stages, review: rv, current_extraction_id: ex?.id ?? null, duplicate, duplicate_resolution: null, route, registration: res.record.registration ?? null, first_std: firstStd, legs_count: legsN });
      // Step 5: ops are told to come and confirm.
      const mail = status === "needs_you" ? composeStopped(r, { title: "A scheduled flight may already be in Leon", subject: "possible duplicate, nothing created", what: stages.find((s) => s.name === "Review requested")?.note ?? "", stage: "Stopped before review (stage 6 of 11)." }) : composeReview({ ...r, request_type: "scheduled" }, rv, { receivedAt: r.created_at });
      const sent = await sendIntakeEmail(r, mail).catch((e) => ({ ok: false, error: e.message }));
      const s2 = (await loadRequest(r.id)).stages;
      setStage(s2, "Review requested", sent.ok ? "done" : "fail", sent.ok ? `${mail.kind.split(" · ")[0]} email ${sent.mode === "capture" ? "captured (not sent)" : "sent"} to ${sent.to.length} address${sent.to.length === 1 ? "" : "es"}: open Flight intake and confirm` : `Email not sent: ${sent.error}`);
      if (status === "needs_review") setStage(s2, "Reviewed and confirmed", "wait", "Waiting for someone to check the values, fill the gaps, choose the services and confirm.");
      await patchRequest(r.id, { stages: s2 });
      await audit({ kind: "intake.portal_collected", success: true, confirmationStatus: "not_required", detail: { requestId: r.id, legs: legsN, attempt } }).catch(() => {});
      return { state: "collected", legs: legsN };
    }
    if (res.notConfigured) {
      lookup.nextAt = null;
      setStage(stages, "Collecting data", "wait", `${res.why} A person reads ${r.reference} in the portal and enters the flight by hand, or turns the look-up on.`);
      patch = { status: "needs_you", status_reason: "Approved · portal look-up is off on this server" };
    } else if (nextOffset != null) {
      lookup.nextAt = new Date(first + nextOffset * 60000).toISOString();
      setStage(stages, "Collecting data", "prog", `${res.state === "not_found" ? `${r.reference} is not in the ${provider} portal yet` : `The portal could not be read (${res.why})`}. Try ${attempt} of ${sched.length}; next at ${hm(lookup.nextAt)}.`);
      patch = { status: "collecting", status_reason: res.state === "not_found" ? "Approved · reference not in the portal yet, will look again" : "Approved · provider portal not readable, will try again" };
      if (res.structural) alert = { title: "The provider's portal is not what the agent expects", subject: "portal screen changed, nothing read", what: res.why, stage: `Collecting data (stage 4 of 11), try ${attempt} of ${sched.length}. The import was refused: nothing is read from a screen the agent does not recognise.` };
    } else {
      lookup.nextAt = null;
      const over = span(sched[Math.min(attempt, sched.length) - 1] ?? 0);
      setStage(stages, "Collecting data", "fail", res.state === "not_found" ? `${r.reference} was not found in the ${provider} portal after ${attempt} ${attempt === 1 ? "try" : `tries over ${over}`}. A person decides: it may appear later, or the reference may be wrong.` : `The ${provider} portal could not be read after ${attempt} ${attempt === 1 ? "try" : "tries"}: ${res.why}`);
      patch = { status: "needs_you", status_reason: res.state === "not_found" ? "Reference not found in the provider's portal" : "Provider portal could not be read" };
      alert = { title: res.state === "not_found" ? "A scheduled flight could not be found in the portal" : "The provider's portal could not be read", subject: res.state === "not_found" ? "reference not found, nothing created" : "portal not readable, nothing created", what: stages.find((s) => s.name === "Collecting data")?.note ?? "", stage: `Collecting data (stage 4 of 11), ${attempt} ${attempt === 1 ? "try" : "tries"}.` };
    }
    review.lookup = lookup;
    await patchRequest(r.id, { ...patch, stages, review });
    if (alert) { const sent = await sendIntakeEmail(r, composeStopped(r, alert)).catch((e) => ({ ok: false, error: e.message })); const s2 = (await loadRequest(r.id)).stages; setStage(s2, "Notification sent", sent.ok ? "done" : "fail", sent.ok ? `Needs you email ${sent.mode === "capture" ? "captured" : "sent"}: ${alert.subject}` : `Email not sent: ${sent.error}`); await patchRequest(r.id, { stages: s2 }); }
    await audit({ kind: "intake.reference_lookup", success: res.state === "found", userEmail: actor?.email ?? null, confirmationStatus: "not_required", detail: { requestId: r.id, attempt, state: res.state, manual, structural: !!res.structural } }).catch(() => {});
    return { state: res.state, attempt };
  } finally { running.delete(requestId); }
}

/** "Look up now" on the page: the one manual exception. Before approval (or after it expired) it IS that person's approval. */
export async function lookupNow(requestId, actor) {
  const r = await loadRequest(requestId); if (!r || r.request_type !== "scheduled") throw Object.assign(new Error("Not a scheduled-flight request."), { status: 409 });
  if (r.status === "awaiting_approval" || isExpired(r)) { const out = await recordAnswer(r.id, { value: "yes", by: actor?.name ?? actor?.email ?? "a person", how: "intake page" }); return { approved: true, ...out }; }
  if (r.status === "closed") throw Object.assign(new Error("This request is closed."), { status: 409 });
  if (r.review?.legs?.length) throw Object.assign(new Error("The record has already been read; the import is one-shot."), { status: 409 });
  return collect(requestId, { manual: true, actor });
}

/** Every 30 s: due look-ups, and questions nobody answered by the deadline (closed, visibly; still processable). */
export function startLookupTicker() {
  let busy = false;
  const tick = async () => {
    if (busy) return; busy = true;
    try {
      const due = (await rest("intake_requests?select=id,review&request_type=eq.scheduled&status=eq.collecting&limit=50").catch(() => [])) ?? [];
      for (const r of due) { const next = r.review?.lookup?.nextAt; if (next && Date.parse(next) <= Date.now()) await collect(r.id).catch(() => {}); }
      const waiting = (await rest("intake_requests?select=id,review,stages,reference&request_type=eq.scheduled&status=eq.awaiting_approval&limit=50").catch(() => [])) ?? [];
      for (const r of waiting) {
        const d = r.review?.approval?.deadlineAt; if (!d || Date.parse(d) > Date.now()) continue;
        const stages = stagesOf(r);
        setStage(stages, "Confirmation received", "fail", `No answer by ${hm(d)}. Nothing was created and the request is closed. Anyone can still process it from this page.`);
        await patchRequest(r.id, { stages, status: "closed", closed_reason: "expired", status_reason: `No answer by ${hm(d)} · nothing created` });
        await audit({ kind: "intake.approval_expired", success: true, confirmationStatus: "not_required", detail: { requestId: r.id, deadlineAt: d } }).catch(() => {});
      }
    } finally { busy = false; }
  };
  setInterval(tick, 30000).unref(); void tick();
}
export { lookupState };
