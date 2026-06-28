import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { renderTemplate } from '@/server/emails/renderTemplate';
import { sendEmail } from '@/server/emails/sendEmail';
import { unsubscribeUrl } from '@/server/utils/unsubscribeToken';
import { getActiveCompetition, getLeaderboard, getTournamentState, claimFinalEmailSend } from '@/lib/pickem-store';
import {
  computeFinalStandingsFromData, rankCardStyle,
  type FinalStandings, type CorePlayoffPred, type CorePlayoffMatch,
} from '@/server/emails/finalStandingsCore';

/*
 * Stage 7 — Final Standings email.
 *
 * Tournament total combines two stores (there is no single combined leaderboard
 * in the app today, so this module defines the canonical final ranking; any
 * future combined-leaderboard UI MUST reuse computeFinalStandings):
 *   - pickem_points_ledger : group stage (group_position + match_outcome +
 *     match_score) and r32_projection — read via getLeaderboard.
 *   - playoff_predictions.points_awarded : playoff round points, written by the
 *     calculate_playoff_points RPC (winner points by round + folded +2 exact bonus).
 *
 * Breakdown shown in the email (sums to the displayed TOTAL = combined total):
 *   groupStagePoints     = all group-stage ledger (group_position+match_outcome+match_score)
 *   r32ProjectionPoints  = ledger r32_projection
 *   r32/r16/qf/sf Points = playoff base (winner) points per round
 *   finalPoints          = playoff base points for FINAL + THIRD (template has no
 *                          separate Third-Place row, so they're folded together)
 *   exactScoreBonusPoints= 2 × playoff exact-score hits
 */

/** Canonical combined final standings for all participants. Computed once per
 * batch. Delegates the math to the pure, unit-verified finalStandingsCore. */
export async function computeFinalStandings(competitionId: string): Promise<FinalStandings> {
  const supabase = createSupabaseAdminClient();
  const ledger = await getLeaderboard(competitionId);
  const [{ data: predRows }, { data: matchRows }, { data: champRows }] = await Promise.all([
    supabase.from('playoff_predictions')
      .select('user_id, match_id, predicted_winner_id, predicted_home_score, predicted_away_score, points_awarded'),
    supabase.from('playoff_matches')
      .select('id, round, home_score, away_score, winner_team_id, is_locked'),
    supabase.from('pickem_champion_predictions')
      .select('user_id, points_awarded')
      .eq('competition_id', competitionId),
  ]);
  const championByUser = new Map<string, number>();
  for (const row of (champRows ?? []) as Array<{ user_id: string; points_awarded: number | null }>) {
    championByUser.set(String(row.user_id), Number(row.points_awarded ?? 0));
  }
  return computeFinalStandingsFromData(
    ledger.map(r => ({ userId: r.userId, points: r.points, r32Points: r.r32Points })),
    (predRows ?? []) as CorePlayoffPred[],
    (matchRows ?? []) as CorePlayoffMatch[],
    championByUser,
  );
}

/** Build the flat template payload for one user from precomputed standings. */
export function getFinalStandingsData(
  userId: string,
  standings: FinalStandings,
  firstName: string,
  base: string,
): Record<string, unknown> {
  const u = standings.perUser.get(userId)!;
  const finalRank = standings.rankByUser.get(userId) ?? standings.totalUsers;
  const card = rankCardStyle(finalRank);
  const above = u.totalPoints >= standings.avgPoints;
  return {
    firstName,
    finalRank,
    totalUsers: standings.totalUsers,
    totalPoints: u.totalPoints,
    groupStagePoints: u.groupStagePoints,
    r32ProjectionPoints: u.r32ProjectionPoints,
    r32Points: u.r32Points,
    r16Points: u.r16Points,
    qfPoints: u.qfPoints,
    sfPoints: u.sfPoints,
    finalPoints: u.finalPoints,
    exactScoreBonusPoints: u.exactScoreBonusPoints,
    championPoints: u.championPoints,
    bestRound: u.bestRound,
    correctPicksCount: u.correctPicksCount,
    totalPicksCount: u.totalPicksCount,
    exactScoreCount: u.exactScoreCount,
    avgPoints: standings.avgPoints,
    pointsAboveAverage: Math.abs(u.totalPoints - standings.avgPoints),
    aboveOrBelowText: above ? 'above' : 'below',
    deltaColor: above ? '#16a34a' : '#9ca3af',
    // render-time rank-card variant
    rankCardBg: card.bg,
    rankCardBorder: card.border,
    rankMedal: card.medal,
    rankNumColor: card.numColor,
    leaderboardUrl: `${base}/pickem`,
    unsubscribeLink: unsubscribeUrl(userId),
    wc2026LogoUrl: `${base}/wc2026-logo.png`,
    clearwayLogoUrl: `${base}/clearway-logo.svg`,
    verxylLogoUrl: `${base}/verxyl-logo.png`,
  };
}

