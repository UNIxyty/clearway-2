// Intake emails (§I12): E2 review needed, E3 loaded, E4 needs you (a/b/c, plus the stopped / timezone /
// could-not-read variants in E4b's structure). Counts only — never a name, date of birth or passport number.
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

/** Who gets intake emails: Agent settings → Flight intake (falls back to INTAKE_NOTIFY_TO until saved there). */
export const notifyTo = async () => (await intakeSettings()).notifyTo;
const consoleBase = () => String(process.env.AGENT_CONSOLE_URL || process.env.NEXT_PUBLIC_SITE_URL || "https://console.clearway.aero").replace(/\/+$/, "");
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

export function composeReview(req, review, ctx) {
  const legs = review.legs.filter((l) => !l.removed);
  const lines = legs.reduce((n, l) => n + l.services.filter((s) => !s.isNote).length, 0);
  const toConfirm = legs.reduce((n, l) => n + l.services.filter((s) => s.decision === "to_confirm").length, 0);
  const low = legs.reduce((n, l) => n + l.fields.filter((f) => f.state === "low_confidence").length, 0);
  const tz = legs.some((l) => l.fields.some((f) => f.state === "tz_unknown"));
  const f0 = Object.fromEntries((legs[0]?.fields ?? []).map((x) => [x.key, x]));
  const subject = `${tz ? "Needs you" : "Review"}: ${req.reference} · ${routeOf(review)} · ${datesOf(review)} · ${legs.length} leg${legs.length === 1 ? "" : "s"}${tz ? " · timezone unknown, nothing in Leon" : `, ${lines} service lines`}`;
  const blocks = [
    { type: "heading", text: tz ? "A handling request needs you" : "A handling request needs review" },
    { type: "mono", text: `${req.reference} · ${req.sender_name ?? ""}`.trim() },
    { type: "table", rows: [["Route", routeOf(review), true], ["Dates", datesOf(review), true], ["Legs", String(legs.length)], ["Aircraft", [f0.aircraftType?.value, f0.registration?.value].filter(Boolean).join(" · ") || "not given", true], ["Services", `${lines} lines · ${toConfirm} ask us to confirm`], ["People", ctx.peopleLine ?? "not given"]] },
    { type: "legs", title: `THE ${legs.length} LEG${legs.length === 1 ? "" : "S"} · TIMES IN UTC`, rows: legRows(review) },
  ];
  if (tz) blocks.push({ type: "callout", tone: "red", title: "Timezone unknown.", text: `The times in the request have no timezone. Nothing can be sent until someone sets it.${ctx.tzLine ? ` ${ctx.tzLine}` : ""}` });
  else if (low) blocks.push({ type: "callout", tone: "amber", title: `${low} value${low === 1 ? " needs" : "s need"} a look.`, text: "The agent marked them as low confidence." });
  blocks.push({ type: "section", title: "WHAT HAPPENS NEXT", text: "Nothing is created in Leon until someone checks this request on the page, chooses the services and confirms." });
  blocks.push({ type: "cta", text: "Review the request", url: `${consoleBase()}/agent/intake?r=${req.id}` });
  return { kind: tz ? "E4 · Needs you" : "E2 · Needs review", subject, blocks, context: `because ${req.sender_name ?? "a dispatcher"} emailed the intake address at ${hm(ctx.receivedAt)}Z. Nothing is in Leon yet.` };
}

