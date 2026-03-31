import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
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

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    const disableAuthForTesting = String(process.env.DISABLE_AUTH_FOR_TESTING || "").toLowerCase() === "true";
    if (disableAuthForTesting && (userErr || !user)) {
      return NextResponse.json({ preferences: {} });
    }

    const userId = user?.id ?? null;
    if (userErr || !userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const metadata = (user?.user_metadata ?? {}) as Record<string, unknown>;
    const metadataName =
      (typeof metadata.full_name === "string" ? metadata.full_name : null) ??
      (typeof metadata.name === "string" ? metadata.name : null);
    const normalizedMetadataName = metadataName?.trim() || null;

    const admin = createSupabaseServiceRoleClient();
    const db = admin ?? supabase;
    const { data, error } = await db
      .from("user_preferences")
      .select(PREF_SELECT)
      .eq("user_id", userId!)
      .maybeSingle();

    if (error && error.code !== "PGRST116") {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    let preferences: Record<string, unknown> | null = (data as Record<string, unknown> | null) ?? null;
    if ((!preferences || !preferences.display_name) && normalizedMetadataName) {
      const fallback = {
        user_id: userId,
        display_name: normalizedMetadataName,
      };
      const { data: synced, error: syncErr } = await db
        .from("user_preferences")
        .upsert(fallback, { onConflict: "user_id" })
        .select(PREF_SELECT)
        .maybeSingle();
      if (!syncErr && synced) {
        preferences = synced as Record<string, unknown>;
      } else {
        preferences = {
          ...(preferences ?? {}),
          display_name: normalizedMetadataName,
        };
      }
    }

    return NextResponse.json({ preferences });
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

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();
    const userId = user?.id ?? null;
    if (userErr || !userId) {
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
