import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const error = requestUrl.searchParams.get("error");
  const errorDescription = requestUrl.searchParams.get("error_description");
  const nextRaw = requestUrl.searchParams.get("next") || "/";
  const next = nextRaw.startsWith("/") ? nextRaw : "/";
  const continueRaw = requestUrl.searchParams.get("continue");
  const continuePath = continueRaw && continueRaw.startsWith("/") ? continueRaw : null;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return NextResponse.redirect(new URL(`/login?error=missing_supabase`, requestUrl.origin));
  }

  // Supabase/Google sent an error (e.g. redirect_uri_mismatch, access_denied)
  if (error) {
    const loginUrl = new URL("/login", requestUrl.origin);
    loginUrl.searchParams.set("error", "oauth_failed");
    loginUrl.searchParams.set("message", errorDescription || error);
    loginUrl.searchParams.set("next", next);
    return NextResponse.redirect(loginUrl);
  }

  if (!code) {
    const loginUrl = new URL("/login", requestUrl.origin);
    loginUrl.searchParams.set("error", "oauth_no_code");
    loginUrl.searchParams.set("next", next);
    return NextResponse.redirect(loginUrl);
  }

  const redirectTo = new URL(next, requestUrl.origin);
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

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) {
    const loginUrl = new URL("/login", requestUrl.origin);
    loginUrl.searchParams.set("error", "session_exchange_failed");
    loginUrl.searchParams.set("message", exchangeError.message);
    loginUrl.searchParams.set("next", next);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

