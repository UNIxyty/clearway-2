import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { getCorporateTokenFromCookieStore, getCorporateSessionByToken } from "@/lib/corporate-auth";
import { createSupabaseServiceRoleClient } from "@/lib/supabase-admin";

const PREF_SELECT =
  "display_name, notify_enabled, notify_search_start, notify_search_end, notify_notam, notify_aip, notify_gen, is_admin, created_at, updated_at";
const PREF_POST_SELECT =
  "display_name, notify_enabled, notify_search_start, notify_search_end, notify_notam, notify_aip, notify_gen, updated_at";

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
    if (disableAuthForTesting && (userErr || !user) && !corporateSession) {
      return NextResponse.json({ preferences: {} });
    }

    const isCorporate = Boolean(corporateSession?.device_profile_id);
    const userId = user?.id ?? null;
    const deviceProfileId = corporateSession?.device_profile_id ?? null;

    if ((!isCorporate && (userErr || !userId)) || (isCorporate && !deviceProfileId)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createSupabaseServiceRoleClient();
    if (isCorporate) {
      if (!admin) {
        return NextResponse.json(
          {
            error: "Server misconfigured",
            detail: "SUPABASE_SERVICE_ROLE_KEY is required for corporate account preferences.",
          },
          { status: 503 }
        );
      }
      const { data, error } = await admin
        .from("device_profile_preferences")
        .select(PREF_SELECT)
        .eq("device_profile_id", deviceProfileId!)
        .maybeSingle();

      if (error && error.code !== "PGRST116") {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ preferences: data });
    }

    // Supabase auth user
    const db = admin ?? supabase;
    const { data, error } = await db
      .from("user_preferences")
      .select(PREF_SELECT)
      .eq("user_id", userId!)
      .maybeSingle();

    if (error && error.code !== "PGRST116") {
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

    const isCorporate = Boolean(corporateSession?.device_profile_id);
    const userId = user?.id ?? null;
    const deviceProfileId = corporateSession?.device_profile_id ?? null;

    if ((!isCorporate && (userErr || !userId)) || (isCorporate && !deviceProfileId)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      display_name?: string;
      notify_enabled?: boolean;
      notify_search_start?: boolean;
      notify_search_end?: boolean;
      notify_notam?: boolean;
      notify_aip?: boolean;
      notify_gen?: boolean;
    };

    const admin = createSupabaseServiceRoleClient();
    if (isCorporate) {
      if (!admin) {
        return NextResponse.json(
          {
            error: "Server misconfigured",
            detail: "SUPABASE_SERVICE_ROLE_KEY is required for corporate account preferences.",
          },
          { status: 503 }
        );
      }
      const updates: Record<string, unknown> = {
        device_profile_id: deviceProfileId,
      };
      if (body.display_name !== undefined) {
        updates.display_name = body.display_name.trim() || null;
      }
      if (typeof body.notify_enabled === "boolean") updates.notify_enabled = body.notify_enabled;
      if (typeof body.notify_search_start === "boolean") updates.notify_search_start = body.notify_search_start;
      if (typeof body.notify_search_end === "boolean") updates.notify_search_end = body.notify_search_end;
      if (typeof body.notify_notam === "boolean") updates.notify_notam = body.notify_notam;
      if (typeof body.notify_aip === "boolean") updates.notify_aip = body.notify_aip;
      if (typeof body.notify_gen === "boolean") updates.notify_gen = body.notify_gen;

      const { data, error } = await admin
        .from("device_profile_preferences")
        .upsert(updates, { onConflict: "device_profile_id" })
        .select(PREF_POST_SELECT)
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true, preferences: data });
    }

    const updates: Record<string, unknown> = {
      user_id: userId,
    };
    if (body.display_name !== undefined) {
      updates.display_name = body.display_name.trim() || null;
    }
    if (typeof body.notify_enabled === "boolean") updates.notify_enabled = body.notify_enabled;
    if (typeof body.notify_search_start === "boolean") updates.notify_search_start = body.notify_search_start;
    if (typeof body.notify_search_end === "boolean") updates.notify_search_end = body.notify_search_end;
    if (typeof body.notify_notam === "boolean") updates.notify_notam = body.notify_notam;
    if (typeof body.notify_aip === "boolean") updates.notify_aip = body.notify_aip;
    if (typeof body.notify_gen === "boolean") updates.notify_gen = body.notify_gen;

    const db = admin ?? supabase;
    const { data, error } = await db
      .from("user_preferences")
      .upsert(updates, { onConflict: "user_id" })
      .select(PREF_POST_SELECT)
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
