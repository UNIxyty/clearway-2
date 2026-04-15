import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createSupabaseServiceRoleClient } from "@/lib/supabase-admin";

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

  const { data: existingHidden, error: existingHiddenError } = await service
    .from("deleted_airports")
    .select("id")
    .eq("icao", icao)
    .eq("deleted_by", user.id)
    .is("restored_at", null)
    .limit(1);
  if (existingHiddenError) return NextResponse.json({ error: existingHiddenError.message }, { status: 500 });
  if ((existingHidden ?? []).length > 0) return NextResponse.json({ ok: true, alreadyHidden: true });

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
