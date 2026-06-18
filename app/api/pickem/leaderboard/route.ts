import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/admin-auth";
import { getActiveCompetition, getLeaderboard, hasSubmitted, listGroupResults } from "@/lib/pickem-store";

export async function GET() {
  const auth = await requireAuthenticatedUser();
  if ("error" in auth) return auth.error;
  const competition = await getActiveCompetition();
  if (!competition) return NextResponse.json({ error: "Competition not configured." }, { status: 404 });

  const [rows, viewerSubmitted, groupResults] = await Promise.all([
    getLeaderboard(competition.id),
    hasSubmitted({ userId: auth.user.id, competitionId: competition.id }),
    listGroupResults(competition.id),
  ]);

  // Group-position points can only be scored once admin finalizes the real group
  // positions (pickem_group_results). Until then groupPoints is legitimately 0
  // for everyone — the UI should show "—" (pending), not "0" (which implies
  // "scored, earned nothing").
  return NextResponse.json({
    competitionId: competition.id,
    viewerSubmitted,
    groupResultsFinalized: groupResults.length > 0,
    rows,
  });
}
