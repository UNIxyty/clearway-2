import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { getActiveCompetition, listGroups, listTeams } from '@/lib/pickem-store';
import { previewGroupPositionPoints } from '@/lib/pickem-scoring';

export const dynamic = 'force-dynamic';

/*
 * Dry-run preview for the group-standings editor: how many group-position points
 * would be awarded if a group finished in `orderTeamIds` order. Writes nothing —
 * the admin still has to Publish Standings to commit.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;

  const comp = await getActiveCompetition();
  if (!comp) return NextResponse.json({ error: 'No active competition' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const groupCode = String(body.groupCode ?? '').trim().toUpperCase();
  const orderTeamIds = Array.isArray(body.orderTeamIds) ? body.orderTeamIds.map((x: unknown) => String(x)) : [];
  if (!groupCode || orderTeamIds.length !== 4) {
    return NextResponse.json({ error: 'groupCode and 4 orderTeamIds are required.' }, { status: 400 });
  }

  // Validate the order is a permutation of this group's 4 teams.
  const [groups, teams] = await Promise.all([listGroups(comp.id), listTeams(comp.id)]);
  if (!groups.some(g => g.code === groupCode)) {
    return NextResponse.json({ error: 'Group not found.' }, { status: 404 });
  }
  const allowed = new Set(teams.filter(t => t.groupCode === groupCode).map(t => t.id));
  if (allowed.size !== 4 || new Set(orderTeamIds).size !== 4 || orderTeamIds.some((id: string) => !allowed.has(id))) {
    return NextResponse.json({ error: 'orderTeamIds must be a valid permutation for the group.' }, { status: 400 });
  }

  try {
    const result = await previewGroupPositionPoints(comp.id, groupCode, orderTeamIds);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error('[groups/preview] failed', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Preview failed' }, { status: 500 });
  }
}
