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
export const PLAYOFF_ROUND_POINTS: Record<string, number> = {
  R32: 1, R16: 2, QF: 5, SF: 8, FINAL: 10, THIRD: 3,
};

export const PLAYOFF_EXACT_BONUS = 2;
