/*
 * SINGLE SOURCE OF TRUTH for playoff + champion point values AND the per-match
 * scoring logic. The SQL RPC calculate_playoff_points must implement the identical
 * control flow; scripts/check-playoff-points-sync.ts parses `SCORING:<path>=<n>`
 * marker comments in the migration and fails if any value drifts from this file.
 *
 * Per match, per user, compute three booleans then award the HIGHEST applicable
 * tier (points never stack within a match):
 *
 *   MATCHUP_MATCHES   — the SET of the two teams the user predicted for THIS match
 *                       equals {home_team_id, away_team_id}. R32: always true (the
 *                       slot teams are the actual teams). R16+: the user's two
 *                       teams = their predicted winners of the two feeder matches.
 *   SCORE_MATCHES     — full-time scoreline matches. If MATCHUP_MATCHES, the score
 *                       is aligned per-team (flipped if the user's home team is the
 *                       actual away team). If NOT MATCHUP_MATCHES, the raw score
 *                       PAIR is compared order-independently (sorted pairs equal).
 *   PROGRESSOR_MATCHES — predicted_winner_id == winner_team_id.
 *
 *   MATCHUP_MATCHES:  score+prog → 5,  score → 3,  prog → 2,  else 0
 *   NOT MATCHUP:      prog OR score → 2,  else 0   (capped at 2, non-stacking)
 *   World Champion:   flat 6, scored separately (calculate_champion_points).
 */
export const SCORING = {
  MATCHUP_MATCHES: {
    SCORE_AND_PROGRESSOR: 5,
    SCORE_ONLY: 3,
    PROGRESSOR_ONLY: 2,
    NONE: 0,
  },
  NO_MATCHUP: {
    PROGRESSOR_OR_SCORE: 2,
    NONE: 0,
  },
  WORLD_CHAMPION: 6,
} as const;

/** Flat winner/progressor base, used to split a stored points_awarded total into
 * a "progressor base" vs "bonus" for display breakdowns. */
export const PLAYOFF_WINNER_POINTS = SCORING.MATCHUP_MATCHES.PROGRESSOR_ONLY; // 2

/** Bonus points for a correct World Champion prediction. */
export const WORLD_CHAMPION_POINTS = SCORING.WORLD_CHAMPION; // 6

export interface PlayoffScoreInput {
  /** Actual match. */
  actualHomeTeamId: string | null;
  actualAwayTeamId: string | null;
  actualHomeScore: number | null;
  actualAwayScore: number | null;
  winnerTeamId: string | null;
  /** The two teams the user predicted for THIS match, in the user's home/away
   *  order (R32: the slot's home/away; R16+: predicted winners of feeder1/feeder2). */
  predHomeTeamId: string | null;
  predAwayTeamId: string | null;
  predHomeScore: number | null;
  predAwayScore: number | null;
  predictedWinnerId: string | null;
}

export interface PlayoffScoreResult {
  matchup: boolean;
  score: boolean;
  progressor: boolean;
  points: number;
}

/** Pure TS mirror of calculate_playoff_points for one prediction. */
export function evaluatePlayoffPrediction(i: PlayoffScoreInput): PlayoffScoreResult {
  const aHome = i.actualHomeTeamId;
  const aAway = i.actualAwayTeamId;
  const uHome = i.predHomeTeamId;
  const uAway = i.predAwayTeamId;

  // MATCHUP_MATCHES — set equality of the two predicted teams vs the actual two.
  const matchup =
    !!uHome && !!uAway && !!aHome && !!aAway &&
    ((uHome === aHome && uAway === aAway) || (uHome === aAway && uAway === aHome));

  // PROGRESSOR_MATCHES.
  const progressor = !!i.predictedWinnerId && i.predictedWinnerId === i.winnerTeamId;

  // SCORE_MATCHES.
  let score = false;
  const ph = i.predHomeScore, pa = i.predAwayScore;
  const ah = i.actualHomeScore, av = i.actualAwayScore;
  if (ph !== null && pa !== null && ah !== null && av !== null) {
    if (matchup) {
      // Align per team: if the user's home team is the actual AWAY team, flip.
      const flipped = uHome === aAway;
      score = flipped ? (ph === av && pa === ah) : (ph === ah && pa === av);
    } else {
      // Order-independent raw score pair.
      score = Math.min(ph, pa) === Math.min(ah, av) && Math.max(ph, pa) === Math.max(ah, av);
    }
  }

  let points: number;
  if (matchup) {
    if (score && progressor) points = SCORING.MATCHUP_MATCHES.SCORE_AND_PROGRESSOR;
    else if (score) points = SCORING.MATCHUP_MATCHES.SCORE_ONLY;
    else if (progressor) points = SCORING.MATCHUP_MATCHES.PROGRESSOR_ONLY;
    else points = SCORING.MATCHUP_MATCHES.NONE;
  } else {
    points = (progressor || score) ? SCORING.NO_MATCHUP.PROGRESSOR_OR_SCORE : SCORING.NO_MATCHUP.NONE;
  }

  return { matchup, score, progressor, points };
}
