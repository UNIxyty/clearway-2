/*
 * Pure, dependency-free core for final tournament standings.
 *
 * This is the single source of truth for combining the two point stores and
 * ranking users. It takes plain data (no Supabase) so it can be unit-verified
 * against a synthetic dataset and reused by the email trigger unchanged.
 */

// Re-exported from the single source of truth. This core recomputes the per-round
// base + exact-bonus SPLIT (which the folded points_awarded can't provide); its
// total equals SUM(points_awarded) as long as these constants match the RPC,
// which scripts/check-playoff-points-sync.ts enforces.
// Relative .ts import (allowImportingTsExtensions) so this leaf resolves under
// tsc, webpack, AND the bare-node verify harness identically.
import { PLAYOFF_ROUND_POINTS, PLAYOFF_EXACT_BONUS } from '../../lib/playoffs/scoring-constants.ts';
export const ROUND_POINTS = PLAYOFF_ROUND_POINTS;
export const EXACT_BONUS = PLAYOFF_EXACT_BONUS;
export const ROUND_LABEL: Record<string, string> = {
  R32: 'Round of 32', R16: 'Round of 16', QF: 'Quarter-Finals',
  SF: 'Semi-Finals', FINAL: 'Final', THIRD: 'Third Place',
};

/** Already-aggregated ledger totals per user (group stage + r32_projection). */
export interface LedgerUser {
  userId: string;
  points: number;     // NOTE: getLeaderboard now returns a COMBINED total; this
                      // module subtracts playoffPoints to recover ledger-only.
  r32Points: number;  // r32_projection only
  playoffPoints?: number; // playoff match points already folded into `points`
}
export interface CorePlayoffPred {
  user_id: string;
  match_id: string;
  predicted_winner_id: string | null;
  predicted_home_score: number | null;
  predicted_away_score: number | null;
}
export interface CorePlayoffMatch {
  id: string;
  round: string;
  home_score: number | null;
  away_score: number | null;
  winner_team_id: string | null;
  is_locked: boolean;
}

