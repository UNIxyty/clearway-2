import { NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@/lib/admin-auth';
import { getActiveCompetition, getTournamentState } from '@/lib/pickem-store';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

/*
 * Lightweight read of the playoffs launch gate for any authenticated user.
 * (tournament_state is service-role only, so the client can't read it directly.)
 * Playoffs is "open to regular users" iff BOTH openedAt and deadline are set.
 */
export async function GET() {
  const auth = await requireAuthenticatedUser();
  if ('error' in auth) return auth.error;

  const comp = await getActiveCompetition();
  if (!comp) return NextResponse.json({ openedAt: null, deadline: null, openedByName: null });

  const state = await getTournamentState(comp.id);

  let openedByName: string | null = null;
  if (state.playoffsOpenedBy) {
    const supabase = createSupabaseAdminClient();
    const { data } = await supabase
      .from('user_preferences')
      .select('display_name')
      .eq('user_id', state.playoffsOpenedBy)
      .maybeSingle();
    openedByName = (data?.display_name as string) ?? null;
  }

  return NextResponse.json({
    openedAt: state.playoffsOpenedAt,
    deadline: state.playoffsPredictionDeadline,
    openedByName,
  });
}
