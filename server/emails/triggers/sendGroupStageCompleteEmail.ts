import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { renderTemplate } from '@/server/emails/renderTemplate';
import { sendEmail } from '@/server/emails/sendEmail';
import { unsubscribeUrl } from '@/server/utils/unsubscribeToken';
import { flagFor } from '@/lib/playoffs/flags';
import { PICKEM_POINTS, type PickemMatchPrediction } from '@/lib/pickem-shared';
import { derivePredictedGroupPositions } from '@/lib/pickem-group-table';
import { listGroups, listMatches, listTeams } from '@/lib/pickem-store';
import { R32_PAIRINGS } from '@/lib/playoffs/r32Bracket';
import { computeUserPredictedR32, type BracketTeam, type GroupMatch } from '@/lib/playoffs/standings';

export interface R32Matchup {
  /** R32 slot code (e.g. R32_M01) — used to carry the slot's official date/venue. */
  matchCode: string;
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
  /**
   * When provided, only users whose email is in this list receive the blast
   * (case-insensitive) — used to rehearse the send to admins/devs before going
   * live. Ranks/averages are still computed across ALL users, so a test
   * recipient sees their real standing. Omit to email everyone (default).
   */
  onlyEmails?: string[];
}

interface GroupRow {
  label: string; predicted: string; actual: string;
  points: number; rowAlt: boolean; hasPoints: boolean;
}

export function sendGroupStageCompleteBlast(opts: GroupStageBlastOptions): void {
  // Fire-and-forget, but never let a failure vanish as an unhandled rejection.
  void _blast(opts).catch(err =>
    console.error('[group-stage-blast] fatal — blast aborted', err),
  );
}

