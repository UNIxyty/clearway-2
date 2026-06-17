/*
 * Verification harness for Stage 7 final standings (run, don't trust).
 * Exercises the REAL pure core (computeFinalStandingsFromData) + the REAL
 * template (finalStandings.html) against a synthetic full-tournament dataset.
 *   node --experimental-strip-types scripts/verify-final-standings.ts
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import Handlebars from 'handlebars';
import {
  computeFinalStandingsFromData, rankCardStyle,
  type LedgerUser, type CorePlayoffPred, type CorePlayoffMatch,
} from '../server/emails/finalStandingsCore.ts';

// ── Build a real-shaped 32-match bracket; every match home wins 2–1, locked. ──
const ROUNDS: Array<[string, number]> = [['R32', 16], ['R16', 8], ['QF', 4], ['SF', 2], ['FINAL', 1], ['THIRD', 1]];
const matches: CorePlayoffMatch[] = [];
for (const [round, n] of ROUNDS) {
  for (let i = 0; i < n; i++) {
    matches.push({ id: `${round}_${i}`, round, home_score: 2, away_score: 1, winner_team_id: `HOME_${round}_${i}`, is_locked: true });
  }
}
const HOME = (m: CorePlayoffMatch) => m.winner_team_id!;
const AWAY = (m: CorePlayoffMatch) => `AWAY_${m.id}`;

// A user's playoff predictions: first `exactN` matches exact (2–1, winner right),
// next up to `correctN` winner-right-not-exact (3–1), rest wrong (0–1, away).
function buildPreds(userId: string, correctN: number, exactN: number): CorePlayoffPred[] {
  return matches.map((m, idx): CorePlayoffPred => {
    if (idx < exactN) return { user_id: userId, match_id: m.id, predicted_winner_id: HOME(m), predicted_home_score: 2, predicted_away_score: 1 };
    if (idx < correctN) return { user_id: userId, match_id: m.id, predicted_winner_id: HOME(m), predicted_home_score: 3, predicted_away_score: 1 };
    return { user_id: userId, match_id: m.id, predicted_winner_id: AWAY(m), predicted_home_score: 0, predicted_away_score: 1 };
  });
}

// 8 users with varied accuracy + a dedicated bestRound stress user.
const profiles: Array<{ id: string; ledger: number; r32proj: number; correctN: number; exactN: number }> = [
  { id: 'champ',  ledger: 90, r32proj: 14, correctN: 30, exactN: 10 },
  { id: 'strong', ledger: 70, r32proj: 12, correctN: 26, exactN: 6 },
  { id: 'midA',   ledger: 55, r32proj: 8,  correctN: 18, exactN: 3 },
  { id: 'midB',   ledger: 50, r32proj: 8,  correctN: 16, exactN: 3 },
  { id: 'avgish', ledger: 48, r32proj: 7,  correctN: 17, exactN: 3 },
  { id: 'weak',   ledger: 30, r32proj: 4,  correctN: 12, exactN: 2 },
  { id: 'poor',   ledger: 18, r32proj: 2,  correctN: 8,  exactN: 1 },
  { id: 'last',   ledger: 8,  r32proj: 0,  correctN: 3,  exactN: 0 },
];

const ledger: LedgerUser[] = profiles.map(p => ({ userId: p.id, points: p.ledger, r32Points: p.r32proj }));
let preds: CorePlayoffPred[] = profiles.flatMap(p => buildPreds(p.id, p.correctN, p.exactN));

// ── bestRound stress user: FINAL correct (raw 10) but only ~83% of its ceiling;
//    R32 14/16 winners (raw 14, but 29% of ceiling) → bestRound must be Final. ──
const stressId = 'pct_stress';
ledger.push({ userId: stressId, points: 40, r32Points: 5 });
preds = preds.concat(matches.map((m, idx): CorePlayoffPred => {
  if (m.round === 'FINAL') return { user_id: stressId, match_id: m.id, predicted_winner_id: HOME(m), predicted_home_score: 3, predicted_away_score: 0 }; // winner right, not exact
  if (m.round === 'R32' && idx < 14) return { user_id: stressId, match_id: m.id, predicted_winner_id: HOME(m), predicted_home_score: 3, predicted_away_score: 0 }; // 14 winner-right
  return { user_id: stressId, match_id: m.id, predicted_winner_id: AWAY(m), predicted_home_score: 0, predicted_away_score: 1 };
}));

// ── Run the REAL core ──
const result = computeFinalStandingsFromData(ledger, preds, matches);

// ── Independent hand-calc (deliberately separate summation) ──
const ROUND_VAL: Record<string, number> = { R32: 1, R16: 2, QF: 5, SF: 8, FINAL: 10, THIRD: 3 };
const matchById = new Map(matches.map(m => [m.id, m]));
function handCalc(userId: string, ledgerTotal: number): number {
  let playoff = 0;
  for (const p of preds.filter(x => x.user_id === userId)) {
    const m = matchById.get(p.match_id)!;
    if (p.predicted_winner_id === m.winner_team_id) playoff += ROUND_VAL[m.round];
    if (p.predicted_home_score === m.home_score && p.predicted_away_score === m.away_score) playoff += 2;
  }
  return ledgerTotal + playoff;
}

let failures = 0;
const check = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { failures++; console.log(`  ✗ ${label}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); }
  else console.log(`  ✓ ${label}: ${JSON.stringify(got)}`);
};

console.log('\n=== #2 totalPoints: core vs independent hand-calc (3 spanning users) ===');
for (const id of ['champ', 'avgish', 'last']) {
  const u = result.perUser.get(id)!;
  const led = ledger.find(l => l.userId === id)!.points;
  console.log(`\n${id} — rank #${result.rankByUser.get(id)}  total=${u.totalPoints}`);
  console.log(`   breakdown: group=${u.groupStagePoints} r32proj=${u.r32ProjectionPoints} R32=${u.r32Points} R16=${u.r16Points} QF=${u.qfPoints} SF=${u.sfPoints} Final&3rd=${u.finalPoints} exactBonus=${u.exactScoreBonusPoints} (exactCount=${u.exactScoreCount}, correct=${u.correctPicksCount}/${u.totalPicksCount}) bestRound=${u.bestRound}`);
  check(`${id} total == hand-calc`, u.totalPoints, handCalc(id, led));
  // breakdown must sum to total
  const sum = u.groupStagePoints + u.r32ProjectionPoints + u.r32Points + u.r16Points + u.qfPoints + u.sfPoints + u.finalPoints + u.exactScoreBonusPoints;
  check(`${id} breakdown sums to total`, sum, u.totalPoints);
}

console.log('\n=== #3 rank ordering + deterministic tiebreaker ===');
const ranked = [...result.perUser.entries()].sort((a, b) => result.rankByUser.get(a[0])! - result.rankByUser.get(b[0])!);
console.log('  rank  user        total  exact  correct');
for (const [uid, u] of ranked) {
  console.log(`  #${String(result.rankByUser.get(uid)).padEnd(3)} ${uid.padEnd(11)} ${String(u.totalPoints).padStart(4)}   ${String(u.exactScoreCount).padStart(3)}    ${u.correctPicksCount}`);
}
// monotonic: higher rank => >= total, and ranks are distinct 1..N
const ranks = [...result.rankByUser.values()].sort((a, b) => a - b);
check('ranks are distinct 1..N', ranks, Array.from({ length: result.totalUsers }, (_, i) => i + 1));
let mono = true;
for (let i = 1; i < ranked.length; i++) if (ranked[i - 1][1].totalPoints < ranked[i][1].totalPoints) mono = false;
check('rank order is monotonic by total', mono, true);
console.log(`  totalUsers=${result.totalUsers}  avgPoints=${result.avgPoints}`);

console.log('\n=== #5 bestRound ceiling-aware stress (raw R32 > raw Final, but Final % higher) ===');
const s = result.perUser.get(stressId)!;
console.log(`  ${stressId}: R32 base=${s.r32Points}  Final&3rd base=${s.finalPoints}  bestRound=${s.bestRound}`);
check('stress bestRound == Final (despite fewer raw Final pts)', s.bestRound, 'Final');

console.log('\n=== #4 render real template, confirm "Final & Third Place" + single card ===');
const tpl = fs.readFileSync(path.join(process.cwd(), 'server/emails/templates/finalStandings.html'), 'utf-8');
const render = Handlebars.compile(tpl);
const champ = result.perUser.get('champ')!;
const rank = result.rankByUser.get('champ')!;
const card = rankCardStyle(rank);
const html = render({
  firstName: 'Alex', finalRank: rank, totalUsers: result.totalUsers, totalPoints: champ.totalPoints,
  groupStagePoints: champ.groupStagePoints, r32ProjectionPoints: champ.r32ProjectionPoints,
  r32Points: champ.r32Points, r16Points: champ.r16Points, qfPoints: champ.qfPoints, sfPoints: champ.sfPoints,
  finalPoints: champ.finalPoints, exactScoreBonusPoints: champ.exactScoreBonusPoints, bestRound: champ.bestRound,
  correctPicksCount: champ.correctPicksCount, totalPicksCount: champ.totalPicksCount, exactScoreCount: champ.exactScoreCount,
  avgPoints: result.avgPoints, pointsAboveAverage: Math.abs(champ.totalPoints - result.avgPoints),
  aboveOrBelowText: 'above', deltaColor: '#16a34a',
  rankCardBg: card.bg, rankCardBorder: card.border, rankMedal: card.medal, rankNumColor: card.numColor,
  leaderboardUrl: '#', unsubscribeLink: '#', wc2026LogoUrl: '#', clearwayLogoUrl: '#', verxylLogoUrl: '#',
});
check('rendered HTML contains "Final & Third Place"', html.includes('Final &amp; Third Place'), true);
check('rendered HTML shows gold card bg (#1) only, no silver/bronze/blue rank-card border', html.includes('border: 2px solid #FFD700') && !html.includes('border: 2px solid #C0C0C0') && !html.includes('border: 2px solid #CD7F32') && !html.includes('border: 2px solid #1a56db'), true);
check('rendered HTML shows gold medal', html.includes('🥇'), true);

console.log(`\n${failures === 0 ? '✅ ALL CHECKS PASSED' : `❌ ${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
