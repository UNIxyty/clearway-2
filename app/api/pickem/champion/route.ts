import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@/lib/admin-auth';
import { createSupabaseServiceRoleClient } from '@/lib/supabase-admin';
import { getActiveCompetition, getTournamentState, getUserPlayoffAccess, listTeams } from '@/lib/pickem-store';

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
  const [teams, state, access, finalRes, predRes, r32Res] = await Promise.all([
    listTeams(comp.id),
    getTournamentState(comp.id),
    getUserPlayoffAccess({ userId: auth.user.id, competitionId: comp.id }),
    supabase.from('playoff_matches').select('winner_team_id, is_locked').eq('round', 'FINAL').limit(1).maybeSingle(),
    supabase.from('pickem_champion_predictions')
      .select('predicted_team_id, points_awarded')
      .eq('competition_id', comp.id).eq('user_id', auth.user.id).maybeSingle(),
    supabase.from('playoff_matches').select('home_team_id, away_team_id').eq('round', 'R32'),
  ]);

  // Only teams that qualified to the playoffs (appear in the R32 bracket) can be
  // picked as champion. If R32 isn't populated yet, fall back to all teams.
  const qualifiedIds = new Set<string>();
  for (const r of (r32Res.data ?? [])) {
    if (r.home_team_id) qualifiedIds.add(r.home_team_id as string);
    if (r.away_team_id) qualifiedIds.add(r.away_team_id as string);
  }
  const pickableTeams = qualifiedIds.size > 0 ? teams.filter(t => qualifiedIds.has(t.id)) : teams;

  const finalLocked = Boolean(finalRes.data?.is_locked);
  const championTeamId = (finalRes.data?.winner_team_id as string | null) ?? null;
  const deadline = state.playoffsPredictionDeadline;
  // A live per-user playoff-access grant keeps the pick editable even past the
  // global deadline — mirrors the playoffs gate (usePlayoffsLaunchState).
  const userAccess = access ? new Date(access.accessUntil).getTime() > Date.now() : false;
  const pastDeadline = deadline ? Date.now() >= new Date(deadline).getTime() : false;

  return NextResponse.json({
    competitionId: comp.id,
    teams: pickableTeams.map(t => ({ id: t.id, name: t.name, shortName: t.shortName })),
    prediction: predRes.data
      ? {
          predictedTeamId: (predRes.data.predicted_team_id as string | null) ?? null,
          pointsAwarded: Number(predRes.data.points_awarded ?? 0),
        }
      : null,
    deadline,
    isLocked: finalLocked || (pastDeadline && !userAccess),
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

  // Re-check the lock server-side so a stale client can't write past it. A live
  // per-user playoff-access grant keeps it editable past the global deadline.
  const [state, access, finalRes] = await Promise.all([
    getTournamentState(comp.id),
    getUserPlayoffAccess({ userId: auth.user.id, competitionId: comp.id }),
    supabase.from('playoff_matches').select('is_locked').eq('round', 'FINAL').limit(1).maybeSingle(),
  ]);
  const userAccess = access ? new Date(access.accessUntil).getTime() > Date.now() : false;
  const pastDeadline = state.playoffsPredictionDeadline
    ? Date.now() >= new Date(state.playoffsPredictionDeadline).getTime() : false;
  if (Boolean(finalRes.data?.is_locked) || (pastDeadline && !userAccess)) {
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
