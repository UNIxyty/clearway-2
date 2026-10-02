// Email sender for the Digital Wall backend.
//
// Provider choice: the repo already sends email through the Resend HTTP API
// (see lib/pickem-email.ts in the main portal), so we reuse the same provider
// and RESEND_API_KEY instead of introducing an SMTP dependency into this
// dependency-free raw-node backend. Swapping providers only means replacing
// deliverViaResend().
//
// Templates are plain HTML files with {{key}} placeholders (HTML-escaped) and
// {{{key}}} placeholders (raw insertion). The alert template is a scaffold —
// the final design will be produced separately and dropped in place.

import fs from "node:fs/promises";
import path from "node:path";

// RESEND_BASE_URL exists so tests can point sends at a local capture server;
// production leaves it unset.
function resendEndpoint() {
  const base = String(process.env.RESEND_BASE_URL || "https://api.resend.com").trim().replace(/\/+$/, "");
  return `${base}/emails`;
}

export function mailerConfigured() {
  return Boolean(String(process.env.RESEND_API_KEY || "").trim());
}

function defaultFrom() {
  return (
    String(process.env.DIGITAL_WALL_EMAIL_FROM || "").trim() ||
    "Clearway Digital Wall <no-reply@clearway.verxyl.com>"
  );
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** Fill {{{raw}}} and {{escaped}} placeholders in a template string. */
export function fillTemplate(template, vars = {}) {
  return template
    .replace(/\{\{\{\s*([\w.-]+)\s*\}\}\}/g, (_, key) => String(vars[key] ?? ""))
    .replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, key) => escapeHtml(vars[key] ?? ""));
}

export async function renderTemplateFile(templatePath, vars = {}) {
  const absolute = path.isAbsolute(templatePath)
    ? templatePath
    : path.resolve(process.cwd(), templatePath);
  const template = await fs.readFile(absolute, "utf-8");
  return fillTemplate(template, vars);
}

// NO CALENDAR RESPONSES, EVER. Meeting invites reach the agent's mailbox (a
// provider notifies flights as Outlook invites). Accepting, declining or
// changing one is a person's action in their own calendar; this process must
// not be able to do it even by accident. It has no calendar or mailbox API, so
// the only way it could answer an invite is by mailing iCalendar content, and
// this is the one function that puts mail on the wire. Therefore:
//   - the provider payload is built from a fixed set of fields: an HTML body
//     and attachments. No custom headers, no alternative parts, so the body
//     can never be a text/calendar part;
//   - an attachment that is an iCalendar object (by name or by content) is
//     refused, whatever its method;
//   - an attached message (.eml) is refused when it carries a calendar part
//     with a response method. Forwarding an invite as received (METHOD:REQUEST
//     inside the original message) stays possible: that is evidence passed on
//     by a person, not an answer.
// A refusal throws; sendEmail turns it into { ok: false, error } like any
// other failed send, so the caller sees it and nothing leaves.
const CALENDAR_FILENAME = /\.(ics|ical|icalendar|ifb|vcs)$/i;
const RESPONSE_METHOD = /METHOD\s*[:=]\s*"?(REPLY|COUNTER|DECLINECOUNTER|REFRESH)\b/i;

function isMimeMessage(text) {
  const end = text.search(/\r?\n\r?\n/);
  const head = end === -1 ? "" : text.slice(0, end);
  return /^[A-Za-z][\w-]*:[ \t]/.test(text) && /^(content-type|mime-version|from|received):/im.test(head) && !/BEGIN:VCALENDAR/i.test(head);
}

export function calendarRefusal({ html, attachments } = {}) {
  if (/BEGIN:VCALENDAR/i.test(String(html ?? ""))) return "the body contains iCalendar content";
  for (const a of Array.isArray(attachments) ? attachments : []) {
    const name = String(a?.filename ?? "");
    if (CALENDAR_FILENAME.test(name)) return `attachment "${name}" is a calendar file`;
    const bytes = Buffer.isBuffer(a?.content) ? a.content : Buffer.from(String(a?.content ?? ""), "base64");
    const text = bytes.toString("latin1");
    if (!isMimeMessage(text)) {
      if (/BEGIN:VCALENDAR/i.test(text)) return `attachment "${name}" contains iCalendar content`;
      continue;
    }
    // An attached message: look at each calendar part, decoded if it is base64.
    for (const part of text.matchAll(/content-type:\s*text\/calendar([\s\S]*?)\r?\n\r?\n([\s\S]*?)(?=\r?\n--|$)/gi)) {
      const body = /content-transfer-encoding:\s*base64/i.test(part[1]) ? Buffer.from(part[2].replace(/\s+/g, ""), "base64").toString("latin1") : part[2];
      if (RESPONSE_METHOD.test(part[1]) || RESPONSE_METHOD.test(body)) return `attachment "${name}" carries a calendar response`;
    }
    if (RESPONSE_METHOD.test(text)) return `attachment "${name}" carries a calendar response`;
  }
  return null;
}

async function deliverViaResend({ from, to, subject, html, attachments }) {
  const refusal = calendarRefusal({ html, attachments });
  if (refusal) throw new Error(`Refused: this system never sends calendar content (${refusal}). Nothing was sent.`);
  const payload = { from, to, subject, html };
  if (Array.isArray(attachments) && attachments.length > 0) {
    payload.attachments = attachments.map((a) => ({
      filename: a.filename,
      content: Buffer.isBuffer(a.content) ? a.content.toString("base64") : a.content,
    }));
  }
  const response = await fetch(resendEndpoint(), {
    method: "POST",
    headers: {
      authorization: `Bearer ${String(process.env.RESEND_API_KEY).trim()}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(60000),
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Resend request failed (${response.status}): ${body.slice(0, 300)}`);
  }
  try {
    return JSON.parse(body);
  } catch {
    return { raw: body };
  }
}

/**
 * Send an HTML email (optionally with PDF attachments: [{filename, content:
 * Buffer|base64}]). Never throws — returns { ok, id?, error? } so callers
 * can report failures without crashing the wall.
 */
export async function sendEmail({ to, subject, html, from = defaultFrom(), attachments }) {
  const recipients = (Array.isArray(to) ? to : [to]).map((v) => String(v || "").trim()).filter(Boolean);
  if (recipients.length === 0) {
    console.error(`[mailer] NOT sending "${subject}": no recipients configured.`);
    return { ok: false, error: "No recipients configured." };
  }
  if (!mailerConfigured()) {
    console.error(`[mailer] NOT sending "${subject}" to ${recipients.join(", ")}: RESEND_API_KEY is not configured.`);
    return { ok: false, error: "RESEND_API_KEY is not configured; email skipped." };
  }
  console.log(`[mailer] sending "${subject}" to ${recipients.join(", ")} from "${from}"`);
  try {
    const result = await deliverViaResend({ from, to: recipients, subject, html, attachments });
    console.log(`[mailer] sent ok — Resend id ${result?.id ?? "(none)"}`);
    return { ok: true, id: result?.id ?? null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[mailer] send FAILED: ${message}`);
    return { ok: false, error: message };
  }
}
