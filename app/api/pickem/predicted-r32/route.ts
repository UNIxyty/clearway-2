import { NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@/lib/admin-auth';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { R32_PAIRINGS } from '@/lib/playoffs/r32Bracket';
import { computeGroupStandings, computeBestThird, resolveR32Pairings } from '@/lib/playoffs/standings';
import type { BracketTeam, GroupMatch } from '@/lib/playoffs/standings';

const FLAG_BY_CODE: Record<string, string> = {
  MEX:'🇲🇽', RSA:'🇿🇦', KOR:'🇰🇷', CZE:'🇨🇿', CAN:'🇨🇦', BIH:'🇧🇦', QAT:'🇶🇦', SUI:'🇨🇭',
  BRA:'🇧🇷', MAR:'🇲🇦', HAI:'🇭🇹', SCO:'🏴󠁧󠁢󠁳󠁣󠁴󠁿', USA:'🇺🇸', PAR:'🇵🇾', AUS:'🇦🇺', TUR:'🇹🇷',
  GER:'🇩🇪', CUW:'🇨🇼', CIV:'🇨🇮', ECU:'🇪🇨', NED:'🇳🇱', JPN:'🇯🇵', SWE:'🇸🇪', TUN:'🇹🇳',
  BEL:'🇧🇪', EGY:'🇪🇬', IRN:'🇮🇷', NZL:'🇳🇿', ESP:'🇪🇸', CPV:'🇨🇻', KSA:'🇸🇦', URU:'🇺🇾',
  FRA:'🇫🇷', SEN:'🇸🇳', IRQ:'🇮🇶', NOR:'🇳🇴', ARG:'🇦🇷', ALG:'🇩🇿', AUT:'🇦🇹', JOR:'🇯🇴',
  POR:'🇵🇹', COD:'🇨🇩', UZB:'🇺🇿', COL:'🇨🇴', ENG:'🏴󠁧󠁢󠁥󠁮󠁧󠁿', CRO:'🇭🇷', GHA:'🇬🇭', PAN:'🇵🇦',
};

export async function GET() {
  const auth = await requireAuthenticatedUser();
  if ('error' in auth) return auth.error;

  const supabase = createSupabaseAdminClient();

  // Get competition
  const { data: comp } = await supabase
    .from('pickem_competitions')
    .select('id')
    .eq('slug', 'wc-2026')
    .single();
  if (!comp) return NextResponse.json({ error: 'Competition not found' }, { status: 404 });

  // Fetch group stage matches (those with a group_code)
  const { data: matchRows } = await supabase
    .from('pickem_matches')
    .select('id, group_code, home_team_id, away_team_id, home_score, away_score, status')
    .eq('competition_id', comp.id)
    .not('group_code', 'is', null);

  // Fetch user's match predictions
  const { data: predRows } = await supabase
    .from('pickem_user_match_predictions')
    .select('match_id, predicted_home_score, predicted_away_score')
    .eq('competition_id', comp.id)
    .eq('user_id', auth.user.id);

  // Fetch all teams
  const { data: teamRows } = await supabase
    .from('pickem_teams')
    .select('id, name, short_name, group_code, crest_url')
    .eq('competition_id', comp.id);

  const teams: BracketTeam[] = (teamRows ?? []).map(t => ({
    id: t.id as string,
    name: t.name as string,
    shortName: (t.short_name as string) || (t.name as string),
    flag: FLAG_BY_CODE[(t.short_name as string)] || '',
    groupCode: t.group_code as string,
    crestUrl: (t.crest_url as string | null) ?? null,
  }));

  // Build prediction lookup: matchId → predicted scores
  const predMap = new Map<string, { home: number; away: number }>();
  (predRows ?? []).forEach(p => {
    predMap.set(p.match_id as string, {
      home: p.predicted_home_score as number,
      away: p.predicted_away_score as number,
    });
  });

  // Convert pickem matches to GroupMatch using user's predicted scores
  const groupMatches: GroupMatch[] = (matchRows ?? []).map(m => {
    const pred = predMap.get(m.id as string);
    return {
      id: m.id as string,
      groupCode: m.group_code as string,
      homeTeamId: m.home_team_id as string,
      awayTeamId: m.away_team_id as string,
      homeScore: pred ? pred.home : null,
      awayScore: pred ? pred.away : null,
      status: m.status as string,
    };
  });

  // Compute standings per group
  const groupCodes = [...new Set(teams.map(t => t.groupCode))];
  const allStandings = new Map(
    groupCodes.map(gc => [gc, computeGroupStandings(groupMatches, teams, gc)])
  );

  // Best thirds
  const bestThirds = computeBestThird(allStandings);

  // Resolve predicted teams for each R32 slot (best-thirds assigned uniquely)
  const resolved = resolveR32Pairings(R32_PAIRINGS, allStandings, bestThirds);

  return NextResponse.json({
    pairings: resolved.map(r => ({
      matchCode: r.matchCode,
      predictedHome: r.home,
      predictedAway: r.away,
    })),
  });
}
