/* =============================================================================
 * Per-user R32 Projection — the data behind the R32 Projection page.
 *
 * DATA MAPPING (design prop  ->  real source):
 *   userProjection  -> the user's pickem_user_match_predictions run through
 *                      derivePredictedGroupPositions (predicted standings/group)
 *   r32Pairings     -> computeUserPredictedR32 on those predicted standings
 *   officialResults -> pickem_group_results (final_position 1|2 = qualified)
 *   scoringStatus   -> tournament_state.r32_confirmed_at + group_results presence
 *   totalR32Points  -> SUM(pickem_points_ledger.points) WHERE source_type =
 *                      'r32_projection' AND user_id = current user
 *   perGroupScoring -> per group, how many of the user's projected top-2 actually
 *                      qualified (appear in officialResults for that group)
 *
 * This page reads ONLY user predictions + group_results + ledger + tournament_state.
 * It never reads playoff_matches (that is the official Full Bracket system).
 * ===========================================================================*/
import { NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@/lib/admin-auth';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import {
  getActiveCompetition, getTournamentState, listGroupResults,
  listGroups, listMatches, listTeams,
} from '@/lib/pickem-store';
import { derivePredictedGroupPositions } from '@/lib/pickem-group-table';
import { computeUserPredictedR32, type BracketTeam, type GroupMatch } from '@/lib/playoffs/standings';
import { R32_PAIRINGS } from '@/lib/playoffs/r32Bracket';
import { flagFor } from '@/lib/playoffs/flags';
import { flagCdnCodeFor } from '@/lib/playoffs/flags';

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireAuthenticatedUser();
  if ('error' in auth) return auth.error;

  const comp = await getActiveCompetition();
  if (!comp) return NextResponse.json({ error: 'Competition not configured.' }, { status: 404 });

  const supabase = createSupabaseAdminClient();

  const [groups, teams, matches, groupResults, tState] = await Promise.all([
    listGroups(comp.id),
    listTeams(comp.id),
    listMatches(comp.id),
    listGroupResults(comp.id),
    getTournamentState(comp.id),
  ]);

  // The user's group-stage score predictions.
  const { data: predRows } = await supabase
    .from('pickem_user_match_predictions')
    .select('match_id, predicted_home_score, predicted_away_score')
    .eq('competition_id', comp.id)
    .eq('user_id', auth.user.id);
  const predByMatch = new Map(
    (predRows ?? []).map(p => [String(p.match_id), p as { predicted_home_score: number; predicted_away_score: number }]),
  );

  // Predicted standings (per team) from the user's picks.
  const matchPredictions = (matches.filter(m => m.groupCode)).map(m => {
    const p = predByMatch.get(m.id);
    return {
      userId: auth.user.id,
      competitionId: comp.id,
      matchId: m.id,
      predictedHomeScore: p ? Number(p.predicted_home_score) : 0,
      predictedAwayScore: p ? Number(p.predicted_away_score) : 0,
      predictedOutcome: (p ? (p.predicted_home_score === p.predicted_away_score ? 'draw'
        : p.predicted_home_score > p.predicted_away_score ? 'home' : 'away') : 'draw') as 'home' | 'away' | 'draw',
    };
  });
  const derived = derivePredictedGroupPositions({ groups, teams, matches, matchPredictions });
  const posByTeam = new Map(derived.map(d => [d.teamId, d.predictedPosition]));

  const teamById = new Map(teams.map(t => [t.id, t]));
  const projTeam = (teamId: string) => {
    const t = teamById.get(teamId);
    const shortName = t?.shortName ?? '';
    return {
      teamId,
      name: t?.name ?? 'TBD',
      countryCode: flagCdnCodeFor(shortName),
      emoji: flagFor(shortName),
    };
  };

  // userProjection: teams per group ordered by predicted position (1..4).
  const userProjection = groups
    .map(g => g.code)
    .sort()
    .map(code => ({
      groupCode: code,
      teams: teams
        .filter(t => t.groupCode === code)
        .sort((a, b) => (posByTeam.get(a.id) ?? 99) - (posByTeam.get(b.id) ?? 99))
        .map(t => projTeam(t.id)),
    }));

  // r32Pairings via the shared per-user resolver (same one the scoring uses).
  const bracketTeams: BracketTeam[] = teams.map(t => ({
    id: t.id, name: t.name, shortName: t.shortName,
    flag: flagFor(t.shortName), groupCode: t.groupCode, crestUrl: t.crestUrl ?? null,
  }));
  const groupMatches: GroupMatch[] = matches.filter(m => m.groupCode).map(m => {
    const p = predByMatch.get(m.id);
    return {
      id: m.id, groupCode: m.groupCode as string,
      homeTeamId: m.homeTeamId, awayTeamId: m.awayTeamId,
      homeScore: p ? Number(p.predicted_home_score) : null,
      awayScore: p ? Number(p.predicted_away_score) : null,
      status: m.status,
    };
  });
  const resolved = computeUserPredictedR32(R32_PAIRINGS, groupMatches, bracketTeams);

  // officialResults: top-2 (final_position 1|2) per group, when finalized.
  const qualByGroup = new Map<string, string[]>();
  for (const r of groupResults) {
    if (r.finalPosition === 1 || r.finalPosition === 2) {
      const arr = qualByGroup.get(r.groupCode) ?? [];
      arr.push(r.teamId);
      qualByGroup.set(r.groupCode, arr);
    }
  }
  const officialResults = groupResults.length > 0
    ? userProjection.map(g => ({ groupCode: g.groupCode, qualifiedTeamIds: qualByGroup.get(g.groupCode) ?? [] }))
    : null;

  // scoringStatus
  const scoringStatus: 'in_progress' | 'awaiting_confirmation' | 'scored' =
    tState.r32ConfirmedAt ? 'scored'
      : groupResults.length > 0 ? 'awaiting_confirmation'
        : 'in_progress';

  // perGroupScoring: how many of the user's projected top-2 actually qualified.
  const perGroupScoring = userProjection.map(g => {
    const qualified = new Set(qualByGroup.get(g.groupCode) ?? []);
    const correct = g.teams.slice(0, 2).filter(t => qualified.has(t.teamId)).length;
    return { groupCode: g.groupCode, correct, total: 2 };
  });

  // r32Pairings only meaningful once the group stage is over (status != in_progress).
  const r32Pairings = scoringStatus === 'in_progress'
    ? null
    : resolved.map(r => ({
        matchCode: r.matchCode,
        home: r.home?.id ?? `tbd-${r.matchCode}-h`,
        away: r.away?.id ?? `tbd-${r.matchCode}-a`,
      }));

  // totalR32Points from the ledger.
  const { data: ledgerRows } = await supabase
    .from('pickem_points_ledger')
    .select('points')
    .eq('competition_id', comp.id)
    .eq('user_id', auth.user.id)
    .eq('source_type', 'r32_projection');
  const totalR32Points = (ledgerRows ?? []).reduce((s, r) => s + Number((r as { points: number }).points || 0), 0);

  // teamById payload so the matchup preview can resolve projected team ids.
  const teamLookup: Record<string, { teamId: string; name: string; countryCode: string | null; emoji: string }> = {};
  for (const g of userProjection) for (const t of g.teams) teamLookup[t.teamId] = t;
  for (const r of resolved) {
    for (const side of [r.home, r.away]) if (side && !teamLookup[side.id]) teamLookup[side.id] = projTeam(side.id);
  }

  return NextResponse.json({
    userProjection,
    officialResults,
    r32Pairings,
    perGroupScoring,
    scoringStatus,
    totalR32Points,
    teamLookup,
  });
}
