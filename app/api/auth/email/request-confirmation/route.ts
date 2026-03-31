import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase-admin";
import {
  buildAppUrl,
  isValidEmail,
  normalizeEmail,
  randomToken,
  sha256Hex,
} from "@/lib/auth-email-flow-utils.mjs";

const SIGNUP_TOKEN_TTL_MS = 60 * 60 * 1000;

export async function POST(request: Request) {
  const service = createSupabaseServiceRoleClient();
  if (!service) {
    return NextResponse.json({ error: "Missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 503 });
  }

  const requestUrl = new URL(request.url);
  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    email?: string;
    next?: string;
  };

  const name = String(body.name ?? "").trim();
  const email = normalizeEmail(body.email);
  if (!name) {
    return NextResponse.json({ error: "Name is required." }, { status: 400 });
  }
  if (!isValidEmail(email)) {
    return NextResponse.json({ error: "Valid email is required." }, { status: 400 });
  }

  const token = randomToken();
  const tokenHash = sha256Hex(token);
  const expiresAt = new Date(Date.now() + SIGNUP_TOKEN_TTL_MS).toISOString();
  const appUrl = buildAppUrl(process.env.NEXT_PUBLIC_SITE_URL, requestUrl.origin);
  const continuePath = typeof body.next === "string" && body.next.startsWith("/") ? body.next : "/";
  const callbackUrl = `${appUrl}/auth/callback?signup_token=${encodeURIComponent(token)}&continue=${encodeURIComponent(
    continuePath,
  )}`;

  // Keep any previous signup tokens invalid once a new email is requested.
  await service
    .from("email_confirmations")
    .update({ used_at: new Date().toISOString() })
    .eq("email", email)
    .eq("purpose", "signup")
    .is("used_at", null);

  const { error: tokenError } = await service.from("email_confirmations").insert({
    email,
    token_hash: tokenHash,
    purpose: "signup",
    expires_at: expiresAt,
  });

  if (tokenError) {
    return NextResponse.json({ error: tokenError.message }, { status: 500 });
  }

  // Supabase sends the email using your configured auth email provider/templates.
  const { error: inviteError } = await service.auth.admin.inviteUserByEmail(email, {
    redirectTo: callbackUrl,
    data: {
      full_name: name,
      name,
    },
  });

  if (inviteError) {
    console.error("[auth/email/request-confirmation] inviteUserByEmail failed", {
      email,
      message: inviteError.message,
      name: inviteError.name,
      status: inviteError.status,
      code: inviteError.code,
    });
    // Return generic response to avoid account enumeration and keep UX stable.
    return NextResponse.json({
      ok: true,
      sent: false,
      message:
        "We could not send a confirmation email right now. Please retry in a minute.",
    });
  }

  return NextResponse.json({
    ok: true,
    sent: true,
    message:
      "If this email can receive invitations, a confirmation email has been sent.",
  });
}
