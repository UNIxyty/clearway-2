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

async function deliverViaResend({ from, to, subject, html, attachments }) {
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
