import { PICKEM_POINTS } from "@/lib/pickem-shared";
import { listMatches, listUserPredictions, replacePointsLedger } from "@/lib/pickem-store";
import { createSupabaseServiceRoleClient } from "@/lib/supabase-admin";

function matchOutcome(home: number, away: number): "home" | "away" | "draw" {
  if (home === away) return "draw";
  return home > away ? "home" : "away";
}

export async function recomputePickemPoints(competitionId: string): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();
  if (!supabase) throw new Error("Missing Supabase service role configuration");

  const [{ data: groupResults }, { data: users }, matches] = await Promise.all([
    supabase
      .from("pickem_group_results")
      .select("group_code,team_id,final_position")
      .eq("competition_id", competitionId),
    supabase
      .from("pickem_prediction_submissions")
      .select("user_id")
      .eq("competition_id", competitionId),
    listMatches(competitionId),
  ]);

  const finalPosByTeam = new Map<string, number>();
  for (const row of groupResults || []) {
    finalPosByTeam.set(`${(row as any).group_code}:${(row as any).team_id}`, Number((row as any).final_position));
  }

  const finishedMatches = matches.filter(
    (m) => m.homeScore !== null && m.awayScore !== null && String(m.status).toLowerCase() === "finished",
  );
  const finishedById = new Map(finishedMatches.map((m) => [m.id, m]));
  const ledgerRows: Array<{
    userId: string;
    sourceType: string;
    sourceId: string;
    points: number;
    details: object;
  }> = [];

  for (const userRow of users || []) {
    const userId = String((userRow as any).user_id);
    const predictions = await listUserPredictions({ userId, competitionId });

    for (const gp of predictions.groupPredictions) {
      const actualPosition = finalPosByTeam.get(`${gp.groupCode}:${gp.teamId}`);
      if (!actualPosition) continue;
      if (actualPosition === gp.predictedPosition) {
        ledgerRows.push({
          userId,
          sourceType: "group_position",
          sourceId: `${gp.groupCode}:${gp.teamId}`,
          points: PICKEM_POINTS.GROUP_POSITION,
          details: {
            predictedPosition: gp.predictedPosition,
            actualPosition,
            groupCode: gp.groupCode,
            teamId: gp.teamId,
          },
        });
      }
    }

    for (const mp of predictions.matchPredictions) {
      const match = finishedById.get(mp.matchId);
      if (!match || match.homeScore === null || match.awayScore === null) continue;
      const actualOutcome = matchOutcome(match.homeScore, match.awayScore);
      if (mp.predictedOutcome === actualOutcome) {
        ledgerRows.push({
          userId,
          sourceType: "match_outcome",
          sourceId: mp.matchId,
          points: PICKEM_POINTS.MATCH_OUTCOME,
          details: {
            predictedOutcome: mp.predictedOutcome,
            actualOutcome,
            matchId: mp.matchId,
          },
        });
      }
      if (mp.predictedHomeScore === match.homeScore && mp.predictedAwayScore === match.awayScore) {
        ledgerRows.push({
          userId,
          sourceType: "match_score",
          sourceId: mp.matchId,
          points: PICKEM_POINTS.MATCH_SCORE,
          details: {
            predictedHomeScore: mp.predictedHomeScore,
            predictedAwayScore: mp.predictedAwayScore,
            homeScore: match.homeScore,
            awayScore: match.awayScore,
            matchId: mp.matchId,
          },
        });
      }
    }
  }

  await replacePointsLedger({ competitionId, rows: ledgerRows });
}
