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

import { buildEmail, TEMPLATES } from "@/shared/email/templates.mjs";
import { B } from "@/shared/email/layout.mjs";
import { createSupabaseServiceRoleClient } from "@/lib/supabase-admin";

let supportCache: { at: number; value: string } | null = null;
/** The address every email's footer carries (Admin › Clients › "The address clients write to"); cached a minute; "" when unset. */
export async function supportAddress(): Promise<string> {
  if (supportCache && Date.now() - supportCache.at < 60_000) return supportCache.value;
  let value = "";
  // the same setting lib/clients/onboarding.ts › supportEmail reads (app_settings › clients.support_email); read here
  // directly so this module does not import onboarding (which imports this one)
  try {
    const service = createSupabaseServiceRoleClient();
    if (service) { const { data } = await service.from("app_settings").select("value").eq("key", "clients.support_email").maybeSingle(); const e = String((data?.value as { email?: unknown } | null)?.email ?? "").trim().toLowerCase(); value = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : ""; }
  } catch { value = ""; }
  supportCache = { at: Date.now(), value };
  return value;
}

/** The two values every template takes besides its own: where the portal is, and whom to write to. */
export async function mailOptions(request?: Request): Promise<{ portalUrl: string; supportEmail: string }> {
  return { portalUrl: appUrl(request), supportEmail: await supportAddress() };
}

export type TemplateId = keyof typeof TEMPLATES;
/** One of the designed emails (shared/email/templates.mjs), with the portal's options filled in. */
export async function templateEmail(id: TemplateId, vars: Record<string, unknown>, request?: Request): Promise<{ subject: string; html: string; text: string }> {
  const out = buildEmail(id, { ...(await mailOptions(request)), ...vars }) as { subject: string; html: string; text: string };
  return out;
}

/**
 * A plain branded email: a title, paragraphs, an optional button, a footnote. Returns html and text. Since 2026-11-10 it
 * is the generic notice template (19-notice) of the one master layout, for every email that has no design of its own.
 */
export function layoutEmail({ title, paragraphs, button, footnote, supportEmail: support = "", reason }: { title: string; paragraphs: string[]; button?: { label: string; url: string }; footnote?: string; supportEmail?: string; reason?: string }) {
  const out = buildEmail("19-notice", { portalUrl: appUrl(), supportEmail: support || (supportCache?.value ?? ""), subject: title, headline: title, preheader: paragraphs[0] ?? "", body: paragraphs, buttonLabel: button?.label, link: button?.url, blocks: footnote ? [B.note(footnote)] : [], reason }) as { html: string; text: string };
  return { html: out.html, text: out.text };
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
