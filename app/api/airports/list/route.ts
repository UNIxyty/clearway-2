import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createSupabaseServiceRoleClient } from "@/lib/supabase-admin";

function parseAdminEmails() {
  return String(process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
}

async function isAdmin(
  supabase: ReturnType<typeof createServerClient>,
  userId: string,
  email: string | null,
) {
  const adminEmails = parseAdminEmails();
  if (email && adminEmails.includes(email.toLowerCase())) return true;

  const { data, error } = await supabase
    .from("user_preferences")
    .select("is_admin")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return false;
  return Boolean((data as { is_admin?: boolean } | null)?.is_admin);
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const country = searchParams.get("country")?.trim() || null;
  const state = searchParams.get("state")?.trim() || null;
  const includeDeleted = searchParams.get("include_deleted") === "true";

  const service = createSupabaseServiceRoleClient();
  if (!service) {
    return NextResponse.json({ error: "Missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 503 });
  }

  if (includeDeleted) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey) return NextResponse.json({ error: "Missing Supabase config" }, { status: 500 });

    const cookieStore = cookies();
    const supabase = createServerClient(url, anonKey, {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {},
      },
    });
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const admin = await isAdmin(supabase, user.id, user.email ?? null);
    if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { data, error } = await service
      .from("deleted_airports")
      .select("id, icao, airport_snapshot, deleted_by, deleted_reason, deleted_at, restored_at")
      .order("deleted_at", { ascending: false })
      .limit(500);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ results: data ?? [] });
  }

  let query = service
    .from("airports")
    .select("country,state,icao,name,lat,lon,visible")
    .eq("visible", true)
    .order("icao", { ascending: true });
  if (country) query = query.eq("country", country);
  if (state) query = query.eq("state", state);

  const { data, error } = await query.limit(10000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ results: data ?? [] });
}
