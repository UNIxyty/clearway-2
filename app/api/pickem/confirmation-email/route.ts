import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/admin-auth";
import { sendPickemSubmissionEmail } from "@/lib/pickem-email";
import { getActiveCompetition, hasSubmitted, listGroups, listMatches, listTeams, listUserPredictions } from "@/lib/pickem-store";

export async function POST() {
  const auth = await requireAuthenticatedUser();
  if ("error" in auth) return auth.error;

  const competition = await getActiveCompetition();
  if (!competition) {
    return NextResponse.json({ error: "Competition not configured." }, { status: 404 });
  }

  const submitted = await hasSubmitted({ userId: auth.user.id, competitionId: competition.id });
  if (!submitted) {
    return NextResponse.json({ error: "Submit predictions first." }, { status: 400 });
  }

  if (!auth.user.email) {
    return NextResponse.json({ error: "No email found on account." }, { status: 400 });
  }

  const displayName =
    String(auth.user.user_metadata?.display_name || auth.user.user_metadata?.name || "").trim() ||
    String(auth.user.email).split("@")[0];

  const [groups, teams, matches, predictions] = await Promise.all([
    listGroups(competition.id),
    listTeams(competition.id),
    listMatches(competition.id),
    listUserPredictions({ userId: auth.user.id, competitionId: competition.id }),
  ]);
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
        homeFlag: "",
        awayFlag: "",
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));
  const predictedGroups = new Set(predictions.groupPredictions.map((prediction) => prediction.groupCode));
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

  const sent = await sendPickemSubmissionEmail({
    to: auth.user.email,
    displayName,
    competitionName: competition.name,
    groupsSet: predictedGroups.size,
    groupsTotal: groups.length,
    matchesPredicted: predictions.matchPredictions.length,
    matchPicks,
    submittedAt,
    daysToKickoff,
  });

  if (!sent) {
    return NextResponse.json(
      { error: "Email could not be sent. Check RESEND_API_KEY and sender domain setup." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, message: "Confirmation email sent." });
}

