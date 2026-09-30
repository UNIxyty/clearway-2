// The intake pipeline for type 2 (handling requests), from a stored message to "Awaiting review".
//
//   Request received → Reading request → Data extracted → Awaiting review → Reviewed and confirmed →
//   Building Leon request → Leon request built → Sent to Leon → Filling checklist → Checklist filled → Notification sent
//
// Stages are data (one list per type); the page draws whatever list it is given. Type 1 (provider portal)
// has its own nine-stage list, defined here so the page and the list can show it, but nothing collects from
// a portal: a message routed to type 1 stops at "Collecting data" as NOT BUILT, said so in plain words.
//
// Processing runs off the webhook's response path, one message at a time, in this process. A message still
// "waiting" after a restart is picked up again on start (idempotent: one request per message, extraction
// versions append).
import { createHash } from "node:crypto";
import { simpleParser } from "mailparser";
import { rest } from "../knowledge/retrieval.mjs";
import { audit } from "../store.mjs";
import { extractAttachment } from "../attachments.mjs";
import { readKey, sniff, sha256 } from "./blobstore.mjs";
import { enforce, normalise, preclassify, referenceFor, runModel } from "./extract.mjs";
import { reviewFromExtraction } from "./review.mjs";
import { flightsBetween, checklistDefinitions } from "./leon-lookup.mjs";
import { personalTokens, scrubString, searchTextFor } from "./personal.mjs";
import { composeReview, composeStopped, sendIntakeEmail } from "./notify.mjs";

export const STAGES = {
  handling: ["Request received", "Reading request", "Data extracted", "Awaiting review", "Reviewed and confirmed", "Building Leon request", "Leon request built", "Sent to Leon", "Filling checklist", "Checklist filled", "Notification sent"],
  scheduled: ["Request received", "Confirmation sent", "Confirmation received", "Collecting data", "Data collected", "Building Leon request", "Leon request built", "Sent to Leon", "Notification sent"],
};
export const freshStages = (type) => STAGES[type].map((name) => ({ name, state: "none", at: null, ms: null, note: null }));
export function setStage(stages, name, state, note = null, at = new Date().toISOString()) {
  const s = stages.find((x) => x.name === name); if (!s) return stages;
  if (state !== "prog" && s.state === "prog" && s.at) s.ms = Date.parse(at) - Date.parse(s.at);
  s.state = state; if (state === "prog" || !s.at) s.at = at; if (state !== "prog") s.doneAt = at; if (note !== undefined) s.note = note;
  return stages;
}

// ── Queue ─────────────────────────────────────────────────────────────────────────────────────────────
const queue = []; let running = false;
export function enqueue(messageId, opts = {}) { if (process.env.INTAKE_PIPELINE === "off") return; if (!queue.some((q) => q.messageId === messageId)) queue.push({ messageId, opts }); void drain(); }
async function drain() {
  if (running) return; running = true;
  try { while (queue.length) { const { messageId, opts } = queue.shift(); await processMessage(messageId, opts).catch((e) => process.stderr.write(`[intake] processing ${messageId} failed: ${e?.stack || e}\n`)); } }
  finally { running = false; }
}
export const queueDepth = () => queue.length + (running ? 1 : 0);
/** On start: anything left waiting is processed again. */
export async function resumeWaiting() {
  const rows = (await rest("intake_messages?select=id&direction=eq.inbound&status=eq.waiting&fetch_status=eq.stored&order=received_at.asc&limit=200").catch(() => [])) ?? [];
  for (const r of rows) enqueue(r.id);
  return rows.length;
}

// ── Reading a stored message ─────────────────────────────────────────────────────────────────────────
export async function loadParsed(message) {
  if (!message.raw_key) throw new Error(message.purged_at ? "The message was removed by retention." : "The raw message was not stored.");
  const raw = await readKey(message.raw_key);
  const parsed = await simpleParser(raw, { skipImageLinks: true });
  return { raw, parsed };
}
/** Attachments with their DB ids (matched by content hash), content, and what the code could read. */
export async function attachmentsOf(message, parsed) {
  const rows = (await rest(`intake_attachments?select=id,sha256,bytes,sniffed_type,declared_name,declared_type,storage_key,purged_at&message_id=eq.${message.id}`)) ?? [];
  const bySha = new Map(rows.map((r) => [r.sha256, r]));
  const out = [];
  for (const a of parsed.attachments ?? []) {
    if (!a?.content?.length) continue;
    const h = sha256(a.content); const row = bySha.get(h);
    out.push({ id: row?.id ?? null, sha256: h, name: a.filename || row?.declared_name || "(no name)", content: a.content, bytes: a.content.length, sniffedType: row?.sniffed_type ?? sniff(a.content), declaredType: a.contentType, inline: a.contentDisposition === "inline" || (!!a.cid && !a.filename), cid: a.cid ?? null, related: !!a.related });
  }
  return out;
}

