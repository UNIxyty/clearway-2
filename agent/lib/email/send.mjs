// Agent email: prepare → preview → send.
//
// REUSES THE EXISTING SEND PATH. digital-wall/lib/mailer.mjs is the platform's
// Resend client — it already handles attachments, never throws, and returns the
// provider's own error. A second send path would mean two places to rotate a
// key, two sets of failure behaviour, and two things to check when mail stops
// arriving. The agent image copies that module in (build context is the repo
// root, the same arrangement opsboard-react already uses to share shared/).
//
// FAILURES ARE LOUD. A swallowed email failure has cost this project weeks:
// mail silently not arriving looks exactly like mail nobody sent. The provider's
// real error is returned to the caller, written to the log row, and surfaced in
// the panel — never reduced to "something went wrong".

import { randomUUID } from "node:crypto";
import { sendEmail as deliver, mailerConfigured } from "../../../digital-wall/lib/mailer.mjs";
import { renderAgentEmail, renderAgentEmailText } from "./template.mjs";
import { audit } from "../store.mjs";

const REST_TIMEOUT_MS = 10_000;
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024; // Resend's practical ceiling

function supabaseUrl() { return String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, ""); }
function serviceKey() { return String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim(); }

async function rest(pathAndQuery, init = {}) {
  const headers = {
    apikey: serviceKey(), Authorization: `Bearer ${serviceKey()}`,
    "Content-Type": "application/json", ...(init.headers ?? {}),
  };
  const response = await fetch(`${supabaseUrl()}/rest/v1/${pathAndQuery}`, { ...init, headers, signal: AbortSignal.timeout(REST_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`${init.method ?? "GET"} ${pathAndQuery} -> ${response.status}: ${(await response.text()).slice(0, 240)}`);
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

/**
 * Internal means "same email domain as the person asking", plus anything in
 * AGENT_EMAIL_INTERNAL_DOMAINS. Everything else is external and needs an
 * explicit confirmation — checked HERE, in the backend, because a model that
 * decides for itself whether a recipient is internal has decided the safety
 * rule.
 */
export function classifyRecipients(recipients, user) {
  const own = String(user?.email || "").split("@")[1]?.toLowerCase() ?? null;
  const extra = String(process.env.AGENT_EMAIL_INTERNAL_DOMAINS || "")
    .split(",").map((d) => d.trim().toLowerCase().replace(/^@/, "")).filter(Boolean);
  const internalDomains = new Set([own, ...extra].filter(Boolean));

  const internal = [];
  const external = [];
  for (const raw of recipients) {
    const address = String(raw || "").trim();
    if (!address) continue;
    const domain = address.split("@")[1]?.toLowerCase();
    (domain && internalDomains.has(domain) ? internal : external).push(address);
  }
  return { internal, external, internalDomains: [...internalDomains] };
}

/**
 * The external-recipient gate, in ONE place.
 *
 * Both tools need to refuse early — email_document so it does not download a
 * 3 MB PDF for a send that is about to be blocked — and the first version let
 * them return early on their own, which silently skipped the log. A blocked
 * attempt that leaves no trace defeats the point of requiring confirmation, so
 * the check and the record now travel together and callers get the refusal
 * from here or not at all.
 *
 * Returns null when the send may proceed.
 */
export async function refuseUnconfirmedExternal({ recipients, user, conversationId, subject, confirmed }) {
  const { external, internal } = classifyRecipients(recipients, user);
  if (external.length === 0 || confirmed === true) return null;

  const error = `${external.join(", ")} ${external.length === 1 ? "is" : "are"} outside your organisation. Ask the user to confirm before sending.`;
  await logSend({ user, conversationId, recipients, subject, attachments: [], status: "blocked", error, external });
  return { sent: false, needsConfirmation: true, external, internal, recipients, messageId: null, error };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateRecipients(recipients) {
  const clean = (Array.isArray(recipients) ? recipients : [recipients])
    .map((r) => String(r || "").trim()).filter(Boolean);
  const bad = clean.filter((r) => !EMAIL_RE.test(r));
  if (bad.length) throw new Error(`Not valid email addresses: ${bad.join(", ")}`);
  if (clean.length === 0) throw new Error("At least one recipient is required.");
  if (clean.length > 20) throw new Error("At most 20 recipients per send.");
  return clean;
}

/**
 * Build the message without sending it. The panel shows exactly this HTML as
 * the preview, so what the user approves is what leaves the building — not a
 * re-render that could differ.
 */
export function prepareEmail({ subject, tag, blocks, attachments = [], user, conversationId, consoleUrl }) {
  const when = new Date().toISOString().replace("T", " at ").replace(/\.\d+Z$/, "Z");
  const reference = `agent-msg ${randomUUID().slice(0, 8)}${conversationId ? ` · thread ${conversationId.slice(0, 8)}` : ""}`;

  // The attachment list block is appended automatically: a recipient should be
  // able to see what was attached even when their client hides attachments.
  const withFiles = attachments.length
    ? [...blocks, { type: "files", title: "ATTACHED", files: attachments.map((a) => ({ filename: a.filename, meta: a.meta ?? null, size: formatBytes(a.bytes) })) }]
    : blocks;
  const full = consoleUrl ? [...withFiles, { type: "cta", text: "Open in the console", url: consoleUrl }] : withFiles;

  const common = { subject, tag, requester: user?.name ?? user?.email, requesterEmail: user?.email, when, blocks: full, reference, consoleUrl };
  return {
    subject,
    html: renderAgentEmail(common),
    text: renderAgentEmailText(common),
    reference,
    blocks: full,
    attachments: attachments.map((a) => ({ filename: a.filename, bytes: a.bytes, id: a.id ?? null })),
  };
}

function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Send. Returns { ok, id?, error } and NEVER hides the provider's message.
 *
 * `confirmedExternal` must be explicitly true for any external recipient. The
 * caller cannot satisfy it by simply omitting recipients from a list — the
 * classification is recomputed here from the addresses actually being sent to.
 */
export async function sendAgentEmail({ to, prepared, attachments = [], user, conversationId, confirmedExternal = false }) {
  const recipients = validateRecipients(to);
  const { internal, external } = classifyRecipients(recipients, user);

  if (external.length > 0 && confirmedExternal !== true) {
    const error = `Confirmation required: ${external.join(", ")} ${external.length === 1 ? "is" : "are"} outside your organisation.`;
    await logSend({ user, conversationId, recipients, subject: prepared.subject, attachments, status: "blocked", error, external });
    return { ok: false, error, needsConfirmation: true, external, internal };
  }

  const totalBytes = attachments.reduce((n, a) => n + (a.content?.length ?? 0), 0);
  if (totalBytes > MAX_ATTACHMENT_BYTES) {
    const error = `Attachments total ${formatBytes(totalBytes)}, over the ${formatBytes(MAX_ATTACHMENT_BYTES)} limit.`;
    await logSend({ user, conversationId, recipients, subject: prepared.subject, attachments, status: "failed", error, external });
    return { ok: false, error };
  }

  if (!mailerConfigured()) {
    const error = "RESEND_API_KEY is not configured on the server, so no email was sent.";
    await logSend({ user, conversationId, recipients, subject: prepared.subject, attachments, status: "failed", error, external });
    return { ok: false, error };
  }

  const result = await deliver({
    to: recipients,
    subject: prepared.subject,
    html: prepared.html,
    attachments: attachments.map((a) => ({ filename: a.filename, content: a.content })),
  });

  await logSend({
    user, conversationId, recipients, subject: prepared.subject, attachments,
    status: result.ok ? "sent" : "failed",
    error: result.ok ? null : result.error,
    providerId: result.id ?? null,
    external,
    reference: prepared.reference,
  });

  // The provider's own words, not a paraphrase — whoever debugs this needs the
  // real message ("domain not verified", "rate limited"), not "send failed".
  return result.ok
    ? { ok: true, id: result.id ?? null, recipients, reference: prepared.reference }
    : { ok: false, error: result.error, recipients };
}

async function logSend({ user, conversationId, recipients, subject, attachments, status, error, providerId, external, reference }) {
  const row = {
    user_id: user?.userId ?? null,
    user_email: user?.email ?? null,
    conversation_id: /^[0-9a-f-]{36}$/i.test(String(conversationId ?? "")) ? conversationId : null,
    recipients,
    external_recipients: external ?? [],
    subject,
    attachments: (attachments ?? []).map((a) => ({ filename: a.filename, bytes: a.content?.length ?? a.bytes ?? null })),
    status,
    provider_id: providerId ?? null,
    provider_error: error ?? null,
    reference: reference ?? null,
  };
  try {
    await rest("agent_email_log", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify([row]) });
  } catch (logError) {
    process.stderr.write(`[agent-email] FAILED to persist the send log: ${logError.message}\n`);
  }
  await audit({
    kind: `email.${status}`,
    userId: user?.userId, userEmail: user?.email, conversationId,
    toolName: "send_email",
    toolArgs: { to: recipients, subject, attachments: (attachments ?? []).map((a) => a.filename) },
    toolResult: { status, providerId: providerId ?? null },
    confirmationStatus: (external ?? []).length > 0 ? (status === "blocked" ? "pending" : "confirmed") : "not_required",
    success: status === "sent",
    error: error ?? null,
  });
}

export async function listSends({ userId, limit = 50 }) {
  const filter = userId ? `&user_id=eq.${encodeURIComponent(userId)}` : "";
  return (await rest(`agent_email_log?select=*${filter}&order=created_at.desc&limit=${Math.min(limit, 200)}`)) ?? [];
}
