// Admin → Users → Send password reset (portal redesign §3.2, approved item 8). Sends the same reset email the
// sign-in page's "Forgot password" sends, to the account's own address, so only its owner can use it. Needs
// portal.users.password-reset (admin and developer by default; docs/supabase-permissions-password-reset.sql). As with
// role changes, an admin cannot act on a developer's account.
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServiceRoleClient } from "@/lib/supabase-admin";
import { requirePermission } from "@/lib/permissions/server";
import { buildAppUrl } from "@/lib/auth-email-flow-utils.mjs";

export async function POST(request: Request) {
  const auth = await requirePermission("portal.users.password-reset");
  if ("error" in auth) return auth.error;

  const body = (await request.json().catch(() => ({}))) as { userId?: string };
  const userId = String(body.userId ?? "").trim();
  if (!userId) return NextResponse.json({ error: "userId is required." }, { status: 400 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = createSupabaseServiceRoleClient();
  if (!url || !anonKey || !service) return NextResponse.json({ error: "The reset email service is not configured." }, { status: 503 });

  const { data: target, error: findError } = await service.auth.admin.getUserById(userId);
  const email = target?.user?.email ?? null;
  if (findError || !email) return NextResponse.json({ error: "No such account, or it has no email address." }, { status: 404 });

  const { data: pref } = await service.from("user_preferences").select("is_developer").eq("user_id", userId).maybeSingle();
  if ((pref as { is_developer?: boolean } | null)?.is_developer && !auth.isDeveloper) {
    return NextResponse.json({ error: "Admins cannot act on Developer accounts." }, { status: 403 });
  }

  const anon = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const appUrl = buildAppUrl(process.env.NEXT_PUBLIC_SITE_URL, new URL(request.url).origin);
  const { error } = await anon.auth.resetPasswordForEmail(email, { redirectTo: `${appUrl}/auth/reset` });
  if (error) {
    const status = (error as { status?: number }).status ?? 502;
    return NextResponse.json({ error: status === 429 ? "Too many reset emails just now — try again in a minute." : `The reset email was not sent: ${error.message}`, status }, { status: status === 429 ? 429 : 502 });
  }
  return NextResponse.json({ ok: true, sentTo: email });
}
