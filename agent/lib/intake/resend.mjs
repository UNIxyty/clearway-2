// Resend inbound → the agent mailbox.
//
// Resend delivers by webhook (Svix-signed). The webhook carries metadata only; the message itself is fetched
// from the Received Emails API, and the raw .eml from its signed download URL (which expires, so it is fetched
// straight away and stored — the raw MIME is what settles any dispute about what arrived).
//
// Rules:
//  - An unverified payload is rejected with 401 and nothing is stored. Not logged-and-processed-anyway.
//  - Idempotent twice over: on the Svix message id (a Resend retry reuses it) and on Resend's email_id
//    (unique per message). A retry never creates a second message, request or Leon flight.
//  - The request row is unique per message, so extraction can be re-run without a second request.
//  - Delivery events for mail WE sent (delivered / delayed / bounced / complained / failed) are recorded for
//    the Sent tab — a bounce is how a missing reply is explained.
import { createHmac, timingSafeEqual } from "node:crypto";
import { simpleParser } from "mailparser";
import { rest } from "../knowledge/retrieval.mjs";
import { putContent, putRaw, sniff } from "./blobstore.mjs";
import { enqueue } from "./pipeline.mjs";

const TOLERANCE_S = 5 * 60;

/** Svix verification: HMAC-SHA256 of `${id}.${timestamp}.${body}` with the base64 secret after "whsec_". */
export function verifySvix({ id, timestamp, signature, body, secret }) {
  if (!secret) return { ok: false, reason: "no webhook secret configured" };
  if (!id || !timestamp || !signature) return { ok: false, reason: "missing svix headers" };
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > TOLERANCE_S) return { ok: false, reason: "timestamp outside tolerance" };
  const key = Buffer.from(String(secret).replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest();
  for (const part of String(signature).split(" ")) {
    const [ver, sig] = part.split(",");
    if (ver !== "v1" || !sig) continue;
    const got = Buffer.from(sig, "base64");
    if (got.length === expected.length && timingSafeEqual(got, expected)) return { ok: true };
  }
  return { ok: false, reason: "signature mismatch" };
}

