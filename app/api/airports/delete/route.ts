import { NextResponse } from "next/server";
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

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return NextResponse.json({ error: "Missing Supabase config" }, { status: 500 });
  }

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

  const service = createSupabaseServiceRoleClient();
  if (!service) {
    return NextResponse.json({ error: "Missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 503 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    icao?: string;
    reason?: string;
  };
  const icao = String(body.icao ?? "").trim().toUpperCase();
  const reason = String(body.reason ?? "").trim() || null;
  if (!icao) return NextResponse.json({ error: "ICAO is required" }, { status: 400 });

  const { data: airport, error: airportError } = await service
    .from("airports")
    .select("*")
    .eq("icao", icao)
    .maybeSingle();
  if (airportError) return NextResponse.json({ error: airportError.message }, { status: 500 });
  if (!airport) return NextResponse.json({ error: "Airport not found" }, { status: 404 });

  const { error: updateError } = await service
    .from("airports")
    .update({ visible: false, updated_at: new Date().toISOString() })
    .eq("icao", icao);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  const { error: archiveError } = await service.from("deleted_airports").insert({
    airport_id: typeof (airport as { id?: unknown }).id === "number" ? (airport as { id: number }).id : null,
    icao,
    airport_snapshot: airport,
    deleted_by: user.id,
    deleted_reason: reason,
  });
  if (archiveError) return NextResponse.json({ error: archiveError.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
