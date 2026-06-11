import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/admin-auth";
import { pickemTeamFlag, sendPickemSubmissionEmail } from "@/lib/pickem-email";
import { isGroupPredictionsLocked } from "@/lib/pickem-rules";
import {
  getActiveCompetition,
  hasSubmitted,
  listGroups,
  listMatches,
  listTeams,
  listUserPredictions,
  markSubmitted,
} from "@/lib/pickem-store";

export async function POST() {
  const auth = await requireAuthenticatedUser();
  if ("error" in auth) return auth.error;
  const competition = await getActiveCompetition();
  if (!competition) return NextResponse.json({ error: "Competition not configured." }, { status: 404 });
  if (isGroupPredictionsLocked(competition)) {
    return NextResponse.json({ error: "Submission is closed." }, { status: 409 });
  }

  const [groups, teams, matches, predictions] = await Promise.all([
    listGroups(competition.id),
    listTeams(competition.id),
    listMatches(competition.id),
    listUserPredictions({ userId: auth.user.id, competitionId: competition.id }),
  ]);

  const groupMatchIds = matches.filter((m) => m.stage === "group").map((m) => m.id);
  const predictedMatchIds = new Set(predictions.matchPredictions.map((m) => m.matchId));
  const missingMatches = groupMatchIds.filter((id) => !predictedMatchIds.has(id));
  if (missingMatches.length) {
    return NextResponse.json({ error: "You must predict all group matches before submit." }, { status: 400 });
  }

  const alreadySubmitted = await hasSubmitted({ userId: auth.user.id, competitionId: competition.id });
  await markSubmitted({ userId: auth.user.id, competitionId: competition.id });

  if (!alreadySubmitted && auth.user.email) {
    const displayName =
      String(auth.user.user_metadata?.display_name || auth.user.user_metadata?.name || "").trim() ||
      String(auth.user.email).split("@")[0];
    const teamById = new Map(teams.map((team) => [team.id, team]));
    const predictionByMatchId = new Map(
      predictions.matchPredictions.map((prediction) => [prediction.matchId, prediction]),
    );
    const matchPicks = matches
      .filter((match) => match.stage === "group")
      .sort((a, b) => new Date(a.kickoffAt).getTime() - new Date(b.kickoffAt).getTime())
      .map((match) => {
        const prediction = predictionByMatchId.get(match.id);
        if (!prediction) return null;
        return {
          homeName: teamById.get(match.homeTeamId)?.name || "Home",
          awayName: teamById.get(match.awayTeamId)?.name || "Away",
          homeScore: prediction.predictedHomeScore,
          awayScore: prediction.predictedAwayScore,
          homeFlag: pickemTeamFlag(teamById.get(match.homeTeamId)?.name || ""),
          awayFlag: pickemTeamFlag(teamById.get(match.awayTeamId)?.name || ""),
        };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row));
    const daysToKickoff = Math.max(
      0,
      Math.ceil((new Date(competition.startsAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000)),
    );
    const submittedAt = new Date().toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/Riga",
    });

    void sendPickemSubmissionEmail({
      to: auth.user.email,
      displayName,
      competitionName: competition.name,
      groupsSet: groups.length,
      groupsTotal: groups.length,
      matchesPredicted: predictions.matchPredictions.length,
      matchPicks,
      submittedAt,
      daysToKickoff,
    });
  }
  return NextResponse.json({ ok: true });
}
