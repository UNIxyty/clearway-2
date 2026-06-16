import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { R32_PAIRINGS } from '@/lib/playoffs/r32Bracket';
import { computeGroupStandings, computeBestThird, resolveQualifier } from '@/lib/playoffs/standings';
import type { BracketTeam, GroupMatch } from '@/lib/playoffs/standings';

export const dynamic = 'force-dynamic';

export async function POST() {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;

  const supabase = createSupabaseAdminClient();

  const { data: comp } = await supabase
    .from('pickem_competitions')
    .select('id')
    .eq('slug', 'wc-2026')
    .single();
  if (!comp) return NextResponse.json({ error: 'Competition not found' }, { status: 404 });

  const [{ data: matchRows }, { data: teamRows }] = await Promise.all([
    supabase
      .from('pickem_matches')
      .select('id, group_code, home_team_id, away_team_id, home_score, away_score, status')
      .eq('competition_id', comp.id)
      .not('group_code', 'is', null),
    supabase
      .from('pickem_teams')
      .select('id, name, short_name, group_code, flag_emoji, crest_url')
      .eq('competition_id', comp.id),
  ]);

  const teams: BracketTeam[] = (teamRows ?? []).map(t => ({
    id: t.id as string,
    name: t.name as string,
    shortName: (t.short_name as string) || (t.name as string),
    flag: (t.flag_emoji as string) || '',
    groupCode: t.group_code as string,
    crestUrl: (t.crest_url as string | null) ?? null,
  }));

  const groupMatches: GroupMatch[] = (matchRows ?? []).map(m => ({
    id: m.id as string,
    groupCode: m.group_code as string,
    homeTeamId: m.home_team_id as string,
    awayTeamId: m.away_team_id as string,
    homeScore: (m.home_score as number | null) ?? null,
    awayScore: (m.away_score as number | null) ?? null,
    status: (m.status as string) ?? '',
  }));

  const groupCodes = [...new Set(teams.map(t => t.groupCode))];
  const allStandings = new Map(
    groupCodes.map(gc => [gc, computeGroupStandings(groupMatches, teams, gc)])
  );
  const bestThirds = computeBestThird(allStandings);

  const rows = R32_PAIRINGS.map((p, i) => {
    const homeTeam = resolveQualifier(p.home, allStandings, bestThirds);
    const awayTeam = resolveQualifier(p.away, allStandings, bestThirds);
    return {
      match_code: p.matchCode,
      match_number: i + 1,
      round: 'R32',
      home_team_id: homeTeam?.id ?? null,
      away_team_id: awayTeam?.id ?? null,
      is_locked: false,
    };
  });

  const { error } = await supabase
    .from('playoff_matches')
    .upsert(rows, { onConflict: 'match_code' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const filled = rows.filter(r => r.home_team_id && r.away_team_id).length;
  return NextResponse.json({ ok: true, filled, total: rows.length });
}
