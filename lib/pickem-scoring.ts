import { PICKEM_POINTS, type PickemMatchPrediction } from "@/lib/pickem-shared";
import { derivePredictedGroupPositions } from "@/lib/pickem-group-table";
import { getTournamentState, listGroups, listMatches, listTeams, listUserPredictions, replacePointsLedger } from "@/lib/pickem-store";
import { createSupabaseServiceRoleClient } from "@/lib/supabase-admin";
import { computeUserPredictedR32 } from "@/lib/playoffs/standings";
import type { GroupMatch, BracketTeam } from "@/lib/playoffs/standings";
import { flagFor } from "@/lib/playoffs/flags";
import { R32_PAIRINGS } from "@/lib/playoffs/r32Bracket";

function matchOutcome(home: number, away: number): "home" | "away" | "draw" {
  if (home === away) return "draw";
  return home > away ? "home" : "away";
}

/**
 * DRY RUN: how many group-position points WOULD be awarded for one group if it
 * finished in `orderTeamIds` order (index 0 = 1st). Pure read — writes nothing to
 * the ledger. Mirrors the group_position logic in recomputePickemPoints exactly
 * (derived predicted positions vs the candidate final positions, +1 per match).
 */
export async function previewGroupPositionPoints(
  competitionId: string,
  groupCode: string,
  orderTeamIds: string[],
): Promise<{ points: number; correctPlacements: number }> {
  const supabase = createSupabaseServiceRoleClient();
  if (!supabase) throw new Error("Missing Supabase service role configuration");

  const [groups, teams, matches, { data: predRows }] = await Promise.all([
    listGroups(competitionId),
    listTeams(competitionId),
    listMatches(competitionId),
    supabase
      .from("pickem_user_match_predictions")
      .select("user_id, match_id, predicted_home_score, predicted_away_score, predicted_outcome")
      .eq("competition_id", competitionId),
  ]);

  // Candidate final position per team (1-based) for the target group.
  const candidatePos = new Map<string, number>();
  orderTeamIds.forEach((teamId, idx) => candidatePos.set(teamId, idx + 1));

  // All users' match predictions grouped by user.
  const predsByUser = new Map<string, PickemMatchPrediction[]>();
  for (const p of (predRows ?? [])) {
    const uid = String((p as { user_id: string }).user_id);
    if (!predsByUser.has(uid)) predsByUser.set(uid, []);
    predsByUser.get(uid)!.push({
      userId: uid,
      competitionId,
      matchId: String((p as { match_id: string }).match_id),
      predictedHomeScore: Number((p as { predicted_home_score: number }).predicted_home_score),
      predictedAwayScore: Number((p as { predicted_away_score: number }).predicted_away_score),
      predictedOutcome: (p as { predicted_outcome: "home" | "away" | "draw" }).predicted_outcome,
    });
  }

  let points = 0;
  let correctPlacements = 0;
  for (const matchPredictions of predsByUser.values()) {
    const derived = derivePredictedGroupPositions({ groups, teams, matches, matchPredictions });
    for (const gp of derived) {
      if (gp.groupCode !== groupCode) continue;
      const real = candidatePos.get(gp.teamId);
      if (real !== undefined && real === gp.predictedPosition) {
        points += PICKEM_POINTS.GROUP_POSITION;
        correctPlacements += 1;
      }
    }
  }

  return { points, correctPlacements };
}

export async function recomputePickemPoints(competitionId: string): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();
  if (!supabase) throw new Error("Missing Supabase service role configuration");

  const [{ data: groupResults }, submissionsRes, groupPredRes, matchPredRes, groups, teams, matches] = await Promise.all([
    supabase
      .from("pickem_group_results")
      .select("group_code,team_id,final_position")
      .eq("competition_id", competitionId),
    supabase
      .from("pickem_prediction_submissions")
      .select("user_id")
      .eq("competition_id", competitionId),
    supabase
      .from("pickem_user_group_predictions")
      .select("user_id")
      .eq("competition_id", competitionId),
    supabase
      .from("pickem_user_match_predictions")
      .select("user_id")
      .eq("competition_id", competitionId),
    listGroups(competitionId),
    listTeams(competitionId),
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

  const participantIds = new Set<string>();
  for (const row of submissionsRes.data || []) participantIds.add(String((row as any).user_id));
  for (const row of groupPredRes.data || []) participantIds.add(String((row as any).user_id));
  for (const row of matchPredRes.data || []) participantIds.add(String((row as any).user_id));

  // R32 projection scoring is only active once the admin has confirmed the real
  // R32 bracket (Stage 4). Until then we skip it entirely.
  const tState = await getTournamentState(competitionId);
  const r32Confirmed = !!tState.r32ConfirmedAt;
  const bracketTeams: BracketTeam[] = teams.map((t) => ({
    id: t.id, name: t.name, shortName: t.shortName, flag: flagFor(t.shortName),
    groupCode: t.groupCode, crestUrl: t.crestUrl ?? null,
  }));
  const groupStageMatches = matches.filter((m) => m.stage === "group" && m.groupCode);
  const realR32ByCode = new Map<string, { home: string | null; away: string | null }>();
  if (r32Confirmed) {
    const { data: r32Rows } = await supabase
      .from("playoff_matches")
      .select("match_code, home_team_id, away_team_id")
      .eq("round", "R32");
    for (const r of r32Rows || []) {
      realR32ByCode.set(String((r as any).match_code), {
        home: ((r as any).home_team_id as string) ?? null,
        away: ((r as any).away_team_id as string) ?? null,
      });
    }
  }

  for (const userId of participantIds) {
    const predictions = await listUserPredictions({ userId, competitionId });

    const derivedGroups = derivePredictedGroupPositions({
      groups,
      teams,
      matches,
      matchPredictions: predictions.matchPredictions,
    });

    for (const gp of derivedGroups) {
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

    // R32 projection: +1 per slot where the user's predicted pair (derived from
    // their group score picks, same computation the R32 Draw page shows) matches
    // the real admin-confirmed pair. Pair compared unordered (home/away agnostic).
    if (r32Confirmed && realR32ByCode.size > 0) {
      const predByMatch = new Map(predictions.matchPredictions.map((mp) => [mp.matchId, mp]));
      const userGroupMatches: GroupMatch[] = groupStageMatches.map((m) => {
        const p = predByMatch.get(m.id);
        return {
          id: m.id,
          groupCode: m.groupCode as string,
          homeTeamId: m.homeTeamId,
          awayTeamId: m.awayTeamId,
          homeScore: p ? p.predictedHomeScore : null,
          awayScore: p ? p.predictedAwayScore : null,
          status: m.status,
        };
      });
      const predictedR32 = computeUserPredictedR32(R32_PAIRINGS, userGroupMatches, bracketTeams);
      for (const slot of predictedR32) {
        const real = realR32ByCode.get(slot.matchCode);
        if (!real?.home || !real?.away) continue;
        const predIds = [slot.home?.id, slot.away?.id].filter((x): x is string => !!x);
        if (predIds.length !== 2) continue;
        const realIds = [real.home, real.away];
        const paired = predIds.every((id) => realIds.includes(id));
        if (paired) {
          ledgerRows.push({
            userId,
            sourceType: "r32_projection",
            sourceId: slot.matchCode,
            points: PICKEM_POINTS.R32_PROJECTION,
            details: { matchCode: slot.matchCode, predicted: predIds, real: realIds },
          });
        }
      }
    }
  }

  await replacePointsLedger({ competitionId, rows: ledgerRows });
}
