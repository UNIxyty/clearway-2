// HTTP routes for the Flight intake page and the Agent mailbox. Wired from server.mjs after authentication:
// every route here runs as the signed-in user, and the mailbox routes additionally require mailbox access.
// Responses never carry personal data except the two reveal endpoints, which are audited.
import { rest } from "../knowledge/retrieval.mjs";
import { audit } from "../store.mjs";
import { cancelConfirmation, getConfirmation, issueConfirmation, beginConfirmation, settleConfirmation, failConfirmation } from "../confirm.mjs";
import { readKey } from "./blobstore.mjs";
import { STAGES, enqueue, processMessage, loadParsed, attachmentsOf, queueDepth } from "./pipeline.mjs";
import { prepareSend, confirmSend, sendStatus, legStates, resolveUnknown, TOOL, checklistPlan } from "./send.mjs";
import { blockersFor, validateValue, recomputeTimes, applyTzChoice, tzOptions, CORE_FIELDS, fmtDate } from "./review.mjs";
import { aircraftByRegistration, airport, checklistDefinitions } from "./leon-lookup.mjs";
import { leonConfigured } from "./leon-client.mjs";
import { maskForReader, MASK } from "./personal.mjs";
import { sanitizeEmailHtml } from "./sanitize.mjs";
import { retentionDays } from "./retention.mjs";
import { notifyTo } from "./notify.mjs";
import { intakeSettings, setIntakeSettings } from "./settings.mjs";
import { agentFrom } from "../email/send.mjs";
import { sendEmail as deliver } from "../../../digital-wall/lib/mailer.mjs";

const err = (status, message) => Object.assign(new Error(message), { status });
const isPrivileged = (u) => u?.agentRole === "admin" || u?.agentRole === "developer";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const who = (user) => ({ name: user.name || user.email, at: new Date().toISOString() });

// ── Mailbox access (§M3): ops leads and intake admins. Admins/developers, plus a list in agent_settings. ──
async function mailboxReaders() { return (await intakeSettings()).mailboxReaders; }
export async function mailboxAllowed(user) { return isPrivileged(user) || (await mailboxReaders()).includes(String(user.email ?? "").toLowerCase()); }

