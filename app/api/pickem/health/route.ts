import { NextResponse } from "next/server";
import { getActiveCompetition } from "@/lib/pickem-store";

export async function GET() {
  const competition = await getActiveCompetition();
  return NextResponse.json({
    ok: true,
    configured: Boolean(competition),
    competitionSlug: competition?.slug || null,
  });
}
