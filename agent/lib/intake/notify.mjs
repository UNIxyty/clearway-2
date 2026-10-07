// Intake emails (§I12): E2 review needed, E3 loaded, E4 needs you (a/b, plus the stopped / timezone /
// could-not-read variants in E4b's structure; E4c "checklist incomplete" no longer exists: the agent sets no
// checklist status). Counts only — never a name, date of birth or passport number.
// Rule for Needs you subjects: they always say what is in Leon.
//
// Sent from the agent's own address through Resend, to the recipients set in Agent settings → Flight intake. Each send is stored
// as an outbound intake_messages row (the mailbox Sent tab), and Resend's delivery webhooks update it.
// INTAKE_MAIL_MODE=capture stores the rendered email without calling Resend (the rig uses this: a rig run
// must not send real mail); the row then says "Captured, not sent".
import { randomUUID } from "node:crypto";
import { renderAgentEmail, renderAgentEmailText } from "../email/template.mjs";
import { agentFrom } from "../email/send.mjs";
import { sendEmail as deliver } from "../../../digital-wall/lib/mailer.mjs";
import { rest } from "../knowledge/retrieval.mjs";
import { fmtDate } from "./review.mjs";
import { intakeSettings } from "./settings.mjs";
import { outcomeWords } from "./leon-people.mjs";

/** Who gets intake emails: Agent settings → Flight intake (falls back to INTAKE_NOTIFY_TO until saved there). */
export const notifyTo = async () => (await intakeSettings()).notifyTo;
export const consoleBase = () => String(process.env.AGENT_CONSOLE_URL || process.env.NEXT_PUBLIC_SITE_URL || "https://console.clearway.aero").replace(/\/+$/, "");
const hm = (iso) => (iso ? new Date(iso).toISOString().slice(11, 16) : "--:--");
const day = (iso) => (iso ? fmtDate(iso).slice(0, 6) : "");

function legRows(review, states = {}) {
  return review.legs.filter((l) => !l.removed).map((l) => {
    const f = Object.fromEntries(l.fields.map((x) => [x.key, x]));
    const s = states[l.index];
    return { n: l.index + 1, route: `${f.departure?.value || "????"} → ${f.arrival?.value || "????"}`, when: `${f.date?.value || "date not given"} · ${f.std?.utc ? hm(f.std.utc) : f.std?.value || "--:--"} → ${f.sta?.utc ? hm(f.sta.utc) : f.sta?.value || "--:--"} ${f.std?.state === "tz_unknown" ? "TZ ?" : "UTC"}`, state: s?.label ?? null, stateTone: s?.tone ?? null };
  });
}
const routeOf = (review) => { const legs = review.legs.filter((l) => !l.removed); const pts = []; for (const l of legs) { const f = Object.fromEntries(l.fields.map((x) => [x.key, x])); if (!pts.length) pts.push(f.departure?.value || "????"); pts.push(f.arrival?.value || "????"); } return pts.join(" → "); };
const datesOf = (review) => { const ds = review.legs.filter((l) => !l.removed).map((l) => l.fields.find((x) => x.key === "std")?.utc).filter(Boolean).sort(); if (!ds.length) return "dates not given"; const a = day(ds[0]), b = day(ds[ds.length - 1]); return a === b ? a : `${a.slice(0, 2)}–${b}`; };

/** The request page's line for a scheduled flight: the import is one-shot. Said on the page and in E3 alike. */
export const NOT_DETECTED = "Changes the provider makes to this flight after the import are not detected: the portal is read once, at import. Any later change must be noticed by a person.";
const scheduledOf = (req) => req.request_type === "scheduled";

