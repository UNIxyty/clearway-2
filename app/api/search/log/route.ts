import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { getCorporateTokenFromCookieStore, getCorporateSessionByToken } from "@/lib/corporate-auth";

export async function POST(request: Request) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey) {
      return NextResponse.json({ error: "Missing Supabase config" }, { status: 500 });
    }

    const cookieStore = cookies();
    const supabase = createServerClient(url, anonKey, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {
          // No-op: we only need to read session for this route
        },
      },
    });

    const corporateToken = getCorporateTokenFromCookieStore(cookieStore);
    const corporateSession = corporateToken ? await getCorporateSessionByToken(corporateToken) : null;
    const {
      data: { user },
      error: userErr,
    } = corporateSession
      ? { data: { user: null }, error: null }
      : await supabase.auth.getUser();
    const identityId = corporateSession?.device_profile_id ?? user?.id ?? null;
    if (userErr || !identityId) {
      return NextResponse.json(
        { error: "Unauthorized", detail: userErr?.message ?? "getUser failed" },
        { status: 401 },
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      query?: string;
      resultCount?: number;
      source?: string;
    };
    const query = (body.query ?? "").trim();
    if (!query) {
      return NextResponse.json({ ok: true, logged: false }, { status: 200 });
    }

    const { error } = await supabase.from("search_events").insert({
      user_id: identityId,
      query,
      result_count: typeof body.resultCount === "number" ? body.resultCount : null,
      source: typeof body.source === "string" ? body.source : "portal",
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, logged: true }, { status: 200 });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as { message?: string })?.message || "Failed" }, { status: 500 });
  }
}