/** After a send: E3 loaded, E4a partly, E4b nothing, E4c checklist incomplete. */
export function composeOutcome(req, review, outcome) {
  const legs = review.legs.filter((l) => !l.removed);
  const states = Object.fromEntries(outcome.legs.map((o) => [o.index, o.state === "in_leon" ? { label: `✓ In Leon · ${o.flightNid}`, tone: "ok" } : o.state === "unknown" ? { label: "? Unknown · checking", tone: "bad" } : { label: "✕ NOT in Leon", tone: "bad" }]));
  const inLeon = outcome.legs.filter((o) => o.state === "in_leon");
  const notIn = outcome.legs.filter((o) => o.state !== "in_leon");
  const chk = outcome.checklist; const unfilled = chk.items.filter((i) => !i.filled);
  const who = `${outcome.by} confirmed this request at ${hm(outcome.at)}Z.`;
  const legsBlock = { type: "legs", title: "EVERY LEG · TIMES IN UTC", rows: legRows(review, states) };
  const cta = { type: "cta", text: "Open the request", url: `${consoleBase()}/agent/intake?r=${req.id}` };
  if (!notIn.length && !unfilled.length) {
    const accepted = legs.map((l) => { const ok = l.services.filter((s) => s.decision === "provide").map((s) => s.name); return ok.length ? `Leg ${l.index + 1}: ${ok.join(", ")}.` : null; }).filter(Boolean).join(" ");
    const tc = legs.flatMap((l) => l.services.filter((s) => s.decision === "to_confirm").map((s) => `${s.name} on leg ${l.index + 1}`));
    const dec = legs.flatMap((l) => l.services.filter((s) => s.decision === "decline").map((s) => `${s.name} on leg ${l.index + 1}`));
    return { kind: "E3 · Loaded", subject: `Loaded: ${req.reference} · ${inLeon.length} flight${inLeon.length === 1 ? "" : "s"} in Leon · checklist complete`, context: `. ${who}`, blocks: [
      { type: "heading", text: `Loaded into Leon: ${inLeon.length} flight${inLeon.length === 1 ? "" : "s"}` }, { type: "mono", text: `${req.reference} · ${req.sender_name ?? ""}`.trim() },
      { type: "callout", tone: "green", title: `${inLeon.length === 1 ? "The leg is" : inLeon.length === 2 ? "Both legs are" : `All ${inLeon.length} legs are`} in Leon. Checklist: ${chk.items.length} of ${chk.items.length} items filled.`, text: `Created at ${hm(outcome.at)}Z. Check them against the list below.` },
      legsBlock,
      { type: "section", title: "SERVICES ACCEPTED", text: [accepted, tc.length ? `To confirm: ${tc.join(", ")}.` : null, dec.length ? `Declined: ${dec.join(", ")}.` : null].filter(Boolean).join(" ") || "None." },
      cta,
    ] };
  }
  if (!notIn.length && unfilled.length) {
    return { kind: "E4 · Needs you", subject: `Needs you: ${req.reference} · ${inLeon.length === 2 ? "both flights" : `${inLeon.length} flight${inLeon.length === 1 ? "" : "s"}`} in Leon, ${unfilled.length} checklist item${unfilled.length === 1 ? "" : "s"} not filled`, context: `. ${who}`, blocks: [
      { type: "heading", text: "Needs you: checklist incomplete" }, { type: "mono", text: req.reference },
      { type: "callout", tone: "red", title: `${inLeon.length === 2 ? "Both flights are" : "The flights are"} in Leon. ${unfilled.length} checklist item${unfilled.length === 1 ? " is" : "s are"} not filled.`, text: "The flights exist and are correct. Only the checklist needs finishing." },
      legsBlock,
      { type: "section", title: "NOT FILLED", text: unfilled.map((i) => `Leg ${i.leg + 1} · ${i.label}: ${i.reason}`).join(" · ") },
      { type: "section", title: "HOW FAR IT GOT", text: "Filling checklist, stage 9 of 11." },
      { type: "section", title: "WHAT TO DO", text: "Retry the items from the request page, or fill them in Leon." }, cta,
    ] };
  }
  const nothing = !inLeon.length;
  const wrong = notIn.map((o) => `Leg ${o.index + 1}: ${o.state === "unknown" ? "Leon did not answer, so the agent does not know whether this leg exists in Leon. Check Leon before resending." : `Leon refused it. ${o.error}`}`).join(" ");
  return { kind: "E4 · Needs you", subject: nothing ? `Needs you: ${req.reference} · nothing created in Leon` : `Needs you: ${req.reference} · ${inLeon.length} of ${outcome.legs.length} legs in Leon, ${notIn.length === 1 ? `leg ${notIn[0].index + 1} is not` : `legs ${notIn.map((o) => o.index + 1).join(", ")} are not`}`, context: `. ${who}`, blocks: [
    { type: "heading", text: nothing ? "Needs you: nothing loaded" : `Needs you: ${inLeon.length} of ${outcome.legs.length} legs loaded` }, { type: "mono", text: req.reference },
    { type: "callout", tone: "red", title: nothing ? "Nothing was created in Leon." : `${notIn.length === 1 ? `Leg ${notIn[0].index + 1} is` : `Legs ${notIn.map((o) => o.index + 1).join(", ")} are`} NOT in Leon.`, text: nothing ? "No leg below is in Leon." : `${inLeon.map((o) => `Leg ${o.index + 1}`).join(", ")} ${inLeon.length === 1 ? "is" : "are"} in Leon.` },
    legsBlock,
    { type: "section", title: "WHAT WENT WRONG", text: wrong },
    { type: "section", title: "HOW FAR IT GOT", text: "Sent to Leon, stage 8 of 11." },
    { type: "section", title: "WHAT TO DO", text: "Open the request. You can correct the leg and resend it, or create it in Leon yourself and mark it handled." }, cta,
  ] };
}