export function composeReview(req, review, ctx) {
  const legs = review.legs.filter((l) => !l.removed);
  const sched = scheduledOf(req);
  const lines = legs.reduce((n, l) => n + l.services.filter((s) => !s.isNote).length, 0);
  const toConfirm = legs.reduce((n, l) => n + l.services.filter((s) => s.decision === "to_confirm").length, 0);
  const low = legs.reduce((n, l) => n + l.fields.filter((f) => f.state === "low_confidence").length, 0);
  const gaps = legs.reduce((n, l) => n + l.fields.filter((f) => f.required && (f.state === "not_given" || f.state === "invalid")).length, 0);
  const tz = legs.some((l) => l.fields.some((f) => f.state === "tz_unknown"));
  const f0 = Object.fromEntries((legs[0]?.fields ?? []).map((x) => [x.key, x]));
  const subject = `${tz ? "Needs you" : "Review"}: ${req.reference} · ${routeOf(review)} · ${datesOf(review)} · ${legs.length} leg${legs.length === 1 ? "" : "s"}${tz ? " · timezone unknown, nothing in Leon" : sched ? ` · ${gaps} to fill in` : `, ${lines} service lines`}`;
  const blocks = [
    { type: "heading", text: tz ? `A ${sched ? "scheduled flight" : "handling request"} needs you` : sched ? "A scheduled flight is ready to confirm" : "A handling request needs review" },
    { type: "mono", text: `${req.reference} · ${req.sender_name ?? ""}`.trim() },
    { type: "table", rows: [["Route", routeOf(review), true], ["Dates", datesOf(review), true], ["Legs", String(legs.length)], ["Aircraft", [f0.aircraftType?.value, f0.registration?.value].filter(Boolean).join(" · ") || "not given", true], ["Services", sched ? "none in the portal · choose them on the page" : `${lines} lines · ${toConfirm} ask us to confirm`], ["People", sched ? "crew count and passenger names are not in the portal" : ctx.peopleLine ?? "not given"]] },
    { type: "legs", title: `THE ${legs.length} LEG${legs.length === 1 ? "" : "S"} · TIMES IN UTC${sched ? " · ARRIVALS COMPUTED" : ""}`, rows: legRows(review) },
  ];
  if (tz) blocks.push({ type: "callout", tone: "red", title: "Timezone unknown.", text: `The times in the request have no timezone. Nothing can be sent until someone sets it.${ctx.tzLine ? ` ${ctx.tzLine}` : ""}` });
  else if (sched && gaps) blocks.push({ type: "callout", tone: "amber", title: `${gaps} value${gaps === 1 ? " is" : "s are"} not in the portal.`, text: "Crew count, passenger names, services and anything the agent could not map are blocking: fill them in on the page." });
  else if (low) blocks.push({ type: "callout", tone: "amber", title: `${low} value${low === 1 ? " needs" : "s need"} a look.`, text: "The agent marked them as low confidence." });
  blocks.push({ type: "section", title: "WHAT HAPPENS NEXT", text: sched ? "Come to Flight intake, check the values the agent read from the portal, fill the gaps, choose the services and confirm. Nothing is created in Leon until then." : "Nothing is created in Leon until someone checks this request on the page, chooses the services and confirms." });
  blocks.push({ type: "cta", text: sched ? "Open Flight intake and confirm" : "Review the request", url: `${consoleBase()}/agent/intake?r=${req.id}` });
  const context = sched ? `because ${review.approval?.answer?.by ?? "ops"} approved the processing of ${req.reference} and its record was read from the ${review.notification?.providerName ?? "provider"}'s portal. Nothing is in Leon yet.` : `because ${req.sender_name ?? "a dispatcher"} emailed the intake address at ${hm(ctx.receivedAt)}Z. Nothing is in Leon yet.`;
  return { kind: tz ? "E4 · Needs you" : sched ? "E1 · Ready to confirm" : "E2 · Needs review", subject, blocks, context };
}

// ── E1: the approval gate for a scheduled flight ────────────────────────────────────────────────────────────
const notifSummary = (req, review) => { const n = review.notification ?? {}; return { n, route: (n.route ?? []).join(" → ") || req.route || "route not given", legs: req.legs_count ?? Math.max(1, (n.route?.length ?? 2) - 1), when: n.date ?? "date not given", provider: n.providerName ?? "the provider" }; };
const notifRows = (req, review) => { const { n, route, legs, when, provider } = notifSummary(req, review); return [["Reference", req.reference, true], ["Provider", provider], ["Route", route, true], ["Date", when, true], ["Legs", String(legs)], ["Times in the invite", (n.etd ?? []).length ? `${n.etd.join(", ")} (local, as the provider wrote them — not used)` : "not given"], ["Received", `${hm(req.created_at)}Z · ${req.sender_name ?? "unknown sender"}`]]; };
const reSubject = (req, tail) => `Re: Process? ${req.reference} · ${tail}`;

