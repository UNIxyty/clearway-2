// Every email the platform sends has one live status (2026-10-26): the mailer records an outbound row in
// intake_messages when the send names its record, the Resend webhook turns that row's status into Delivered / Bounced /
// Delayed, and the agent serves it at /api/email/status for the card. On the RIG: the mock Resend (:3996), the agent
// (:5175), a signed webhook event like Resend's.
//   node --env-file=.env.rig rig/email-status-check.mjs
import { createHmac, randomUUID } from "node:crypto";
if (!/127\.0\.0\.1|localhost/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "")) { console.error("rig only (local DB)"); process.exit(78); }
const AGENT = process.env.RIG_AGENT_URL || "http://127.0.0.1:5175";
let failures = 0;
const ok = (c, what, d = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${what}${d ? `  · ${String(d).slice(0, 240)}` : ""}`); if (!c) failures += 1; };
const db = async (p) => (await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${p}`, { headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` } })).json();
const { sendEmail } = await import("../digital-wall/lib/mailer.mjs");
process.env.RESEND_BASE_URL = process.env.RESEND_API_BASE || "http://127.0.0.1:3996";

console.log("\n=== 1. A send the mail service accepts: a row, status 'sent' (accepted), the card can read it ===");
const r1 = await sendEmail({ to: ["handler@example.invalid"], subject: `rig email status ${randomUUID().slice(0, 8)}`, html: "<p>rig</p>", text: "rig", record: { kind: "agent-email", by: "rig-access-user@rig.invalid", ref: "RIG-1" } });
ok(r1.ok === true && !!r1.id && /^[0-9a-f-]{36}$/.test(String(r1.recordId)), "the mailer answers ok with the provider id and the record id", JSON.stringify({ ok: r1.ok, hasId: !!r1.id, recordId: r1.recordId }));
let row = (await db(`intake_messages?select=direction,provider,provider_message_id,sent_kind,delivery_status,delivery_events,delivery_detail,sent_html,to_addrs&id=eq.${r1.recordId}`))[0];
ok(row?.direction === "outbound" && row.provider === "resend" && row.provider_message_id === r1.id && row.sent_kind === "agent-email" && row.delivery_status === "sent" && row.delivery_events?.[0]?.event === "Queued" && row.sent_html === null, "the row: outbound, the provider's id, the kind, 'sent' with a Queued event, no body stored", JSON.stringify({ ...row, delivery_events: undefined }));
let st = await (await fetch(`${AGENT}/api/email/status?id=${r1.recordId}`)).json();
ok(st.ok && st.status === "sent" && st.final === false && st.to?.[0] === "handler@example.invalid" && !("sent_html" in st), "the agent's status route says sent (accepted), not final, with the recipient", JSON.stringify(st).slice(0, 200));

console.log("\n=== 2. The mail service's later word arrives by webhook and the status follows ===");
async function event(type, emailId, extra = {}) {
  const body = JSON.stringify({ type, created_at: new Date().toISOString(), data: { email_id: emailId, created_at: new Date().toISOString(), ...extra } });
  const svixId = `msg_${randomUUID()}`, ts = String(Math.floor(Date.now() / 1000));
  const sig = createHmac("sha256", Buffer.from(process.env.RESEND_WEBHOOK_SECRET.replace(/^whsec_/, ""), "base64")).update(`${svixId}.${ts}.${body}`).digest("base64");
  const r = await fetch(`${AGENT}/api/intake/resend-webhook`, { method: "POST", headers: { "content-type": "application/json", "svix-id": svixId, "svix-timestamp": ts, "svix-signature": `v1,${sig}` }, body });
  return (await r.json()).outcome;
}
ok((await event("email.delivery_delayed", r1.id)) === "delivery_event", "a delay event is taken");
st = await (await fetch(`${AGENT}/api/email/status?id=${r1.recordId}`)).json();
ok(st.status === "delivery_delayed" && st.final === false, "…status: delayed, still not final", st.status);
ok((await event("email.delivered", r1.id)) === "delivery_event", "a delivered event is taken");
st = await (await fetch(`${AGENT}/api/email/status?id=${r1.recordId}`)).json();
ok(st.status === "delivered" && st.final === true && st.events.map((e) => e.event).join(",") === "Queued,Delayed,Delivered", "…status: delivered, final, with the three events in order", st.events?.map((e) => e.event).join(","));

console.log("\n=== 3. A bounce is final and says why ===");
const r3 = await sendEmail({ to: ["nobody@bounce.invalid"], subject: "rig bounce", html: "<p>rig</p>", record: { kind: "aip-send", ref: "RIG777" } });
await event("email.bounced", r3.id, { bounce: { type: "Permanent", subType: "General", message: "The recipient address does not exist" } });
st = await (await fetch(`${AGENT}/api/email/status?id=${r3.recordId}`)).json();
ok(st.status === "bounced" && st.final === true && /does not exist/.test(st.bounce?.message ?? ""), "bounced, final, with the mail service's reason", JSON.stringify(st.bounce));

console.log("\n=== 4. A send the mail service refuses: the row says failed from the start ===");
const saved = process.env.RESEND_BASE_URL; process.env.RESEND_BASE_URL = "http://127.0.0.1:9"; // nothing listens
const r4 = await sendEmail({ to: ["handler@example.invalid"], subject: "rig refused", html: "<p>rig</p>", record: { kind: "agent-email" } });
process.env.RESEND_BASE_URL = saved;
row = (await db(`intake_messages?select=delivery_status,delivery_events,delivery_detail&id=eq.${r4.recordId}`))[0];
ok(r4.ok === false && !!r4.recordId && row?.delivery_status === "failed" && row.delivery_events?.[0]?.event === "Failed" && !!row.delivery_detail?.error, "the mailer answers not ok, and the row is 'failed' with a Failed event and the reason", JSON.stringify({ ok: r4.ok, status: row?.delivery_status }));
st = await (await fetch(`${AGENT}/api/email/status?id=${r4.recordId}`)).json();
ok(st.status === "failed" && st.final === true && !!st.error, "the status route: failed, final, with the error", st.error?.slice(0, 80));

console.log("\n=== 5. No record asked for, no row; bad ids refused ===");
const before = (await db("intake_messages?select=id&direction=eq.outbound")).length;
await sendEmail({ to: ["handler@example.invalid"], subject: "rig unrecorded", html: "<p>rig</p>" });
ok((await db("intake_messages?select=id&direction=eq.outbound")).length === before, "a send without a record adds no row (the intake's own emails record themselves)");
ok((await fetch(`${AGENT}/api/email/status?id=not-an-id`)).status === 400 && (await fetch(`${AGENT}/api/email/status?id=${randomUUID()}`)).status === 404, "a malformed id is 400, an unknown one 404");

console.log(`\n${failures ? `${failures} FAILED` : "ALL PASSED"}`);
process.exit(failures ? 1 : 0);