/** Batch send. Guard is claimed BEFORE sending so a re-trigger can't double-send. */
export async function sendFinalStandingsBlast(
  competitionId: string,
  opts?: { onlyEmails?: string[] },
): Promise<void> {
  const onlyEmails = opts?.onlyEmails;
  // A targeted send (admins-only / test) must NOT consume the one-time guard,
  // so the real all-users send remains possible afterward.
  if (!onlyEmails || onlyEmails.length === 0) {
    const won = await claimFinalEmailSend(competitionId);
    if (!won) return; // already sent
  }
  void _blast(competitionId, onlyEmails);
}

async function _blast(competitionId: string, onlyEmails?: string[]): Promise<void> {
  const supabase = createSupabaseAdminClient();
  const base = (process.env.APP_BASE_URL ?? 'https://clearway.verxyl.com').replace(/\/+$/, '');

  const standings = await computeFinalStandings(competitionId);

  const { data: allPrefs } = await supabase
    .from('user_preferences')
    .select('user_id, display_name, email_opt_out');
  const prefsByUser = new Map((allPrefs ?? []).map(p => [p.user_id as string, p]));

  const onlySet = onlyEmails && onlyEmails.length > 0
    ? new Set(onlyEmails.map(e => e.trim().toLowerCase()))
    : null;

  const { data: { users } } = await supabase.auth.admin.listUsers({ perPage: 1000 });

  for (const user of users) {
    if (!user.email) continue;
    if (onlySet && !onlySet.has(user.email.toLowerCase())) continue;
    if (!standings.perUser.has(user.id)) continue; // not a participant (no standings row)
    const prefs = prefsByUser.get(user.id);
    if (prefs?.email_opt_out) continue;

    const displayName = String(
      prefs?.display_name || user.user_metadata?.display_name || user.user_metadata?.name || ''
    ).trim() || user.email.split('@')[0];
    const firstName = displayName.split(/\s+/)[0] || 'there';

    const html = renderTemplate('finalStandings.html', getFinalStandingsData(user.id, standings, firstName, base));
    await sendEmail(
      user.email,
      "WC2026 Pick'em Is Over — Here's How You Finished",
      html,
      { userId: user.id, emailType: 'final_standings' },
    );
  }
}

/**
 * Event-driven check, called from publish-result after a FINAL or THIRD match is
 * published + scored. Fires the blast once both FINAL and THIRD are done.
 */
export async function maybeSendFinalStandings(): Promise<void> {
  const comp = await getActiveCompetition();
  if (!comp) return;

  const state = await getTournamentState(comp.id);
  if (state.finalEmailSentAt) return;

  const supabase = createSupabaseAdminClient();
  const { data: rows } = await supabase
    .from('playoff_matches')
    .select('round, home_score, away_score, is_locked, winner_team_id')
    .in('round', ['FINAL', 'THIRD']);

  const done = (round: string) => (rows ?? []).some(r =>
    r.round === round && r.is_locked && r.home_score !== null && r.away_score !== null && r.winner_team_id);

  if (done('FINAL') && done('THIRD')) {
    await sendFinalStandingsBlast(comp.id);
  }
}