function classifyAutomatic(parsed) {
  const h = parsed.headers; const get = (k) => String(h.get(k) ?? "");
  const ct = h.get("content-type"); const ctv = typeof ct === "object" ? `${ct.value}; ${JSON.stringify(ct.params ?? {})}` : String(ct ?? "");
  const from = String(parsed.from?.value?.[0]?.address ?? "").toLowerCase();
  if (/multipart\/report/i.test(ctv) && /delivery-status/i.test(ctv) || /^(mailer-daemon|postmaster)@/.test(from)) return { kind: "bounce", title: "Ignored as a bounce", reason: "Bounce", checks: [["Bounce", "yes", "Delivery Status Notification"]] };
  const auto = get("auto-submitted");
  if (auto && !/^no$/i.test(auto) || /^(auto|automatic) ?reply|out of (the )?office/i.test(parsed.subject ?? "")) return { kind: "auto", title: "Ignored: automatic reply", reason: "Out of office", checks: [["Auto-Submitted header", auto ? "yes" : "maybe", auto || "subject reads as an automatic reply"]] };
  if (h.has("list-unsubscribe") || /^bulk|list$/i.test(get("precedence"))) return { kind: "newsletter", title: "Ignored: newsletter", reason: "Newsletter", checks: [["List-Unsubscribe", "yes", ""]] };
  return null;
}

async function patchMessage(id, patch) { await rest(`intake_messages?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(patch) }); }
async function patchRequest(id, patch) { await rest(`intake_requests?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }) }); }

/**
 * Duplicate / revision check (§I14.6). A match: an existing (not cancelled) Leon flight with the same
 * registration or flight number, the same route, and STD within ±3 h; or our own earlier request with the same
 * reference (ignoring -R2 / REV / REVISED) that already put flights in Leon.
 */
