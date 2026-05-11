import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase-admin";

const VALID_SOURCES = new Set(["ead", "scraper", "usa", "asecna"]);

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      icao?: string;
      source?: string;
      duration_ms?: number;
    };

    const icao = (body.icao ?? "").trim().toUpperCase();
    const source = (body.source ?? "").trim().toLowerCase();
    const duration_ms = body.duration_ms;

    if (!/^[A-Z0-9]{4}$/.test(icao)) {
      return NextResponse.json({ error: "Invalid ICAO" }, { status: 400 });
    }
    if (!VALID_SOURCES.has(source)) {
      return NextResponse.json({ error: "Invalid source" }, { status: 400 });
    }
    if (typeof duration_ms !== "number" || duration_ms <= 0 || duration_ms > 600_000) {
      return NextResponse.json({ error: "Invalid duration" }, { status: 400 });
    }

    const admin = createSupabaseServiceRoleClient();
    if (!admin) return NextResponse.json({ ok: false }, { status: 200 });

    await admin.from("pdf_download_stats").insert({ icao, source, duration_ms });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
