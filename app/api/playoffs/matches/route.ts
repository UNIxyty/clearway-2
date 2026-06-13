import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createSupabaseServerClient();

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
    // RLS on pickem_teams requires competition_id filter — fetch it first
    const { data: comp } = await supabase
      .from('pickem_competitions')
      .select('id')
      .eq('slug', 'wc-2026')
      .single();

    if (comp) {
      const { data: teamRows } = await supabase
        .from('pickem_teams')
        .select('id, name, short_name, crest_url, group_code')
        .eq('competition_id', comp.id)
        .in('id', teamIds);
      (teamRows ?? []).forEach(t => { teamsById[t.id] = t; });
    }
  }

  const matches = (matchRows ?? []).map(m => ({
    ...m,
    homeTeam: m.home_team_id ? (teamsById[m.home_team_id] ?? null) : null,
    awayTeam: m.away_team_id ? (teamsById[m.away_team_id] ?? null) : null,
  }));

  return NextResponse.json({ matches });
}
