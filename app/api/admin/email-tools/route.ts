import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { getActiveCompetition, getTournamentState } from '@/lib/pickem-store';
import { sendEmail } from '@/server/emails/sendEmail';
import { renderMockEmail, EMAIL_META, EMAIL_TYPES, type EmailType } from '@/server/emails/mockData';
import { sendGroupStageCompleteBlast } from '@/server/emails/triggers/sendGroupStageCompleteEmail';
import { sendFinalStandingsBlast } from '@/server/emails/triggers/sendFinalStandingsEmail';
import { playoffsOpenedTemplateExists, renderPlayoffsOpenedMock, sendPlayoffsOpenedBlast } from '@/server/emails/triggers/sendPlayoffsOpenedEmail';
import { getAdminEmails } from '@/server/emails/resolveRecipients';

export const dynamic = 'force-dynamic';

// ── GET: per-type status (last sent, guard timestamps, user count) ──
export async function GET() {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;
  const comp = await getActiveCompetition();
  const supabase = createSupabaseAdminClient();

  const lastSent: Record<string, string | null> = {};
  for (const t of EMAIL_TYPES) {
    const { data } = await supabase
      .from('email_logs')
      .select('sent_at')
      .eq('email_type', t)
      .eq('status', 'sent')
      .order('sent_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    lastSent[t] = (data?.sent_at as string) ?? null;
  }

  const state = comp
    ? await getTournamentState(comp.id)
    : { r32ConfirmedAt: null, finalEmailSentAt: null, playoffsOpenedAt: null };
  const { data: { users } } = await supabase.auth.admin.listUsers({ perPage: 1000 });

  // playoffs_opened isn't in the mock EMAIL_TYPES loop above — query its last send
  // separately so the dedicated card can show "Last sent".
  const { data: poLast } = await supabase
    .from('email_logs')
    .select('sent_at')
    .eq('email_type', 'playoffs_opened')
    .eq('status', 'sent')
    .order('sent_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json({
    lastSent,
    userCount: users.length,
    guards: {
      group_stage_complete: state.r32ConfirmedAt,
      final_standings: state.finalEmailSentAt,
    },
    meta: EMAIL_META,
    // The playoffs_opened template is produced separately via Claude Design; the
    // UI disables its Send Test button until the file exists on disk.
    playoffsOpenedTemplateAvailable: playoffsOpenedTemplateExists(),
    playoffsOpenedLastSent: (poLast?.sent_at as string) ?? null,
    playoffsOpenedAt: state.playoffsOpenedAt ?? null,
  });
}

