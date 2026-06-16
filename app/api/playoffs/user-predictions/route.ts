import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceRoleClient } from '@/lib/supabase-admin';

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check if viewer has submitted any playoff picks
  const { data: viewerPicks, error: viewerPicksError } = await supabase
    .from('playoff_predictions')
    .select('id')
    .eq('user_id', user.id)
    .limit(1);

  if (viewerPicksError) {
    return NextResponse.json({ error: 'Failed to check viewer picks' }, { status: 500 });
  }

  const viewerSubmitted = viewerPicks && viewerPicks.length > 0;

  if (!viewerSubmitted) {
    return NextResponse.json({ error: 'Forbidden: you have not submitted playoff picks' }, { status: 403 });
  }

  // Get userId from search params
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');

  if (!userId) {
    return NextResponse.json({ error: 'Missing userId parameter' }, { status: 400 });
  }

  // Use service role client to bypass RLS
  const serviceClient = createSupabaseServiceRoleClient();
  if (!serviceClient) {
    return NextResponse.json({ error: 'Service role client unavailable' }, { status: 500 });
  }

  // Fetch predictions with match data
  const { data: predictionsData, error: predictionsError } = await serviceClient
    .from('playoff_predictions')
    .select(`
      match_id, predicted_winner_id, predicted_home_score, predicted_away_score, points_awarded,
      match:playoff_matches!match_id(
        match_code, round, home_score, away_score, winner_team_id, is_locked,
        homeTeam:pickem_teams!home_team_id(name, flag_emoji),
        awayTeam:pickem_teams!away_team_id(name, flag_emoji)
      )
    `)
    .eq('user_id', userId);

  if (predictionsError) {
    return NextResponse.json({ error: 'Failed to fetch predictions' }, { status: 500 });
  }

  // Fetch all teams to resolve predicted_winner_id
  const { data: teamsData, error: teamsError } = await serviceClient
    .from('pickem_teams')
    .select('id, name, flag_emoji');

  if (teamsError) {
    return NextResponse.json({ error: 'Failed to fetch teams' }, { status: 500 });
  }

  const teamMap = new Map<string, { name: string; flag_emoji: string }>();
  for (const team of teamsData ?? []) {
    teamMap.set(team.id as string, {
      name: team.name as string,
      flag_emoji: team.flag_emoji as string,
    });
  }

  const predictions = (predictionsData ?? []).map((row: any) => {
    const match = row.match as any;
    const homeTeam = match?.homeTeam as any;
    const awayTeam = match?.awayTeam as any;

    const predictedWinnerId = row.predicted_winner_id as string | null;
    const predictedWinnerTeam = predictedWinnerId ? teamMap.get(predictedWinnerId) : null;

    return {
      matchCode: match?.match_code ?? null,
      round: match?.round ?? null,
      homeTeamName: homeTeam?.name ?? null,
      homeTeamFlag: homeTeam?.flag_emoji ?? null,
      awayTeamName: awayTeam?.name ?? null,
      awayTeamFlag: awayTeam?.flag_emoji ?? null,
      predictedWinnerId,
      predictedWinnerName: predictedWinnerTeam?.name ?? null,
      predictedWinnerFlag: predictedWinnerTeam?.flag_emoji ?? null,
      predictedHomeScore: row.predicted_home_score ?? null,
      predictedAwayScore: row.predicted_away_score ?? null,
      isLocked: match?.is_locked ?? false,
      actualHomeScore: match?.home_score ?? null,
      actualAwayScore: match?.away_score ?? null,
      winnerTeamId: match?.winner_team_id ?? null,
      pointsAwarded: row.points_awarded ?? null,
    };
  });

  return NextResponse.json({ predictions });
}
