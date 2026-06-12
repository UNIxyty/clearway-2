import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/admin-auth";
import {
  getActiveCompetition,
  getUserLockOverride,
  listGroupResults,
  listGroups,
  listMatches,
  listTeams,
  listUserPredictions,
} from "@/lib/pickem-store";

export async function GET() {
  const auth = await requireAuthenticatedUser();
  if ("error" in auth) return auth.error;

  const competition = await getActiveCompetition();
  if (!competition) {
    return NextResponse.json({ error: "Pickem competition is not configured." }, { status: 404 });
  }

  const [groups, teams, matches, groupResults, userPredictions, prefRes, lockOverride] = await Promise.all([
    listGroups(competition.id),
    listTeams(competition.id),
    listMatches(competition.id),
    listGroupResults(competition.id),
    listUserPredictions({ userId: auth.user.id, competitionId: competition.id }),
    auth.supabase
      .from("user_preferences")
      .select("display_name")
      .eq("user_id", auth.user.id)
      .maybeSingle(),
    getUserLockOverride({ userId: auth.user.id, competitionId: competition.id }),
  ]);

  const displayName =
    String((prefRes.data as { display_name?: string } | null)?.display_name || "").trim() ||
    String(auth.user.user_metadata?.display_name || "").trim() ||
    String(auth.user.email || "").split("@")[0] ||
    "Player";

  return NextResponse.json({
    competition,
    viewer: {
      userId: auth.user.id,
      email: auth.user.email || null,
      displayName,
      lockOverrideUntil: lockOverride?.unlockUntil || null,
    },
    groups,
    teams,
    matches,
    groupResults,
    userPredictions,
  });
}
