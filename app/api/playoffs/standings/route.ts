import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceRoleClient } from '@/lib/supabase-admin';

export async function GET() {
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
    return NextResponse.json({ viewerSubmitted: false, rows: [] });
  }

  // Use service role client to bypass RLS
  const serviceClient = createSupabaseServiceRoleClient();
  if (!serviceClient) {
    return NextResponse.json({ error: 'Service role client unavailable' }, { status: 500 });
  }

  const { data: allPredictions, error: predictionsError } = await serviceClient
    .from('playoff_predictions')
    .select('user_id, points_awarded, predicted_home_score, predicted_away_score');

  if (predictionsError) {
    return NextResponse.json({ error: 'Failed to fetch predictions' }, { status: 500 });
  }

  if (!allPredictions || allPredictions.length === 0) {
    return NextResponse.json({ viewerSubmitted: true, rows: [] });
  }

  // Aggregate by user_id
  const aggregated = new Map<string, {
    totalPoints: number;
    correctPicks: number;
    picksWithScores: number;
  }>();

  for (const row of allPredictions) {
    const userId = row.user_id as string;
    if (!aggregated.has(userId)) {
      aggregated.set(userId, { totalPoints: 0, correctPicks: 0, picksWithScores: 0 });
    }
    const entry = aggregated.get(userId)!;
    entry.totalPoints += (row.points_awarded ?? 0);
    if ((row.points_awarded ?? 0) > 0) {
      entry.correctPicks += 1;
    }
    if (row.predicted_home_score != null && row.predicted_away_score != null) {
      entry.picksWithScores += 1;
    }
  }

  const userIds = Array.from(aggregated.keys());

  // Get display names
  const { data: userPrefs, error: prefsError } = await serviceClient
    .from('user_preferences')
    .select('user_id, display_name')
    .in('user_id', userIds);

  if (prefsError) {
    return NextResponse.json({ error: 'Failed to fetch user preferences' }, { status: 500 });
  }

  const displayNameMap = new Map<string, string>();
  for (const pref of userPrefs ?? []) {
    displayNameMap.set(pref.user_id as string, pref.display_name as string);
  }

  // Build rows and rank
  const rows = Array.from(aggregated.entries()).map(([userId, stats]) => ({
    userId,
    displayName: displayNameMap.get(userId) ?? userId,
    totalPoints: stats.totalPoints,
    correctPicks: stats.correctPicks,
    picksWithScores: stats.picksWithScores,
  }));

  rows.sort((a, b) => {
    if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
    return a.displayName.localeCompare(b.displayName);
  });

  const rankedRows = rows.map((row, index) => ({
    rank: index + 1,
    userId: row.userId,
    displayName: row.displayName,
    totalPoints: row.totalPoints,
    correctPicks: row.correctPicks,
  }));

  return NextResponse.json({ viewerSubmitted: true, rows: rankedRows });
}