export async function findDuplicates(review, reference, requestId) {
  const legs = review.legs.filter((l) => !l.removed);
  const matches = [];
  for (const leg of legs) {
    const f = Object.fromEntries(leg.fields.map((x) => [x.key, x]));
    const std = f.std?.utc; if (!std || !f.departure?.value || !f.arrival?.value) continue;
    const t = Date.parse(std);
    const around = await flightsBetween(new Date(t - 3 * 3600_000).toISOString().replace(/\.\d+Z$/, "Z"), new Date(t + 3 * 3600_000).toISOString().replace(/\.\d+Z$/, "Z"));
    const norm = (s) => String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    for (const fl of around) {
      const sameRoute = fl.adep === f.departure.value && fl.ades === f.arrival.value;
      const sameAc = f.registration?.value && norm(fl.registration) === norm(f.registration.value);
      const sameNo = f.flightNumber?.value && norm(fl.flightNo) === norm(f.flightNumber.value);
      const within = Math.abs(Date.parse(fl.std) - t) <= 3 * 3600_000;
      if (within && (sameAc || sameNo) && (sameRoute || (sameAc && sameNo && (fl.adep === f.departure.value || fl.ades === f.arrival.value)))) {
        if (fl.opsNotes.includes(`CWY-INTAKE ${requestId}`)) continue; // our own flight for THIS request
        matches.push({ leg: leg.index, leon: fl, sameRoute, why: [sameAc ? "registration" : null, sameNo ? "flight number" : null, sameRoute ? "route" : "one airport", "STD within 3 h"].filter(Boolean).join(", ") });
      }
    }
  }
  const base = String(reference ?? "").toUpperCase().replace(/[-\s]*(R\d+|REV(ISED)?\d*)$/, "");
  let ours = [];
  if (base && base !== "UNREFERENCED") {
    ours = (await rest(`intake_requests?select=id,reference,status&id=neq.${requestId}&reference=ilike.${encodeURIComponent(base)}*&status=in.(loaded,partly_loaded,needs_you,in_progress)`).catch(() => [])) ?? [];
    ours = ours.filter((r) => String(r.reference).toUpperCase().replace(/[-\s]*(R\d+|REV(ISED)?\d*)$/, "") === base);
    // Only an earlier request that actually put flights in Leon counts (one stopped as a duplicate does not).
    if (ours.length) { const inLeon = new Set(((await rest(`intake_leon_writes?select=request_id&state=eq.in_leon&request_id=in.(${ours.map((o) => o.id).join(",")})`).catch(() => [])) ?? []).map((w) => w.request_id)); ours = ours.filter((o) => inLeon.has(o.id)); }
  }
  if (!matches.length && !ours.length) return null;
  // Comparison table: this request vs the Leon flights (per matched leg).
  const rows = [];
  for (const m of matches) {
    const leg = review.legs[m.leg]; const f = Object.fromEntries(leg.fields.map((x) => [x.key, x]));
    const hm = (iso) => (iso ? `${iso.slice(0, 10)} ${iso.slice(11, 16)}` : "—");
    for (const [label, mine, theirs] of [["Leg", `LEG ${m.leg + 1}`, `Leon ${m.leon.nid}`], ["Flight no.", f.flightNumber?.value, m.leon.flightNo], ["Route", `${f.departure?.value} → ${f.arrival?.value}`, `${m.leon.adep} → ${m.leon.ades}`], ["STD", hm(f.std?.utc), hm(m.leon.std)], ["STA", hm(f.sta?.utc), hm(m.leon.sta)], ["Registration", f.registration?.value, m.leon.registration]])
      rows.push({ field: label, mine: mine ?? "—", theirs: theirs ?? "—", differs: label !== "Leg" && String(mine ?? "") !== String(theirs ?? "") });
  }
  return { matches, ours: ours.map((r) => ({ id: r.id, reference: r.reference, status: r.status })), rows, leonIds: [...new Set(matches.map((m) => m.leon.nid))], created: matches[0]?.leon.created ?? null, tripNumber: matches[0]?.leon.tripNumber ?? null };
}

function peopleLine(people, review) {
  return review.legs.filter((l) => !l.removed).map((l) => {
    const f = Object.fromEntries(l.fields.map((x) => [x.key, x]));
    const crew = f.crewCount?.state === "unknown" ? "crew TBA" : f.crewCount?.value ? `${f.crewCount.value} crew` : "crew not given";
    const pax = f.paxTotal?.state === "unknown" ? "pax TBA" : f.paxTotal?.value !== "" && f.paxTotal?.value != null ? `${f.paxTotal.value} pax` : "pax not given";
    return `Leg ${l.index + 1}: ${crew}, ${pax}`;
  }).join(" · ");
}

/**
 * Processes one inbound message. Options: { actor, requestAttachmentId (ops: "use this file instead"),
 * forceHandling (mailbox: "Process as handling request") }.
 */
