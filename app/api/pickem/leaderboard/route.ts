import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/admin-auth";
import { getActiveCompetition, getLeaderboard, hasSubmitted } from "@/lib/pickem-store";

export async function GET() {
  const auth = await requireAuthenticatedUser();
  if ("error" in auth) return auth.error;
  const competition = await getActiveCompetition();
  if (!competition) return NextResponse.json({ error: "Competition not configured." }, { status: 404 });

  const [rows, viewerSubmitted] = await Promise.all([
    getLeaderboard(competition.id),
    hasSubmitted({ userId: auth.user.id, competitionId: competition.id }),
  ]);

  return NextResponse.json({
    competitionId: competition.id,
    viewerSubmitted,
    rows,
  });
}
