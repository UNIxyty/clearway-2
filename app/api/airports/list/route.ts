import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createSupabaseServiceRoleClient } from "@/lib/supabase-admin";
import { TRY_AGAIN, failure } from "@/lib/public-error";
import { staffGate } from "@/lib/admin-auth";
import { selectAll } from "@/lib/supabase-all";

const NOT_LOADED = `The airport list could not be loaded. ${TRY_AGAIN}`;

export async function GET(request: NextRequest) {
  const notStaff = await staffGate(request); if (notStaff) return notStaff; // staff (or the platform's own services) only, checked here (2026-11-02)
  const searchParams = request.nextUrl.searchParams;
  const country = searchParams.get("country")?.trim() || null;
  const state = searchParams.get("state")?.trim() || null;
  const includeDeleted = searchParams.get("include_deleted") === "true";
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return failure(500, NOT_LOADED, { tag: "AIRPORTS-LIST", what: "Supabase URL / anon key not set" });

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

  const service = createSupabaseServiceRoleClient();
  if (!service) {
    return failure(503, NOT_LOADED, { tag: "AIRPORTS-LIST", what: "SUPABASE_SERVICE_ROLE_KEY not set" });
  }

  if (includeDeleted) {
    if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data, error } = await service
      .from("deleted_airports")
      .select("id, icao, airport_snapshot, deleted_reason, deleted_at, restored_at")
      .eq("deleted_by", user.id)
      .is("restored_at", null)
      .order("deleted_at", { ascending: false })
      .limit(500);
    if (error) return failure(500, NOT_LOADED, { tag: "AIRPORTS-LIST", what: "Database error", detail: error });
    return NextResponse.json({ results: data ?? [] });
  }

  // every visible airport (2026-11-07: .limit(10000) was cut at 1000, alphabetically, without a word)
  const build = () => {
    let query = service
      .from("airports")
      .select("country,state,icao,name,lat,lon,visible")
      .eq("visible", true)
      .order("icao", { ascending: true });
    if (country) query = query.eq("country", country);
    if (state) query = query.eq("state", state);
    return query;
  };
  const { data, error } = await selectAll((from, to) => build().range(from, to));
  if (error) return failure(500, NOT_LOADED, { tag: "AIRPORTS-LIST", what: "Database error", detail: error });
  const airports = (data ?? []) as Array<{ icao?: string } & Record<string, unknown>>;
  if (!user?.id) return NextResponse.json({ results: airports });

  const { data: hiddenRows, error: hiddenError } = await selectAll((from, to) => service
    .from("deleted_airports")
    .select("icao")
    .eq("deleted_by", user.id)
    .is("restored_at", null)
    .order("icao", { ascending: true })
    .range(from, to));
  if (hiddenError) return failure(500, NOT_LOADED, { tag: "AIRPORTS-LIST", what: "Database error (hiddenError)", detail: hiddenError });

  const hiddenIcaos = new Set((hiddenRows ?? []).map((row) => String((row as { icao?: string }).icao ?? "").toUpperCase()));
  const filtered = airports.filter((airport) => !hiddenIcaos.has(String(airport.icao ?? "").toUpperCase()));
  return NextResponse.json({ results: filtered });
}
