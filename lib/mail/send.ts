// The portal's emails, sent by us (2026-11-02): through Resend with the platform's one sender (digital-wall/lib/mailer.mjs),
// from the brand settings' name and address (content/docs/site.json › email), and recorded in Mailbox › Sent with a
// delivery status the Resend webhook keeps current. No body is stored for these rows: several carry a link that lets
// someone in. Before this, Supabase sent the sign-up, invite, password-reset and email-change emails itself — from its
// own default sender, with no row anywhere and no status (docs/emails.md).
import site from "@/content/docs/site.json";
import { sendEmail as wallSend } from "@/digital-wall/lib/mailer.mjs";

// the mailer is plain JS; its `record` defaults to null, so TypeScript reads it as always-null — say what it takes
const sendEmail = wallSend as unknown as (a: { to: string | string[]; subject: string; html: string; text: string; from: string; fallbackFrom?: string | null; record: { kind: string; by: string | null; ref: string | null } }) => Promise<{ ok: boolean; id?: string | null; recordId?: string | null; error?: string }>;

type Brand = { product?: string; email?: { fromName?: string; fromAddress?: string; fallbackAddress?: string } };
const brand = site as Brand;

/** "Name <address>": the brand's name, and its address or the server's configured one. */
export function brandFrom(): string {
  const name = String(brand.email?.fromName || brand.product || "").trim();
  const configured = String(brand.email?.fromAddress || "").trim();
  const envFrom = String(process.env.CLIENT_EMAIL_FROM || process.env.DIGITAL_WALL_EMAIL_FROM || "").trim();
  const envAddress = envFrom.match(/<([^>]+)>/)?.[1] ?? (envFrom.includes("@") ? envFrom : "");
  const address = configured || envAddress;
  const use = address || "no-reply@verxyl.com"; // a verified domain (production's Resend, read 2026-11-02); clearway.verxyl.com is not
  return name ? `${name.replace(/[<>"]/g, "")} <${use}>` : use;
}

/** The same name at the address that works while the brand's domain is not yet verified in Resend (or null). */
export function brandFallbackFrom(): string | null {
  const address = String(brand.email?.fallbackAddress || "").trim();
  if (!address) return null;
  const name = String(brand.email?.fromName || brand.product || "").trim().replace(/[<>"]/g, "");
  return name ? `${name} <${address}>` : address;
}

export const productName = () => String(brand.product || "").trim() || "The portal";

export type SendResult = { ok: boolean; id: string | null; recordId: string | null; error?: string };

/** Send and record. `kind` names the email in Mailbox › Sent; `ref` points at what it is about (a client, a user). */
export async function sendPortalEmail({ to, subject, html, text, kind, by = null, ref = null }: { to: string | string[]; subject: string; html: string; text: string; kind: string; by?: string | null; ref?: string | null }): Promise<SendResult> {
  const out = await sendEmail({ to, subject, html, text, from: brandFrom(), fallbackFrom: brandFallbackFrom(), record: { kind, by, ref } });
  return { ok: Boolean(out.ok), id: out.id ?? null, recordId: out.recordId ?? null, ...(out.ok ? {} : { error: out.error }) };
}

const esc = (s: string) => String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

/** A plain branded email: a title, paragraphs, an optional button, a footnote. Returns html and text. */
export function layoutEmail({ title, paragraphs, button, footnote }: { title: string; paragraphs: string[]; button?: { label: string; url: string }; footnote?: string }) {
  const product = productName();
  const html = `<!doctype html><html><body style="margin:0;background:#f4f6f9;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#17181c">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;border:1px solid #e3e6eb">
<tr><td style="padding:24px 28px 0;font-size:15px;font-weight:800;letter-spacing:-.01em">${esc(product)}</td></tr>
<tr><td style="padding:16px 28px 0;font-size:20px;font-weight:700;line-height:1.3">${esc(title)}</td></tr>
${paragraphs.map((p) => `<tr><td style="padding:12px 28px 0;font-size:15px;line-height:1.6;color:#33363d">${esc(p)}</td></tr>`).join("\n")}
${button ? `<tr><td style="padding:20px 28px 0"><a href="${esc(button.url)}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:12px 20px;border-radius:9px">${esc(button.label)}</a></td></tr>
<tr><td style="padding:12px 28px 0;font-size:12.5px;line-height:1.5;color:#6b7280;word-break:break-all">If the button does not work, open this address: ${esc(button.url)}</td></tr>` : ""}
${footnote ? `<tr><td style="padding:16px 28px 0;font-size:12.5px;line-height:1.5;color:#6b7280">${esc(footnote)}</td></tr>` : ""}
<tr><td style="padding:24px 28px 24px;font-size:12px;color:#9ca3af">${esc(product)}</td></tr>
</table></td></tr></table></body></html>`;
  const text = [product, "", title, "", ...paragraphs.flatMap((p) => [p, ""]), ...(button ? [`${button.label}: ${button.url}`, ""] : []), ...(footnote ? [footnote, ""] : [])].join("\n");
  return { html, text };
}

/** The portal's own address, for links in emails. */
export function appUrl(request?: Request): string {
  const configured = String(process.env.PORTAL_SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || "").trim().replace(/\/+$/, "");
  if (configured) return configured;
  if (request) {
    const h = request.headers; const host = h.get("x-forwarded-host") || h.get("host"); const proto = h.get("x-forwarded-proto") || "https";
    if (host) return `${proto}://${host}`;
  }
  return "";
}
