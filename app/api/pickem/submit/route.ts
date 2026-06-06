import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/admin-auth";
import { getActiveCompetition, listGroups, listMatches, listUserPredictions, markSubmitted } from "@/lib/pickem-store";

export async function POST() {
  const auth = await requireAuthenticatedUser();
  if ("error" in auth) return auth.error;
  const competition = await getActiveCompetition();
  if (!competition) return NextResponse.json({ error: "Competition not configured." }, { status: 404 });

  const [groups, matches, predictions] = await Promise.all([
    listGroups(competition.id),
    listMatches(competition.id),
    listUserPredictions({ userId: auth.user.id, competitionId: competition.id }),
  ]);

  const groupCodes = groups.map((g) => g.code);
  const predictedGroups = new Set(predictions.groupPredictions.map((g) => g.groupCode));
  const missingGroups = groupCodes.filter((code) => !predictedGroups.has(code));
  if (missingGroups.length) {
    return NextResponse.json({ error: `Missing group predictions for: ${missingGroups.join(", ")}` }, { status: 400 });
  }

  const groupMatchIds = matches.filter((m) => m.stage === "group").map((m) => m.id);
  const predictedMatchIds = new Set(predictions.matchPredictions.map((m) => m.matchId));
  const missingMatches = groupMatchIds.filter((id) => !predictedMatchIds.has(id));
  if (missingMatches.length) {
    return NextResponse.json({ error: "You must predict all group matches before submit." }, { status: 400 });
  }

  await markSubmitted({ userId: auth.user.id, competitionId: competition.id });
  return NextResponse.json({ ok: true });
}
