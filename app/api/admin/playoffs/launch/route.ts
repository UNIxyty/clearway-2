import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { getActiveCompetition, openPlayoffs, getTournamentState } from '@/lib/pickem-store';

export const dynamic = 'force-dynamic';

/*
 * Admin: open playoffs to regular users (or push the deadline later).
 * Sets playoffs_opened_at + playoffs_opened_by on first open; subsequent calls
 * only update playoffs_prediction_deadline. There is no "close" action.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;

  const comp = await getActiveCompetition();
  if (!comp) return NextResponse.json({ error: 'No active competition' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const deadline = String(body.deadline ?? '').trim();
  const parsed = deadline ? new Date(deadline) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) {
    return NextResponse.json({ error: 'A valid prediction deadline is required.' }, { status: 400 });
  }

  try {
    await openPlayoffs({ competitionId: comp.id, deadline: parsed.toISOString(), adminUserId: auth.user.id });
  } catch (e) {
    console.error('[admin/playoffs/launch] failed', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to open playoffs' }, { status: 500 });
  }

  const state = await getTournamentState(comp.id);
  return NextResponse.json({
    ok: true,
    openedAt: state.playoffsOpenedAt,
    deadline: state.playoffsPredictionDeadline,
  });
}