/** E1 "Process?": what arrived, Yes / No, the reply path, and the deadline. One email per recipient (own links). */
export function composeProcess(req, review, { links, deadlineAt }) {
  const { route, legs, when } = notifSummary(req, review);
  return { kind: "E1 · Process?", subject: `Process? ${req.reference} · ${route} · ${when} · ${legs} leg${legs === 1 ? "" : "s"}`, context: `because a flight notification for ${req.reference} arrived at ${hm(req.created_at)}Z. Nothing has been read from the provider and nothing is in Leon.`, blocks: [
    { type: "heading", text: "Does this scheduled flight need processing?" }, { type: "mono", text: req.reference },
    { type: "table", rows: notifRows(req, review) },
    { type: "section", title: "WHAT HAPPENS ON YES", text: "The agent reads the flight's record from the provider's portal, shows it on Flight intake and emails you to come and confirm. Nothing goes to Leon without that confirmation." },
    { type: "section", title: "WHAT HAPPENS ON NO", text: "The request is closed on Flight intake. Nothing is read, nothing is created." },
    { type: "choice", options: [{ text: "Yes, process it", url: links.yes }, { text: "No, skip it", url: links.no }] },
    { type: "paragraph", text: "Or just reply yes or no." },
    { type: "callout", tone: "amber", title: `No answer by ${hm(deadlineAt)}Z ${day(deadlineAt) === day(req.created_at) ? "today" : `on ${day(deadlineAt)}`}:`, text: "nothing is created and the request closes. It stays on the intake page, where anyone can still process it." },
  ] };
}
/** E1a: a late or repeated answer; the first one stands. */
export function composeProcessAnswered(req, review, answered) {
  return { kind: "E1a · Already answered", subject: reSubject(req, "already answered"), context: `because another answer arrived for ${req.reference}.`, blocks: [
    { type: "heading", text: "This question was already answered" }, { type: "mono", text: req.reference },
    { type: "callout", tone: "green", title: `${answered.by} answered ${answered.value === "yes" ? "yes" : "no"} at ${hm(answered.at)}Z.`, text: "The first answer stands; this one changed nothing." },
    { type: "cta", text: "Open the request", url: `${consoleBase()}/agent/intake?r=${req.id}` },
  ] };
}
/** E1b: an answer after the deadline. */
export function composeProcessExpired(req, review) {
  return { kind: "E1b · Expired", subject: reSubject(req, "this request has expired"), context: `because an answer arrived for ${req.reference} after its deadline.`, blocks: [
    { type: "heading", text: "This request has expired" }, { type: "mono", text: req.reference },
    { type: "callout", tone: "amber", title: `No answer arrived by ${hm(review.approval?.deadlineAt)}Z, so the request was closed.`, text: "Nothing was created. It is still on the intake page, where anyone can process it." },
    { type: "cta", text: "Open the request", url: `${consoleBase()}/agent/intake?r=${req.id}` },
  ] };
}
/** E1c: a reply that was neither a yes nor a no. */
export function composeProcessUnclear(req, review, { quoted, links }) {
  return { kind: "E1c · Unclear", subject: reSubject(req, "was that a yes or a no?"), context: `because a reply arrived for ${req.reference} that the agent could not read as an answer.`, blocks: [
    { type: "heading", text: "Was that a yes or a no?" }, { type: "mono", text: req.reference },
    { type: "paragraph", text: `The reply began “${String(quoted ?? "").slice(0, 80)}”. The agent did nothing with it.` },
    { type: "choice", options: [{ text: "Yes, process it", url: links.yes }, { text: "No, skip it", url: links.no }] },
    { type: "paragraph", text: "Or reply again with just yes or no as the first line." },
    { type: "callout", tone: "amber", title: `The deadline is still ${hm(review.approval?.deadlineAt)}Z.`, text: "After it, nothing is created and the request closes; it can still be processed from the intake page." },
  ] };
}

