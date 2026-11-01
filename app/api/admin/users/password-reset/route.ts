// Admin → Users → Send password reset (portal redesign §3.2, approved item 8). Sends the same reset email the
// sign-in page's "Forgot password" sends, to the account's own address, so only its owner can use it. Sent by us since
// 2026-11-02 (lib/mail/auth-links.ts): the brand's sender, a row in Mailbox › Sent with its delivery status. Needs
// portal.users.password-reset (admin and developer by default; docs/supabase-permissions-password-reset.sql). As with
// role changes, an admin cannot act on a developer's account.
import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase-admin";
import { requirePermission } from "@/lib/permissions/server";
import { appUrl } from "@/lib/mail/send";
import { sendResetEmail } from "@/lib/mail/auth-links";
import { TRY_AGAIN, failure, logFailure } from "@/lib/public-error";

const NOT_SENT = `The reset email was not sent. ${TRY_AGAIN}`;

export async function POST(request: Request) {
  const auth = await requirePermission("portal.users.password-reset");
  if ("error" in auth) return auth.error;

  const body = (await request.json().catch(() => ({}))) as { userId?: string };
  const userId = String(body.userId ?? "").trim();
  if (!userId) return NextResponse.json({ error: "userId is required." }, { status: 400 });

  const service = createSupabaseServiceRoleClient();
  if (!service) {
    return failure(503, NOT_SENT, { tag: "ADMIN-PASSWORD-RESET", what: "service role key not set" });
  }

  const { data: target, error: findError } = await service.auth.admin.getUserById(userId);
  const email = target?.user?.email ?? null;
  if (findError || !email) return NextResponse.json({ error: "No such account, or it has no email address." }, { status: 404 });

  const { data: pref } = await service.from("user_preferences").select("is_developer").eq("user_id", userId).maybeSingle();
  if ((pref as { is_developer?: boolean } | null)?.is_developer && !auth.isDeveloper) {
    return NextResponse.json({ error: "Admins cannot act on Developer accounts." }, { status: 403 });
  }

  const out = await sendResetEmail(service, email, appUrl(request), { kind: "password-reset-admin", by: auth.user.email ?? null });
  if (!out.ok) {
    logFailure("ADMIN-PASSWORD-RESET", out.linkError ? "reset link not made" : "reset email not sent", out.error);
    // A failed email is not a bad gateway, and a 502 body is replaced by Cloudflare's page in production: answer 500.
    return NextResponse.json({ error: NOT_SENT, code: out.linkError ? "link_not_made" : "email_not_sent" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, sentTo: email });
}
