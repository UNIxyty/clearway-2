import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { MATCHES, OFFICIAL_MATCH_NUMBER } from '@/lib/playoffs/bracketData';

export const dynamic = 'force-dynamic';

/*
 * Admin write for a single playoff match's team assignment (Bracket Setup).
 *
 * Goes through the service-role client after requireAdmin so the write is not
 * subject to the playoff_matches RLS policy, which only recognizes admins via
 * user_preferences.is_admin and would silently drop writes from admins granted
 * via ADMIN_EMAILS / auth metadata.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;

  const body = await req.json().catch(() => ({}));
  const matchCode = String(body.matchCode ?? '');
  const def = MATCHES[matchCode];
  if (!def) return NextResponse.json({ error: `Unknown match code: ${matchCode}` }, { status: 400 });

  const homeTeamId = (body.homeTeamId as string) || null;
  const awayTeamId = (body.awayTeamId as string) || null;
  const isLocked = Boolean(body.isLocked);

  const supabase = createSupabaseAdminClient();

  // The 32 rows are seeded; update by match_code, preserving match_number / round /
  // kickoff / venue. Fall back to insert only if the row is somehow missing.
  const { data: updated, error: updErr } = await supabase
    .from('playoff_matches')
    .update({ home_team_id: homeTeamId, away_team_id: awayTeamId, is_locked: isLocked })
    .eq('match_code', matchCode)
    .select('id');

  if (updErr) {
    console.error('[set-match] update failed', { matchCode, error: updErr.message });
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  if (updated && updated.length > 0) {
    return NextResponse.json({ ok: true, id: updated[0].id });
  }

  // Row didn't exist — insert it with the official FIFA match number.
  const matchNumber = OFFICIAL_MATCH_NUMBER[matchCode] ?? (parseInt(matchCode.replace(/\D/g, ''), 10) || 0);
  const { data: inserted, error: insErr } = await supabase
    .from('playoff_matches')
    .insert({
      match_code: matchCode,
      match_number: matchNumber,
      round: def.round,
      home_team_id: homeTeamId,
      away_team_id: awayTeamId,
      is_locked: isLocked,
    })
    .select('id')
    .single();

  if (insErr) {
    console.error('[set-match] insert failed', { matchCode, error: insErr.message });
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: inserted?.id });
}
