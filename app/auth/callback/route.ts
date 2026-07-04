import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { safeNextPath } from "@/lib/auth-next-path.mjs";

function getPublicOrigin(requestUrl: URL, headers: Headers): string {
  const siteUrl = String(process.env.PORTAL_SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || "").trim().replace(/\/+$/, "");
  if (siteUrl) return siteUrl;
  const forwardedHost = headers.get("x-forwarded-host") || headers.get("host") || "";
  if (forwardedHost) {
    const proto = (headers.get("x-forwarded-proto") || "https").split(",")[0].trim();
    return `${proto}://${forwardedHost}`;
  }
  return origin;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const origin = getPublicOrigin(requestUrl, request.headers);
  const code = requestUrl.searchParams.get("code");
  const tokenHash =
    requestUrl.searchParams.get("token_hash") ?? requestUrl.searchParams.get("token");
  const rawTokenType = requestUrl.searchParams.get("type");
  const tokenType = rawTokenType ? rawTokenType.toLowerCase() : null;
  const signupToken = requestUrl.searchParams.get("signup_token");
  const error = requestUrl.searchParams.get("error");
  const errorDescription = requestUrl.searchParams.get("error_description");
  const nextRaw =
    requestUrl.searchParams.get("next") ||
    (signupToken ? `/auth/confirm?token=${encodeURIComponent(signupToken)}` : "/");
  // safeNextPath blocks external/protocol-relative values ("//evil.com"
  // would otherwise resolve off-origin via `new URL(next, origin)` below).
  const next = safeNextPath(nextRaw);
  const continueRaw = requestUrl.searchParams.get("continue");
  const continuePath = safeNextPath(continueRaw, "") || null;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return NextResponse.redirect(new URL(`/login?error=missing_supabase`, origin));
  }

  // Supabase/Google sent an error (e.g. redirect_uri_mismatch, access_denied)
  if (error) {
    const loginUrl = new URL("/login", origin);
    loginUrl.searchParams.set("error", "oauth_failed");
    loginUrl.searchParams.set("message", errorDescription || error);
    loginUrl.searchParams.set("next", next);
    return NextResponse.redirect(loginUrl);
  }

  if (!code && !tokenHash) {
    if (signupToken) {
      const confirmUrl = new URL(
        `/auth/confirm?token=${encodeURIComponent(signupToken)}`,
        origin,
      );
      if (continuePath) {
        confirmUrl.searchParams.set("continue", continuePath);
      }
      return NextResponse.redirect(confirmUrl);
    }
    if (next.startsWith("/auth/reset")) {
      const resetUrl = new URL(next, origin);
      if (continuePath) {
        resetUrl.searchParams.set("continue", continuePath);
      }
      return NextResponse.redirect(resetUrl);
    }
    const loginUrl = new URL("/login", origin);
    loginUrl.searchParams.set("error", "oauth_no_code");
    loginUrl.searchParams.set("next", next);
    return NextResponse.redirect(loginUrl);
  }

  const redirectTo = new URL(next, origin);
  if (continuePath) {
    redirectTo.searchParams.set("continue", continuePath);
  }
  const response = NextResponse.redirect(redirectTo);
  const cookieStore = cookies();

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  let authError: string | null = null;
  if (code) {
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) authError = exchangeError.message;
  } else if (tokenHash) {
    const otpType =
      (tokenType as "signup" | "invite" | "recovery" | "email_change" | "email" | null) ??
      "invite";
    const { error: verifyError } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: otpType,
    });
    if (verifyError) authError = verifyError.message;
  }

  if (authError) {
    const loginUrl = new URL("/login", origin);
    loginUrl.searchParams.set("error", "session_exchange_failed");
    loginUrl.searchParams.set("message", authError);
    loginUrl.searchParams.set("next", next);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

