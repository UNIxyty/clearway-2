import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase-admin";
import {
  isValidEmail,
  normalizeEmail,
  randomToken,
  sha256Hex,
} from "@/lib/auth-email-flow-utils.mjs";

const SIGNUP_TOKEN_TTL_MS = 60 * 60 * 1000;

// Determine the public-facing origin. Inside Docker the raw requestUrl.origin
// is often http://localhost:3000, which Supabase rejects as a redirectTo URL.
// We prefer NEXT_PUBLIC_SITE_URL, then fall back to forwarded proxy headers.
function getPublicOrigin(requestUrl: URL, headers: Headers): string {
  const siteUrl = String(process.env.NEXT_PUBLIC_SITE_URL || "").trim().replace(/\/+$/, "");
  if (siteUrl) return siteUrl;

  const forwardedHost = headers.get("x-forwarded-host") || headers.get("host") || "";
  if (forwardedHost) {
    const proto = (headers.get("x-forwarded-proto") || "https").split(",")[0].trim();
    return `${proto}://${forwardedHost}`;
  }

  return requestUrl.origin;
}

// Errors that reveal a configuration problem rather than a user-enumeration risk
// can be surfaced to the caller so the admin/developer can diagnose them quickly.
function isConfigError(msg: string): boolean {
  return /redirect|url|not allowed|smtp|provider|configuration/i.test(msg);
}

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
  const appUrl = getPublicOrigin(requestUrl, request.headers);
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

  const { data: inviteData, error: inviteError } = await service.auth.admin.inviteUserByEmail(email, {
    redirectTo: callbackUrl,
    data: { full_name: name, name },
  });

  if (inviteError) {
    console.error("[auth/email/request-confirmation] inviteUserByEmail failed", {
      callbackUrl,
      email,
      message: inviteError.message,
      status: inviteError.status,
      code: inviteError.code,
    });
    // Surface config errors (bad redirect URL, SMTP issues) so the problem is visible.
    // For user-enumeration-risk errors keep the response generic.
    const errorMsg = isConfigError(inviteError.message)
      ? `Invite email failed: ${inviteError.message}`
      : "We could not send a confirmation email right now. Please retry in a minute.";
    return NextResponse.json({ ok: true, sent: false, message: errorMsg });
  }

  // Store the Supabase user ID in the token purpose so the confirm step can
  // look up the account without scanning all users. The email_confirmations
  // table allows purpose values starting with 'signup' — see the migration note.
  const invitedUserId = inviteData?.user?.id ?? null;
  if (invitedUserId) {
    await service
      .from("email_confirmations")
      .update({ purpose: `signup:${invitedUserId}` })
      .eq("token_hash", tokenHash)
      .is("used_at", null);
  }

  return NextResponse.json({
    ok: true,
    sent: true,
    message: "If this email can receive invitations, a confirmation email has been sent.",
  });
}
