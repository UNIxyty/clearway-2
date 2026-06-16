import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { computeGroupStandings } from '@/lib/playoffs/standings';
import type { GroupMatch, StandingRow } from '@/lib/playoffs/standings';
import type { BracketTeam } from '@/lib/playoffs/types';
import { renderTemplate } from '@/server/emails/renderTemplate';
import { sendEmail } from '@/server/emails/sendEmail';
import { unsubscribeUrl } from '@/server/utils/unsubscribeToken';

export interface R32Matchup {
  flagA: string;
  teamA: string;
  flagB: string;
  teamB: string;
  date: string;
  venue: string;
}

export interface GroupStageBlastOptions {
  competitionId: string;
  matchups: R32Matchup[];
  r32Deadline: string;
  r32PredictionsUrl: string;
  leaderboardUrl: string;
}

export function sendGroupStageCompleteBlast(opts: GroupStageBlastOptions): void {
  void _blast(opts);
}

async function _blast(opts: GroupStageBlastOptions): Promise<void> {
  const supabase = createSupabaseAdminClient();
  const base = (process.env.APP_BASE_URL ?? 'https://clearway.verxyl.com').replace(/\/+$/, '');

  // Fetch all group matches with scores
  const { data: rawMatches } = await supabase
    .from('pickem_matches')
    .select('id, group_code, home_team_id, away_team_id, home_score, away_score, status')
    .eq('competition_id', opts.competitionId)
    .eq('stage', 'group');

  // Fetch all teams
  const { data: rawTeams } = await supabase
    .from('pickem_teams')
    .select('id, group_code, name, short_name, flag, crest_url')
    .eq('competition_id', opts.competitionId);

  if (!rawMatches || !rawTeams) return;

  const teams: BracketTeam[] = rawTeams.map(t => ({
    id: t.id,
    name: t.name,
    shortName: t.short_name,
    flag: t.flag ?? '',
    groupCode: t.group_code,
    crestUrl: t.crest_url ?? null,
  }));

  const matches: GroupMatch[] = rawMatches.map(m => ({
    id: m.id,
    groupCode: m.group_code ?? '',
    homeTeamId: m.home_team_id,
    awayTeamId: m.away_team_id,
    homeScore: m.home_score ?? null,
    awayScore: m.away_score ?? null,
    status: m.status,
  }));

  // Compute actual standings per group
  const groupCodes = [...new Set(teams.map(t => t.groupCode))].sort();
  const actualStandings = new Map<string, StandingRow[]>();
  for (const code of groupCodes) {
    actualStandings.set(code, computeGroupStandings(matches, teams, code));
  }
  const teamById = new Map(teams.map(t => [t.id, t]));

  // Fetch all user group predictions
  const { data: allPreds } = await supabase
    .from('pickem_user_group_predictions')
    .select('user_id, group_code, team_id, predicted_position')
    .eq('competition_id', opts.competitionId);

  if (!allPreds) return;

  // Fetch all user_preferences for opt-out and display names
  const { data: allPrefs } = await supabase
    .from('user_preferences')
    .select('user_id, display_name, email_opt_out');

  const prefsByUser = new Map((allPrefs ?? []).map(p => [p.user_id as string, p]));

  // Get all users with email via admin API
  const { data: { users } } = await supabase.auth.admin.listUsers({ perPage: 1000 });

  // Group predictions by userId → groupCode → position → teamId
  // posMap: predicted_position (number) → team_id (string)
  type PosMap = Map<number, string>;
  const predsByUser = new Map<string, Map<string, PosMap>>();

  for (const p of allPreds) {
    const uid = String(p.user_id);
    if (!predsByUser.has(uid)) predsByUser.set(uid, new Map());
    const byGroup = predsByUser.get(uid)!;
    if (!byGroup.has(p.group_code)) byGroup.set(p.group_code, new Map<number, string>());
    const posMap: PosMap = byGroup.get(p.group_code)!;
    posMap.set(Number(p.predicted_position), p.team_id as string);
  }

  // Compute per-user group points summary
  function userGroupPoints(userId: string): { groups: GroupRow[]; total: number } {
    const byGroup = predsByUser.get(userId) ?? new Map();
    let total = 0;

    const groups: GroupRow[] = groupCodes.map((code, idx) => {
      const actual = actualStandings.get(code) ?? [];
      const userPred: PosMap = byGroup.get(code) ?? new Map<number, string>();

      // Build predicted team list (sorted by predicted_position)
      const predictedTeams = Array.from(userPred.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([, tid]) => teamById.get(tid))
        .filter((t): t is BracketTeam => t !== undefined);

      const actualTeams = actual.map(r => r.team);

      // Award +1 per team in the correct position
      let pts = 0;
      for (let i = 0; i < Math.min(predictedTeams.length, actualTeams.length); i++) {
        if (predictedTeams[i]?.id === actualTeams[i]?.id) pts++;
      }
      total += pts;

      const fmt = (arr: BracketTeam[]) =>
        arr.map(t => `${t.flag} ${t.shortName}`).join(', ') || '–';

      return {
        label: `Group ${code}`,
        predicted: fmt(predictedTeams),
        actual: fmt(actualTeams),
        points: pts,
        rowAlt: idx % 2 === 1,
        hasPoints: pts > 0,
      };
    });

    return { groups, total };
  }

  interface GroupRow {
    label: string; predicted: string; actual: string;
    points: number; rowAlt: boolean; hasPoints: boolean;
  }

  // Compute all totals for rank/avg
  const allTotals = users.map(u => userGroupPoints(u.id).total);
  const totalUsers = users.length;
  const avgPoints = totalUsers > 0
    ? Math.round((allTotals.reduce((a, b) => a + b, 0) / totalUsers) * 10) / 10
    : 0;

  const matchupsLeft = opts.matchups.slice(0, 8);
  const matchupsRight = opts.matchups.slice(8, 16);

  for (const user of users) {
    if (!user.email) continue;
    const prefs = prefsByUser.get(user.id);
    if (prefs?.email_opt_out) continue;

    const displayName = String(
      prefs?.display_name || user.user_metadata?.display_name || user.user_metadata?.name || ''
    ).trim() || user.email.split('@')[0];
    const firstName = displayName.split(/\s+/)[0] || 'there';

    const { groups, total } = userGroupPoints(user.id);
    const sortedTotals = [...allTotals].sort((a, b) => b - a);
    const rank = sortedTotals.indexOf(total) + 1;

    const html = renderTemplate('groupStageComplete.html', {
      firstName,
      totalGroupPoints: total,
      rank,
      totalUsers,
      avgPoints,
      groups,
      matchupsLeft,
      matchupsRight,
      r32PredictionsUrl: opts.r32PredictionsUrl || `${base}/playoffs/bracket`,
      r32Deadline: opts.r32Deadline,
      leaderboardUrl: opts.leaderboardUrl || `${base}/playoffs/standings`,
      unsubscribeLink: unsubscribeUrl(user.id),
      wc2026LogoUrl: `${base}/wc2026-logo.png`,
      clearwayLogoUrl: `${base}/header_logo_white.svg`,
      verxylLogoUrl: `${base}/logo.png`,
    });

    await sendEmail(
      user.email,
      'WC2026 Group Stage Complete – Your Results & R32 Bracket',
      html,
      { userId: user.id, emailType: 'group_stage_complete' },
    );
  }
}
