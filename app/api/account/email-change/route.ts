// Change my sign-in email (2026-11-02). Before, the profile pages called supabase.auth.updateUser({ email }) and Supabase
// emailed both addresses from its default sender. Now Supabase makes the two links and we send them
// (lib/mail/auth-links.ts): the brand's sender, two rows in Mailbox › Sent. The change happens once both are confirmed.
// The answer says which emails went; a failure is said, never a "check your inbox".
import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase-admin";
import { requirePermission } from "@/lib/permissions/server";
import { isValidEmail, normalizeEmail } from "@/lib/auth-email-flow-utils.mjs";
import { failure, logFailure } from "@/lib/public-error";
import { TRY_AGAIN } from "@/lib/error-text";
import { appUrl } from "@/lib/mail/send";
import { sendEmailChange } from "@/lib/mail/auth-links";

export const dynamic = "force-dynamic";
const NOT_SENT = `The confirmation emails were not sent. ${TRY_AGAIN}`;
const recent = new Map<string, number>();

export async function POST(request: Request) {
  const who = await requirePermission("portal.account.preferences");
  if ("error" in who) return who.error;
  const service = createSupabaseServiceRoleClient();
  if (!service) return failure(503, NOT_SENT, { tag: "EMAIL-CHANGE", what: "service role key not set" });
  const current = normalizeEmail(who.user.email);
  const body = (await request.json().catch(() => ({}))) as { email?: string };
  const next = normalizeEmail(body.email);
  if (!isValidEmail(next)) return NextResponse.json({ error: "That doesn't look like an email address." }, { status: 400 });
  if (next === current) return NextResponse.json({ error: "That is already your sign-in email." }, { status: 400 });
  if (!current) return NextResponse.json({ error: "This account has no email to change from." }, { status: 400 });
  const last = recent.get(who.user.id) ?? 0;
  if (Date.now() - last < 60_000) return NextResponse.json({ error: "Confirmation emails went out a moment ago. Check both inboxes; you can ask again in a minute.", code: "too_soon" }, { status: 429 });

  const out = await sendEmailChange(service, { id: who.user.id, email: current }, next, appUrl(request));
  if (out.current.linkError) {
    if (/email_exists|already.*registered|already been registered/i.test(out.current.linkError)) return NextResponse.json({ error: "Another account already signs in with that email." }, { status: 409 });
    logFailure("EMAIL-CHANGE", "links not made", out.current.error);
    return NextResponse.json({ error: NOT_SENT, code: "link_not_made" }, { status: 500 });
  }
  recent.set(who.user.id, Date.now());
  if (!out.current.ok || !out.next.ok) {
    logFailure("EMAIL-CHANGE", "email not sent", `${out.current.ok ? "" : `current: ${out.current.error}`} ${out.next.ok ? "" : `new: ${out.next.error}`}`.trim());
    const which = !out.current.ok && !out.next.ok ? "Neither email was sent" : !out.next.ok ? `The email to ${next} was not sent` : `The email to ${current} was not sent`;
    return NextResponse.json({ error: `${which}, so the change cannot be confirmed. ${TRY_AGAIN}`, code: "email_not_sent" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, sentTo: [current, next] });
}
