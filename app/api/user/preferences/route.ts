import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createSupabaseServiceRoleClient } from "@/lib/supabase-admin";
import { requirePermission } from "@/lib/permissions/server";
import { sanitizeLayout } from "@/lib/dashboard-layout";
import { isDensity, isMotion, isStartPage, sanitizePins } from "@/lib/user-settings";

const PREF_SELECT =
  "display_name, notify_enabled, notify_search_start, notify_search_end, notify_notam, notify_aip, notify_gen, captcha_consent_dismissed, is_admin, created_at, updated_at";
const PREF_POST_SELECT =
  "display_name, notify_enabled, notify_search_start, notify_search_end, notify_notam, notify_aip, notify_gen, captcha_consent_dismissed, updated_at";

const THEMES = ["system", "light", "dark"];
// Columns added by the portal redesign. Until their SQL has run (docs/supabase-portal-theme.sql,
// docs/supabase-portal-dashboard.sql, docs/supabase-portal-settings.sql) a read or write leaves them out instead of
// failing the rest.
const OPTIONAL = ["theme", "dashboard_layout", "table_density", "motion", "start_page", "pinned_tabs"] as const;
type Optional = (typeof OPTIONAL)[number];
const missingColumn = (e: { message?: string; code?: string }, col: string) => (e.message ?? "").includes(col) && (e.code === "42703" || e.code === "PGRST204" || /does not exist|schema cache/.test(e.message ?? ""));
const missingOptional = (e: { message?: string; code?: string } | null, cols: readonly Optional[]) => (e ? cols.find((c) => missingColumn(e, c)) ?? null : null);

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
    let cols: Optional[] = [...OPTIONAL];
    let { data, error } = await db.from("user_preferences").select([PREF_SELECT, ...cols].join(", ")).eq("user_id", userId!).maybeSingle();
    for (let miss = missingOptional(error, cols); miss; miss = missingOptional(error, cols)) {
      cols = cols.filter((c) => c !== miss);
      ({ data, error } = await db.from("user_preferences").select([PREF_SELECT, ...cols].join(", ")).eq("user_id", userId!).maybeSingle());
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
      dashboard_layout?: unknown;
      table_density?: unknown;
      motion?: unknown;
      start_page?: unknown;
      pinned_tabs?: unknown;
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

    // The dashboard's blocks and their sizes (lib/dashboard-layout); null goes back to the default layout.
    if (body.dashboard_layout !== undefined) {
      const layout = body.dashboard_layout === null ? null : sanitizeLayout(body.dashboard_layout);
      if (body.dashboard_layout !== null && !layout) return NextResponse.json({ error: "dashboard_layout must be a list of known blocks, each sized S, M or L" }, { status: 400 });
      updates.dashboard_layout = layout;
    }

    // Settings (lib/user-settings): each checked here; a bad value is refused, not stored.
    if (body.table_density !== undefined) {
      if (!isDensity(body.table_density)) return NextResponse.json({ error: "table_density must be comfortable or compact" }, { status: 400 });
      updates.table_density = body.table_density;
    }
    if (body.motion !== undefined) {
      if (!isMotion(body.motion)) return NextResponse.json({ error: "motion must be system or reduce" }, { status: 400 });
      updates.motion = body.motion;
    }
    if (body.start_page !== undefined) {
      if (!isStartPage(body.start_page)) return NextResponse.json({ error: "start_page is not one of the start pages" }, { status: 400 });
      updates.start_page = body.start_page;
    }
    if (body.pinned_tabs !== undefined) {
      const pins = sanitizePins(body.pinned_tabs);
      if (!pins) return NextResponse.json({ error: "pinned_tabs must be up to 5 pages or airports" }, { status: 400 });
      updates.pinned_tabs = pins;
    }

    const db = admin ?? supabase;
    let cols = OPTIONAL.filter((c) => updates[c] !== undefined);
    const write = () => db.from("user_preferences").upsert(updates, { onConflict: "user_id" }).select([PREF_POST_SELECT, ...cols].join(", ")).single();
    let { data, error } = await write();
    // A column whose SQL has not run yet: the choice still holds on this device (localStorage); say it was not saved
    // to the account rather than failing the other fields.
    const unsaved = new Set<Optional>();
    for (let miss = missingOptional(error, cols); miss; miss = missingOptional(error, cols)) {
      delete updates[miss];
      unsaved.add(miss);
      cols = cols.filter((c) => c !== miss);
      ({ data, error } = await write());
    }

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      preferences: data,
      ...(body.theme !== undefined ? { themeSaved: !unsaved.has("theme") } : {}),
      ...(body.dashboard_layout !== undefined ? { dashboardSaved: !unsaved.has("dashboard_layout") } : {}),
      unsaved: [...unsaved],
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: (e as { message?: string })?.message || "Failed" },
      { status: 500 }
    );
  }
}
