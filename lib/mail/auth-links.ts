// The sign-in emails, sent by us (2026-11-02). Supabase used to send these itself (resetPasswordForEmail,
// inviteUserByEmail, updateUser({ email })) from its default sender, unrecorded. Now Supabase only makes the link
// (auth.admin.generateLink, which sends nothing) and lib/mail/send.ts sends it: the brand's sender, a row in Mailbox ›
// Sent, a delivery status. The link points at our own pages with the token hash (/auth/reset and /auth/callback both
// verify it), so it no longer depends on Supabase's redirect list. docs/emails.md has the before and after.
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendPortalEmail, templateEmail, type SendResult } from "@/lib/mail/send";

export type LinkSend = SendResult & { noAccount?: boolean; linkError?: string };
const failed = (error: string, extra: Partial<LinkSend> = {}): LinkSend => ({ ok: false, id: null, recordId: null, error, ...extra });

const recentResets = new Map<string, number>();
/** Seconds before another reset email may go to this address (Supabase rate-limited these; we do too). 0 = now. */
export function resetWait(email: string, everyMs = 60_000): number {
  const last = recentResets.get(email.toLowerCase()) ?? 0;
  return Math.max(0, Math.ceil((last + everyMs - Date.now()) / 1000));
}

/** A password-reset link to an account's own address. noAccount when there is no such account (nothing is sent). */
export async function sendResetEmail(service: SupabaseClient, email: string, appUrl: string, { kind = "password-reset", by = null as string | null, device = "" } = {}): Promise<LinkSend> {
  const { data, error } = await service.auth.admin.generateLink({ type: "recovery", email });
  if (error || !data?.properties?.hashed_token) {
    const status = (error as { status?: number } | null)?.status ?? 0;
    const msg = String(error?.message ?? "no link");
    if (status === 404 || /not.*found/i.test(msg)) return failed("no account", { noAccount: true });
    return failed(`link not made: ${msg}`, { linkError: msg });
  }
  const url = `${appUrl}/auth/reset?token_hash=${encodeURIComponent(data.properties.hashed_token)}&type=recovery`;
  const { subject, html, text } = await templateEmail("04-staff-reset-password", { email, link: url, requestedAt: new Date(), expiresAt: new Date(Date.now() + 3600_000), device: device || "" });
  const out = await sendPortalEmail({ to: email, subject, html, text, kind, by, ref: data.user?.id ?? null });
  // counted only once the mail service took it (2026-11-02): a send that failed must not answer the next try with
  // "a reset email went to this address a moment ago" — nothing went, and the person should be able to try again
  if (out.ok) recentResets.set(email.toLowerCase(), Date.now());
  return out;
}

/** The sign-up confirmation: Supabase makes the (unconfirmed) account and the link; we send it. */
export async function sendInviteEmail(service: SupabaseClient, email: string, name: string, callbackUrl: string): Promise<LinkSend & { userId: string | null }> {
  const make = () => service.auth.admin.generateLink({ type: "invite", email, options: { data: { full_name: name, name } } });
  let { data, error } = await make();
  // an account invited earlier and never finished: start it again, so the link is fresh (as before 2026-11-02)
  if (!error && data?.user && !data.user.email_confirmed_at && Date.now() - new Date(data.user.created_at).getTime() > 60_000) {
    await service.auth.admin.deleteUser(data.user.id);
    ({ data, error } = await make());
  }
  if (error || !data?.properties?.hashed_token) return { ...failed(`link not made: ${String(error?.message ?? "no link")}`, { linkError: String(error?.message ?? "no link") }), userId: null };
  const sep = callbackUrl.includes("?") ? "&" : "?";
  const url = `${callbackUrl}${sep}token_hash=${encodeURIComponent(data.properties.hashed_token)}&type=invite`;
  const { subject, html, text } = await templateEmail("01-staff-confirm-email", { email, name, link: url, expiresAt: new Date(Date.now() + 3600_000) });
  const out = await sendPortalEmail({ to: email, subject, html, text, kind: "account-invite", ref: data.user?.id ?? null });
  return { ...out, userId: data.user?.id ?? null };
}

/** Changing a sign-in email: a link to each address (both must be confirmed, as Supabase's secure change asks). */
export async function sendEmailChange(service: SupabaseClient, user: { id: string; email: string }, newEmail: string, appUrl: string): Promise<{ current: LinkSend; next: LinkSend }> {
  const back = encodeURIComponent("/account/profile?email-link=1");
  // The link carries the address and its one-time code, verified with verifyOtp({ email, token }) in /auth/callback. Not
  // the returned hashed_token: for email_change_new GoTrue (v2.197) returns a hash made from the CURRENT address while it
  // stores one made from the new one, so a token_hash link to the new address never confirms (seen on the rig 2026-11-02).
  const linkFor = async (type: "email_change_current" | "email_change_new", to: string) => {
    const { data, error } = await service.auth.admin.generateLink({ type, email: user.email, newEmail });
    if (error || !data?.properties?.email_otp) return { error: String(error?.message ?? "no link"), code: (error as { code?: string } | null)?.code ?? "" }; // public-error-ok: for the route's log and its email_exists check; the person sees the route's own words
    return { url: `${appUrl}/auth/callback?type=email_change&email=${encodeURIComponent(to)}&otp=${encodeURIComponent(data.properties.email_otp)}&next=${back}` };
  };
  // current first, then new: each call keeps the other's token, so both links stay good
  const cur = await linkFor("email_change_current", user.email);
  if ("error" in cur) { const f = failed(`link not made: ${cur.error}`, { linkError: cur.code || cur.error }); return { current: f, next: f }; }
  const nxt = await linkFor("email_change_new", newEmail);
  if ("error" in nxt) { const f = failed(`link not made: ${nxt.error}`, { linkError: nxt.code || nxt.error }); return { current: f, next: f }; }
  const mail = async (to: string, url: string, which: "current" | "new") => {
    const { subject, html, text } = await templateEmail("05-staff-confirm-new-email", { oldEmail: user.email, newEmail, link: url, expiresAt: new Date(Date.now() + 24 * 3600_000) });
    return sendPortalEmail({ to, subject, html, text, kind: `email-change-${which}`, by: user.email, ref: user.id });
  };
  const [current, next] = await Promise.all([mail(user.email, cur.url, "current"), mail(newEmail, nxt.url, "new")]);
  return { current, next };
}
