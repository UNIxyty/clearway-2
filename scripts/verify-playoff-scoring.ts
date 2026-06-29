/*
 * Verify the playoff scoring TS mirror (evaluatePlayoffPrediction) against the
 * spec's A1–A5 / B1–B4 cases. Mirrors the SQL calculate_playoff_points logic.
 *   node --experimental-strip-types scripts/verify-playoff-scoring.ts
 */
import { evaluatePlayoffPrediction, type PlayoffScoreInput } from '../lib/playoffs/scoring-constants.ts';

interface Case {
  name: string;
  input: PlayoffScoreInput;
  expected: number;
}

// Team ids are just names here.
const cases: Case[] = [
  {
    name: 'A1 matchup+score+prog',
    input: {
      actualHomeTeamId: 'Germany', actualAwayTeamId: 'Paraguay', actualHomeScore: 2, actualAwayScore: 1, winnerTeamId: 'Germany',
      predHomeTeamId: 'Germany', predAwayTeamId: 'Paraguay', predHomeScore: 2, predAwayScore: 1, predictedWinnerId: 'Germany',
    },
    expected: 5,
  },
  {
    name: 'A2 matchup+score, wrong prog (penalties)',
    input: {
      actualHomeTeamId: 'Germany', actualAwayTeamId: 'Paraguay', actualHomeScore: 1, actualAwayScore: 1, winnerTeamId: 'Paraguay',
      predHomeTeamId: 'Germany', predAwayTeamId: 'Paraguay', predHomeScore: 1, predAwayScore: 1, predictedWinnerId: 'Germany',
    },
    expected: 3,
  },
  {
    name: 'A3 matchup+prog, wrong score',
    input: {
      actualHomeTeamId: 'France', actualAwayTeamId: 'Sweden', actualHomeScore: 1, actualAwayScore: 0, winnerTeamId: 'France',
      predHomeTeamId: 'France', predAwayTeamId: 'Sweden', predHomeScore: 3, predAwayScore: 0, predictedWinnerId: 'France',
    },
    expected: 2,
  },
  {
    name: 'A4 matchup (flipped teams) + score + prog',
    input: {
      actualHomeTeamId: 'Germany', actualAwayTeamId: 'Paraguay', actualHomeScore: 2, actualAwayScore: 1, winnerTeamId: 'Germany',
      predHomeTeamId: 'Paraguay', predAwayTeamId: 'Germany', predHomeScore: 1, predAwayScore: 2, predictedWinnerId: 'Germany',
    },
    expected: 5,
  },
  {
    name: 'A5 matchup only, score wrong, prog wrong',
    input: {
      actualHomeTeamId: 'Germany', actualAwayTeamId: 'Paraguay', actualHomeScore: 1, actualAwayScore: 0, winnerTeamId: 'Germany',
      predHomeTeamId: 'Germany', predAwayTeamId: 'Paraguay', predHomeScore: 2, predAwayScore: 0, predictedWinnerId: 'Paraguay',
    },
    expected: 0,
  },
  {
    name: 'B1 no matchup, prog only',
    input: {
      actualHomeTeamId: 'Canada', actualAwayTeamId: 'Paraguay', actualHomeScore: 1, actualAwayScore: 0, winnerTeamId: 'Canada',
      predHomeTeamId: 'Canada', predAwayTeamId: 'Germany', predHomeScore: 2, predAwayScore: 0, predictedWinnerId: 'Canada',
    },
    expected: 2,
  },
  {
    name: 'B2 no matchup, score pair matches',
    input: {
      actualHomeTeamId: 'France', actualAwayTeamId: 'Sweden', actualHomeScore: 3, actualAwayScore: 2, winnerTeamId: 'France',
      predHomeTeamId: 'Germany', predAwayTeamId: 'Paraguay', predHomeScore: 3, predAwayScore: 2, predictedWinnerId: 'Germany',
    },
    expected: 2,
  },
  {
    name: 'B3 no matchup, nothing right',
    input: {
      actualHomeTeamId: 'France', actualAwayTeamId: 'Sweden', actualHomeScore: 0, actualAwayScore: 3, winnerTeamId: 'France',
      predHomeTeamId: 'Germany', predAwayTeamId: 'Paraguay', predHomeScore: 2, predAwayScore: 1, predictedWinnerId: 'Germany',
    },
    expected: 0,
  },
  {
    name: 'B4 no matchup, prog AND score → capped at 2',
    input: {
      actualHomeTeamId: 'Canada', actualAwayTeamId: 'Paraguay', actualHomeScore: 2, actualAwayScore: 1, winnerTeamId: 'Canada',
      predHomeTeamId: 'Canada', predAwayTeamId: 'Germany', predHomeScore: 2, predAwayScore: 1, predictedWinnerId: 'Canada',
    },
    expected: 2,
  },
];

let failures = 0;
console.log('Playoff scoring verification (matchup / score / progressor → points)\n');
for (const c of cases) {
  const r = evaluatePlayoffPrediction(c.input);
  const ok = r.points === c.expected;
  if (!ok) failures++;
  console.log(
    `  ${ok ? '✓' : '✗'} ${c.name.padEnd(46)} ` +
    `matchup=${r.matchup} score=${r.score} prog=${r.progressor} → ${r.points} (expected ${c.expected})`,
  );
}
console.log(`\n${failures === 0 ? '✅ ALL CASES PASSED' : `❌ ${failures} CASE(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