// ── POST: { action: 'test', emailType, recipient } | { action: 'all', emailType, force } ──
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;

  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? '');

  // Special case: playoffs_opened is not part of the mock EMAIL_TYPES union (its
  // template is designed separately). Handle its test send before that guard.
  if (action === 'test-playoffs-opened') {
    if (!playoffsOpenedTemplateExists()) {
      return NextResponse.json({ error: 'Template not yet designed — use Claude Design to create it first.' }, { status: 400 });
    }
    const recipient = String(body.recipient ?? '').trim();
    if (!recipient || !recipient.includes('@')) {
      return NextResponse.json({ error: 'A valid recipient email is required.' }, { status: 400 });
    }
    const { subject, html } = renderPlayoffsOpenedMock();
    const result = await sendEmail(recipient, subject, html, { emailType: 'playoffs_opened', isTest: true });
    if (!result.success) return NextResponse.json({ error: result.error ?? 'Send failed' }, { status: 500 });
    return NextResponse.json({ ok: true, sentTo: recipient });
  }

  // Batch send the Playoffs Opened email to all non-opted-out users. Manual admin
  // action — separate from the auto-trigger; no one-time guard (the auto-open
  // guard prevents the AUTOMATIC fire, not deliberate re-sends from here).
  if (action === 'all-playoffs-opened') {
    if (!playoffsOpenedTemplateExists()) {
      return NextResponse.json({ error: 'Template not yet designed — use Claude Design to create it first.' }, { status: 400 });
    }
    const comp = await getActiveCompetition();
    if (!comp) return NextResponse.json({ error: 'No active competition' }, { status: 404 });
    const adminOnly = String(body.audience ?? 'all') === 'admins';
    const onlyEmails = adminOnly ? await getAdminEmails() : undefined;
    if (adminOnly && (!onlyEmails || onlyEmails.length === 0)) {
      return NextResponse.json({ error: 'No admin recipients found (set ADMIN_EMAILS or mark users as admin).' }, { status: 400 });
    }
    sendPlayoffsOpenedBlast({ competitionId: comp.id, onlyEmails });
    return NextResponse.json({ ok: true, queued: true, audience: adminOnly ? 'admins' : 'all' });
  }

  const emailType = String(body.emailType ?? '') as EmailType;
  if (!EMAIL_TYPES.includes(emailType)) {
    return NextResponse.json({ error: `Unknown email type: ${emailType}` }, { status: 400 });
  }

  if (action === 'test') {
    const recipient = String(body.recipient ?? '').trim();
    if (!recipient || !recipient.includes('@')) {
      return NextResponse.json({ error: 'A valid recipient email is required.' }, { status: 400 });
    }
    const { subject, html } = renderMockEmail(emailType);
    const result = await sendEmail(recipient, subject, html, { emailType, isTest: true });
    if (!result.success) return NextResponse.json({ error: result.error ?? 'Send failed' }, { status: 500 });
    return NextResponse.json({ ok: true, sentTo: recipient });
  }

  if (action === 'all') {
    const force = Boolean(body.force);
    // audience: 'all' (default) | 'admins' (only admins/devs receive it). An
    // admins-only send is a review step — it never consumes one-time guards.
    const adminOnly = String(body.audience ?? 'all') === 'admins';
    const onlyEmails = adminOnly ? await getAdminEmails() : undefined;
    const comp = await getActiveCompetition();
    if (!comp) return NextResponse.json({ error: 'No active competition' }, { status: 404 });
    const supabase = createSupabaseAdminClient();

    if (!EMAIL_META[emailType].batch) {
      return NextResponse.json({ error: `${EMAIL_META[emailType].label} is a per-user email — use Send Test.` }, { status: 400 });
    }
    if (adminOnly && (!onlyEmails || onlyEmails.length === 0)) {
      return NextResponse.json({ error: 'No admin recipients found (set ADMIN_EMAILS or mark users as admin).' }, { status: 400 });
    }

    if (emailType === 'group_stage_complete') {
      const state = await getTournamentState(comp.id);
      if (!state.r32ConfirmedAt) {
        return NextResponse.json({ error: 'Confirm the R32 bracket first (Bracket Setup → Confirm R32).' }, { status: 400 });
      }
      const base = (process.env.APP_BASE_URL ?? 'https://clearway.verxyl.com').replace(/\/+$/, '');
      sendGroupStageCompleteBlast({ competitionId: comp.id, r32Deadline: '', r32PredictionsUrl: `${base}/playoffs/bracket`, leaderboardUrl: `${base}/pickem`, onlyEmails });
      return NextResponse.json({ ok: true, queued: true, audience: adminOnly ? 'admins' : 'all' });
    }

    if (emailType === 'final_standings') {
      // Admins-only review send: bypass the one-time guard entirely.
      if (adminOnly) {
        await sendFinalStandingsBlast(comp.id, { onlyEmails });
        return NextResponse.json({ ok: true, queued: true, audience: 'admins' });
      }
      const state = await getTournamentState(comp.id);
      if (state.finalEmailSentAt && !force) {
        return NextResponse.json({ error: 'Already sent', alreadySent: state.finalEmailSentAt }, { status: 409 });
      }
      if (force) {
        // Reset the guard so the blast (which claims it again) will re-send.
        const { error } = await supabase.from('tournament_state')
          .upsert({ competition_id: comp.id, final_email_sent_at: null, updated_at: new Date().toISOString() }, { onConflict: 'competition_id' });
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      }
      await sendFinalStandingsBlast(comp.id);
      return NextResponse.json({ ok: true, queued: true, audience: 'all' });
    }
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
