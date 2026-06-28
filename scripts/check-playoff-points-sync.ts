/*
 * Drift guard: assert the playoff + champion SQL RPCs use the SAME point values
 * as the TS single source of truth (scoring-constants.ts). No DB needed — it
 * parses `SCORING:<path>=<n>` marker comments in the migrations and fails (exit 1)
 * on any mismatch so a future point-value change on one side can't silently ship.
 *   node --experimental-strip-types scripts/check-playoff-points-sync.ts
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { SCORING } from '../lib/playoffs/scoring-constants.ts';

// Migrations carrying the authoritative SQL point values (with SCORING: markers).
const MIGRATIONS = [
  'migrations/20260629_new_playoff_scoring.sql',
  'migrations/20260629_champion_predictions.sql',
];

// Flatten the TS SCORING object into dot-paths → value.
function flatten(obj: Record<string, unknown>, prefix = ''): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'number') out[key] = v;
    else if (v && typeof v === 'object') Object.assign(out, flatten(v as Record<string, unknown>, key));
  }
  return out;
}
const tsValues = flatten(SCORING as unknown as Record<string, unknown>);

// Parse every `SCORING:PATH=N` marker across the migrations.
const sqlValues: Record<string, number> = {};
for (const file of MIGRATIONS) {
  const sql = fs.readFileSync(path.join(process.cwd(), file), 'utf-8');
  for (const m of sql.matchAll(/SCORING:([A-Z0-9_.]+)\s*=\s*(\d+)/g)) {
    sqlValues[m[1]] = Number(m[2]);
  }
}

const problems: string[] = [];
for (const [key, val] of Object.entries(tsValues)) {
  if (sqlValues[key] === undefined) problems.push(`SQL is missing marker SCORING:${key} (TS has ${val})`);
  else if (sqlValues[key] !== val) problems.push(`${key}: TS=${val} but SQL=${sqlValues[key]}`);
}
for (const key of Object.keys(sqlValues)) {
  if (tsValues[key] === undefined) problems.push(`SQL has extra marker SCORING:${key}=${sqlValues[key]} not in TS`);
}

if (problems.length) {
  console.error('❌ scoring values DRIFTED between TS (scoring-constants.ts) and the SQL RPCs:');
  for (const p of problems) console.error('   • ' + p);
  console.error('\nUpdate either lib/playoffs/scoring-constants.ts or the migration SCORING: markers so they match.');
  process.exit(1);
}

console.log('✅ scoring values in sync (TS SCORING ↔ SQL markers):', JSON.stringify(tsValues));
