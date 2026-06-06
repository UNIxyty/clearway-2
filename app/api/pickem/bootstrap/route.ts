import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/admin-auth";
import { getActiveCompetition, listGroups, listMatches, listTeams, listUserPredictions } from "@/lib/pickem-store";

export async function GET() {
  const auth = await requireAuthenticatedUser();
  if ("error" in auth) return auth.error;

  const competition = await getActiveCompetition();
  if (!competition) {
    return NextResponse.json({ error: "Pickem competition is not configured." }, { status: 404 });
  }

  const [groups, teams, matches, userPredictions] = await Promise.all([
    listGroups(competition.id),
    listTeams(competition.id),
    listMatches(competition.id),
    listUserPredictions({ userId: auth.user.id, competitionId: competition.id }),
  ]);

  return NextResponse.json({
    competition,
    groups,
    teams,
    matches,
    userPredictions,
  });
}
