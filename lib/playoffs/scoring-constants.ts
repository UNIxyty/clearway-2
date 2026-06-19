/*
 * SINGLE SOURCE OF TRUTH for playoff point values.
 *
 * Every TS consumer (FullBracket badges, finalStandingsCore email math) imports
 * these — they can no longer drift from each other. The SQL RPC
 * calculate_playoff_points (migrations/*_playoff_score_bonus.sql) cannot import
 * TS, so it is kept in sync by scripts/check-playoff-points-sync.ts, which parses
 * the migration and FAILS if its CASE values / bonus don't equal these constants.
 * Run it via `npm run check:scoring` (wire into CI / prebuild).
 *
 * If you change a value here, update the RPC migration to match (the check will
 * tell you if you forgot).
 */
// Flat scoring across EVERY round: +1 for a correct winner, +2 exact-score bonus.
// PLAYOFF_ROUND_POINTS keeps its per-round-map shape (consumers do [round] lookups)
// but every round resolves to the same PLAYOFF_WINNER_POINTS — one source of truth.
export const PLAYOFF_WINNER_POINTS = 1;
export const PLAYOFF_EXACT_BONUS = 2;

const PLAYOFF_ROUNDS = ['R32', 'R16', 'QF', 'SF', 'FINAL', 'THIRD'] as const;
export const PLAYOFF_ROUND_POINTS: Record<string, number> = Object.fromEntries(
  PLAYOFF_ROUNDS.map((r) => [r, PLAYOFF_WINNER_POINTS]),
);