/** A pipeline failure before anything was sent (duplicate stop, could not read). E4b structure. */
export function composeStopped(req, { title, subject, what, stage }) {
  return { kind: "E4 · Needs you", subject: `Needs you: ${req.reference} · ${subject}`, context: `because ${req.sender_name ?? "a dispatcher"} emailed the intake address. Nothing has been sent to Leon.`, blocks: [
    { type: "heading", text: title }, { type: "mono", text: req.reference },
    { type: "callout", tone: "red", title: "Nothing has been sent to Leon.", text: "" },
    { type: "section", title: "WHAT WENT WRONG", text: what }, { type: "section", title: "HOW FAR IT GOT", text: stage },
    { type: "cta", text: "Open the request", url: `${consoleBase()}/agent/intake?r=${req.id}` },
  ] };
}

/** Renders, sends (or captures) and records one intake email. Returns { ok, messageId, providerId, mode, error }. */
export async function sendIntakeEmail(req, mail) {
  const to = await notifyTo();
  const footer = `intake ${req.reference}`;
  const html = renderAgentEmail({ subject: mail.subject, tag: "FLIGHT INTAKE", context: mail.context, blocks: mail.blocks, reference: footer });
  const text = renderAgentEmailText({ subject: mail.subject, context: mail.context, blocks: mail.blocks, reference: footer });
  const mode = String(process.env.INTAKE_MAIL_MODE || "").trim() === "capture" ? "capture" : "send";
  if (!to.length && mode === "send") return { ok: false, error: "No notification address is set (Agent settings → Flight intake).", mode: "skipped" };
  let providerId = null, error = null;
  if (mode === "send") { const r = await deliver({ to, from: agentFrom(), subject: mail.subject, html }); providerId = r.id ?? null; if (!r.ok) error = r.error; }
  const rows = await rest("intake_messages", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify([{
    provider: mode === "capture" ? "capture" : "resend", provider_message_id: providerId ?? `${mode}-${randomUUID()}`, direction: "outbound", received_at: new Date().toISOString(),
    from_addr: agentFrom(), to_addrs: to.length ? to : ["(no address set)"], subject: mail.subject, status: "sent", status_reason: mail.kind, sent_kind: mail.kind, sent_html: html,
    delivery_status: error ? "failed" : mode === "capture" ? "captured" : "sent", delivery_detail: error ? { error } : { text: text.slice(0, 4000) },
    delivery_events: [{ event: error ? "Failed" : mode === "capture" ? "Captured" : "Queued", at: new Date().toISOString(), detail: error ?? (mode === "capture" ? "INTAKE_MAIL_MODE=capture: stored, not sent" : null) }],
    request_id: req.id, fetch_status: "stored", search_text: `${mail.subject}\n${to.join(" ")}\n${req.reference}`,
  }]) }).catch((e) => { error = error ?? `send log: ${e.message}`; return []; });
  return { ok: !error, messageId: rows?.[0]?.id ?? null, providerId, mode, error, kind: mail.kind, to };
}
