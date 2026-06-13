import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from('playoff_matches')
    .select(`
      id, match_code, round, match_number, kickoff_at, venue, city,
      is_locked, home_score, away_score, winner_team_id,
      home_team_id, away_team_id,
      homeTeam:pickem_teams!home_team_id(id, name, short_name, crest_url, group_code),
      awayTeam:pickem_teams!away_team_id(id, name, short_name, crest_url, group_code)
    `)
    .order('match_number');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ matches: data });
}