export interface PerUser {
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

export interface FinalStandings {
  perUser: Map<string, PerUser>;
  rankByUser: Map<string, number>;
  totalUsers: number;
  avgPoints: number;
}

export function rankCardStyle(rank: number): { bg: string; border: string; medal: string; numColor: string } {
  if (rank === 1) return { bg: '#FFFBEB', border: '#FFD700', medal: '🥇', numColor: '#B45309' };
  if (rank === 2) return { bg: '#F8FAFC', border: '#C0C0C0', medal: '🥈', numColor: '#6b7280' };
  if (rank === 3) return { bg: '#FFF7ED', border: '#CD7F32', medal: '🥉', numColor: '#92400e' };
  return { bg: '#EBF3FF', border: '#1a56db', medal: '', numColor: '#1a56db' };
}

export function computeFinalStandingsFromData(
  ledger: LedgerUser[],
  predRows: CorePlayoffPred[],
  matchRows: CorePlayoffMatch[],
): FinalStandings {
  const ledgerByUser = new Map(ledger.map(r => [r.userId, r]));
  const matchById = new Map(matchRows.map(m => [m.id, m]));

  interface Acc {
    base: Record<string, number>;
    earned: Record<string, number>;     // base + exact bonus
    available: Record<string, number>;  // ceiling: roundVal + EXACT_BONUS per scored match
    exactCount: number; correctCount: number; totalPicks: number;
  }
  const acc = new Map<string, Acc>();
  const ensure = (uid: string): Acc => {
    let a = acc.get(uid);
    if (!a) { a = { base: {}, earned: {}, available: {}, exactCount: 0, correctCount: 0, totalPicks: 0 }; acc.set(uid, a); }
    return a;
  };

  for (const p of predRows) {
    const m = matchById.get(p.match_id);
    if (!m || !m.is_locked || m.home_score === null || m.away_score === null || !m.winner_team_id) continue;
    const roundVal = ROUND_POINTS[m.round] ?? 0;
    const a = ensure(p.user_id);
    const winnerCorrect = !!p.predicted_winner_id && p.predicted_winner_id === m.winner_team_id;
    const exact = p.predicted_home_score === m.home_score && p.predicted_away_score === m.away_score;
    const base = winnerCorrect ? roundVal : 0;
    const bonus = exact ? EXACT_BONUS : 0;
    a.base[m.round] = (a.base[m.round] ?? 0) + base;
    a.earned[m.round] = (a.earned[m.round] ?? 0) + base + bonus;
    a.available[m.round] = (a.available[m.round] ?? 0) + roundVal + EXACT_BONUS;
    if (exact) a.exactCount += 1;
    if (winnerCorrect) a.correctCount += 1;
    a.totalPicks += 1;
  }

  const participantIds = new Set<string>([...ledgerByUser.keys(), ...acc.keys()]);
  const perUser = new Map<string, PerUser>();

  for (const uid of participantIds) {
    const led = ledgerByUser.get(uid);
    const a = acc.get(uid);
    const r32ProjectionPoints = led?.r32Points ?? 0;
    // getLeaderboard.points is now the COMBINED total; recover the ledger-only
    // portion so playoff points (added back via playoffTotal below) aren't
    // double-counted.
    const ledgerTotal = (led?.points ?? 0) - (led?.playoffPoints ?? 0);
    const groupStagePoints = ledgerTotal - r32ProjectionPoints;

    const r32Points = a?.base['R32'] ?? 0;
    const r16Points = a?.base['R16'] ?? 0;
    const qfPoints = a?.base['QF'] ?? 0;
    const sfPoints = a?.base['SF'] ?? 0;
    const finalPoints = (a?.base['FINAL'] ?? 0) + (a?.base['THIRD'] ?? 0);
    const exactScoreCount = a?.exactCount ?? 0;
    const exactScoreBonusPoints = exactScoreCount * EXACT_BONUS;
    const playoffTotal = r32Points + r16Points + qfPoints + sfPoints + finalPoints + exactScoreBonusPoints;

    let bestRound = '—';
    let bestPct = -1;
    if (a) {
      for (const round of Object.keys(a.available)) {
        const avail = a.available[round];
        if (avail <= 0) continue;
        const pct = (a.earned[round] ?? 0) / avail;
        if (pct > bestPct) { bestPct = pct; bestRound = ROUND_LABEL[round] ?? round; }
      }
    }

    perUser.set(uid, {
      groupStagePoints, r32ProjectionPoints,
      r32Points, r16Points, qfPoints, sfPoints, finalPoints,
      exactScoreBonusPoints, exactScoreCount,
      correctPicksCount: a?.correctCount ?? 0,
      totalPicksCount: a?.totalPicks ?? 0,
      totalPoints: ledgerTotal + playoffTotal,
      bestRound,
    });
  }

  // Deterministic ranking with a defined tiebreaker chain so no two users get an
  // ambiguous/duplicate rank: totalPoints desc → exactScoreCount desc →
  // correctPicksCount desc → userId asc. Rank = position (1-based, distinct).
  const ordered = [...perUser.entries()].sort((x, y) => {
    const a = x[1], b = y[1];
    if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
    if (b.exactScoreCount !== a.exactScoreCount) return b.exactScoreCount - a.exactScoreCount;
    if (b.correctPicksCount !== a.correctPicksCount) return b.correctPicksCount - a.correctPicksCount;
    return x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0;
  });
  const rankByUser = new Map<string, number>();
  ordered.forEach(([uid], i) => rankByUser.set(uid, i + 1));

  const totalUsers = participantIds.size;
  const avgPoints = totalUsers > 0
    ? Math.round([...perUser.values()].reduce((s, u) => s + u.totalPoints, 0) / totalUsers)
    : 0;

  return { perUser, rankByUser, totalUsers, avgPoints };
}
