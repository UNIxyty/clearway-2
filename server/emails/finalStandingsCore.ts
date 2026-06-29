/*
 * Pure, dependency-free core for final tournament standings.
 *
 * Single source of truth for combining the point stores and ranking users. Takes
 * plain data (no Supabase) so it can be unit-verified and reused by the email
 * trigger unchanged.
 *
 * Playoff points use the authoritative points_awarded written by the tiered
 * calculate_playoff_points RPC (the both-teams-match tier can't be re-derived
 * here without the full prediction graph). We split that total into a per-round
 * "winner base" (correct winners × flat WINNER value) and a single combined
 * "bonus" bucket (everything above the winner base) for the email breakdown.
 */
import { PLAYOFF_WINNER_POINTS, SCORING } from '../../lib/playoffs/scoring-constants.ts';

// Highest possible points on a single match (both-teams + winner + exact).
const MAX_PER_MATCH = SCORING.MATCHUP_MATCHES.SCORE_AND_PROGRESSOR;

export const ROUND_LABEL: Record<string, string> = {
  R32: 'Round of 32', R16: 'Round of 16', QF: 'Quarter-Finals',
  SF: 'Semi-Finals', FINAL: 'Final', THIRD: 'Third Place',
};

/** Already-aggregated ledger totals per user. */
export interface LedgerUser {
  userId: string;
  points: number;     // GROUP-STAGE total only (group_position+match_outcome+match_score)
}
export interface CorePlayoffPred {
  user_id: string;
  match_id: string;
  predicted_winner_id: string | null;
  predicted_home_score: number | null;
  predicted_away_score: number | null;
  points_awarded: number | null; // authoritative, written by calculate_playoff_points
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
  r32Points: number;
  r16Points: number;
  qfPoints: number;
  sfPoints: number;
  finalPoints: number; // FINAL + THIRD winner base
  exactScoreBonusPoints: number; // all playoff points above the winner base
  exactScoreCount: number;
  correctPicksCount: number;
  totalPicksCount: number;
  championPoints: number;
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
  championByUser: Map<string, number> = new Map(),
): FinalStandings {
  const ledgerByUser = new Map(ledger.map(r => [r.userId, r]));
  const matchById = new Map(matchRows.map(m => [m.id, m]));

  interface Acc {
    base: Record<string, number>;       // winner base per round (#winners × WINNER)
    earned: Record<string, number>;     // points_awarded per round
    available: Record<string, number>;  // ceiling: MAX_PER_MATCH per scored pick
    totalEarned: number; totalBase: number;
    exactCount: number; correctCount: number; totalPicks: number;
  }
  const acc = new Map<string, Acc>();
  const ensure = (uid: string): Acc => {
    let a = acc.get(uid);
    if (!a) { a = { base: {}, earned: {}, available: {}, totalEarned: 0, totalBase: 0, exactCount: 0, correctCount: 0, totalPicks: 0 }; acc.set(uid, a); }
    return a;
  };

  for (const p of predRows) {
    const m = matchById.get(p.match_id);
    if (!m || !m.is_locked || m.home_score === null || m.away_score === null || !m.winner_team_id) continue;
    const a = ensure(p.user_id);
    const winnerCorrect = !!p.predicted_winner_id && p.predicted_winner_id === m.winner_team_id;
    const exact = p.predicted_home_score === m.home_score && p.predicted_away_score === m.away_score;
    const earned = Number(p.points_awarded ?? 0);
    const base = winnerCorrect ? PLAYOFF_WINNER_POINTS : 0;
    a.base[m.round] = (a.base[m.round] ?? 0) + base;
    a.earned[m.round] = (a.earned[m.round] ?? 0) + earned;
    a.available[m.round] = (a.available[m.round] ?? 0) + MAX_PER_MATCH;
    a.totalEarned += earned;
    a.totalBase += base;
    if (exact) a.exactCount += 1;
    if (winnerCorrect) a.correctCount += 1;
    a.totalPicks += 1;
  }

  const participantIds = new Set<string>([...ledgerByUser.keys(), ...acc.keys(), ...championByUser.keys()]);
  const perUser = new Map<string, PerUser>();

  for (const uid of participantIds) {
    const led = ledgerByUser.get(uid);
    const a = acc.get(uid);
    const groupStagePoints = led?.points ?? 0;
    const championPoints = championByUser.get(uid) ?? 0;

    const r32Points = a?.base['R32'] ?? 0;
    const r16Points = a?.base['R16'] ?? 0;
    const qfPoints = a?.base['QF'] ?? 0;
    const sfPoints = a?.base['SF'] ?? 0;
    const finalPoints = (a?.base['FINAL'] ?? 0) + (a?.base['THIRD'] ?? 0);
    const exactScoreCount = a?.exactCount ?? 0;
    const playoffTotal = a?.totalEarned ?? 0;
    // Everything above the flat winner base = the exact/both-teams bonus bucket.
    const exactScoreBonusPoints = playoffTotal - (a?.totalBase ?? 0);

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
      groupStagePoints,
      r32Points, r16Points, qfPoints, sfPoints, finalPoints,
      exactScoreBonusPoints, exactScoreCount,
      correctPicksCount: a?.correctCount ?? 0,
      totalPicksCount: a?.totalPicks ?? 0,
      championPoints,
      totalPoints: groupStagePoints + playoffTotal + championPoints,
      bestRound,
    });
  }

  // Deterministic ranking: totalPoints desc → exactScoreCount desc →
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
