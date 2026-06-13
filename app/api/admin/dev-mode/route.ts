import { NextResponse } from 'next/server';
import { requireDeveloper } from '@/lib/admin-auth';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

function matchOutcome(home: number, away: number): 'home' | 'away' | 'draw' {
  if (home === away) return 'draw';
  return home > away ? 'home' : 'away';
}

async function getCompetitionId(supabase: ReturnType<typeof createSupabaseAdminClient>) {
  const { data } = await supabase
    .from('pickem_competitions')
    .select('id')
    .eq('slug', 'wc-2026')
    .single();
  return data?.id as string | undefined;
}

/** GET — current dev mode status + score preview */
export async function GET() {
  const auth = await requireDeveloper();
  if ('error' in auth) return auth.error;

  const supabase = createSupabaseAdminClient();
  const userId = auth.user.id;

  const competitionId = await getCompetitionId(supabase);
  if (!competitionId) return NextResponse.json({ error: 'Competition not found' }, { status: 404 });

  const { count } = await supabase
    .from('pickem_dev_match_overrides')
    .select('match_id', { count: 'exact', head: true })
    .eq('user_id', userId);

  const active = (count ?? 0) > 0;
  if (!active) {
    return NextResponse.json({ active: false, overrideCount: 0, preview: [] });
  }

  const [{ data: overrides }, { data: teams }, { data: matches }] = await Promise.all([
    supabase
      .from('pickem_dev_match_overrides')
      .select('match_id, home_score, away_score')
      .eq('user_id', userId),
    supabase
      .from('pickem_teams')
      .select('id, name')
      .eq('competition_id', competitionId),
    supabase
      .from('pickem_matches')
      .select('id, home_team_id, away_team_id, group_code')
      .eq('competition_id', competitionId),
  ]);

  const matchIds = (overrides ?? []).map(o => o.match_id as string);

  const { data: predictions } = await supabase
    .from('pickem_user_match_predictions')
    .select('match_id, predicted_home_score, predicted_away_score, predicted_outcome')
    .eq('user_id', userId)
    .in('match_id', matchIds);

  const teamById = new Map((teams ?? []).map(t => [t.id as string, t.name as string]));
  const matchById = new Map((matches ?? []).map(m => [m.id as string, m]));
  const predById = new Map((predictions ?? []).map(p => [p.match_id as string, p]));

  let totalPoints = 0;
  let matchesWithPrediction = 0;

  const preview = (overrides ?? []).map(o => {
    const matchId = o.match_id as string;
    const match = matchById.get(matchId);
    const pred = predById.get(matchId);

    const actualHome = o.home_score as number;
    const actualAway = o.away_score as number;
    const actualOutcome = matchOutcome(actualHome, actualAway);

    let points = 0;
    let outcomeCorrect = false;
    let scoreCorrect = false;

    if (pred) {
      matchesWithPrediction++;
      if ((pred.predicted_outcome as string) === actualOutcome) {
        points += 1;
        outcomeCorrect = true;
      }
      if (pred.predicted_home_score === actualHome && pred.predicted_away_score === actualAway) {
        points += 2;
        scoreCorrect = true;
      }
    }
    totalPoints += points;

    return {
      matchId,
      groupCode: (match?.group_code as string | null) ?? null,
      homeName: teamById.get(match?.home_team_id as string ?? '') ?? '?',
      awayName: teamById.get(match?.away_team_id as string ?? '') ?? '?',
      actualHome,
      actualAway,
      predictedHome: pred ? (pred.predicted_home_score as number) : null,
      predictedAway: pred ? (pred.predicted_away_score as number) : null,
      hasPrediction: !!pred,
      outcomeCorrect,
      scoreCorrect,
      points,
    };
  });

  return NextResponse.json({
    active: true,
    overrideCount: count ?? 0,
    matchesWithPrediction,
    totalPoints,
    preview,
  });
}

/** POST — activate dev mode: seed overrides + seed predictions */
export async function POST() {
  const auth = await requireDeveloper();
  if ('error' in auth) return auth.error;

  const supabase = createSupabaseAdminClient();
  const userId = auth.user.id;

  const competitionId = await getCompetitionId(supabase);
  if (!competitionId) return NextResponse.json({ error: 'Competition not found' }, { status: 404 });

  const { data: groupMatches } = await supabase
    .from('pickem_matches')
    .select('id')
    .eq('competition_id', competitionId)
    .not('group_code', 'is', null);

  if (!groupMatches?.length) {
    return NextResponse.json({ error: 'No group stage matches found' }, { status: 404 });
  }

  const matchIds = groupMatches.map(m => m.id as string);

  const [overrideResult, predResult] = await Promise.all([
    supabase.from('pickem_dev_match_overrides').upsert(
      matchIds.map(matchId => ({
        user_id: userId,
        match_id: matchId,
        home_score: 2,
        away_score: 0,
        status: 'finished',
      })),
      { onConflict: 'user_id,match_id' },
    ),
    supabase.from('pickem_user_match_predictions').upsert(
      matchIds.map(matchId => ({
        user_id: userId,
        competition_id: competitionId,
        match_id: matchId,
        predicted_home_score: 2,
        predicted_away_score: 0,
        predicted_outcome: 'home',
      })),
      { onConflict: 'user_id,competition_id,match_id' },
    ),
  ]);

  if (overrideResult.error) {
    return NextResponse.json({ error: overrideResult.error.message }, { status: 500 });
  }
  if (predResult.error) {
    return NextResponse.json({ error: predResult.error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, matchCount: matchIds.length });
}

/** DELETE — deactivate dev mode: clear overrides */
export async function DELETE() {
  const auth = await requireDeveloper();
  if ('error' in auth) return auth.error;

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from('pickem_dev_match_overrides')
    .delete()
    .eq('user_id', auth.user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
