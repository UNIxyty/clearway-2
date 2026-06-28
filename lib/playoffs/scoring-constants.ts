/*
 * SINGLE SOURCE OF TRUTH for playoff + champion point values.
 *
 * Every TS consumer (FullBracket card fallback, finalStandingsCore email math,
 * playoffs standings) imports these. The SQL RPC calculate_playoff_points cannot
 * import TS, so it is kept in sync by scripts/check-playoff-points-sync.ts, which
 * parses `SCORING:<path>=<n>` marker comments in the migration and FAILS if any
 * value drifts from this file. Run via `npm run check:scoring`.
 *
 * Scoring tiers depend on whether BOTH real teams in a playoff match were teams
 * the user predicted would be there (their R32 projection for R32; both feeder
 * winners predicted correctly for R16+). See the RPC migration for how that's
 * determined per round.
 */
export const SCORING = {
  // Both teams in the match are from the user's predicted pairs.
  BOTH_TEAMS_MATCH: {
    EXACT_SCORE_AND_WINNER: 5, // correct winner + exact score
    EXACT_SCORE_ONLY: 3,       // wrong winner but exact score (e.g. penalties)
    WINNER_ONLY: 2,            // correct winner, wrong score
  },
  // One or neither team is from the user's predicted pairs.
  ONE_OR_NO_TEAMS_MATCH: {
    WINNER_ONLY: 2,            // correct winner pick
    EXACT_SCORE_ONLY: 2,       // exact score but wrong winner
    EXACT_SCORE_AND_WINNER: 4, // correct winner + exact score (2 + 2)
  },
  WORLD_CHAMPION: 6,           // correct champion prediction
} as const;

/**
 * Flat "winner base" — identical in both tiers (WINNER_ONLY = 2). Used to split a
 * stored points_awarded total into "winner base" vs "bonus" for the email /
 * standings breakdowns without re-deriving the both-teams-match tier in TS.
 */
export const PLAYOFF_WINNER_POINTS = SCORING.ONE_OR_NO_TEAMS_MATCH.WINNER_ONLY;

/** Bonus points for a correct World Champion prediction. */
export const WORLD_CHAMPION_POINTS = SCORING.WORLD_CHAMPION;
