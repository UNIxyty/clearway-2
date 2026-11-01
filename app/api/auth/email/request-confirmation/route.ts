// Sign up with email (/signup): an unconfirmed account and a confirmation link. Since 2026-11-02 Supabase only makes the
// link (lib/mail/auth-links.ts) and we send it: the brand's sender, a row in Mailbox › Sent, a delivery status. Client
// access requests no longer come here — they have no account until approved (/api/client-requests).
import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase-admin";
import {
  isValidEmail,
  normalizeEmail,
  randomToken,
  sha256Hex,
} from "@/lib/auth-email-flow-utils.mjs";
import { failure } from "@/lib/public-error";
import { TRY_AGAIN_SIGNED_OUT } from "@/lib/error-text";
import { sendInviteEmail } from "@/lib/mail/auth-links";

const NOT_SENT = `We could not send a confirmation email right now. ${TRY_AGAIN_SIGNED_OUT}`;

const SIGNUP_TOKEN_TTL_MS = 60 * 60 * 1000;

// Determine the public-facing origin. Inside Docker the raw requestUrl.origin
// is often http://localhost:3000, which Supabase rejects as a redirectTo URL.
// We prefer NEXT_PUBLIC_SITE_URL, then fall back to forwarded proxy headers.
function getPublicOrigin(requestUrl: URL, headers: Headers): string {
  const siteUrl = String(process.env.PORTAL_SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || "").trim().replace(/\/+$/, "");
  if (siteUrl) return siteUrl;

  const forwardedHost = headers.get("x-forwarded-host") || headers.get("host") || "";
  if (forwardedHost) {
    const proto = (headers.get("x-forwarded-proto") || "https").split(",")[0].trim();
    return `${proto}://${forwardedHost}`;
  }

  return requestUrl.origin;
}

export async function POST(request: Request) {
  const service = createSupabaseServiceRoleClient();
  if (!service) {
    return failure(503, NOT_SENT, { tag: "AUTH-SIGNUP", what: "SUPABASE_SERVICE_ROLE_KEY not set" });
  }

  const requestUrl = new URL(request.url);
  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    email?: string;
    next?: string;
    kind?: string;
  };
  if (String(body.kind ?? "") === "client") {
    // the Stage 5 client branch (an account before approval) ended 2026-11-02: ask from /request-access instead
    return NextResponse.json({ error: "Access requests have moved: use Ask for access on the sign-in page." }, { status: 410 });
  }

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
    return failure(500, NOT_SENT, { tag: "AUTH-SIGNUP", what: "email_confirmations insert failed", detail: tokenError });
  }

  const out = await sendInviteEmail(service, email, name, callbackUrl);
  if (!out.ok) {
    // The detail (a link Supabase would not make, a send the mail service refused) is logged, not shown.
    console.error("[auth/email/request-confirmation] confirmation email not sent", { message: out.error });
    return NextResponse.json({ ok: true, sent: false, message: NOT_SENT });
  }

  // Store the Supabase user ID in the token purpose so the confirm step can
  // look up the account without scanning all users.
  if (out.userId) {
    await service
      .from("email_confirmations")
      .update({ purpose: `signup:${out.userId}` })
      .eq("token_hash", tokenHash)
      .is("used_at", null);
  }

  return NextResponse.json({
    ok: true,
    sent: true,
    message: "If this email can receive invitations, a confirmation email has been sent.",
  });
}
