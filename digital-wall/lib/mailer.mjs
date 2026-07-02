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

const RESEND_ENDPOINT = "https://api.resend.com/emails";

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

async function deliverViaResend({ from, to, subject, html }) {
  const response = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      authorization: `Bearer ${String(process.env.RESEND_API_KEY).trim()}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ from, to, subject, html }),
    signal: AbortSignal.timeout(15000),
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
 * Send an HTML email. Never throws — returns { ok, id?, error? } so callers
 * (the alert scanner) can log failures without crashing the wall.
 */
export async function sendEmail({ to, subject, html, from = defaultFrom() }) {
  const recipients = (Array.isArray(to) ? to : [to]).map((v) => String(v || "").trim()).filter(Boolean);
  if (recipients.length === 0) {
    return { ok: false, error: "No recipients configured." };
  }
  if (!mailerConfigured()) {
    return { ok: false, error: "RESEND_API_KEY is not configured; email skipped." };
  }
  try {
    const result = await deliverViaResend({ from, to: recipients, subject, html });
    return { ok: true, id: result?.id ?? null };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
