import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createSupabaseServiceRoleClient } from "@/lib/supabase-admin";
import { requirePermission } from "@/lib/permissions/server";

const PREF_SELECT =
  "display_name, notify_enabled, notify_search_start, notify_search_end, notify_notam, notify_aip, notify_gen, captcha_consent_dismissed, is_admin, created_at, updated_at";
const PREF_POST_SELECT =
  "display_name, notify_enabled, notify_search_start, notify_search_end, notify_notam, notify_aip, notify_gen, captcha_consent_dismissed, updated_at";

const THEMES = ["system", "light", "dark"];
const missingThemeColumn = (e: { message?: string; code?: string }) => /theme/.test(e.message ?? "") && (e.code === "42703" || e.code === "PGRST204" || /does not exist|schema cache/.test(e.message ?? ""));

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

    const admin = createSupabaseServiceRoleClient();
    const db = admin ?? supabase;
    let { data, error } = await db
      .from("user_preferences")
      .select(`${PREF_SELECT}, theme`)
      .eq("user_id", userId!)
      .maybeSingle();
    // Before docs/supabase-portal-theme.sql has run there is no theme column: read the rest as before.
    if (error && missingThemeColumn(error)) {
      ({ data, error } = await db.from("user_preferences").select(PREF_SELECT).eq("user_id", userId!).maybeSingle());
    }

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
  const permission = await requirePermission("portal.account.preferences");
  if ("error" in permission) return permission.error;
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
      captcha_consent_dismissed?: boolean;
      theme?: string;
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
    if (typeof body.captcha_consent_dismissed === "boolean") {
      updates.captcha_consent_dismissed = body.captcha_consent_dismissed;
    }
    // Appearance (portal redesign §1.3): "system" (match this device), "light" or "dark".
    if (body.theme !== undefined) {
      if (!THEMES.includes(body.theme)) return NextResponse.json({ error: "theme must be system, light or dark" }, { status: 400 });
      updates.theme = body.theme;
    }

    const db = admin ?? supabase;
    let { data, error } = await db
      .from("user_preferences")
      .upsert(updates, { onConflict: "user_id" })
      .select(updates.theme !== undefined ? `${PREF_POST_SELECT}, theme` : PREF_POST_SELECT)
      .single();
    // No theme column yet (docs/supabase-portal-theme.sql not run): the choice still holds on this device
    // (localStorage); say it was not saved to the account rather than failing the other fields.
    let themeSaved = updates.theme !== undefined;
    if (error && missingThemeColumn(error)) {
      delete updates.theme;
      themeSaved = false;
      ({ data, error } = await db.from("user_preferences").upsert(updates, { onConflict: "user_id" }).select(PREF_POST_SELECT).single());
    }

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, preferences: data, ...(body.theme !== undefined ? { themeSaved } : {}) });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: (e as { message?: string })?.message || "Failed" },
      { status: 500 }
    );
  }
}
