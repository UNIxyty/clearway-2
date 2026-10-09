// Sign out from anywhere that has no Supabase client of its own (the Digital Wall console): ends the session on the
// server, expires its cookies, and lands on the sign-in page. POST only, so a link or an image cannot sign anyone out.
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const SESSION_COOKIE = /^sb-.+-auth-token(\.\d+)?$/;

export async function POST(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && anonKey) {
    try {
      // Reads the session from the request; its own cookie writes are ignored — the response below expires them.
      const supabase = createServerClient(url, anonKey, { cookies: { getAll: () => request.cookies.getAll(), setAll: () => {} } });
      await supabase.auth.signOut();
    } catch {
      // Already signed out, or auth unreachable: the cookies are expired either way.
    }
  }
  const response = NextResponse.redirect(new URL("/login", request.url), 303);
  for (const c of request.cookies.getAll()) if (SESSION_COOKIE.test(c.name)) response.cookies.set(c.name, "", { path: "/", maxAge: 0 });
  return response;
}
