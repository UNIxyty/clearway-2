import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceRoleClient } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/admin-auth';
import {
  resolveSlotServer, resolveWinnerServer,
  type ResolveContext, type ServerMatch, type ServerTeam, type ServerPrediction,
} from '@/lib/playoffs/resolveBracketServer';
import { flagFor } from '@/lib/playoffs/flags';
import { playoffBreakdown } from '@/lib/playoffs/pointsBreakdown';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Viewer must have submitted their own playoff picks before viewing others' —
  // UNLESS they're an admin, who can inspect any user's picks regardless.
  const isAdmin = !('error' in (await requireAdmin()));
  if (!isAdmin) {
    const { data: viewerPicks, error: viewerPicksError } = await supabase
      .from('playoff_predictions')
      .select('id')
      .eq('user_id', user.id)
      .limit(1);

    if (viewerPicksError) {
      return NextResponse.json({ error: 'Failed to check viewer picks' }, { status: 500 });
    }
    if (!viewerPicks || viewerPicks.length === 0) {
      return NextResponse.json({ error: 'Forbidden: you have not submitted playoff picks' }, { status: 403 });
    }
  }

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');
  if (!userId) {
    return NextResponse.json({ error: 'Missing userId parameter' }, { status: 400 });
  }

  const serviceClient = createSupabaseServiceRoleClient();
  if (!serviceClient) {
    return NextResponse.json({ error: 'Service role client unavailable' }, { status: 500 });
  }

  // Load the full bracket, the target user's predictions, and all teams
  const [{ data: matchRows, error: matchErr }, { data: predRows, error: predErr }] = await Promise.all([
    serviceClient
      .from('playoff_matches')
      .select('id, match_code, round, match_number, home_team_id, away_team_id, home_score, away_score, winner_team_id, is_locked'),
    serviceClient
      .from('playoff_predictions')
      .select('match_id, predicted_winner_id, predicted_home_score, predicted_away_score, points_awarded')
      .eq('user_id', userId),
  ]);

  if (matchErr || predErr) {
    return NextResponse.json({ error: 'Failed to fetch predictions' }, { status: 500 });
  }

  const matches = matchRows ?? [];
  const preds = predRows ?? [];

  const { data: teamRows, error: teamsError } = await serviceClient
    .from('pickem_teams')
    .select('id, name, short_name');
  if (teamsError) {
    return NextResponse.json({ error: 'Failed to fetch teams' }, { status: 500 });
  }

  const teamsById = new Map<string, ServerTeam>();
  for (const t of teamRows ?? []) {
    teamsById.set(t.id as string, {
      id: t.id as string,
      name: (t.name as string) ?? (t.short_name as string) ?? 'TBD',
      flag: flagFor(t.short_name as string),
    });
  }

  const matchesByCode: Record<string, ServerMatch> = {};
  const matchExtraById = new Map<string, Record<string, unknown>>();
  matches.forEach(m => {
    matchesByCode[m.match_code as string] = {
      id: m.id as string,
      matchCode: m.match_code as string,
      round: m.round as string,
      matchNumber: (m.match_number as number) ?? null,
      homeTeamId: (m.home_team_id as string) ?? null,
      awayTeamId: (m.away_team_id as string) ?? null,
    };
    matchExtraById.set(m.id as string, m);
  });

  const predsByMatchId = new Map<string, ServerPrediction>();
  preds.forEach(p => {
    predsByMatchId.set(p.match_id as string, {
      predictedWinnerId: (p.predicted_winner_id as string) ?? null,
      predictedHomeScore: (p.predicted_home_score as number) ?? null,
      predictedAwayScore: (p.predicted_away_score as number) ?? null,
    });
  });

  const ctx: ResolveContext = { matchesByCode, predsByMatchId, teamsById };

  const predictions = preds.map(row => {
    const matchId = row.match_id as string;
    const m = matchExtraById.get(matchId);
    const code = (m?.match_code as string) ?? null;

    // Resolve home/away through the bracket (R16+ have null DB team ids). These
    // are the TARGET USER's predicted teams for the slot (their feeder winners).
    const home = code ? resolveSlotServer(code, 'home', ctx) : null;
    const away = code ? resolveSlotServer(code, 'away', ctx) : null;
    const winner = code ? resolveWinnerServer(code, ctx) : null;

    const predictedWinnerId = (row.predicted_winner_id as string) ?? null;
    const predictedHomeScore = (row.predicted_home_score as number) ?? null;
    const predictedAwayScore = (row.predicted_away_score as number) ?? null;
    const actualHomeScore = (m?.home_score as number) ?? null;
    const actualAwayScore = (m?.away_score as number) ?? null;
    const winnerTeamId = (m?.winner_team_id as string) ?? null;
    const pointsAwarded = (row.points_awarded as number) ?? null;

    // Server-computed scoring breakdown (Option A) for the points tooltip. Uses the
    // same certified evaluatePlayoffPrediction mirror as calculate_playoff_points and
    // is dropped when it disagrees with the stored points_awarded — so the client
    // shows the real reasons and can never contradict the awarded points.
    const scored = actualHomeScore !== null && actualAwayScore !== null && !!winnerTeamId;
    let breakdown: { lines: { ok: boolean; label: string }[]; total: number } | null = null;
    if (scored && predictedWinnerId) {
      const bd = playoffBreakdown(
        {
          actualHomeTeamId: (m?.home_team_id as string) ?? null,
          actualAwayTeamId: (m?.away_team_id as string) ?? null,
          actualHomeScore,
          actualAwayScore,
          winnerTeamId,
          predHomeTeamId: home?.id ?? null,
          predAwayTeamId: away?.id ?? null,
          predHomeScore: predictedHomeScore,
          predAwayScore: predictedAwayScore,
          predictedWinnerId,
        },
        pointsAwarded ?? 0,
      );
      if (bd.reliable) breakdown = { lines: bd.lines, total: bd.total };
    }

    return {
      matchCode: code,
      round: (m?.round as string) ?? null,
      matchNumber: (m?.match_number as number) ?? null,
      homeTeamName: home?.name ?? null,
      homeTeamFlag: home?.flag ?? null,
      awayTeamName: away?.name ?? null,
      awayTeamFlag: away?.flag ?? null,
      predictedWinnerId,
      predictedWinnerName: winner?.name ?? null,
      predictedWinnerFlag: winner?.flag ?? null,
      predictedHomeScore,
      predictedAwayScore,
      isLocked: (m?.is_locked as boolean) ?? false,
      actualHomeScore,
      actualAwayScore,
      winnerTeamId,
      pointsAwarded,
      breakdown,
    };
  });

  return NextResponse.json({ predictions });
}
