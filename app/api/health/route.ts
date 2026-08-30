import { NextResponse } from "next/server";

// Portal health probe (platform audit §6.4). Deliberately unauthenticated —
// middleware lets /api/health through — and deliberately cheap: no Supabase,
// no storage, no external calls. It proves the Next server itself answers.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET() {
  return NextResponse.json({
    ok: true,
    service: "portal",
    time: new Date().toISOString(),
  });
}