async function _blast(opts: GroupStageBlastOptions): Promise<void> {
  const supabase = createSupabaseAdminClient();
  const base = (process.env.APP_BASE_URL ?? 'https://clearway.verxyl.com').replace(/\/+$/, '');

  // Typed group/team/match data (same source the leaderboard scoring uses).
  const [groups, teams, matches] = await Promise.all([
    listGroups(opts.competitionId),
    listTeams(opts.competitionId),
    listMatches(opts.competitionId),
  ]);
  const teamById = new Map(teams.map(t => [t.id, t]));
  const groupCodes = [...new Set(teams.map(t => t.groupCode))].sort();

  // Real final positions (admin-set) — the truth group points are scored against,
  // identical to recomputePickemPoints / the leaderboard.
  const { data: groupResults } = await supabase
    .from('pickem_group_results')
    .select('group_code, team_id, final_position')
    .eq('competition_id', opts.competitionId);
  const realPosByTeam = new Map<string, number>();
  for (const r of groupResults ?? []) {
    realPosByTeam.set(`${(r as any).group_code}:${(r as any).team_id}`, Number((r as any).final_position));
  }

  // All users' match predictions (group standings are derived from these scores).
  const { data: allMatchPreds } = await supabase
    .from('pickem_user_match_predictions')
    .select('user_id, match_id, predicted_home_score, predicted_away_score, predicted_outcome')
    .eq('competition_id', opts.competitionId);
  const predsByUser = new Map<string, PickemMatchPrediction[]>();
  for (const p of allMatchPreds ?? []) {
    const uid = String((p as any).user_id);
    if (!predsByUser.has(uid)) predsByUser.set(uid, []);
    predsByUser.get(uid)!.push({
      userId: uid,
      competitionId: opts.competitionId,
      matchId: String((p as any).match_id),
      predictedHomeScore: Number((p as any).predicted_home_score),
      predictedAwayScore: Number((p as any).predicted_away_score),
      predictedOutcome: (p as any).predicted_outcome,
    });
  }

  const { data: allPrefs } = await supabase
    .from('user_preferences')
    .select('user_id, display_name, email_opt_out');
  const prefsByUser = new Map((allPrefs ?? []).map(p => [p.user_id as string, p]));

  const { data: { users } } = await supabase.auth.admin.listUsers({ perPage: 1000 });

  const fmt = (ids: string[]) =>
    ids.map(id => teamById.get(id)).filter(Boolean)
       .map(t => `${flagFor(t!.shortName)} ${t!.shortName}`).join(', ') || '–';

  // Per-user group points via the SAME score-derived model as the leaderboard:
  // derived predicted positions vs admin-set real final positions, +1 per match.
  function userGroupPoints(userId: string): { groups: GroupRow[]; total: number } {
    const derived = derivePredictedGroupPositions({
      groups, teams, matches,
      matchPredictions: predsByUser.get(userId) ?? [],
    });
    // groupCode -> [teamId ordered by predicted position]
    const predByGroup = new Map<string, string[]>();
    const predPosByTeam = new Map<string, number>();
    for (const d of derived) {
      if (!predByGroup.has(d.groupCode)) predByGroup.set(d.groupCode, []);
      predByGroup.get(d.groupCode)![d.predictedPosition - 1] = d.teamId;
      predPosByTeam.set(`${d.groupCode}:${d.teamId}`, d.predictedPosition);
    }

    let total = 0;
    const groupRows: GroupRow[] = groupCodes.map((code, idx) => {
      const predictedIds = predByGroup.get(code) ?? [];
      // Actual order from real final positions.
      const actualIds = teams
        .filter(t => t.groupCode === code)
        .map(t => ({ id: t.id, pos: realPosByTeam.get(`${code}:${t.id}`) ?? 99 }))
        .sort((a, b) => a.pos - b.pos)
        .map(t => t.id);

      let pts = 0;
      for (const t of teams.filter(tt => tt.groupCode === code)) {
        const pp = predPosByTeam.get(`${code}:${t.id}`);
        const rp = realPosByTeam.get(`${code}:${t.id}`);
        if (pp !== undefined && rp !== undefined && pp === rp) pts += PICKEM_POINTS.GROUP_POSITION;
      }
      total += pts;

      return {
        label: `Group ${code}`,
        predicted: fmt(predictedIds.filter(Boolean)),
        actual: fmt(actualIds),
        points: pts,
        rowAlt: idx % 2 === 1,
        hasPoints: pts > 0,
      };
    });

    return { groups: groupRows, total };
  }

  const totalsByUser = new Map<string, number>();
  for (const u of users) totalsByUser.set(u.id, userGroupPoints(u.id).total);
  const allTotals = [...totalsByUser.values()];
  const totalUsers = users.length;
  const avgPoints = totalUsers > 0
    ? Math.round((allTotals.reduce((a, b) => a + b, 0) / totalUsers) * 10) / 10
    : 0;
  const sortedTotals = [...allTotals].sort((a, b) => b - a);

  // ── Per-user R32 projection ──
  // The email's "Your R32 Matchups" must be each user's OWN projection (their
  // group picks → computeUserPredictedR32), NOT the official playoff_matches
  // pairs. Slot date/venue come from opts.matchups (official per-slot meta).
  const bracketTeams: BracketTeam[] = teams.map(t => ({
    id: t.id,
    name: t.name,
    shortName: t.shortName,
    flag: flagFor(t.shortName),
    groupCode: t.groupCode,
    crestUrl: t.crestUrl ?? null,
  }));
  const groupStageMatches = matches.filter(m => m.groupCode);
  const slotMeta = new Map(opts.matchups.map(m => [m.matchCode, { date: m.date, venue: m.venue }]));

  function userR32Matchups(userId: string): R32Matchup[] {
    const predMap = new Map((predsByUser.get(userId) ?? []).map(p => [p.matchId, p]));
    const gm: GroupMatch[] = groupStageMatches.map(m => {
      const p = predMap.get(m.id);
      return {
        id: m.id,
        groupCode: m.groupCode as string,
        homeTeamId: m.homeTeamId,
        awayTeamId: m.awayTeamId,
        homeScore: p ? p.predictedHomeScore : null,
        awayScore: p ? p.predictedAwayScore : null,
        status: m.status,
      };
    });
    return computeUserPredictedR32(R32_PAIRINGS, gm, bracketTeams).map(r => {
      const meta = slotMeta.get(r.matchCode) ?? { date: '', venue: '' };
      return {
        matchCode: r.matchCode,
        teamA: r.home?.name ?? 'TBD',
        flagA: r.home ? flagFor(r.home.shortName) : '',
        teamB: r.away?.name ?? 'TBD',
        flagB: r.away ? flagFor(r.away.shortName) : '',
        date: meta.date,
        venue: meta.venue,
      };
    });
  }

  // Optional allow-list (rehearse to admins/devs). Population/stats above are
  // unfiltered, so ranks stay correct; this only narrows who is actually sent.
  const onlySet = opts.onlyEmails && opts.onlyEmails.length > 0
    ? new Set(opts.onlyEmails.map(e => e.trim().toLowerCase()))
    : null;

  let sent = 0;
  let failed = 0;
  for (const user of users) {
    if (!user.email) continue;
    if (onlySet && !onlySet.has(user.email.toLowerCase())) continue;
    const prefs = prefsByUser.get(user.id);
    if (prefs?.email_opt_out) continue;

    const userMatchups = userR32Matchups(user.id);
    const matchupsLeft = userMatchups.slice(0, 8);
    const matchupsRight = userMatchups.slice(8, 16);

    const displayName = String(
      prefs?.display_name || user.user_metadata?.display_name || user.user_metadata?.name || ''
    ).trim() || user.email.split('@')[0];
    const firstName = displayName.split(/\s+/)[0] || 'there';

    const { groups: groupRows, total } = userGroupPoints(user.id);
    const rank = sortedTotals.indexOf(total) + 1;

    const html = renderTemplate('groupStageComplete.html', {
      firstName,
      totalGroupPoints: total,
      rank,
      totalUsers,
      avgPoints,
      groups: groupRows,
      matchupsLeft,
      matchupsRight,
      r32PredictionsUrl: opts.r32PredictionsUrl || `${base}/playoffs/bracket`,
      r32Deadline: opts.r32Deadline,
      leaderboardUrl: opts.leaderboardUrl || `${base}/playoffs/standings`,
      unsubscribeLink: unsubscribeUrl(user.id),
      wc2026LogoUrl: `${base}/wc2026-logo.png`,
      clearwayLogoUrl: `${base}/clearway-logo.svg`,
      verxylLogoUrl: `${base}/verxyl-logo.png`,
    });

    // Per-recipient guard so one failed send doesn't abort the whole batch and
    // each failure is visible in server logs (was previously silent).
    try {
      await sendEmail(
        user.email,
        'WC2026 Group Stage Complete — Your Results Are In',
        html,
        { userId: user.id, emailType: 'group_stage_complete' },
      );
      sent++;
    } catch (err) {
      failed++;
      console.error('[group-stage-blast] send failed', {
        userId: user.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  console.log('[group-stage-blast] complete', {
    competitionId: opts.competitionId,
    mode: onlySet ? 'test' : 'all',
    sent,
    failed,
  });
}
