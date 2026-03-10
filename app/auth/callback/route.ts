import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next") || "/";

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return NextResponse.redirect(new URL(`/login?error=missing_supabase`, requestUrl.origin));
  }

  const response = NextResponse.redirect(new URL(next, requestUrl.origin));

  if (code) {
    const supabase = createServerClient(url, anonKey, {
      cookies: {
        getAll() {
          // Cookies not needed from Request in this callback.
          return [];
        },
        setAll(cookiesToSet) {
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    });

    await supabase.auth.exchangeCodeForSession(code);
  }

  return response;
}

