import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase-admin";

const MIN_SAMPLES = 5;

export async function GET(request: NextRequest) {
  const icao = request.nextUrl.searchParams.get("icao")?.trim().toUpperCase() ?? "";
  const source = request.nextUrl.searchParams.get("source")?.trim().toLowerCase() ?? "";

  if (!/^[A-Z0-9]{4}$/.test(icao)) {
    return NextResponse.json({ estimate: null }, { status: 200 });
  }

  const admin = createSupabaseServiceRoleClient();
  if (!admin) return NextResponse.json({ estimate: null });

  // Try per-ICAO average first (last 50 downloads)
  const { data: icaoRows } = await admin
    .from("pdf_download_stats")
    .select("duration_ms")
    .eq("icao", icao)
    .order("created_at", { ascending: false })
    .limit(50);

  if (icaoRows && icaoRows.length >= MIN_SAMPLES) {
    const avg = Math.round(icaoRows.reduce((s, r) => s + r.duration_ms, 0) / icaoRows.length);
    return NextResponse.json({ estimate: avg, samples: icaoRows.length, basis: "icao" });
  }

  // Fallback to source-type average (last 100 downloads of same source)
  if (source) {
    const { data: sourceRows } = await admin
      .from("pdf_download_stats")
      .select("duration_ms")
      .eq("source", source)
      .order("created_at", { ascending: false })
      .limit(100);

    if (sourceRows && sourceRows.length >= MIN_SAMPLES) {
      const avg = Math.round(sourceRows.reduce((s, r) => s + r.duration_ms, 0) / sourceRows.length);
      return NextResponse.json({ estimate: avg, samples: sourceRows.length, basis: "source" });
    }
  }

  return NextResponse.json({ estimate: null });
}
