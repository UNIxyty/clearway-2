import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { getCorporateTokenFromCookieStore, getCorporateSessionByToken } from "@/lib/corporate-auth";

export async function GET() {
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
        setAll() {},
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

    const disableAuthForTesting = String(process.env.DISABLE_AUTH_FOR_TESTING || "").toLowerCase() === "true";
    if (disableAuthForTesting && (userErr || !user)) {
      // In test mode, allow portal UI to render without a session.
      return NextResponse.json({ preferences: {} });
    }

    const identityId = corporateSession?.device_profile_id ?? user?.id ?? null;
    if (userErr || !identityId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("user_preferences")
      .select(
        "display_name, aip_model, gen_model, notify_enabled, notify_search_start, notify_search_end, notify_notam, notify_aip, notify_gen, is_admin, created_at, updated_at"
      )
      .eq("user_id", identityId)
      .maybeSingle();

    if (error && error.code !== "PGRST116") {
      // PGRST116 = no rows returned (expected for first-time users)
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ preferences: data });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: (e as { message?: string })?.message || "Failed" },
      { status: 500 }
    );
  }
}

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
        setAll() {},
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
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      display_name?: string;
      aip_model?: string;
      gen_model?: string;
      notify_enabled?: boolean;
      notify_search_start?: boolean;
      notify_search_end?: boolean;
      notify_notam?: boolean;
      notify_aip?: boolean;
      notify_gen?: boolean;
    };

    // Build update object with only provided fields
    const updates: {
      user_id: string;
      display_name?: string | null;
      aip_model?: string;
      gen_model?: string;
      notify_enabled?: boolean;
      notify_search_start?: boolean;
      notify_search_end?: boolean;
      notify_notam?: boolean;
      notify_aip?: boolean;
      notify_gen?: boolean;
    } = {
      user_id: identityId,
    };

    if (body.display_name !== undefined) {
      updates.display_name = body.display_name.trim() || null;
    }
    if (body.aip_model?.trim()) {
      updates.aip_model = body.aip_model.trim();
    }
    if (body.gen_model?.trim()) {
      updates.gen_model = body.gen_model.trim();
    }
    if (typeof body.notify_enabled === "boolean") updates.notify_enabled = body.notify_enabled;
    if (typeof body.notify_search_start === "boolean") updates.notify_search_start = body.notify_search_start;
    if (typeof body.notify_search_end === "boolean") updates.notify_search_end = body.notify_search_end;
    if (typeof body.notify_notam === "boolean") updates.notify_notam = body.notify_notam;
    if (typeof body.notify_aip === "boolean") updates.notify_aip = body.notify_aip;
    if (typeof body.notify_gen === "boolean") updates.notify_gen = body.notify_gen;

    const { data, error } = await supabase
      .from("user_preferences")
      .upsert(updates, { onConflict: "user_id" })
      .select(
        "display_name, aip_model, gen_model, notify_enabled, notify_search_start, notify_search_end, notify_notam, notify_aip, notify_gen, updated_at"
      )
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, preferences: data });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: (e as { message?: string })?.message || "Failed" },
      { status: 500 }
    );
  }
}
