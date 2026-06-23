import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { getActiveCompetition, getTournamentState, getLeaderboard, listGroupResults } from '@/lib/pickem-store';

export const dynamic = 'force-dynamic';

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'A';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/*
 * Consolidated admin console data (profile + tournament state + stats + R32 slot
 * count) in one service-role call behind requireAdmin — same pattern as the
 * other admin endpoints. Field names are camelCased to the admin.ts contracts.
 */
export async function GET() {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;

  const comp = await getActiveCompetition();
  const supabase = createSupabaseAdminClient();

  // Profile (display name → initials).
  const { data: pref } = await supabase
    .from('user_preferences').select('display_name').eq('user_id', auth.user.id).maybeSingle();
  const name = String(
    (pref?.display_name as string) || auth.user.user_metadata?.display_name || auth.user.user_metadata?.name || '',
  ).trim() || (auth.user.email ?? 'Admin').split('@')[0];

  if (!comp) {
    return NextResponse.json({
      profile: { name, initials: initialsOf(name) },
      state: { groupStageComplete: false, r32ConfirmedAt: null, playoffsOpenedAt: null, playoffsDeadlineAt: null, finalEmailSentAt: null },
      stats: { participants: 0, groupMatchesPredicted: 0, playoffPredictionsMade: 0, emailsSent: 0, emailOptOuts: 0 },
      assignedSlots: 0,
    });
  }

  const [ts, groupResults, leaderboard, groupPreds, playoffPreds, emailsSent, optOuts, r32Rows] = await Promise.all([
    getTournamentState(comp.id),
    listGroupResults(comp.id),
    getLeaderboard(comp.id),
    supabase.from('pickem_user_match_predictions').select('id', { count: 'exact', head: true }).eq('competition_id', comp.id),
    supabase.from('playoff_predictions').select('id', { count: 'exact', head: true }).not('predicted_winner_id', 'is', null),
    supabase.from('email_logs').select('id', { count: 'exact', head: true }).eq('status', 'sent'),
    supabase.from('user_preferences').select('id', { count: 'exact', head: true }).eq('email_opt_out', true),
    supabase.from('playoff_matches').select('home_team_id, away_team_id').eq('round', 'R32'),
  ]);

  const assignedSlots = (r32Rows.data ?? []).filter(r => r.home_team_id && r.away_team_id).length;

  return NextResponse.json({
    profile: { name, initials: initialsOf(name) },
    state: {
      groupStageComplete: groupResults.length > 0,
      r32ConfirmedAt: ts.r32ConfirmedAt,
      playoffsOpenedAt: ts.playoffsOpenedAt,
      playoffsDeadlineAt: ts.playoffsPredictionDeadline,
      finalEmailSentAt: ts.finalEmailSentAt,
    },
    stats: {
      participants: leaderboard.length,
      groupMatchesPredicted: groupPreds.count ?? 0,
      playoffPredictionsMade: playoffPreds.count ?? 0,
      emailsSent: emailsSent.count ?? 0,
      emailOptOuts: optOuts.count ?? 0,
    },
    assignedSlots,
  });
}
