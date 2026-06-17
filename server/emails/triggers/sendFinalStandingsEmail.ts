import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { renderTemplate } from '@/server/emails/renderTemplate';
import { sendEmail } from '@/server/emails/sendEmail';
import { unsubscribeUrl } from '@/server/utils/unsubscribeToken';
import { getActiveCompetition, getLeaderboard, getTournamentState, claimFinalEmailSend } from '@/lib/pickem-store';

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

const ROUND_POINTS: Record<string, number> = { R32: 1, R16: 2, QF: 5, SF: 8, FINAL: 10, THIRD: 3 };
const EXACT_BONUS = 2;
const ROUND_LABEL: Record<string, string> = {
  R32: 'Round of 32', R16: 'Round of 16', QF: 'Quarter-Finals',
  SF: 'Semi-Finals', FINAL: 'Final', THIRD: 'Third Place',
};

interface PerUser {
  groupStagePoints: number;
  r32ProjectionPoints: number;
  r32Points: number;
  r16Points: number;
  qfPoints: number;
  sfPoints: number;
  finalPoints: number; // FINAL + THIRD base points
  exactScoreBonusPoints: number;
  exactScoreCount: number;
  correctPicksCount: number;
  totalPicksCount: number;
  totalPoints: number;
  bestRound: string;
}

interface FinalStandings {
  perUser: Map<string, PerUser>;
  rankByUser: Map<string, number>;
  totalUsers: number;
  avgPoints: number;
}

interface PlayoffPredRow {
  user_id: string;
  match_id: string;
  predicted_winner_id: string | null;
  predicted_home_score: number | null;
  predicted_away_score: number | null;
}
interface PlayoffMatchRow {
  id: string;
  round: string;
  home_score: number | null;
  away_score: number | null;
  winner_team_id: string | null;
  is_locked: boolean;
}

/** Canonical combined final standings for all participants. Computed once per batch. */
export async function computeFinalStandings(competitionId: string): Promise<FinalStandings> {
  const supabase = createSupabaseAdminClient();

  // Ledger side (group + r32_projection) via the same helper the leaderboard uses.
  const ledger = await getLeaderboard(competitionId);
  const ledgerByUser = new Map(ledger.map(r => [r.userId, r]));

  // Playoff side.
  const [{ data: predRows }, { data: matchRows }] = await Promise.all([
    supabase.from('playoff_predictions')
      .select('user_id, match_id, predicted_winner_id, predicted_home_score, predicted_away_score'),
    supabase.from('playoff_matches')
      .select('id, round, home_score, away_score, winner_team_id, is_locked'),
  ]);
  const matchById = new Map<string, PlayoffMatchRow>(
    ((matchRows ?? []) as PlayoffMatchRow[]).map(m => [m.id, m]),
  );

  // Per-user playoff accumulator.
  interface Acc {
    base: Record<string, number>; // round -> base winner points
    earnedPctNum: Record<string, number>; // round -> earned (base+bonus)
    available: Record<string, number>; // round -> max achievable
    exactCount: number; correctCount: number; totalPicks: number;
  }
  const acc = new Map<string, Acc>();
  const ensure = (uid: string): Acc => {
    let a = acc.get(uid);
    if (!a) { a = { base: {}, earnedPctNum: {}, available: {}, exactCount: 0, correctCount: 0, totalPicks: 0 }; acc.set(uid, a); }
    return a;
  };

  for (const p of ((predRows ?? []) as PlayoffPredRow[])) {
    const m = matchById.get(p.match_id);
    if (!m || !m.is_locked || m.home_score === null || m.away_score === null || !m.winner_team_id) continue;
    const roundVal = ROUND_POINTS[m.round] ?? 0;
    const a = ensure(p.user_id);
    const winnerCorrect = !!p.predicted_winner_id && p.predicted_winner_id === m.winner_team_id;
    const exact = p.predicted_home_score === m.home_score && p.predicted_away_score === m.away_score;
    const base = winnerCorrect ? roundVal : 0;
    const bonus = exact ? EXACT_BONUS : 0;
    a.base[m.round] = (a.base[m.round] ?? 0) + base;
    a.earnedPctNum[m.round] = (a.earnedPctNum[m.round] ?? 0) + base + bonus;
    a.available[m.round] = (a.available[m.round] ?? 0) + roundVal + EXACT_BONUS;
    if (exact) a.exactCount += 1;
    if (winnerCorrect) a.correctCount += 1;
    a.totalPicks += 1;
  }

  // All participants = ledger participants ∪ playoff participants.
  const participantIds = new Set<string>([...ledgerByUser.keys(), ...acc.keys()]);

  const perUser = new Map<string, PerUser>();
  for (const uid of participantIds) {
    const led = ledgerByUser.get(uid);
    const a = acc.get(uid);
    const r32ProjectionPoints = led?.r32Points ?? 0;
    const ledgerTotal = led?.points ?? 0;
    const groupStagePoints = ledgerTotal - r32ProjectionPoints; // group_position+match_outcome+match_score

    const r32Points = a?.base['R32'] ?? 0;
    const r16Points = a?.base['R16'] ?? 0;
    const qfPoints = a?.base['QF'] ?? 0;
    const sfPoints = a?.base['SF'] ?? 0;
    const finalPoints = (a?.base['FINAL'] ?? 0) + (a?.base['THIRD'] ?? 0);
    const exactScoreCount = a?.exactCount ?? 0;
    const exactScoreBonusPoints = exactScoreCount * EXACT_BONUS;
    const playoffTotal = r32Points + r16Points + qfPoints + sfPoints + finalPoints + exactScoreBonusPoints;

    // Best round by earned/available percentage (rounds have different ceilings).
    let bestRound = '—';
    let bestPct = -1;
    if (a) {
      for (const round of Object.keys(a.available)) {
        const avail = a.available[round];
        if (avail <= 0) continue;
        const pct = (a.earnedPctNum[round] ?? 0) / avail;
        if (pct > bestPct) { bestPct = pct; bestRound = ROUND_LABEL[round] ?? round; }
      }
    }

    perUser.set(uid, {
      groupStagePoints,
      r32ProjectionPoints,
      r32Points, r16Points, qfPoints, sfPoints, finalPoints,
      exactScoreBonusPoints,
      exactScoreCount,
      correctPicksCount: a?.correctCount ?? 0,
      totalPicksCount: a?.totalPicks ?? 0,
      totalPoints: ledgerTotal + playoffTotal,
      bestRound,
    });
  }

  // Rank by combined total (ties share rank: strictly-greater count + 1).
  const totals = [...perUser.entries()].map(([uid, u]) => ({ uid, total: u.totalPoints }));
  const rankByUser = new Map<string, number>();
  for (const { uid, total } of totals) {
    const better = totals.filter(t => t.total > total).length;
    rankByUser.set(uid, better + 1);
  }

  const totalUsers = participantIds.size;
  const avgPoints = totalUsers > 0
    ? Math.round(totals.reduce((s, t) => s + t.total, 0) / totalUsers)
    : 0;

  return { perUser, rankByUser, totalUsers, avgPoints };
}

