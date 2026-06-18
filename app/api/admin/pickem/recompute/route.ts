import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { getActiveCompetition, getLeaderboard } from '@/lib/pickem-store';
import { recomputePickemPoints } from '@/lib/pickem-scoring';

export const dynamic = 'force-dynamic';

/*
 * Admin: regenerate the points ledger from current source data (group results +
 * finished match results + predictions + R32 confirmation). Points are fully
 * derived, so this restores them deterministically as long as the source data is
 * present. Returns participant + points totals so the admin can confirm.
 */
export async function POST() {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;

  const comp = await getActiveCompetition();
  if (!comp) return NextResponse.json({ error: 'No active competition' }, { status: 404 });

  try {
    await recomputePickemPoints(comp.id);
  } catch (e) {
    console.error('[admin/pickem/recompute] failed', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Recompute failed' }, { status: 500 });
  }

  const leaderboard = await getLeaderboard(comp.id);
  const withPoints = leaderboard.filter(r => r.points > 0).length;
  const totalPoints = leaderboard.reduce((s, r) => s + r.points, 0);

  return NextResponse.json({
    ok: true,
    participants: leaderboard.length,
    usersWithPoints: withPoints,
    totalPoints,
  });
}
