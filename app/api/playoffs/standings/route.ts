import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceRoleClient } from '@/lib/supabase-admin';
import { getActiveCompetition } from '@/lib/pickem-store';
import { PLAYOFF_WINNER_POINTS } from '@/lib/playoffs/scoring-constants';

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Gate: viewer must have submitted their own playoff picks (Stage 8).
  const { data: viewerPicks, error: viewerErr } = await supabase
    .from('playoff_predictions').select('id').eq('user_id', user.id).limit(1);
  if (viewerErr) return NextResponse.json({ error: 'Failed to check viewer picks' }, { status: 500 });
  if (!viewerPicks || viewerPicks.length === 0) return NextResponse.json({ viewerSubmitted: false, rows: [] });

  const service = createSupabaseServiceRoleClient();
  if (!service) return NextResponse.json({ error: 'Service role client unavailable' }, { status: 500 });

  const comp = await getActiveCompetition();

  const [{ data: preds, error: predErr }, { data: matchRows, error: matchErr }, ledgerRes, champRes] = await Promise.all([
    service.from('playoff_predictions')
      .select('user_id, match_id, predicted_winner_id, predicted_home_score, predicted_away_score, points_awarded'),
    service.from('playoff_matches')
      .select('id, winner_team_id, home_score, away_score'),
    comp
      ? service.from('pickem_points_ledger').select('user_id, points').eq('competition_id', comp.id).eq('source_type', 'r32_projection')
      : Promise.resolve({ data: [], error: null }),
    comp
      ? service.from('pickem_champion_predictions').select('user_id, points_awarded').eq('competition_id', comp.id)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (predErr || matchErr) return NextResponse.json({ error: 'Failed to fetch predictions' }, { status: 500 });

  const matchById = new Map((matchRows ?? []).map(m => [m.id as string, m]));

  interface Agg { r32ProjPts: number; matchResultPts: number; exactScorePts: number; championPts: number; correctPicks: number }
  const agg = new Map<string, Agg>();
  const ensure = (uid: string): Agg => {
    let a = agg.get(uid);
    if (!a) { a = { r32ProjPts: 0, matchResultPts: 0, exactScorePts: 0, championPts: 0, correctPicks: 0 }; agg.set(uid, a); }
    return a;
  };

  // R32 projection points from the ledger.
  for (const row of (ledgerRes.data ?? [])) {
    ensure(row.user_id as string).r32ProjPts += Number(row.points ?? 0);
  }

  // World Champion points (6 if correct).
  for (const row of (champRes.data ?? [])) {
    ensure(row.user_id as string).championPts += Number(row.points_awarded ?? 0);
  }

  // Split each scored prediction's authoritative points_awarded into winner base
  // (flat WINNER value) + the remaining exact/both-teams bonus.
  for (const p of (preds ?? [])) {
    const m = matchById.get(p.match_id as string);
    if (!m || !m.winner_team_id || m.home_score === null || m.away_score === null) continue;
    const a = ensure(p.user_id as string);
    const winnerCorrect = !!p.predicted_winner_id && p.predicted_winner_id === m.winner_team_id;
    const pts = Number(p.points_awarded ?? 0);
    const base = winnerCorrect ? PLAYOFF_WINNER_POINTS : 0;
    a.matchResultPts += base;
    a.exactScorePts += Math.max(0, pts - base);
    if (winnerCorrect) a.correctPicks += 1;
  }

  const userIds = [...agg.keys()];
  if (userIds.length === 0) return NextResponse.json({ viewerSubmitted: true, rows: [] });

  const { data: prefs } = await service.from('user_preferences').select('user_id, display_name').in('user_id', userIds);
  const nameById = new Map((prefs ?? []).map(p => [p.user_id as string, p.display_name as string]));

  const rows = userIds.map(uid => {
    const a = agg.get(uid)!;
    return {
      userId: uid,
      displayName: nameById.get(uid) ?? uid,
      r32ProjPts: a.r32ProjPts,
      matchResultPts: a.matchResultPts,
      exactScorePts: a.exactScorePts,
      championPts: a.championPts,
      totalPoints: a.r32ProjPts + a.matchResultPts + a.exactScorePts + a.championPts,
      correctPicks: a.correctPicks,
    };
  }).sort((x, y) => y.totalPoints - x.totalPoints || x.displayName.localeCompare(y.displayName))
    .map((r, i) => ({ rank: i + 1, ...r }));

  return NextResponse.json({ viewerSubmitted: true, rows });
}
