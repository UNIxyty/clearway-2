import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createSupabaseServiceRoleClient } from "@/lib/supabase-admin";
import { requirePermission } from "@/lib/permissions/server";
import { failure } from "@/lib/public-error";

// This log is written in the background; nothing on screen depends on it.
const NOT_LOGGED = "The search was not recorded.";

export async function POST(request: Request) {
  const permission = await requirePermission("portal.search.log");
  if ("error" in permission) return permission.error;
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey) {
      return failure(500, NOT_LOGGED, { tag: "SEARCH-LOG", what: "Supabase URL / anon key not set" });
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

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();
    const identityId = user?.id ?? null;
    if (userErr || !identityId) {
      return failure(401, "Unauthorized", { tag: "SEARCH-LOG", what: "getUser failed", detail: userErr ?? undefined });
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

    const admin = createSupabaseServiceRoleClient();
    const db = admin ?? supabase;
    const { error } = await db.from("search_events").insert({
      user_id: identityId,
      query,
      result_count: typeof body.resultCount === "number" ? body.resultCount : null,
      source: typeof body.source === "string" ? body.source : "portal",
    });
    if (error) {
      return failure(500, NOT_LOGGED, { tag: "SEARCH-LOG", what: "Database error", detail: error });
    }
    return NextResponse.json({ ok: true, logged: true }, { status: 200 });
  } catch (e: unknown) {
    return failure(500, NOT_LOGGED, { tag: "SEARCH-LOG", what: "Unexpected error", detail: e });
  }
}
