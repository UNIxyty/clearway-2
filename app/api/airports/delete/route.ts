import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createSupabaseServiceRoleClient } from "@/lib/supabase-admin";
import { requirePermission } from "@/lib/permissions/server";
import { TRY_AGAIN, failure } from "@/lib/public-error";

const NOT_HIDDEN = `The airport was not hidden. ${TRY_AGAIN}`;

export async function POST(request: Request) {
  const permission = await requirePermission("portal.airports.hide");
  if ("error" in permission) return permission.error;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return failure(500, NOT_HIDDEN, { tag: "AIRPORTS-DELETE", what: "Supabase URL / anon key not set" });
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
    return failure(503, NOT_HIDDEN, { tag: "AIRPORTS-DELETE", what: "SUPABASE_SERVICE_ROLE_KEY not set" });
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
  if (airportError) return failure(500, NOT_HIDDEN, { tag: "AIRPORTS-DELETE", what: "Database error (airportError)", detail: airportError });
  if (!airport) return NextResponse.json({ error: "Airport not found" }, { status: 404 });

  const { data: existingHidden, error: existingHiddenError } = await service
    .from("deleted_airports")
    .select("id")
    .eq("icao", icao)
    .eq("deleted_by", user.id)
    .is("restored_at", null)
    .limit(1);
  if (existingHiddenError) return failure(500, NOT_HIDDEN, { tag: "AIRPORTS-DELETE", what: "Database error (existingHiddenError)", detail: existingHiddenError });
  if ((existingHidden ?? []).length > 0) return NextResponse.json({ ok: true, alreadyHidden: true });

  const { error: archiveError } = await service.from("deleted_airports").insert({
    airport_id: typeof (airport as { id?: unknown }).id === "number" ? (airport as { id: number }).id : null,
    icao,
    airport_snapshot: airport,
    deleted_by: user.id,
    deleted_reason: reason,
  });
  if (archiveError) return failure(500, NOT_HIDDEN, { tag: "AIRPORTS-DELETE", what: "Database error (archiveError)", detail: archiveError });

  return NextResponse.json({ ok: true });
}
