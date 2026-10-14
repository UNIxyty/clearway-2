import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase-admin";
import { getAsecnaAirportByIcao } from "@/lib/asecna-airports";
import { requirePermission } from "@/lib/permissions/server";
import { TRY_AGAIN, failure } from "@/lib/public-error";

const NOT_STARTED = `The ASECNA download was not started. ${TRY_AGAIN}`;

export async function POST(request: NextRequest) {
  const permission = await requirePermission("portal.aip.fetch");
  if ("error" in permission) return permission.error;
  const body = (await request.json().catch(() => ({}))) as {
    icao?: string;
    countryCode?: string;
  };
  const icao = String(body.icao || "").trim().toUpperCase();
  if (!/^[A-Z0-9]{4}$/.test(icao)) {
    return NextResponse.json({ error: "Valid 4-letter ICAO required" }, { status: 400 });
  }
  const airport = getAsecnaAirportByIcao(icao);
  if (!airport) {
    return NextResponse.json({ error: "ICAO is not in ASECNA dynamic list" }, { status: 404 });
  }
  const supabase = createSupabaseServiceRoleClient();
  if (!supabase) {
    return failure(503, NOT_STARTED, { tag: "ASECNA-TRIGGER", what: "SUPABASE_SERVICE_ROLE_KEY not set" });
  }
  const { data, error } = await supabase
    .from("asecna_jobs")
    .insert({
      icao,
      country_code: body.countryCode || airport.countryCode,
      status: "queued",
    })
    .select("id,status,created_at")
    .single();
  if (error) {
    return failure(500, NOT_STARTED, { tag: "ASECNA-TRIGGER", what: "Database error", detail: error });
  }
  return NextResponse.json({ jobId: data.id, status: data.status, createdAt: data.created_at });
}
