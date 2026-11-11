// The developers' alert by email (2026-11-11): the designed system alert (18) and its all-clear (18c), to DEVELOPER_EMAILS,
// beside the Telegram message (alert.mjs). Never throws; false when there is nobody to write to or no mailer.
import { logDetail } from "./public-errors.mjs";

export async function emailDevelopers(kind, vars) {
  const to = String(process.env.DEVELOPER_EMAILS || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!to.length) return false;
  try {
    const [{ sendEmail, mailerConfigured }, { buildEmail }] = await Promise.all([import("../../digital-wall/lib/mailer.mjs"), import("../../shared/email/templates.mjs")]);
    if (!mailerConfigured()) return false;
    const portalUrl = String(process.env.PORTAL_SITE_URL || process.env.PORTAL_BASE_URL || "").replace(/\/+$/, "");
    const mail = buildEmail(kind, { portalUrl, supportEmail: "", link: `${portalUrl}/aip/service-status`, ...vars });
    const r = await sendEmail({ to, subject: mail.subject, html: mail.html, text: mail.text, record: { kind: "system-alert", ref: String(vars.service ?? "") } });
    return Boolean(r?.ok);
  } catch (e) { logDetail("alert", "alert email NOT sent", e); return false; }
}