/** After a send: E3 loaded, E4a partly, E4b nothing, E4c checklist incomplete. */
export function composeOutcome(req, review, outcome) {
  const legs = review.legs.filter((l) => !l.removed);
  const states = Object.fromEntries(outcome.legs.map((o) => [o.index, o.state === "in_leon" ? { label: `✓ In Leon · ${o.flightNid}`, tone: "ok" } : o.state === "unknown" ? { label: "? Unknown · checking", tone: "bad" } : { label: "✕ NOT in Leon", tone: "bad" }]));
  const inLeon = outcome.legs.filter((o) => o.state === "in_leon");
  const notIn = outcome.legs.filter((o) => o.state !== "in_leon");
  const unfilled = [];   // checklist statuses are never set by the agent (2026-10-03), so nothing can be "not filled"
  // Passengers and crew of each created leg: always stated, counts only. Crew are a note, never an assignment.
  const ppl = inLeon.flatMap((o) => (o.people ?? []).map((p) => ({ ...p, leg: o.index })));
  const pplFailed = ppl.filter((p) => p.state !== "in_leon" && p.state !== "none");
  const pplLegs = [...new Set(pplFailed.map((p) => p.leg + 1))];
  const pplWhat = [...new Set(pplFailed.map((p) => (p.kind === "pax" ? "passengers" : "crew")))].join(" and ");
  const pplBlock = ppl.length ? [{ type: "section", title: "PASSENGERS AND CREW", text: [...inLeon.map((o) => `Leg ${o.index + 1}: ${(o.people ?? []).map(outcomeWords).join(" ")}`),
    ppl.some((p) => p.kind === "crew" && p.state === "in_leon") ? "Crew were recorded as a note in each flight's OPS notes, as the operator's crew per the request. They are NOT assigned in Leon: Leon assigns crew only from its own crew records, and the agent creates none." : null].filter(Boolean).join("\n") }] : [];
  const who = `${outcome.by} confirmed this request at ${hm(outcome.at)}Z.`;
  const legsBlock = { type: "legs", title: "EVERY LEG · TIMES IN UTC", rows: legRows(review, states) };
  const cta = { type: "cta", text: "Open the request", url: `${consoleBase()}/agent/intake?r=${req.id}` };
  // A scheduled flight was imported once: the completion email says so, as the request page does.
  const oneShot = scheduledOf(req) ? [{ type: "section", title: "AFTER IMPORT", text: NOT_DETECTED }] : [];
  if (!notIn.length && !unfilled.length && !pplFailed.length) {
    // Services are NOT claimed as requested or arranged: they sit in the flight's OPS notes, unactioned, for ops.
    return { kind: "E3 · Loaded", subject: `Loaded: ${req.reference} · ${inLeon.length} flight${inLeon.length === 1 ? "" : "s"} in Leon · checklist left to ops`, context: `. ${who}`, blocks: [
      { type: "heading", text: `Loaded into Leon: ${inLeon.length} flight${inLeon.length === 1 ? "" : "s"}` }, { type: "mono", text: `${req.reference} · ${req.sender_name ?? ""}`.trim() },
      { type: "callout", tone: "green", title: `${inLeon.length === 1 ? "The leg is" : inLeon.length === 2 ? "Both legs are" : `All ${inLeon.length} legs are`} in Leon.`, text: `Created at ${hm(outcome.at)}Z. Check them against the list below.` },
      legsBlock,
      ...pplBlock,
      { type: "section", title: "SERVICES AND CHECKLIST", text: "The client's request is recorded in each flight's OPS notes in Leon, in the requester's own words with the review decisions, marked NOT ACTIONED: nothing has been arranged, ordered or confirmed. No checklist status was set; every item is at Leon's default (?) for ops to work through." },
      ...oneShot,
      cta,
    ] };
  }
  if (!notIn.length) {
    // Every flight is in Leon; some passengers or crew are not. The subject says both.
    return { kind: "E4 · Needs you", subject: `Needs you: ${req.reference} · ${inLeon.length} flight${inLeon.length === 1 ? "" : "s"} in Leon · ${pplWhat} NOT in Leon for leg ${pplLegs.join(", ")}`, context: `. ${who}`, blocks: [
      { type: "heading", text: `Needs you: ${pplWhat} not in Leon` }, { type: "mono", text: req.reference },
      { type: "callout", tone: "red", title: `The ${pplWhat} of leg ${pplLegs.join(", ")} are NOT in Leon.`, text: `${inLeon.length === 1 ? "The flight is" : `All ${inLeon.length} flights are`} in Leon.` },
      legsBlock, ...pplBlock,
      { type: "section", title: "WHAT WENT WRONG", text: pplFailed.map((p) => `Leg ${p.leg + 1}: ${outcomeWords(p)}`).join(" ") },
      { type: "section", title: "HOW FAR IT GOT", text: "Passengers and crew, stage 9 of 12. The flights were created." },
      { type: "section", title: "WHAT TO DO", text: "Open the request to see what Leon said. Add the missing passengers or crew to the flight in Leon by hand; the request has their details." }, ...oneShot, cta,
    ] };
  }
  const nothing = !inLeon.length;
  const wrong = notIn.map((o) => `Leg ${o.index + 1}: ${o.state === "unknown" ? "Leon did not answer, so the agent does not know whether this leg exists in Leon. Check Leon before resending." : `Leon refused it. ${o.error}`}`).join(" ");
  return { kind: "E4 · Needs you", subject: nothing ? `Needs you: ${req.reference} · nothing created in Leon` : `Needs you: ${req.reference} · ${inLeon.length} of ${outcome.legs.length} legs in Leon, ${notIn.length === 1 ? `leg ${notIn[0].index + 1} is not` : `legs ${notIn.map((o) => o.index + 1).join(", ")} are not`}`, context: `. ${who}`, blocks: [
    { type: "heading", text: nothing ? "Needs you: nothing loaded" : `Needs you: ${inLeon.length} of ${outcome.legs.length} legs loaded` }, { type: "mono", text: req.reference },
    { type: "callout", tone: "red", title: nothing ? "Nothing was created in Leon." : `${notIn.length === 1 ? `Leg ${notIn[0].index + 1} is` : `Legs ${notIn.map((o) => o.index + 1).join(", ")} are`} NOT in Leon.`, text: nothing ? "No leg below is in Leon." : `${inLeon.map((o) => `Leg ${o.index + 1}`).join(", ")} ${inLeon.length === 1 ? "is" : "are"} in Leon.` },
    legsBlock, ...pplBlock,
    { type: "section", title: "WHAT WENT WRONG", text: [wrong, ...pplFailed.map((p) => `Leg ${p.leg + 1}: ${outcomeWords(p)}`)].join(" ") },
    { type: "section", title: "HOW FAR IT GOT", text: "Sent to Leon, stage 8 of 12." },
    { type: "section", title: "WHAT TO DO", text: "Open the request. You can correct the leg and resend it, or create it in Leon yourself and mark it handled." }, ...oneShot, cta,
  ] };
}

