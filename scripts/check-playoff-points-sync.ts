/*
 * Drift guard: assert the calculate_playoff_points SQL RPC's round values and
 * exact-score bonus match the TS single source of truth (scoring-constants.ts).
 * No DB needed — it parses the migration text. Fails (exit 1) on any mismatch so
 * a future point-value change on one side can't silently ship.
 *   node --experimental-strip-types scripts/check-playoff-points-sync.ts
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PLAYOFF_ROUND_POINTS, PLAYOFF_EXACT_BONUS } from '../lib/playoffs/scoring-constants.ts';

// The current authoritative RPC definition (the +2 bonus version).
const MIGRATION = 'migrations/20260616_playoff_score_bonus.sql';
const sql = fs.readFileSync(path.join(process.cwd(), MIGRATION), 'utf-8');

const problems: string[] = [];

// Parse "WHEN 'R32' THEN 1" pairs from the round CASE.
const sqlRounds: Record<string, number> = {};
for (const m of sql.matchAll(/WHEN\s+'([A-Z0-9]+)'\s+THEN\s+(\d+)/g)) {
  sqlRounds[m[1]] = Number(m[2]);
}

// Parse the exact-score bonus: "v_points := v_points + 2;"
const bonusMatch = sql.match(/v_points\s*:=\s*v_points\s*\+\s*(\d+)\s*;/);
const sqlBonus = bonusMatch ? Number(bonusMatch[1]) : NaN;

// Compare round values both directions.
for (const [round, pts] of Object.entries(PLAYOFF_ROUND_POINTS)) {
  if (sqlRounds[round] === undefined) problems.push(`RPC is missing round ${round} (TS has ${pts})`);
  else if (sqlRounds[round] !== pts) problems.push(`round ${round}: TS=${pts} but RPC=${sqlRounds[round]}`);
}
for (const round of Object.keys(sqlRounds)) {
  if (PLAYOFF_ROUND_POINTS[round] === undefined) problems.push(`RPC has extra round ${round}=${sqlRounds[round]} not in TS`);
}
if (sqlBonus !== PLAYOFF_EXACT_BONUS) problems.push(`exact bonus: TS=${PLAYOFF_EXACT_BONUS} but RPC=${Number.isNaN(sqlBonus) ? 'not found' : sqlBonus}`);

if (problems.length) {
  console.error('❌ playoff point values DRIFTED between TS and the SQL RPC:');
  for (const p of problems) console.error('   • ' + p);
  console.error(`\nUpdate either lib/playoffs/scoring-constants.ts or ${MIGRATION} so they match.`);
  process.exit(1);
}

console.log('✅ playoff point values in sync (TS scoring-constants ↔ RPC):',
  JSON.stringify(PLAYOFF_ROUND_POINTS), `exactBonus=${PLAYOFF_EXACT_BONUS}`);