export async function processMessage(messageId, opts = {}) {
  const message = (await rest(`intake_messages?select=*&id=eq.${messageId}`))?.[0];
  if (!message || message.direction !== "inbound") return { skipped: "not an inbound message" };
  const now = () => new Date().toISOString();
  let parsed;
  try { ({ parsed } = await loadParsed(message)); }
  catch (e) { await patchMessage(message.id, { status: "failed", status_reason: `Could not read the stored message: ${e.message}`, understood: { kind: "failed", title: "Failed: the message could not be read", body: String(e.message), checks: [] } }); return { failed: e.message }; }

  // The stored message is the truth about subject and sender (the webhook carried only Resend's metadata).
  if (parsed.subject && (parsed.subject !== message.subject || parsed.from?.text !== message.from_addr)) { message.subject = parsed.subject; message.from_addr = parsed.from?.text ?? message.from_addr; await patchMessage(message.id, { subject: message.subject, from_addr: message.from_addr }); }
  const automatic = opts.forceHandling ? null : classifyAutomatic(parsed);
  if (automatic) {
    await patchMessage(message.id, { status: "ignored", status_reason: automatic.reason, understood: { kind: "ignored", title: automatic.title, body: "Not a request, so the agent took no action on it.", checks: automatic.checks }, search_text: `${message.from_addr ?? ""}\n${message.subject ?? ""}` });
    return { ignored: automatic.kind };
  }

  // One request per message; a re-run reuses it.
  const existing = (await rest(`intake_requests?select=*&message_id=eq.${message.id}`))?.[0];
  if (existing) {
    const sent = (await rest(`intake_leon_writes?select=id&request_id=eq.${existing.id}&state=in.(sending,in_leon,unknown)&limit=1`)) ?? [];
    if (sent.length) return { refused: "This request already has legs in Leon (or a send in progress); it is not read again." };
  }
  const req = existing ?? (await rest("intake_requests?on_conflict=message_id", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=representation" }, body: JSON.stringify([{ message_id: message.id, request_type: "handling", status: "extracting", stages: freshStages("handling") }]) }))?.[0]
    ?? (await rest(`intake_requests?select=*&message_id=eq.${message.id}`))?.[0];
  let stages = existing?.stages?.length ? existing.stages.map((s) => ({ ...s })) : freshStages("handling");
  if (existing) for (const s of stages) if (s.name !== "Request received") { s.state = "none"; s.at = null; s.ms = null; s.note = null; }
  setStage(stages, "Request received", "done", `From ${parsed.from?.value?.[0]?.name ? `${parsed.from.value[0].name} · ` : ""}${parsed.from?.value?.[0]?.address ?? message.from_addr ?? "unknown sender"}`, message.received_at);
  setStage(stages, "Reading request", "prog", opts.requestAttachmentId ? "Re-reading with the file ops chose as the request" : null);
  const sender = parsed.from?.value?.[0]?.name || message.from_addr;
  await patchRequest(req.id, { status: "extracting", stages, sender_name: sender, status_reason: "Reading request" });
  await patchMessage(message.id, { request_id: req.id });

  // Attachments: code-evident noise first; everything else read for the model.
  const atts = await attachmentsOf(message, parsed);
  const chosen = opts.requestAttachmentId ? atts.find((a) => a.id === opts.requestAttachmentId) : null;
  for (const a of atts) {
    a.pre = a === chosen ? null : preclassify(a);
    if (a.pre) continue;
    const e = await extractAttachment(a.content, a.name).catch((err) => ({ status: "unreadable", readNote: err.message }));
    a.text = e.text ?? null; a.pages = e.pages ?? null; a.readStatus = e.status; a.readNote = e.note ?? e.readNote ?? null;
    if (!a.text && a.sniffedType === "application/pdf" && a.bytes < 4_500_000) a.docBlock = { document: { format: "pdf", name: `attachment-${a.sha256.slice(0, 8)}`, source: { bytes: a.content } } };
    else if (!a.text && /^image\/(png|jpeg|gif|webp)$/.test(a.sniffedType) && a.bytes < 3_750_000) a.docBlock = { image: { format: a.sniffedType.split("/")[1], source: { bytes: a.content } } };
  }
  const bodyText = parsed.text || (parsed.html ? String(parsed.html).replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ") : "");
  const extraNote = [chosen ? `A PERSON (ops) HAS CHOSEN the attachment "${chosen.name}" as the request itself. Read the schedule and services from it; the body is secondary.` : null, opts.forceHandling ? "A PERSON (ops) HAS ASKED for this email to be read as a handling request. Pre-fill what you can find; set confidence at or below 0.6 for everything you are unsure of." : null].filter(Boolean).join("\n");

  let model, x;
  const started = Date.now();
  try {
    model = await runModel({ message: { from: message.from_addr, to: message.to_addrs, date: message.received_at, subject: message.subject }, bodyText: extraNote ? `${extraNote}\n\n${bodyText}` : bodyText, attachments: atts });
    x = enforce(await normalise(model.raw));
  } catch (e) {
    const why = e.schemaErrors ? `${e.message}` : `The model could not read it: ${String(e.message).slice(0, 200)}`;
    setStage(stages, "Reading request", "fail", why);
    await patchRequest(req.id, { status: "needs_you", status_reason: "Reading request · could not read", stages });
    await patchMessage(message.id, { status: "failed", status_reason: `Could not read the request: ${String(e.message).slice(0, 120)}`, understood: { kind: "failed", title: "Failed: the request could not be read", body: why, checks: [] } });
    await audit({ kind: "intake.extraction_failed", success: false, error: String(e.message).slice(0, 200), confirmationStatus: "not_required", detail: { requestId: req.id, messageId: message.id } }).catch(() => {});
    return { failed: e.message };
  }
  const people = x.personal.people ?? [];
  const tokens = personalTokens(people);

  // Store the version (fields without personal data; personal separately).
  const prev = (await rest(`intake_extractions?select=version&request_id=eq.${req.id}&order=version.desc&limit=1`))?.[0]?.version ?? 0;
  const { personal, ...fields } = x;
  const ex = (await rest("intake_extractions", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify([{ request_id: req.id, version: prev + 1, model_id: model.modelId, model_tier: model.tier, input_tokens: model.usage.inputTokens, output_tokens: model.usage.outputTokens, fields, personal: people.length ? personal : null, created_by: opts.actor?.email ?? "intake" }]) }))?.[0];

  // Attachment roles, as shown on the review screen (and the override that produced this version).
  const roles = atts.map((a) => {
    const m = x.attachments.find((y) => y.name === a.name) ?? null;
    const r = a.pre ?? (m ? { role: m.role, kind: m.kind, why: m.why, read: m.read } : { role: a.text ? "supporting" : "unreadable", kind: "other", why: a.text ? "Read, but the model did not classify it." : "Could not be read.", read: !!a.text });
    return { id: a.id, name: a.name, bytes: a.bytes, type: a.sniffedType, pages: a.pages ?? null, inline: a.inline, role: a === chosen ? "request" : r.role, kind: r.kind, why: scrubString(a === chosen ? `Chosen by ${opts.actor?.name ?? "ops"} as the request. ${r.why ?? ""}`.trim() : r.why, tokens), read: r.read ?? !!a.text, byCode: !!r.byCode, override: a === chosen ? { by: opts.actor?.name ?? null, at: now() } : null, personal: /gendec|crew|pax/.test(r.kind ?? "") || (a.text ? tokens.some((t) => t.length >= 5 && a.text.includes(t)) : false) };
  });
  const requestSource = chosen ? { attachment: chosen.name, attachmentId: chosen.id, why: `Chosen by ${opts.actor?.name ?? "ops"}.`, by: opts.actor?.name ?? null } : { ...x.requestSource, attachmentId: atts.find((a) => a.name === x.requestSource?.attachment)?.id ?? null };

  const handling = x.requestType === "handling" || opts.forceHandling || chosen;
  const defs = model.defs ?? (await checklistDefinitions().catch(() => []));
  const review = reviewFromExtraction(x, defs);
  review.requestSource = requestSource;
  review.extractionId = ex?.id ?? null;
  if (opts.forceHandling) for (const l of review.legs) for (const f of l.fields) if (["extracted", "converted", "cross_checked"].includes(f.state)) { f.state = "low_confidence"; f.note = "Pre-filled from a message that was not recognised. Check it."; }
  const { reference, built } = referenceFor(x, message.subject);
  const legsN = review.legs.length;
  const first = review.legs[0]; const ff = first ? Object.fromEntries(first.fields.map((y) => [y.key, y])) : {};
  const route = (() => { const pts = []; for (const l of review.legs) { const f = Object.fromEntries(l.fields.map((y) => [y.key, y])); if (!pts.length) pts.push(f.departure?.value || "????"); pts.push(f.arrival?.value || "????"); } return pts.join(" → "); })();
  const regs = [...new Set(review.legs.map((l) => l.fields.find((f) => f.key === "registration")?.value).filter(Boolean))];
  const calls = [...new Set(review.legs.map((l) => l.fields.find((f) => f.key === "flightNumber")?.value).filter(Boolean))];
  const apts = [...new Set(review.legs.flatMap((l) => ["departure", "arrival"].map((k) => l.fields.find((f) => f.key === k)).filter(Boolean).flatMap((f) => [f.value, f.airport?.iata]).filter(Boolean)))];
  const search = searchTextFor({ from: `${sender ?? ""} ${message.from_addr ?? ""}`, subject: message.subject, reference, registrations: regs, callsigns: calls, airports: apts, bodyText, people });

  if (!handling || !legsN) {
    setStage(stages, "Reading request", "fail", scrubString(x.whyType, tokens));
    await patchRequest(req.id, { status: "not_recognised", status_reason: scrubString(x.whyType, tokens), stages, review, attachment_roles: roles, current_extraction_id: ex?.id, reference, reference_built: built });
    const checks = [["Schedule block", legsN ? "maybe" : "no", legsN ? `${legsN} leg${legsN === 1 ? "" : "s"}, but not read as a handling request` : "No airport code with a date and time"], ["Registration", regs.length ? "yes" : "no", regs.join(", ")], ["People", people.length ? "yes" : "none", people.length ? `${people.length} ${people.length === 1 ? "person" : "people"} named (not shown)` : ""], ["Attachments", atts.length ? "yes" : "none", atts.length ? `${atts.length}` : ""]];
    await patchMessage(message.id, { status: "not_recognised", status_reason: scrubString(x.whyType, tokens).slice(0, 140), understood: { kind: "notrec", title: `Not recognised: ${scrubString(x.whyType, tokens)}`, body: "The agent did nothing with it.", checks, hint: regs.length || legsN ? "Process as handling request: the agent pre-fills what it found, all marked low confidence, and you complete the rest on the review screen." : "Forward it to a person, or mark it as ignored." }, search_text: search, has_personal_data: people.length > 0 });
    return { notRecognised: true, requestId: req.id };
  }

  setStage(stages, "Reading request", "done", `${atts.filter((a) => !a.pre).length ? `Body and ${atts.filter((a) => !a.pre).length} attachment${atts.filter((a) => !a.pre).length === 1 ? "" : "s"}` : "Body"} · ${model.modelId.replace(/^eu\.anthropic\./, "")} · ${Math.round((Date.now() - started) / 1000)} s`);
  const sCount = review.legs.reduce((n, l) => n + l.services.filter((s) => !s.isNote).length, 0);
  setStage(stages, "Data extracted", "done", `${legsN} leg${legsN === 1 ? "" : "s"} · ${sCount} service lines${people.length ? ` · ${people.length} people (masked)` : ""}`);

  // Duplicate check against Leon (and our own earlier imports). A Leon outage is not a pass.
  let duplicate = null;
  try { duplicate = await findDuplicates(review, reference, req.id); }
  catch (e) { duplicate = { error: `Could not check Leon for duplicates: ${String(e.message).slice(0, 160)}` }; }
  const tz = review.legs.some((l) => l.fields.some((f) => f.state === "tz_unknown"));
  const unreadableRequest = roles.some((r) => r.role === "unreadable") && !x.legs.length;
  let status = "needs_review", reason = "Awaiting review";
  if (duplicate && !duplicate.error) { status = "needs_you"; reason = `Awaiting review · stopped: possible duplicate of Leon ${duplicate.leonIds.join(", ") || duplicate.ours.map((o) => o.reference).join(", ")}`; setStage(stages, "Awaiting review", "hold", `Stopped before review: matches ${duplicate.leonIds.length ? `Leon flight${duplicate.leonIds.length === 1 ? "" : "s"} ${duplicate.leonIds.join(", ")}` : `request ${duplicate.ours.map((o) => o.reference).join(", ")}`}. Nothing has been sent to Leon.`); }
  else if (duplicate?.error) { status = "needs_you"; reason = "Awaiting review · duplicate check did not run"; setStage(stages, "Awaiting review", "wait", duplicate.error); }
  else if (tz) { status = "needs_you"; reason = "Awaiting review · timezone unknown"; setStage(stages, "Awaiting review", "wait", "Timezone unknown: someone must set it before anything can be sent."); }
  else setStage(stages, "Awaiting review", "wait", "Waiting for someone to check the values, choose the services and confirm.");

  const firstStd = review.legs.map((l) => l.fields.find((f) => f.key === "std")?.utc).filter(Boolean).sort()[0] ?? null;
  await patchRequest(req.id, { status, status_reason: reason, stages, review, attachment_roles: roles, current_extraction_id: ex?.id, reference, reference_built: built, duplicate, duplicate_resolution: null, route, registration: regs[0] ?? null, first_std: firstStd, legs_count: legsN });
  const lowN = review.legs.reduce((n, l) => n + l.fields.filter((f) => f.state === "low_confidence").length, 0);
  const checks = [
    ["Reference number", built ? "no" : "yes", built ? `None given; built ${reference} from the callsign and date` : reference],
    ["Schedule block", "yes", `${legsN} leg${legsN === 1 ? "" : "s"}: ${route}`],
    ["Registration", regs.length ? "yes" : "no", regs.join(", ") || "Not given"],
    ["Aircraft type", ff.aircraftType?.value ? "yes" : "no", ff.aircraftType?.value ? (() => { const said = String(ff.aircraftType.said ?? "").replace(/^(TYPE|ICAO|A\/C TYPE)\s*[:]?\s*/i, "").trim(); return said && said.toUpperCase() !== String(ff.aircraftType.value).toUpperCase() ? `${said} → ${ff.aircraftType.value}` : ff.aircraftType.value; })() : "Not given"],
    ["People", people.length ? "yes" : "none", people.length ? `${people.length} ${people.length === 1 ? "record" : "records"} with personal data (not shown)` : "No names in the request"],
    ["Services", sCount ? "yes" : "no", `${sCount} service line${sCount === 1 ? "" : "s"}`],
    ["Attachments", atts.length ? "yes" : "none", atts.length ? roles.map((r) => `${r.name}: ${r.role}`).join(" · ") : ""],
    ["Timezone", tz ? "no" : "yes", tz ? "Not stated anywhere" : "Stated"],
  ];
  await patchMessage(message.id, { status: "processed", status_reason: "Handling request", understood: { kind: "processed", title: "Read as a handling request", ref: reference, refState: reason, body: `${legsN} leg${legsN === 1 ? "" : "s"}, ${sCount} service lines${people.length ? `, ${people.length} people` : ""}.${lowN ? ` ${lowN} value${lowN === 1 ? "" : "s"} low confidence.` : ""}${tz ? " Times have no timezone, so the request is waiting for someone to set it." : ""}${duplicate && !duplicate.error ? " Stopped as a possible duplicate of flights already in Leon." : ""}`, checks }, search_text: search, has_personal_data: people.length > 0 || roles.some((r) => r.personal) });
  await audit({ kind: "intake.extracted", success: true, confirmationStatus: "not_required", detail: { requestId: req.id, messageId: message.id, version: prev + 1, model: model.modelId, legs: legsN, people: people.length, duplicate: !!(duplicate && !duplicate.error), tzUnknown: tz, actor: opts.actor?.email ?? null, requestAttachmentOverride: chosen ? chosen.id : null } }).catch(() => {});

  // Notification: review (E2), or needs-you variants. Recorded on the stage note; the last stage is post-send.
  const reqRow = { ...req, reference, sender_name: sender };
  const mail = duplicate && !duplicate.error
    ? composeStopped(reqRow, { title: "Needs you: possible duplicate", subject: "possible duplicate, nothing created in Leon", what: `The aircraft, route and times match ${duplicate.leonIds.length ? `Leon flight${duplicate.leonIds.length === 1 ? "" : "s"} ${duplicate.leonIds.join(", ")}` : `earlier request ${duplicate.ours.map((o) => o.reference).join(", ")}`}. The agent cannot change flights already in Leon. If this is a revision, update those flights in Leon by hand.`, stage: "Awaiting review, stage 4 of 11. Stopped before building the Leon request." })
    : composeReview(reqRow, review, { peopleLine: peopleLine(people, review), receivedAt: message.received_at });
  const sent = await sendIntakeEmail(reqRow, mail).catch((e) => ({ ok: false, error: e.message }));
  const aw = stages.find((s) => s.name === "Awaiting review"); aw.note = `${aw.note ?? ""} ${sent.ok ? `${mail.kind.split(" · ")[0]} email ${sent.mode === "capture" ? "captured (not sent)" : "sent"} to ${sent.to?.join(", ")}.` : `Email not sent: ${sent.error}`}`.trim();
  aw.email = sent.messageId ?? null;
  await patchRequest(req.id, { stages });
  return { requestId: req.id, status, reference, duplicate: !!duplicate, version: prev + 1 };
}
