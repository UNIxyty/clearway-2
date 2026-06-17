import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { MATCHES } from '@/lib/playoffs/bracketData';
import type { SupabaseClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

/*
 * Admin write for entering a playoff result (Results page).
 *
 * Uses the service-role client after requireAdmin so the score/winner/lock
 * writes are not silently dropped by the playoff_matches RLS policy (which only
 * recognizes user_preferences.is_admin). When publish=true it also runs the
 * points RPC and advances the winner (and bronze-match loser) into the next
 * round's slots so the following round becomes scoreable.
 */

// Propagate the winner (or loser, for the bronze match) into downstream slots.
async function advanceWinner(
  supabase: SupabaseClient,
  code: string,
  winnerId: string | null,
  homeTeamId: string | null,
  awayTeamId: string | null,
) {
  if (!winnerId) return;
  const loserId = winnerId === homeTeamId ? awayTeamId : homeTeamId;

  const downstream = Object.values(MATCHES).filter(d => d.feeders?.includes(code));
  if (downstream.length === 0) return;

  const { data: downRows } = await supabase
    .from('playoff_matches')
    .select('id, match_code')
    .in('match_code', downstream.map(d => d.id));
  const idByCode = new Map((downRows ?? []).map(r => [r.match_code as string, r.id as string]));

  for (const def of downstream) {
    const slotIndex = def.feeders!.indexOf(code); // 0 → home, 1 → away
    const teamForSlot = def.losers ? loserId : winnerId;
    if (!teamForSlot) continue;
    const downId = idByCode.get(def.id);
    if (!downId) continue;
    const field = slotIndex === 0 ? 'home_team_id' : 'away_team_id';
    const { error } = await supabase
      .from('playoff_matches')
      .update({ [field]: teamForSlot })
      .eq('id', downId);
    if (error) {
      console.error('[publish-result] advance failed', { from: code, to: def.id, field, error: error.message });
    }
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;

  const body = await req.json().catch(() => ({}));
  const matchCode = String(body.matchCode ?? '');
  if (!MATCHES[matchCode]) {
    return NextResponse.json({ error: `Unknown match code: ${matchCode}` }, { status: 400 });
  }
  const homeScore = body.homeScore === null || body.homeScore === undefined ? null : Number(body.homeScore);
  const awayScore = body.awayScore === null || body.awayScore === undefined ? null : Number(body.awayScore);
  const winnerTeamId = (body.winnerTeamId as string) || null;
  const publish = Boolean(body.publish);

  const supabase = createSupabaseAdminClient();

  const { data: matchRow, error: fetchErr } = await supabase
    .from('playoff_matches')
    .select('id, home_team_id, away_team_id')
    .eq('match_code', matchCode)
    .single();
  if (fetchErr || !matchRow) {
    return NextResponse.json({ error: 'Match not found' }, { status: 404 });
  }

  const update: Record<string, unknown> = {
    home_score: homeScore,
    away_score: awayScore,
    winner_team_id: winnerTeamId,
  };
  if (publish) update.is_locked = true;

  const { error: updErr } = await supabase
    .from('playoff_matches')
    .update(update)
    .eq('id', matchRow.id);
  if (updErr) {
    console.error('[publish-result] update failed', { matchCode, error: updErr.message });
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  let scoredCount = 0;
  if (publish) {
    const { error: rpcErr } = await supabase.rpc('calculate_playoff_points', { p_match_id: matchRow.id });
    if (rpcErr) {
      console.error('[publish-result] RPC failed', { matchCode, error: rpcErr.message });
      return NextResponse.json({ error: rpcErr.message }, { status: 500 });
    }
    const { count } = await supabase
      .from('playoff_predictions')
      .select('id', { count: 'exact', head: true })
      .eq('match_id', matchRow.id);
    scoredCount = count ?? 0;

    await advanceWinner(
      supabase, matchCode, winnerTeamId,
      matchRow.home_team_id as string | null,
      matchRow.away_team_id as string | null,
    );
  }

  return NextResponse.json({ ok: true, scoredCount });
}