const resendKey = () => String(process.env.RESEND_API_KEY || "").trim();
// The rig points this at a local mock of the Resend API (rig/intake/mock-resend.mjs). Production leaves it unset.
const resendBase = () => String(process.env.RESEND_API_BASE || "https://api.resend.com").replace(/\/+$/, "");
async function resendGet(p) {
  const r = await fetch(`${resendBase()}${p}`, { headers: { authorization: `Bearer ${resendKey()}` }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`Resend GET ${p.replace(/[0-9a-f-]{36}/g, "<id>")} → HTTP ${r.status}`);
  return r.json();
}

/**
 * Handles one verified webhook event. Returns what happened, for the audit line. Never throws on a duplicate.
 * `svixId` is the delivery id; `event` the parsed body.
 */
export async function handleEvent({ svixId, event, audit }) {
  const type = String(event?.type || "");
  const data = event?.data || {};
  const emailId = data.email_id ? String(data.email_id) : null;
  // 1. Delivery-level idempotency: a replayed Svix message is a no-op.
  const inserted = await rest("intake_events?on_conflict=svix_id", {
    method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
    body: JSON.stringify([{ svix_id: svixId, event_type: type, provider_message_id: emailId, occurred_at: event?.created_at || null, detail: { to: Array.isArray(data.to) ? data.to.length : 0 } }]),
  });
  if (Array.isArray(inserted) && inserted.length === 0) return { outcome: "duplicate_delivery", type, emailId };

  if (type === "email.received" && emailId) return receive(emailId, data, audit);
  if (/^email\.(sent|delivered|delivery_delayed|bounced|complained|failed|suppressed)$/.test(type) && emailId) {
    await rest(`intake_messages?provider=eq.resend&provider_message_id=eq.${encodeURIComponent(emailId)}&direction=eq.outbound`, {
      method: "PATCH", body: JSON.stringify({ delivery_status: type.slice(6), delivery_detail: { at: event.created_at ?? null, bounce: data.bounce ? { type: data.bounce.type ?? null, subType: data.bounce.subType ?? null, message: data.bounce.message ?? null } : null } }),
    }).catch(() => null);
    // The Sent reader's delivery table: one row per Resend event, appended.
    const row = (await rest(`intake_messages?select=id,delivery_events&provider=eq.resend&provider_message_id=eq.${encodeURIComponent(emailId)}&direction=eq.outbound`).catch(() => []))?.[0];
    if (row) await rest(`intake_messages?id=eq.${row.id}`, { method: "PATCH", body: JSON.stringify({ delivery_events: [...(row.delivery_events ?? []), { event: { sent: "Sent", delivered: "Delivered", delivery_delayed: "Delayed", bounced: "Bounced", complained: "Marked as spam", failed: "Failed", suppressed: "Suppressed" }[type.slice(6)] ?? type, at: event.created_at ?? new Date().toISOString(), detail: data.bounce?.message ?? null }] }) }).catch(() => null);
    return { outcome: "delivery_event", type, emailId };
  }
  return { outcome: "ignored", type, emailId };
}

async function receive(emailId, data, audit) {
  const receivedAt = data.created_at || new Date().toISOString();
  // 2. Message-level idempotency: the (provider, email_id) pair is unique.
  const rows = await rest("intake_messages?on_conflict=provider,provider_message_id", {
    method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
    body: JSON.stringify([{ provider: "resend", provider_message_id: emailId, rfc_message_id: data.message_id ?? null, direction: "inbound", received_at: receivedAt, from_addr: data.from ?? null, to_addrs: Array.isArray(data.to) ? data.to : [], subject: data.subject ?? null }]),
  });
  if (!Array.isArray(rows) || rows.length === 0) return { outcome: "duplicate_message", emailId };
  const message = rows[0];
  const stored = await fetchAndStore(message).catch(async (e) => {
    await rest(`intake_messages?id=eq.${message.id}`, { method: "PATCH", body: JSON.stringify({ fetch_status: "failed", fetch_error: String(e.message).slice(0, 300), status: "failed", status_reason: "Could not fetch the message from Resend", understood: { kind: "failed", title: "Failed: the message could not be fetched from Resend", body: `Only the envelope arrived. ${String(e.message).slice(0, 160)}`, checks: [] } }) }).catch(() => null);
    return { error: String(e.message) };
  });
  // 3. Reading happens off the response path; one request per message is enforced there (unique key).
  if (!stored?.error) enqueue(message.id);
  await audit?.({ kind: "intake.received", success: !stored?.error, detail: { messageId: message.id, attachments: stored?.attachments ?? 0, rawBytes: stored?.rawBytes ?? null } });
  return { outcome: stored?.error ? "stored_metadata_only" : "received", messageId: message.id };
}

/** Fetches the full message and its raw .eml, stores both, records attachments. Re-runnable (fresh signed URL). */
export async function fetchAndStore(message) {
  const full = await resendGet(`/emails/receiving/${encodeURIComponent(message.provider_message_id)}`);
  const url = full?.raw?.download_url;
  if (!url) throw new Error("Resend returned no raw download URL");
  const r = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!r.ok) throw new Error(`raw download → HTTP ${r.status}`);
  const raw = Buffer.from(await r.arrayBuffer());
  const put = await putRaw(message.id, message.received_at, raw);
  const attachments = await storeAttachmentsFromRaw(message.id, raw);
  await rest(`intake_messages?id=eq.${message.id}`, {
    method: "PATCH", body: JSON.stringify({ raw_key: put.key, raw_sha256: put.sha256, raw_bytes: put.bytes, fetch_status: "stored", fetch_error: null,
      auth: full.authentication ?? null, cc_addrs: Array.isArray(full.cc) ? full.cc : [], rfc_message_id: full.message_id ?? message.rfc_message_id ?? null, status: "waiting" }),
  });
  return { rawBytes: put.bytes, attachments };
}

/** Attachments come from the raw MIME itself (the thing we keep), not from a second listing that could differ. */
export async function storeAttachmentsFromRaw(messageId, raw) {
  const parsed = await simpleParser(raw, { skipHtmlToText: true, skipTextToHtml: true, skipImageLinks: true });
  let n = 0;
  for (const a of parsed.attachments ?? []) {
    if (!a?.content?.length) continue;
    const put = await putContent(a.content);
    await rest("intake_attachments?on_conflict=message_id,sha256", {
      method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
      body: JSON.stringify([{ message_id: messageId, sha256: put.sha256, bytes: put.bytes, sniffed_type: sniff(a.content), declared_type: a.contentType ?? null, declared_name: a.filename ? String(a.filename).slice(0, 200) : null, storage_key: put.key }]),
    });
    n += 1;
  }
  return n;
}
