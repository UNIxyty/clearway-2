import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@/lib/admin-auth';
import { createSupabaseServiceRoleClient } from '@/lib/supabase-admin';
import { getActiveCompetition, getTournamentState, listTeams } from '@/lib/pickem-store';

export const dynamic = 'force-dynamic';

function service() {
  const s = createSupabaseServiceRoleClient();
  if (!s) throw new Error('Service role client unavailable');
  return s;
}

/*
 * World Champion prediction for the current user.
 * GET  → teams, the user's pick, lock state, and (once played) the real champion.
 * POST → upsert the user's pick (rejected when locked).
 */
export async function GET() {
  const auth = await requireAuthenticatedUser();
  if ('error' in auth) return auth.error;
  const comp = await getActiveCompetition();
  if (!comp) return NextResponse.json({ error: 'Competition not configured.' }, { status: 404 });

  const supabase = service();
  const [teams, state, finalRes, predRes] = await Promise.all([
    listTeams(comp.id),
    getTournamentState(comp.id),
    supabase.from('playoff_matches').select('winner_team_id, is_locked').eq('round', 'FINAL').limit(1).maybeSingle(),
    supabase.from('pickem_champion_predictions')
      .select('predicted_team_id, points_awarded')
      .eq('competition_id', comp.id).eq('user_id', auth.user.id).maybeSingle(),
  ]);

  const finalLocked = Boolean(finalRes.data?.is_locked);
  const championTeamId = (finalRes.data?.winner_team_id as string | null) ?? null;
  const deadline = state.playoffsPredictionDeadline;
  const pastDeadline = deadline ? Date.now() >= new Date(deadline).getTime() : false;

  return NextResponse.json({
    competitionId: comp.id,
    teams: teams.map(t => ({ id: t.id, name: t.name, shortName: t.shortName })),
    prediction: predRes.data
      ? {
          predictedTeamId: (predRes.data.predicted_team_id as string | null) ?? null,
          pointsAwarded: Number(predRes.data.points_awarded ?? 0),
        }
      : null,
    deadline,
    isLocked: finalLocked || pastDeadline,
    finalPlayed: championTeamId !== null,
    championTeamId,
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedUser();
  if ('error' in auth) return auth.error;
  const comp = await getActiveCompetition();
  if (!comp) return NextResponse.json({ error: 'Competition not configured.' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const teamId = String(body.teamId ?? '').trim();
  if (!teamId) return NextResponse.json({ error: 'teamId is required.' }, { status: 400 });

  const supabase = service();

  // Re-check the lock server-side so a stale client can't write past it.
  const [state, finalRes] = await Promise.all([
    getTournamentState(comp.id),
    supabase.from('playoff_matches').select('is_locked').eq('round', 'FINAL').limit(1).maybeSingle(),
  ]);
  const pastDeadline = state.playoffsPredictionDeadline
    ? Date.now() >= new Date(state.playoffsPredictionDeadline).getTime() : false;
  if (Boolean(finalRes.data?.is_locked) || pastDeadline) {
    return NextResponse.json({ error: 'Champion pick is locked.' }, { status: 403 });
  }

  const now = new Date().toISOString();
  const { error } = await supabase.from('pickem_champion_predictions').upsert(
    {
      user_id: auth.user.id,
      competition_id: comp.id,
      predicted_team_id: teamId,
      updated_at: now,
    },
    { onConflict: 'user_id,competition_id' },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