function rankCardStyle(rank: number): { bg: string; border: string; medal: string; numColor: string } {
  if (rank === 1) return { bg: '#FFFBEB', border: '#FFD700', medal: '🥇', numColor: '#B45309' };
  if (rank === 2) return { bg: '#F8FAFC', border: '#C0C0C0', medal: '🥈', numColor: '#6b7280' };
  if (rank === 3) return { bg: '#FFF7ED', border: '#CD7F32', medal: '🥉', numColor: '#92400e' };
  return { bg: '#EBF3FF', border: '#1a56db', medal: '', numColor: '#1a56db' };
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
export async function sendFinalStandingsBlast(competitionId: string): Promise<void> {
  const won = await claimFinalEmailSend(competitionId);
  if (!won) return; // already sent
  void _blast(competitionId);
}

async function _blast(competitionId: string): Promise<void> {
  const supabase = createSupabaseAdminClient();
  const base = (process.env.APP_BASE_URL ?? 'https://clearway.verxyl.com').replace(/\/+$/, '');

  const standings = await computeFinalStandings(competitionId);

  const { data: allPrefs } = await supabase
    .from('user_preferences')
    .select('user_id, display_name, email_opt_out');
  const prefsByUser = new Map((allPrefs ?? []).map(p => [p.user_id as string, p]));

  const { data: { users } } = await supabase.auth.admin.listUsers({ perPage: 1000 });

  for (const user of users) {
    if (!user.email) continue;
    if (!standings.perUser.has(user.id)) continue; // not a participant
    const prefs = prefsByUser.get(user.id);
    if (prefs?.email_opt_out) continue;

    const displayName = String(
      prefs?.display_name || user.user_metadata?.display_name || user.user_metadata?.name || ''
    ).trim() || user.email.split('@')[0];
    const firstName = displayName.split(/\s+/)[0] || 'there';

    const html = renderTemplate('finalStandings.html', getFinalStandingsData(user.id, standings, firstName, base));
    await sendEmail(
      user.email,
      'WC2026 Pick\'em – Final Results & Your Tournament Rank',
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
