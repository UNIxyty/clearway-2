import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { getActiveCompetition, getTournamentState, markR32Confirmed } from '@/lib/pickem-store';
import { recomputePickemPoints } from '@/lib/pickem-scoring';
import { sendGroupStageCompleteBlast } from '@/server/emails/triggers/sendGroupStageCompleteEmail';

export const dynamic = 'force-dynamic';

/*
 * Stage 4 — "Confirm R32 Bracket" batch action (admin, runs once).
 * 1. Guard on tournament_state.r32_confirmed_at so the batch only fires once.
 * 2. Mark confirmed (lifecycle marker used elsewhere).
 * 3. Recompute the points ledger for ALL users (group placement + match points),
 *    idempotent full-replace.
 * 4. Send the Group Stage Complete email to every user (group points pulled from
 *    the same score-derived model as the leaderboard).
 *
 * Pass { force: true } to re-run after the first confirmation (e.g. admin fixed a
 * mistyped R32 pair) — re-scoring is idempotent; the email is re-sent.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;

  const comp = await getActiveCompetition();
  if (!comp) return NextResponse.json({ error: 'No active competition' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const force = Boolean(body.force);
  // Email audience control (scoring always runs; only the blast is gated):
  //   recipients omitted/null     -> email EVERYONE (go live, default)
  //   recipients = ['a@x','b@y']  -> email ONLY those addresses (test/admins)
  //   recipients = [] or scoreOnly-> score only, send NO email
  const recipients: string[] | null = Array.isArray(body.recipients)
    ? body.recipients.map((r: unknown) => String(r).trim()).filter(Boolean)
    : null;
  const scoreOnly = body.scoreOnly === true || (Array.isArray(recipients) && recipients.length === 0);

  const state = await getTournamentState(comp.id);
  if (state.r32ConfirmedAt && !force) {
    return NextResponse.json({
      ok: false,
      alreadyConfirmed: true,
      confirmedAt: state.r32ConfirmedAt,
      message: 'R32 bracket was already confirmed. Pass force=true to re-run.',
    });
  }

  const supabase = createSupabaseAdminClient();

  // Real R32 pairs must be fully entered before confirming.
  const { data: r32Rows } = await supabase
    .from('playoff_matches')
    .select('match_code, match_number, home_team_id, away_team_id, kickoff_at')
    .eq('round', 'R32')
    .order('match_number');

  const filled = (r32Rows ?? []).filter(r => r.home_team_id && r.away_team_id);
  if (filled.length < 16) {
    return NextResponse.json({
      error: `Only ${filled.length}/16 R32 matchups have both teams set. Finish Bracket Setup first.`,
    }, { status: 400 });
  }

  const r32Deadline = filled[0]?.kickoff_at
    ? new Date(filled[0].kickoff_at as string).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Riga' })
    : '';

  // 2 + 3: mark confirmed (lifecycle marker), then recompute the group/match
  // ledger (no longer includes any R32 projection scoring — that feature is gone).
  try {
    await markR32Confirmed(comp.id);
    console.log('[confirm-r32] marked confirmed', { competitionId: comp.id, force });
    await recomputePickemPoints(comp.id);
    console.log('[confirm-r32] recompute complete', { competitionId: comp.id });
  } catch (e) {
    console.error('[confirm-r32] scoring failed', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Scoring failed' }, { status: 500 });
  }

  // 4: fire-and-forget the Group Stage Complete blast (unless score-only).
  const base = (process.env.APP_BASE_URL ?? 'https://clearway.verxyl.com').replace(/\/+$/, '');
  if (!scoreOnly) {
    console.log('[confirm-r32] dispatching group-stage email', {
      mode: recipients ? 'test' : 'all',
      recipients: recipients?.length ?? null,
    });
    sendGroupStageCompleteBlast({
      competitionId: comp.id,
      r32Deadline,
      r32PredictionsUrl: `${base}/playoffs/bracket`,
      leaderboardUrl: `${base}/pickem`,
      onlyEmails: recipients ?? undefined,
    });
  } else {
    console.log('[confirm-r32] score-only — no email dispatched', { competitionId: comp.id });
  }

  const emailMode = scoreOnly ? 'none' : recipients ? 'test' : 'all';
  return NextResponse.json({
    ok: true,
    scored: true,
    reRun: force && !!state.r32ConfirmedAt,
    emailMode,
    emailRecipients: recipients ?? null,
  });
}