// ── UI status for the intake list (§I3) ─────────────────────────────────────────────────────────────────
function uiStatus(r, now = Date.now()) {
  const soon = r.first_std && Date.parse(r.first_std) - now < 2 * 3600_000;
  switch (r.status) {
    case "extracting": return { key: "in_progress", label: "In progress" };
    case "needs_review": return soon ? { key: "needs_you", label: "Needs you", escalated: true } : { key: "needs_review", label: "Needs review" };
    case "needs_you": case "partly_loaded": return { key: "needs_you", label: "Needs you" };
    case "in_progress": return { key: "in_progress", label: "In progress" };
    case "loaded": return { key: "loaded", label: "Loaded" };
    case "closed": return r.closed_reason === "cancelled" ? { key: "cancelled", label: "Cancelled" } : r.closed_reason === "skipped" ? { key: "skipped", label: "Skipped" } : { key: "handled", label: "Handled manually" };
    default: return { key: "in_progress", label: "In progress" };
  }
}
const TABS = { needs: ["needs_you", "needs_review", "waiting", "stuck"], progress: ["in_progress"], loaded: ["loaded"], closed: ["handled", "cancelled", "skipped"] };
function stageText(r, s) {
  if (s.escalated) { const m = Math.max(0, Math.round((Date.parse(r.first_std) - Date.now()) / 60000)); return `Awaiting review · departs in ${m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`}`; }
  return r.status_reason ?? "";
}

async function health() {
  const last = (await rest("intake_messages?select=received_at&direction=eq.inbound&order=received_at.desc&limit=1").catch(() => []))?.[0]?.received_at ?? null;
  const lastLeon = (await rest("intake_leon_writes?select=state,updated_at&order=updated_at.desc&limit=1").catch(() => []))?.[0] ?? null;
  return {
    mailbox: { ok: Boolean(process.env.RESEND_WEBHOOK_SECRET), lastAt: last, note: process.env.RESEND_WEBHOOK_SECRET ? null : "No Resend webhook secret is set on the server, so nothing can arrive." },
    leon: { ok: leonConfigured(), lastWrite: lastLeon },
    portals: { built: false, note: "Provider-portal collection is not built. Scheduled flights (type 1) are not collected." },
  };
}

function listRow(r, messages, writes) {
  const s = uiStatus(r); const m = messages.get(r.message_id);
  const ws = writes.get(r.id) ?? {};
  const legs = (r.review?.legs ?? []).map((l) => ({ removed: !!l.removed, state: l.removed ? "removed" : ws[l.index]?.state === "in_leon" ? "in" : ws[l.index]?.state === "not_in_leon" ? "not" : ws[l.index]?.state === "unknown" || ws[l.index]?.state === "sending" ? "unknown" : "none" }));
  return { id: r.id, type: r.request_type, statusKey: s.key, statusLabel: s.label, from: r.sender_name ?? m?.from_addr ?? "", reference: r.reference ?? "—", referenceBuilt: r.reference_built, route: r.route ?? "", firstStd: r.first_std, legs, stage: stageText(r, s), updatedAt: r.updated_at, needsAttention: TABS.needs.includes(s.key) };
}

async function requestRows({ tab = "all", q = "", type = "" }) {
  const rows = (await rest("intake_requests?select=id,message_id,request_type,status,status_reason,reference,reference_built,route,registration,first_std,legs_count,sender_name,updated_at,closed_reason,review&status=neq.not_recognised&order=updated_at.desc&limit=300")) ?? [];
  const msgIds = [...new Set(rows.map((r) => r.message_id))];
  const msgs = msgIds.length ? (await rest(`intake_messages?select=id,from_addr,received_at,search_text&id=in.(${msgIds.join(",")})`)) ?? [] : [];
  const messages = new Map(msgs.map((m) => [m.id, m]));
  const ids = rows.map((r) => r.id);
  const wrows = ids.length ? (await rest(`intake_leon_writes?select=request_id,leg_index,state,created_at&request_id=in.(${ids.join(",")})&order=created_at.asc`)) ?? [] : [];
  const writes = new Map(); for (const w of wrows) { const m = writes.get(w.request_id) ?? {}; m[w.leg_index] = w; writes.set(w.request_id, m); }
  let out = rows.map((r) => ({ ...listRow(r, messages, writes), _search: `${r.reference ?? ""} ${r.route ?? ""} ${r.registration ?? ""} ${r.first_std ? fmtDate(r.first_std) : ""} ${r.first_std?.slice(0, 10) ?? ""} ${messages.get(r.message_id)?.search_text ?? ""}` }));
  const counts = { all: out.length, needs: out.filter((r) => r.needsAttention).length, progress: out.filter((r) => TABS.progress.includes(r.statusKey)).length, loaded: out.filter((r) => r.statusKey === "loaded").length, closed: out.filter((r) => TABS.closed.includes(r.statusKey)).length };
  if (tab !== "all" && TABS[tab]) out = out.filter((r) => TABS[tab].includes(r.statusKey));
  if (type) out = out.filter((r) => r.type === type);
  if (q) { const needle = q.toLowerCase().replace(/[\s→-]+/g, " ").trim(); out = out.filter((r) => r._search.toLowerCase().replace(/[\s→-]+/g, " ").includes(needle)); }
  return { rows: out.map(({ _search, ...r }) => r), counts };
}

async function peopleCounts(extractionId) {
  if (!extractionId) return { hasPersonal: false, legs: {} };
  const ex = (await rest(`intake_extractions?select=personal&id=eq.${extractionId}`))?.[0];
  const people = ex?.personal?.people ?? [];
  const legs = {};
  for (const p of people) { const k = p.leg ?? "all"; legs[k] = legs[k] ?? { crew: 0, pax: 0 }; legs[k][p.list] += 1; }
  return { hasPersonal: people.length > 0, count: people.length, legs, purged: ex && ex.personal === null && people.length === 0 ? null : undefined };
}

async function requestDetail(id) {
  if (!UUID.test(id)) throw err(404, "No such request.");
  const r = (await rest(`intake_requests?select=*&id=eq.${id}`))?.[0]; if (!r) throw err(404, "No such request.");
  const m = (await rest(`intake_messages?select=id,from_addr,to_addrs,subject,received_at,purged_at,has_personal_data&id=eq.${r.message_id}`))?.[0];
  const allWrites = (await rest(`intake_leon_writes?select=id,leg_index,state,leon_flight_nid,leon_trip_nid,leon_error,checklist,http_status,answered_ms,payload,created_at,updated_at,sent_by_email,resolved_by,resolved_note&request_id=eq.${id}&order=created_at.asc`)) ?? [];
  const ws = legStates(allWrites);
  const review = r.review ? structuredClone(r.review) : null;
  if (review) for (const l of review.legs) { const w = ws[l.index]; l.leon = w ? { state: w.state, flightNid: w.leon_flight_nid, error: w.leon_error, at: w.updated_at } : { state: "not_sent" }; l.inLeon = w?.state === "in_leon"; if (l.fields.some((f) => f.state === "tz_unknown") || l.tzChoice) l.tz = tzOptions(l); }
  const { blockers, warnings } = review ? blockersFor(review, r, { lookups: { aircraftNidByRegistration: new Map(review.legs.flatMap((l) => l.fields.filter((f) => f.key === "registration" && f.aircraft?.nid).map((f) => [String(f.value).toUpperCase().replace(/[^A-Z0-9]/g, ""), f.aircraft.nid]))) } }) : { blockers: [], warnings: [] };
  const extractions = (await rest(`intake_extractions?select=id,version,model_id,created_at,created_by,input_tokens,output_tokens&request_id=eq.${id}&order=version.desc`)) ?? [];
  const sent = (await rest(`intake_messages?select=id,sent_kind,subject,received_at,to_addrs,delivery_status&request_id=eq.${id}&direction=eq.outbound&order=received_at.asc`)) ?? [];
  const firstSend = allWrites[0]; const lastAnswer = allWrites.filter((w) => w.answered_ms != null).slice(-1)[0];
  const defs = await checklistDefinitions().catch(() => []);
  const plans = review ? review.legs.filter((l) => !l.removed).map((l) => ({ leg: l.index, ...checklistPlan(l, defs) })) : [];
  return {
    request: { id: r.id, type: r.request_type, typeLabel: r.request_type === "scheduled" ? "Scheduled flight" : "Handling request", reference: r.reference, referenceBuilt: r.reference_built, status: r.status, ui: uiStatus(r), statusReason: r.status_reason, sender: r.sender_name, fromAddr: m?.from_addr, toAddrs: m?.to_addrs, subject: m?.subject, receivedAt: m?.received_at, messageId: r.message_id, route: r.route, firstStd: r.first_std, legsCount: r.legs_count, closedReason: r.closed_reason, duplicate: r.duplicate, duplicateResolution: r.duplicate_resolution, purged: !!m?.purged_at, hasPersonal: !!m?.has_personal_data },
    stageNames: STAGES[r.request_type], stages: r.stages ?? [],
    review, blockers, warnings,
    attachments: (r.attachment_roles ?? []).map((a) => ({ ...a, url: a.id ? `/agent/api/intake/attachments/${a.id}` : null })),
    requestSource: review?.requestSource ?? null,
    sent: { writes: allWrites.map((w) => ({ leg: w.leg_index, state: w.state, flightNid: w.leon_flight_nid, tripNid: w.leon_trip_nid, error: w.leon_error, httpStatus: w.http_status, ms: w.answered_ms, at: w.created_at, updatedAt: w.updated_at, by: w.sent_by_email, resolvedBy: w.resolved_by, checklist: w.checklist, payload: w.payload })), firstAt: firstSend?.created_at ?? null, lastMs: lastAnswer?.answered_ms ?? null },
    checklistPlan: plans,
    extractions: extractions.map((e) => ({ id: e.id, version: e.version, model: e.model_id, at: e.created_at, by: e.created_by, tokens: (e.input_tokens ?? 0) + (e.output_tokens ?? 0) })),
    emails: sent.map((s) => ({ id: s.id, kind: s.sent_kind, subject: s.subject, at: s.received_at, to: s.to_addrs, delivery: s.delivery_status })),
    people: await peopleCounts(r.current_extraction_id),
    retention: { days: await retentionDays() },
  };
}

// ── Review edits ───────────────────────────────────────────────────────────────────────────────────────
async function editRequest(id, user, body) {
  const r = (await rest(`intake_requests?select=*&id=eq.${id}`))?.[0]; if (!r?.review) throw err(404, "No such request.");
  const ws = legStates((await rest(`intake_leon_writes?select=leg_index,state,created_at&request_id=eq.${id}&order=created_at.asc`)) ?? []);
  if (Object.values(ws).some((w) => w.state === "sending")) throw err(409, "A send to Leon is running. Wait for Leon's answer.");
  const review = r.review; const me = who(user); const op = String(body.op ?? "");
  const leg = body.leg != null ? review.legs.find((l) => l.index === Number(body.leg)) : null;
  if (body.leg != null && !leg) throw err(404, "No such leg.");
  if (leg && ws[leg.index]?.state === "in_leon" && op !== "service_view") throw err(409, `This leg is in Leon as flight ${ws[leg.index].leon_flight_nid}. Values are read-only here; change them in Leon.`);
  const edits = []; let auditDetail = { op, leg: body.leg ?? null };
  const field = leg ? leg.fields.find((f) => f.key === body.key) : null;
  switch (op) {
    case "field": {
      if (!field) throw err(404, "No such field.");
      const kind = CORE_FIELDS.find((c) => c.key === field.key)?.kind ?? field.kind;
      const before = field.value; const v = validateValue(kind, body.value);
      if (v.value === before && (field.state !== "tz_unknown")) return null;
      edits.push({ path: `legs.${leg.index}.${field.key}`, previous: { value: before, state: field.state }, value: { value: v.value } });
      field.edited = { was: before === "" ? (field.state === "not_given" ? "not given" : field.state === "unknown" ? "Unknown" : "empty") : before, by: me.name, at: me.at, first: field.edited?.first ?? before };
      field.value = v.value; field.note = v.note ?? `was ${field.edited.was} · edited by ${me.name}`;
      field.state = v.state === "not_given" ? "not_given" : v.state === "invalid" ? "invalid" : v.state === "unknown" ? "unknown" : v.state === "zero" ? "zero" : "edited";
      if (field.state === "not_given") field.note = "Cleared by a person"; if (field.state === "unknown") field.note = `Set to Unknown by ${me.name}. Not the same as 0.`;
      delete field.conflict;
      if (field.kind === "airport" && field.state === "edited") { const a = await airport(field.value).catch(() => undefined); if (a === null) { field.state = "invalid"; field.note = "Not an airport code Leon knows."; } else if (a) field.airport = { icao: a.icao, iata: a.iata, city: a.city, tz: a.tz }; }
      if (field.key === "registration" && field.state === "edited") { const a = await aircraftByRegistration(field.value).catch(() => undefined); if (a === null) { field.state = "invalid"; field.note = "Not an aircraft of this operator in Leon."; delete field.aircraft; } else if (a) field.aircraft = { nid: a.nid, type: a.type }; }
      if (["date", "std", "sta"].includes(field.key)) recomputeTimes(leg);
      auditDetail = { ...auditDetail, field: field.key, from: before, to: field.value };
      break;
    }
    case "looks_right": {
      if (body.serviceId) { const s = leg?.services.find((x) => x.id === body.serviceId); if (!s) throw err(404, "No such service."); s.checked = { by: me.name, at: me.at }; s.lowConfidence = false; auditDetail.service = s.name; break; }
      if (!field || field.state !== "low_confidence") throw err(409, "That value is not marked low confidence.");
      field.state = "checked"; field.checked = { by: me.name, at: me.at }; field.note = `Checked by ${me.name}`; auditDetail.field = field.key; break;
    }
    case "conflict": {
      if (!field?.conflict) throw err(409, "That value has no conflict.");
      const pick = body.use === "attachment" ? field.conflict.attachment : field.conflict.body;
      const num = String(pick ?? "").match(/\d+|TBA|TBC/i)?.[0] ?? "";
      const v = validateValue(field.kind, field.kind === "count" ? num : pick);
      field.edited = { was: `${field.value || "—"} (conflict)`, by: me.name, at: me.at };
      field.state = v.state === "unknown" ? "unknown" : v.state === "invalid" ? "invalid" : "edited"; field.value = v.value; field.note = `Chose ${body.use === "attachment" ? field.conflict.attachmentName ?? "the attachment" : "the email body"}: ${JSON.stringify(pick)} · ${me.name}`;
      field.resolvedConflict = field.conflict; delete field.conflict;
      edits.push({ path: `legs.${leg.index}.${field.key}`, previous: { conflict: field.resolvedConflict }, value: { use: body.use, value: field.value } }); auditDetail.field = field.key; auditDetail.use = body.use; break;
    }
    case "ack_refusal": {
      if (!field || field.state !== "leon_refused") throw err(409, "Leon did not refuse that value.");
      field.edited = { was: `${field.value} (refused by Leon)`, by: me.name, at: me.at }; field.state = "edited";
      field.note = `Refusal acknowledged by ${me.name}; resending unchanged. Leon said: ${String(field.note ?? "").replace(/^Leon:\s*/, "")}`;
      edits.push({ path: `legs.${leg.index}.${field.key}`, previous: { state: "leon_refused" }, value: { ack: true } }); auditDetail.field = field.key; break;
    }
    case "tz": { if (!["utc", "local"].includes(body.choice)) throw err(400, "Choose utc or local."); applyTzChoice(leg, body.choice, me); edits.push({ path: `legs.${leg.index}.tz`, previous: null, value: { choice: body.choice } }); auditDetail.choice = body.choice; break; }
    case "service": {
      const s = leg?.services.find((x) => x.id === body.serviceId); if (!s) throw err(404, "No such service.");
      if (body.decision && ["provide", "to_confirm", "decline"].includes(body.decision)) { auditDetail.from = s.decision; s.decision = body.decision; auditDetail.decision = body.decision; }
      if (typeof body.answer === "string") { s.answer = body.answer.slice(0, 300); auditDetail.answer = true; }
      if (typeof body.noteOnChecklist === "boolean") { s.noteOnChecklist = body.noteOnChecklist; auditDetail.noteOnChecklist = body.noteOnChecklist; }
      if (body.checklistNid !== undefined) { const defs = await checklistDefinitions(); const d = defs.find((x) => x.nid === Number(body.checklistNid)); if (body.checklistNid !== null && !d) throw err(400, "Not a Leon checklist item."); s.checklistNid = d?.nid ?? null; s.checklistLabel = d?.label ?? null; auditDetail.checklistNid = s.checklistNid; }
      if (typeof body.name === "string" && s.added) s.name = body.name.slice(0, 80);
      auditDetail.service = s.name; break;
    }
    case "service_add": { const n = leg.services.length; leg.services.push({ id: `a${leg.index}-${Date.now().toString(36)}`, no: "+", said: null, source: "Added by you", name: String(body.name ?? "New service").slice(0, 80), detail: null, conditional: false, condition: null, isNote: false, requested: "provide", decision: "provide", answer: "", checklistNid: body.checklistNid ?? null, checklistLabel: null, lowConfidence: false, added: { by: me.name, at: me.at } }); auditDetail.service = leg.services[n].name; break; }
    case "leg_add": {
      const idx = Math.max(-1, ...review.legs.map((l) => l.index)) + 1;
      const fields = CORE_FIELDS.map((c) => ({ key: c.key, label: c.label, kind: c.kind, value: "", said: null, source: "Added by you", state: "not_given", note: null, confidence: null, required: c.required, sent: ["flightNumber", "departure", "arrival", "date", "std", "sta", "registration", "paxTotal"].includes(c.key) }));
      review.legs.push({ index: idx, direction: "added", added: { by: me.name, at: me.at }, removed: false, fields, extra: [], services: [], tzChoice: null }); auditDetail.leg = idx; break;
    }
    case "leg_remove": case "leg_restore": {
      if (op === "leg_remove" && review.legs.filter((l) => !l.removed).length <= 1) throw err(409, "The last leg cannot be removed.");
      leg.removed = op === "leg_remove" ? { by: me.name, at: me.at } : false; break;
    }
    case "duplicate": {
      if (!r.duplicate) throw err(409, "No possible duplicate on this request.");
      if (body.action === "not_duplicate") { await rest(`intake_requests?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ duplicate_resolution: { action: "not_duplicate", by: me.name, email: user.email, at: me.at }, status: "needs_review", status_reason: "Awaiting review · marked not a duplicate", updated_at: me.at, updated_by: user.email, stages: (r.stages ?? []).map((s) => s.name === "Awaiting review" ? { ...s, state: "wait", note: `${me.name} said it is not a duplicate. Waiting for review.` } : s) }) }); }
      else if (body.action === "close") { await rest(`intake_requests?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ duplicate_resolution: { action: "close", by: me.name, email: user.email, at: me.at }, status: "closed", closed_reason: "update_by_hand", status_reason: `Closed · ${me.name} will update Leon by hand`, updated_at: me.at, updated_by: user.email }) }); }
      else throw err(400, "Unknown duplicate action.");
      await audit({ kind: "intake.duplicate_decision", userId: user.userId, userEmail: user.email, actorId: user.userId, actorEmail: user.email, success: true, confirmationStatus: "not_required", detail: { requestId: id, action: body.action, leonIds: r.duplicate?.leonIds ?? [] } }).catch(() => {});
      return true;
    }
    case "close": {
      const reason = ["handled_manually", "cancelled", "skipped"].includes(body.reason) ? body.reason : "handled_manually";
      await rest(`intake_requests?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ status: "closed", closed_reason: reason, status_reason: `${reason === "cancelled" ? "Cancelled" : reason === "skipped" ? "Skipped" : "Handled manually"} · ${me.name}${body.note ? ` · ${String(body.note).slice(0, 120)}` : ""}`, updated_at: me.at, updated_by: user.email }) });
      await audit({ kind: "intake.closed", userId: user.userId, userEmail: user.email, actorId: user.userId, actorEmail: user.email, success: true, confirmationStatus: "not_required", detail: { requestId: id, reason } }).catch(() => {});
      return true;
    }
    default: throw err(400, "Unknown edit.");
  }
  review.version = (review.version ?? 1) + 1;
  await rest(`intake_requests?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ review, updated_at: me.at, updated_by: user.email, ...(r.status === "needs_you" && /timezone unknown/.test(r.status_reason ?? "") && !review.legs.some((l) => l.fields.some((f) => f.state === "tz_unknown")) ? { status: "needs_review", status_reason: "Awaiting review" } : {}) }) });
  for (const e of edits) await rest("intake_field_edits", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify([{ request_id: id, extraction_id: review.extractionId ?? r.current_extraction_id, field_path: e.path, previous: e.previous, value: e.value, edited_by: user.userId, edited_by_email: user.email }]) }).catch(() => {});
  await audit({ kind: `intake.${op === "field" ? "edit" : op}`, userId: user.userId, userEmail: user.email, actorId: user.userId, actorEmail: user.email, success: true, confirmationStatus: "not_required", detail: { requestId: id, ...auditDetail } }).catch(() => {});
  return true;
}

async function peopleFor(id, reveal) {
  const r = (await rest(`intake_requests?select=current_extraction_id,review&id=eq.${id}`))?.[0]; if (!r) throw err(404, "No such request.");
  const ex = r.current_extraction_id ? (await rest(`intake_extractions?select=personal&id=eq.${r.current_extraction_id}`))?.[0] : null;
  const people = ex?.personal?.people ?? [];
  const legs = (r.review?.legs ?? []).map((l) => ({ leg: l.index, crew: [], pax: [] }));
  for (const p of people) {
    const targets = p.leg == null ? legs : legs.filter((l) => l.leg === p.leg);
    const row = { role: p.role ?? p.type ?? null, name: p.name, dob: p.dob ? (reveal ? p.dob : MASK) : null, nationality: p.nationality ?? null, passport: p.passport ? (reveal ? p.passport : MASK) : null, expiry: p.expiry ? (reveal ? p.expiry : MASK) : null, source: p.source ?? null, copied: p.leg == null };
    for (const t of targets) t[p.list].push(row);
  }
  return { legs, purged: !ex?.personal && !!r.current_extraction_id, masked: !reveal };
}

// ── Mailbox ────────────────────────────────────────────────────────────────────────────────────────────
const VIEW = { needs: "status=in.(not_recognised,failed,waiting)", processed: "status=eq.processed", replies: "status=eq.reply", ignored: "status=eq.ignored", all: "" };
async function mailboxRows({ box = "received", view = "needs", q = "", days = 7, address = "" }) {
  const since = new Date(Date.now() - Math.max(1, Math.min(366, Number(days) || 7)) * 86400000).toISOString();
  const dir = box === "sent" ? "outbound" : "inbound";
  let filter = `direction=eq.${dir}&received_at=gte.${encodeURIComponent(since)}`;
  if (box === "sent") { if (view === "needs") filter += "&delivery_status=in.(delivery_delayed,bounced,complained,failed)"; }
  else if (VIEW[view]) filter += `&${VIEW[view]}`;
  if (address) filter += `&to_addrs=cs.{${encodeURIComponent(address)}}`;
  let rows = (await rest(`intake_messages?select=id,direction,received_at,from_addr,to_addrs,subject,status,status_reason,request_id,has_personal_data,delivery_status,sent_kind,ignored_by,ignored_reason,search_text&${filter}&order=received_at.desc&limit=500`)) ?? [];
  let personalQuery = false;
  if (q) {
    const needle = q.trim().toLowerCase();
    // A search that looks like personal data returns nothing, on purpose (§M4.4): it is not in the index.
    if ((/^(?=[a-z0-9]{6,12}$)(?=(?:[a-z]*\d){6})[a-z]{0,3}\d/i.test(needle) && !/^\d{1,2}(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\d{2,4}$/i.test(needle)) || /^\d{1,2}[ .\/-](\d{1,2}|[a-z]{3})[ .\/-]\d{2,4}$/i.test(needle)) { personalQuery = true; rows = []; }
    else rows = rows.filter((r) => String(r.search_text ?? "").toLowerCase().includes(needle)).map((r) => ({ ...r, matched: matchReason(r, needle) }));
  }
  const reqIds = [...new Set(rows.map((r) => r.request_id).filter(Boolean))];
  const reqs = reqIds.length ? new Map(((await rest(`intake_requests?select=id,reference,status,status_reason,review,first_std,closed_reason,updated_at,sender_name,request_type,message_id,route,legs_count,registration&id=in.(${reqIds.join(",")})`)) ?? []).map((x) => [x.id, x])) : new Map();
  const attCounts = new Map();
  if (rows.length) for (const a of (await rest(`intake_attachments?select=message_id&message_id=in.(${rows.slice(0, 200).map((r) => r.id).join(",")})`)) ?? []) attCounts.set(a.message_id, (attCounts.get(a.message_id) ?? 0) + 1);
  const all = rows.map((r) => { const req = r.request_id ? reqs.get(r.request_id) : null; return { id: r.id, direction: r.direction, at: r.received_at, from: r.from_addr, to: r.to_addrs, subject: r.subject, status: r.status, what: r.direction === "outbound" ? `${r.sent_kind ?? "Email"}` : r.status === "ignored" && r.ignored_by ? `Marked by ${r.ignored_by} · ${r.ignored_reason}` : r.status_reason ?? "", ref: req?.reference ?? null, requestId: r.request_id, requestState: req ? uiStatus(req).label : null, attachments: attCounts.get(r.id) ?? 0, delivery: r.delivery_status, matched: r.matched ?? null }; });
  return { rows: all, personalQuery };
}
function matchReason(r, needle) {
  const t = String(r.search_text ?? "").toLowerCase(); const i = t.indexOf(needle); if (i < 0) return null;
  if (String(r.subject ?? "").toLowerCase().includes(needle)) return "Matched in subject";
  if (String(r.from_addr ?? "").toLowerCase().includes(needle)) return "Matched in sender";
  if (/^[a-z0-9]{1,2}-?[a-z0-9]{2,5}$/i.test(needle)) return `Matched in body: registration or code ${needle.toUpperCase()}`;
  return `Matched in body: ${needle.toUpperCase()}`;
}

async function mailboxCounts(days = 7) {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const rows = (await rest(`intake_messages?select=direction,status,delivery_status&received_at=gte.${encodeURIComponent(since)}&limit=5000`)) ?? [];
  const inb = rows.filter((r) => r.direction === "inbound"), out = rows.filter((r) => r.direction === "outbound");
  return { received: inb.length, sent: out.length, needs: inb.filter((r) => ["not_recognised", "failed", "waiting"].includes(r.status)).length, processed: inb.filter((r) => r.status === "processed").length, replies: inb.filter((r) => r.status === "reply").length, ignored: inb.filter((r) => r.status === "ignored").length, sentNeeds: out.filter((r) => ["delivery_delayed", "bounced", "complained", "failed"].includes(r.delivery_status)).length, waiting: inb.filter((r) => r.status === "waiting").length };
}

let resendDomains = { at: 0, value: null };
async function addressHealth() {
  const addrs = (await intakeSettings()).addresses;
  if (Date.now() - resendDomains.at > 60_000) {
    try { const r = await fetch(`${String(process.env.RESEND_API_BASE || "https://api.resend.com").replace(/\/+$/, "")}/domains`, { headers: { authorization: `Bearer ${String(process.env.RESEND_API_KEY || "")}` }, signal: AbortSignal.timeout(8000) }); resendDomains = { at: Date.now(), value: r.ok ? (await r.json()).data ?? [] : { error: `HTTP ${r.status}` } }; }
    catch (e) { resendDomains = { at: Date.now(), value: { error: e.message } }; }
  }
  const secret = Boolean(process.env.RESEND_WEBHOOK_SECRET);
  const out = [];
  for (const a of addrs) {
    const dom = a.split("@")[1]; const d = Array.isArray(resendDomains.value) ? resendDomains.value.find((x) => x.name === dom) : null;
    const last = (await rest(`intake_messages?select=received_at&direction=eq.inbound&to_addrs=cs.{${encodeURIComponent(a)}}&order=received_at.desc&limit=1`).catch(() => []))?.[0]?.received_at ?? null;
    const receiving = d?.capabilities?.receiving === "enabled";
    out.push({ address: a, ok: receiving && secret, lastAt: last, why: !d ? (resendDomains.value?.error ? `Resend did not answer (${resendDomains.value.error})` : `${dom} is not a Resend domain`) : !receiving ? `Receiving is ${d.capabilities?.receiving ?? "off"} for ${dom} in Resend` : !secret ? "No webhook secret on the server" : null });
  }
  return { addresses: out, resend: { ok: Array.isArray(resendDomains.value), delayed: 0 } };
}

async function readerPayload(id, user) {
  if (!UUID.test(id)) throw err(404, "No such message.");
  const m = (await rest(`intake_messages?select=*&id=eq.${id}`))?.[0]; if (!m) throw err(404, "No such message.");
  const req = m.request_id ? (await rest(`intake_requests?select=id,reference,status,status_reason,first_std,closed_reason,current_extraction_id,request_type,message_id&id=eq.${m.request_id}`))?.[0] : null;
  const days = await retentionDays();
  const deleteAt = new Date(Date.parse(m.received_at) + days * 86400000);
  const base = { id: m.id, direction: m.direction, subject: m.subject, from: m.from_addr, to: m.to_addrs, cc: m.cc_addrs, at: m.received_at, status: m.status, statusReason: m.status_reason, understood: m.understood, history: m.history ?? [], request: req ? { id: req.id, reference: req.reference, state: uiStatus(req).label } : null, hasPersonal: m.has_personal_data, purged: !!m.purged_at, retention: m.purged_at ? `Removed by retention on ${fmtDate(m.purged_at)}` : `Kept ${days} days · ${m.has_personal_data ? "personal data and attachments " : ""}deleted ${fmtDate(deleteAt.toISOString())}`, ignored: m.ignored_by ? { by: m.ignored_by, reason: m.ignored_reason, note: m.ignored_note } : null, auth: m.auth ?? null, rfcMessageId: m.rfc_message_id };
  // Thread: this request's inbound message + every email we sent for it.
  let thread = [];
  if (req) {
    const rows = (await rest(`intake_messages?select=id,direction,subject,received_at,from_addr,to_addrs,delivery_status,sent_kind&or=(request_id.eq.${req.id},id.eq.${req.message_id})&order=received_at.asc`)) ?? [];
    thread = rows.map((x) => ({ id: x.id, kind: x.direction === "inbound" ? "in" : "out", title: x.direction === "inbound" ? x.subject : `${x.sent_kind ?? "Email"} · ${x.subject}`, sub: x.direction === "inbound" ? x.from_addr : `to ${(x.to_addrs ?? []).join(", ")} · ${x.delivery_status ?? ""}`, at: x.received_at, current: x.id === m.id }));
  }
  if (m.direction === "outbound") return { ...base, sent: { kind: m.sent_kind, resendId: m.provider === "resend" ? m.provider_message_id : null, delivery: m.delivery_status, events: m.delivery_events ?? [], detail: m.delivery_detail?.error ?? null }, thread, attachments: [] };
  const atts = (await rest(`intake_attachments?select=id,bytes,sniffed_type,declared_type,declared_name,purged_at&message_id=eq.${m.id}`)) ?? [];
  const roles = req ? (await rest(`intake_requests?select=attachment_roles&id=eq.${req.id}`))?.[0]?.attachment_roles ?? [] : [];
  return { ...base, thread, attachments: atts.map((a) => { const r = roles.find((x) => x.id === a.id); return { id: a.id, name: a.declared_name ?? "(no name)", type: a.sniffed_type, declared: a.declared_type, bytes: a.bytes, purged: !!a.purged_at, role: r?.role ?? null, why: r?.why ?? null, personal: r?.personal ?? false, url: `/agent/api/intake/attachments/${a.id}` }; }) };
}

async function peopleForMessage(m) {
  if (!m.request_id) return [];
  const r = (await rest(`intake_requests?select=current_extraction_id&id=eq.${m.request_id}`))?.[0];
  if (!r?.current_extraction_id) return [];
  return (await rest(`intake_extractions?select=personal&id=eq.${r.current_extraction_id}`))?.[0]?.personal?.people ?? [];
}
/** Body for the reader, masked. Masked values are \u0000M{n}\u0000 markers; `values` (server-side only) are the real ones. */
async function renderBody(id, { mode = "html", images = false }) {
  const m = (await rest(`intake_messages?select=*&id=eq.${id}`))?.[0]; if (!m) throw err(404, "No such message.");
  if (m.direction === "outbound") return { out: { mode: "html", html: sanitizeEmailHtml(m.sent_html ?? "", {}).html, text: m.delivery_detail?.text ?? "", masks: 0, remoteImages: [], links: [] }, values: [] };
  if (m.purged_at) return { out: { purged: true, purgedAt: m.purged_at }, values: [] };
  let parsed;
  try { ({ parsed } = await loadParsed(m)); }
  catch (e) { return { out: { mode: "text", text: "", masks: 0, unavailable: m.fetch_status === "failed" ? `The message was never fetched from Resend (${m.fetch_error ?? "unknown error"}). Only the envelope is stored.` : `The stored message could not be read (${e.code === "ENOENT" ? "the file is missing" : e.message}).` }, values: [] }; }
  const people = await peopleForMessage(m);
  const values = [];
  const maskText = (t) => { const r = maskForReader(t, people, (i) => `\u0000M${values.length + i}\u0000`); values.push(...r.values); return r.text; };
  if (mode === "text" || !parsed.html) return { out: { mode: "text", text: maskText(parsed.text ?? ""), masks: values.length, hasHtml: !!parsed.html }, values };
  const cids = new Set((parsed.attachments ?? []).filter((a) => a.cid).map((a) => a.cid));
  const s = sanitizeEmailHtml(parsed.html, { showRemote: images, cidUrl: (cid) => (cids.has(cid) ? `/agent/api/mailbox/messages/${id}/cid/${encodeURIComponent(cid)}` : null), proxyUrl: (u) => `/agent/api/mailbox/messages/${id}/image?u=${encodeURIComponent(u)}` });
  // Masking runs on text between tags only; a value never spans a tag in the sanitiser's output.
  const html = s.html.replace(/>([^<]+)</g, (all, t) => `>${maskText(t)}<`);
  return { out: { mode: "html", html, masks: values.length, remoteImages: s.remoteImages, links: s.links, hasText: !!parsed.text }, values };
}

// ── Route table ────────────────────────────────────────────────────────────────────────────────────────
export async function handleIntakeRoutes({ req, res, url, pathname, user, sendJson, readJsonBody }) {
  const send = (payload, status = 200) => { sendJson(res, payload, status); return true; };
  const fail = (e) => send({ ok: false, message: e.message, blockers: e.blockers }, e.status ?? 500);
  const P = pathname;
  try {
    // ---- Flight intake ----
    if (P === "/api/intake/overview" && req.method === "GET") return send({ ok: true, health: await health(), queue: queueDepth() });
    if (P === "/api/intake/requests" && req.method === "GET") return send({ ok: true, ...(await requestRows({ tab: url.searchParams.get("tab") ?? "all", q: url.searchParams.get("q") ?? "", type: url.searchParams.get("type") ?? "" })) });
    let m;
    if ((m = /^\/api\/intake\/requests\/([0-9a-f-]{36})$/.exec(P)) && req.method === "GET") return send({ ok: true, ...(await requestDetail(m[1])) });
    if ((m = /^\/api\/intake\/requests\/([0-9a-f-]{36})\/edit$/.exec(P)) && req.method === "POST") { await editRequest(m[1], user, await readJsonBody(req)); return send({ ok: true, ...(await requestDetail(m[1])) }); }
    if ((m = /^\/api\/intake\/requests\/([0-9a-f-]{36})\/people$/.exec(P)) && req.method === "GET") return send({ ok: true, ...(await peopleFor(m[1], false)) });
    if ((m = /^\/api\/intake\/requests\/([0-9a-f-]{36})\/people\/reveal$/.exec(P)) && req.method === "POST") {
      const out = await peopleFor(m[1], true);
      await audit({ kind: "intake.personal_revealed", userId: user.userId, userEmail: user.email, actorId: user.userId, actorEmail: user.email, success: true, confirmationStatus: "not_required", detail: { requestId: m[1], seconds: 60 } }).catch(() => {});
      return send({ ok: true, ...out, revealedBy: user.name || user.email, at: new Date().toISOString() });
    }
    if ((m = /^\/api\/intake\/requests\/([0-9a-f-]{36})\/reprocess$/.exec(P)) && req.method === "POST") {
      const body = await readJsonBody(req); const r = (await rest(`intake_requests?select=message_id&id=eq.${m[1]}`))?.[0]; if (!r) throw err(404, "No such request.");
      const out = await processMessage(r.message_id, { actor: { email: user.email, name: user.name || user.email }, requestAttachmentId: body.attachmentId ?? null });
      if (out?.refused) throw err(409, out.refused);
      await audit({ kind: "intake.reprocessed", userId: user.userId, userEmail: user.email, actorId: user.userId, actorEmail: user.email, success: !out?.failed, error: out?.failed ?? null, confirmationStatus: "not_required", detail: { requestId: m[1], attachmentId: body.attachmentId ?? null } }).catch(() => {});
      return send({ ok: true, ...(await requestDetail(m[1])) });
    }
    if ((m = /^\/api\/intake\/requests\/([0-9a-f-]{36})\/prepare$/.exec(P)) && req.method === "POST") {
      const out = await prepareSend(m[1], user);
      if (!out.ok) await audit({ kind: "intake.send_refused", userId: user.userId, userEmail: user.email, actorId: user.userId, actorEmail: user.email, success: false, error: out.blockers.join(" | ").slice(0, 400), confirmationStatus: "not_required", detail: { requestId: m[1] } }).catch(() => {});
      return send(out.ok ? { ok: true, ...out } : { ok: false, blockers: out.blockers, warnings: out.warnings, message: "Can't confirm yet." }, out.ok ? 200 : 409);
    }
    if ((m = /^\/api\/intake\/send\/([0-9a-f-]{36})\/(confirm|cancel)$/.exec(P)) && req.method === "POST") {
      if (m[2] === "cancel") { const c = cancelConfirmation(m[1], user); await audit({ kind: "intake.send_cancelled", userId: user.userId, userEmail: user.email, success: true, confirmationStatus: "rejected", detail: { token: m[1], requestId: c?.input?.requestId ?? null } }).catch(() => {}); return send({ ok: true }); }
      const accepted = await confirmSend(m[1], user);
      return send({ ok: true, ...accepted }, 202);
    }
    if ((m = /^\/api\/intake\/send\/([0-9a-f-]{36})$/.exec(P)) && req.method === "GET") { const st = sendStatus(m[1], user); if (!st) throw err(404, "No such send."); return send({ ok: true, ...st }); }
    if ((m = /^\/api\/intake\/requests\/([0-9a-f-]{36})\/legs\/(\d+)\/(check|not_in_leon)$/.exec(P)) && req.method === "POST") { const out = await resolveUnknown(m[1], Number(m[2]), user, m[3]); return send({ ok: true, outcome: out, ...(await requestDetail(m[1])) }); }
    if ((m = /^\/api\/intake\/attachments\/([0-9a-f-]{36})$/.exec(P)) && req.method === "GET") {
      const a = (await rest(`intake_attachments?select=id,message_id,storage_key,sniffed_type,declared_name,purged_at,bytes&id=eq.${m[1]}`))?.[0];
      if (!a) throw err(404, "No such attachment.");
      if (a.purged_at) throw err(410, "Removed by retention.");
      const buf = await readKey(a.storage_key);
      await audit({ kind: "intake.attachment_opened", userId: user.userId, userEmail: user.email, actorId: user.userId, actorEmail: user.email, success: true, confirmationStatus: "not_required", detail: { attachmentId: a.id, messageId: a.message_id, bytes: a.bytes, download: url.searchParams.has("download") } }).catch(() => {});
      const inlineOk = /^(application\/pdf|image\/(png|jpeg|gif|webp)|text\/plain)$/.test(a.sniffed_type) && !url.searchParams.has("download");
      const safeName = String(a.declared_name ?? "attachment").replace(/[^\w.\- ]+/g, "_").slice(0, 120);
      res.writeHead(200, { "content-type": inlineOk ? a.sniffed_type : "application/octet-stream", "content-length": buf.length, "content-disposition": `${inlineOk ? "inline" : "attachment"}; filename="${safeName}"`, "cache-control": "private, no-store", "x-content-type-options": "nosniff", "content-security-policy": "sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; plugin-types application/pdf" });
      res.end(buf); return true;
    }
    // Intake settings (Agent settings page): admins and developers only, read and write.
    if (P === "/api/intake/settings" && (req.method === "GET" || req.method === "PUT")) {
      if (!isPrivileged(user)) throw err(403, "Intake settings are for admins.");
      if (req.method === "PUT") {
        const body = await readJsonBody(req); const before = await intakeSettings({ fresh: true });
        const after = await setIntakeSettings(body, user);
        await audit({ kind: "settings.changed", userId: user.userId, userEmail: user.email, actorId: user.userId, actorEmail: user.email, success: true, confirmationStatus: "not_required", detail: { intake: Object.fromEntries(Object.keys(body).filter((k) => k in after).map((k) => [k, { from: before[k], to: after[k] }])) } }).catch(() => {});
      }
      const s = await intakeSettings({ fresh: true });
      return send({ ok: true, settings: s, health: await addressHealth().catch(() => null) });
    }
    if (P === "/api/intake/checklist-definitions" && req.method === "GET") return send({ ok: true, definitions: (await checklistDefinitions()).map((d) => ({ nid: d.nid, label: d.label, section: d.section })) });

    // ---- Agent mailbox (restricted) ----
    if (P.startsWith("/api/mailbox/")) {
      if (P === "/api/mailbox/access" && req.method === "GET") { const readers = await mailboxReaders(); return send({ ok: true, allowed: await mailboxAllowed(user), readersCount: readers.length }); }
      if (!(await mailboxAllowed(user))) { await audit({ kind: "mailbox.denied", userId: user.userId, userEmail: user.email, success: false, confirmationStatus: "not_required", detail: { path: P } }).catch(() => {}); throw err(403, "You don't have access to the agent mailbox."); }
      if (P === "/api/mailbox/overview" && req.method === "GET") return send({ ok: true, counts: await mailboxCounts(Number(url.searchParams.get("days") || 7)), health: await addressHealth(), queue: queueDepth(), notifyTo: await notifyTo(), mailMode: String(process.env.INTAKE_MAIL_MODE || "send") });
      if (P === "/api/mailbox/messages" && req.method === "GET") return send({ ok: true, ...(await mailboxRows({ box: url.searchParams.get("box") ?? "received", view: url.searchParams.get("view") ?? "needs", q: url.searchParams.get("q") ?? "", days: url.searchParams.get("days") ?? 7, address: url.searchParams.get("address") ?? "" })) });
      if ((m = /^\/api\/mailbox\/messages\/([0-9a-f-]{36})$/.exec(P)) && req.method === "GET") { const out = await readerPayload(m[1], user); await audit({ kind: "mailbox.opened", userId: user.userId, userEmail: user.email, success: true, confirmationStatus: "not_required", detail: { messageId: m[1] } }).catch(() => {}); return send({ ok: true, message: out }); }
      if ((m = /^\/api\/mailbox\/messages\/([0-9a-f-]{36})\/body$/.exec(P)) && req.method === "GET") {
        const images = url.searchParams.get("images") === "1";
        if (images) await audit({ kind: "mailbox.images_shown", userId: user.userId, userEmail: user.email, success: true, confirmationStatus: "not_required", detail: { messageId: m[1] } }).catch(() => {});
        return send({ ok: true, body: (await renderBody(m[1], { mode: url.searchParams.get("mode") ?? "html", images })).out });
      }
      if ((m = /^\/api\/mailbox\/messages\/([0-9a-f-]{36})\/reveal$/.exec(P)) && req.method === "POST") { const { values } = await renderBody(m[1], { mode: url.searchParams.get("mode") ?? "html", images: url.searchParams.get("images") === "1" }); await audit({ kind: "mailbox.personal_revealed", userId: user.userId, userEmail: user.email, actorId: user.userId, actorEmail: user.email, success: true, confirmationStatus: "not_required", detail: { messageId: m[1], seconds: 60 } }).catch(() => {}); return send({ ok: true, values, revealedBy: user.name || user.email }); }
      if ((m = /^\/api\/mailbox\/messages\/([0-9a-f-]{36})\/raw$/.exec(P)) && req.method === "GET") {
        const msg = (await rest(`intake_messages?select=*&id=eq.${m[1]}`))?.[0]; if (!msg) throw err(404, "No such message.");
        if (msg.direction === "outbound") return send({ ok: true, headers: [["From", msg.from_addr], ["To", (msg.to_addrs ?? []).join(", ")], ["Subject", msg.subject], ["Date", msg.received_at]], raw: msg.sent_html ?? "", auth: null });
        if (msg.purged_at || !msg.raw_key) return send({ ok: true, headers: [["From", msg.from_addr ?? ""], ["To", (msg.to_addrs ?? []).join(", ")], ["Subject", msg.subject ?? ""], ["Date", msg.received_at]], raw: "", auth: msg.auth ?? null, unavailable: msg.purged_at ? `Removed by retention on ${fmtDate(msg.purged_at)}.` : `The raw message was never stored (${msg.fetch_error ?? "fetch failed"}). Only the envelope above is kept.` });
        const raw = await readKey(msg.raw_key);
        if (url.searchParams.has("download")) { await audit({ kind: "mailbox.raw_downloaded", userId: user.userId, userEmail: user.email, actorId: user.userId, actorEmail: user.email, success: true, confirmationStatus: "not_required", detail: { messageId: m[1] } }).catch(() => {}); res.writeHead(200, { "content-type": "message/rfc822", "content-disposition": `attachment; filename="message-${m[1].slice(0, 8)}.eml"`, "cache-control": "private, no-store", "x-content-type-options": "nosniff" }); res.end(raw); return true; }
        const { parsed } = await loadParsed(msg); const people = await peopleForMessage(msg);
        const headers = []; for (const line of parsed.headerLines ?? []) { const i = line.line.indexOf(":"); headers.push([line.line.slice(0, i), maskForReader(line.line.slice(i + 1).trim().replace(/\r?\n\s+/g, " "), people, () => MASK).text]); }
        const text = raw.toString("latin1").replace(/(\r?\n\r?\n)((?:[A-Za-z0-9+\/=]{60,}\r?\n){3})(?:[A-Za-z0-9+\/=]{20,}\r?\n)+/g, (a, sep, keep) => `${sep}${keep}…\n`);
        return send({ ok: true, headers, raw: maskForReader(text.slice(0, 200000), people, () => MASK).text, auth: msg.auth ?? null });
      }
      if ((m = /^\/api\/mailbox\/messages\/([0-9a-f-]{36})\/cid\/(.+)$/.exec(P)) && req.method === "GET") {
        const msg = (await rest(`intake_messages?select=*&id=eq.${m[1]}`))?.[0]; if (!msg || msg.purged_at) throw err(404, "No such image.");
        const { parsed } = await loadParsed(msg); const cid = decodeURIComponent(m[2]); const a = (parsed.attachments ?? []).find((x) => x.cid === cid && /^image\//.test(x.contentType));
        if (!a) throw err(404, "No such image."); res.writeHead(200, { "content-type": a.contentType, "cache-control": "private, max-age=300", "x-content-type-options": "nosniff" }); res.end(a.content); return true;
      }
      if ((m = /^\/api\/mailbox\/messages\/([0-9a-f-]{36})\/image$/.exec(P)) && req.method === "GET") {
        // Remote images are fetched by us, never by the browser, and only URLs that are in that message.
        const u = url.searchParams.get("u") ?? ""; const msg = (await rest(`intake_messages?select=*&id=eq.${m[1]}`))?.[0]; if (!msg || msg.purged_at) throw err(404, "No such image.");
        const { parsed } = await loadParsed(msg); if (!/^https?:\/\//i.test(u) || !String(parsed.html ?? "").includes(u.replace(/&/g, "&amp;")) && !String(parsed.html ?? "").includes(u)) throw err(404, "Not an image in this message.");
        const r = await fetch(u, { signal: AbortSignal.timeout(8000), redirect: "follow" }); const ct = r.headers.get("content-type") ?? ""; const buf = Buffer.from(await r.arrayBuffer());
        if (!r.ok || !/^image\/(png|jpeg|gif|webp)/.test(ct) || buf.length > 5_000_000) throw err(404, "Not an image.");
        res.writeHead(200, { "content-type": ct, "cache-control": "private, max-age=300", "x-content-type-options": "nosniff" }); res.end(buf); return true;
      }
      if ((m = /^\/api\/mailbox\/messages\/([0-9a-f-]{36})\/(ignore|unignore|reprocess|forward|process-handling)$/.exec(P)) && req.method === "POST") {
        const body = await readJsonBody(req); const id = m[1]; const msg = (await rest(`intake_messages?select=*&id=eq.${id}`))?.[0]; if (!msg) throw err(404, "No such message.");
        const me = who(user); const hist = [...(msg.history ?? []), { at: me.at, status: msg.status, reason: msg.status_reason, by: me.name, action: m[2] }];
        if (m[2] === "ignore") {
          const reasons = ["Not for us", "Spam", "Newsletter", "Duplicate", "Handled elsewhere", "Other"]; if (!reasons.includes(body.reason)) throw err(400, "Choose a reason."); if (body.reason === "Other" && !String(body.note ?? "").trim()) throw err(400, "Say why, for Other.");
          await rest(`intake_messages?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ status: "ignored", ignored_by: me.name, ignored_reason: body.reason, ignored_note: String(body.note ?? "").slice(0, 300) || null, history: hist }) });
        } else if (m[2] === "unignore" || m[2] === "reprocess") {
          await rest(`intake_messages?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ status: "waiting", status_reason: "In the queue", ignored_by: null, ignored_reason: null, ignored_note: null, history: hist }) });
          enqueue(id, { actor: { email: user.email, name: me.name }, forceHandling: false });
        } else if (m[2] === "process-handling") {
          // §4.15: the request-creating action is confirmed with a server-verified, expiring token.
          if (!body.token) { const c = issueConfirmation({ user, toolName: "intake.process_as_handling", input: { messageId: id }, level: "write", summary: "Create a handling request from this email", targetId: id, targetLabel: msg.subject }); return send({ ok: true, confirmation: c }); }
          const b = beginConfirmation({ token: body.token, user, toolName: "intake.process_as_handling", input: { messageId: id } }); if (b.error) throw err(409, b.error === "expired" ? "This confirmation expired. Nothing was created." : "This confirmation does not match."); if (b.replay) return send({ ok: true, result: b.entry.result });
          await rest(`intake_messages?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ status: "waiting", status_reason: "In the queue · process as handling request", history: hist }) });
          const out = await processMessage(id, { actor: { email: user.email, name: me.name }, forceHandling: true }).catch((e) => ({ failed: e.message }));
          settleConfirmation(b.entry, out);
          if (out?.failed) failConfirmation(b.entry);
          await audit({ kind: "mailbox.process_as_handling", userId: user.userId, userEmail: user.email, actorId: user.userId, actorEmail: user.email, success: !out?.failed, error: out?.failed ?? null, confirmationStatus: "confirmed", detail: { messageId: id, requestId: out?.requestId ?? null } }).catch(() => {});
          return send({ ok: !out?.failed, result: out, message: out?.failed ?? null });
        } else if (m[2] === "forward") {
          const to = String(body.to ?? "").trim(); if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) throw err(400, "A valid address, please.");
          if (msg.purged_at || !msg.raw_key) throw err(410, "The message was removed by retention.");
          const raw = await readKey(msg.raw_key);
          const note = String(body.note ?? "").slice(0, 1000);
          const html = `<p style="font-family:sans-serif;font-size:14px">${note ? note.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c]) + "<br><br>" : ""}Forwarded by ${me.name} from the Clearway agent mailbox. The original message is attached as received.</p>`;
          const mode = String(process.env.INTAKE_MAIL_MODE || "").trim() === "capture" ? "capture" : "send";
          let r2 = { ok: true, id: null }; if (mode === "send") r2 = await deliver({ to: [to], from: agentFrom(), subject: `Fwd: ${msg.subject ?? ""}`, html, attachments: [{ filename: "original-message.eml", content: raw }] });
          await rest("intake_messages", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify([{ provider: mode === "capture" ? "capture" : "resend", provider_message_id: r2.id ?? `${mode}-fwd-${Date.now()}`, direction: "outbound", received_at: me.at, from_addr: agentFrom(), to_addrs: [to], subject: `Fwd: ${msg.subject ?? ""}`, status: "sent", status_reason: `Forward · ${note ? `"${note.slice(0, 80)}"` : "no note"}`, sent_kind: "Forward", sent_html: html, delivery_status: r2.ok ? (mode === "capture" ? "captured" : "sent") : "failed", delivery_detail: r2.ok ? null : { error: r2.error }, request_id: msg.request_id, fetch_status: "stored", search_text: `Fwd: ${msg.subject ?? ""} ${to}` }]) });
          await rest(`intake_messages?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ history: [...hist.slice(0, -1), { at: me.at, action: "forward", by: me.name, to }] }) });
          await audit({ kind: "mailbox.forwarded", userId: user.userId, userEmail: user.email, actorId: user.userId, actorEmail: user.email, success: r2.ok, error: r2.ok ? null : r2.error, confirmationStatus: "not_required", detail: { messageId: id, to, personal: !!msg.has_personal_data } }).catch(() => {});
          if (!r2.ok) throw err(502, `Resend refused the forward: ${r2.error}`);
        }
        await audit({ kind: `mailbox.${m[2]}`, userId: user.userId, userEmail: user.email, actorId: user.userId, actorEmail: user.email, success: true, confirmationStatus: "not_required", detail: { messageId: id, reason: body.reason ?? null } }).catch(() => {});
        return send({ ok: true, message: await readerPayload(id, user) });
      }
    }
  } catch (e) {
    if (!e.status) process.stderr.write(`[intake] ${req.method} ${P} failed: ${e?.stack || e}\n`);
    return fail(e);
  }
  return false;
}
void TOOL; void getConfirmation;
