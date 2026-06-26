import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = createSupabaseAdminClient();

  // Fetch matches
  const { data: matchRows, error } = await supabase
    .from('playoff_matches')
    .select('id, match_code, round, match_number, kickoff_at, venue, city, is_locked, home_score, away_score, winner_team_id, home_team_id, away_team_id')
    .order('match_number');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Collect unique team IDs
  const teamIds = [...new Set(
    (matchRows ?? []).flatMap(m => [m.home_team_id, m.away_team_id]).filter(Boolean) as string[]
  )];

  let teamsById: Record<string, Record<string, unknown>> = {};
  if (teamIds.length > 0) {
    const { data: teamRows } = await supabase
      .from('pickem_teams')
      .select('id, name, short_name, crest_url, group_code')
      .in('id', teamIds);
    (teamRows ?? []).forEach(t => { teamsById[t.id] = t; });
  }

  const matches = (matchRows ?? []).map(m => ({
    ...m,
    homeTeam: m.home_team_id ? (teamsById[m.home_team_id] ?? null) : null,
    awayTeam: m.away_team_id ? (teamsById[m.away_team_id] ?? null) : null,
  }));

  // no-store so a published result is never served stale from the browser or a
  // CDN/edge cache in front of the origin (force-dynamic only governs Next).
  return NextResponse.json({ matches }, { headers: { 'Cache-Control': 'no-store, max-age=0, must-revalidate' } });
}