/** A pipeline failure before anything was sent (duplicate stop, could not read, portal down). E4b structure. */
export function composeStopped(req, { title, subject, what, stage }) {
  const context = scheduledOf(req) ? `because the processing of flight notification ${req.reference} was approved. Nothing has been sent to Leon.` : `because ${req.sender_name ?? "a dispatcher"} emailed the intake address. Nothing has been sent to Leon.`;
  return { kind: "E4 · Needs you", subject: `Needs you: ${req.reference} · ${subject}`, context, blocks: [
    { type: "heading", text: title }, { type: "mono", text: req.reference },
    { type: "callout", tone: "red", title: "Nothing has been sent to Leon.", text: "" },
    { type: "section", title: "WHAT WENT WRONG", text: what }, { type: "section", title: "HOW FAR IT GOT", text: stage },
    { type: "cta", text: "Open the request", url: `${consoleBase()}/agent/intake?r=${req.id}` },
  ] };
}

/**
 * Renders, sends (or captures) and records one intake email. Returns { ok, messageId, providerId, mode, error }.
 * `to` overrides the configured recipients (E1 goes out once per recipient, each with their own answer links).
 * The plain-text part always goes along: it carries the same URLs as the buttons.
 */
export async function sendIntakeEmail(req, mail, { to: only } = {}) {
  const to = only ?? (await notifyTo());
  const footer = `intake ${req.reference}`;
  const html = renderAgentEmail({ subject: mail.subject, tag: "FLIGHT INTAKE", context: mail.context, blocks: mail.blocks, reference: footer });
  const text = renderAgentEmailText({ subject: mail.subject, context: mail.context, blocks: mail.blocks, reference: footer });
  const mode = String(process.env.INTAKE_MAIL_MODE || "").trim() === "capture" ? "capture" : "send";
  if (!to.length && mode === "send") return { ok: false, error: "No notification address is set (Agent settings → Flight intake).", mode: "skipped" };
  let providerId = null, error = null;
  if (mode === "send") { const r = await deliver({ to, from: agentFrom(), subject: mail.subject, html, text }); providerId = r.id ?? null; if (!r.ok) error = r.error; }
  const rows = await rest("intake_messages", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify([{
    provider: mode === "capture" ? "capture" : "resend", provider_message_id: providerId ?? `${mode}-${randomUUID()}`, direction: "outbound", received_at: new Date().toISOString(),
    from_addr: agentFrom(), to_addrs: to.length ? to : ["(no address set)"], subject: mail.subject, status: "sent", status_reason: mail.kind, sent_kind: mail.kind, sent_html: html,
    delivery_status: error ? "failed" : mode === "capture" ? "captured" : "sent", delivery_detail: error ? { error } : { text: text.slice(0, 4000) },
    delivery_events: [{ event: error ? "Failed" : mode === "capture" ? "Captured" : "Queued", at: new Date().toISOString(), detail: error ?? (mode === "capture" ? "INTAKE_MAIL_MODE=capture: stored, not sent" : null) }],
    request_id: req.id, fetch_status: "stored", search_text: `${mail.subject}\n${to.join(" ")}\n${req.reference}`,
  }]) }).catch((e) => { error = error ?? `send log: ${e.message}`; return []; });
  return { ok: !error, messageId: rows?.[0]?.id ?? null, providerId, mode, error, kind: mail.kind, to };
}
