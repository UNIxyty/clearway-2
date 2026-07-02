/*
 * Points-breakdown derivation for the hover/tap tooltip on scored playoff cards.
 *
 * The breakdown is NOT an independent scoring implementation: it runs the SAME
 * certified mirror (evaluatePlayoffPrediction) that scripts/check-playoff-points-
 * sync.ts proves agrees with the SQL calculate_playoff_points. The stored,
 * authoritative points_awarded is passed in and compared against the derived
 * total — if they ever disagree we mark the breakdown `reliable: false` so the
 * caller shows a plain "+N pts" badge instead of a breakdown that could contradict
 * the awarded points. This keeps the tooltip honest by construction.
 */
import { evaluatePlayoffPrediction, type PlayoffScoreInput } from './scoring-constants';

export interface BreakdownLine {
  ok: boolean;
  label: string;
}

export interface PointsBreakdown {
  lines: BreakdownLine[];
  total: number;
  /** true when the derived total equals the authoritative points_awarded. */
  reliable: boolean;
}

/**
 * Build breakdown lines for one scored match prediction. Line order is fixed
 * (Matchup → Score → Winner) so the tooltip reads consistently across tiers.
 */
export function playoffBreakdown(input: PlayoffScoreInput, pointsAwarded: number): PointsBreakdown {
  const r = evaluatePlayoffPrediction(input);

  const lines: BreakdownLine[] = [
    { ok: r.matchup, label: r.matchup ? 'Matchup correct' : 'Matchup missed' },
    { ok: r.score, label: r.score ? 'Exact score' : 'Score missed' },
    { ok: r.progressor, label: r.progressor ? 'Correct winner' : 'Winner missed' },
  ];

  return { lines, total: pointsAwarded, reliable: r.points === pointsAwarded };
}
