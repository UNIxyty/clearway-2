import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { getActiveCompetition, getTournamentState } from '@/lib/pickem-store';
import { sendEmail } from '@/server/emails/sendEmail';
import { renderMockEmail, EMAIL_META, EMAIL_TYPES, type EmailType } from '@/server/emails/mockData';
import { sendGroupStageCompleteBlast, type R32Matchup } from '@/server/emails/triggers/sendGroupStageCompleteEmail';
import { sendFinalStandingsBlast } from '@/server/emails/triggers/sendFinalStandingsEmail';
import { flagFor } from '@/lib/playoffs/flags';

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

  const state = comp ? await getTournamentState(comp.id) : { r32ConfirmedAt: null, finalEmailSentAt: null };
  const { data: { users } } = await supabase.auth.admin.listUsers({ perPage: 1000 });

  return NextResponse.json({
    lastSent,
    userCount: users.length,
    guards: {
      group_stage_complete: state.r32ConfirmedAt,
      final_standings: state.finalEmailSentAt,
    },
    meta: EMAIL_META,
  });
}

// ── POST: { action: 'test', emailType, recipient } | { action: 'all', emailType, force } ──
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;

  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? '');
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
    const comp = await getActiveCompetition();
    if (!comp) return NextResponse.json({ error: 'No active competition' }, { status: 404 });
    const supabase = createSupabaseAdminClient();

    if (!EMAIL_META[emailType].batch) {
      return NextResponse.json({ error: `${EMAIL_META[emailType].label} is a per-user email — use Send Test.` }, { status: 400 });
    }

    if (emailType === 'group_stage_complete') {
      const state = await getTournamentState(comp.id);
      if (!state.r32ConfirmedAt) {
        return NextResponse.json({ error: 'Confirm the R32 bracket first (Bracket Setup → Confirm R32).' }, { status: 400 });
      }
      // Build matchups from the real R32 pairs.
      const { data: r32Rows } = await supabase
        .from('playoff_matches')
        .select('match_code, match_number, home_team_id, away_team_id, kickoff_at, venue, city')
        .eq('round', 'R32').order('match_number');
      const filled = (r32Rows ?? []).filter(r => r.home_team_id && r.away_team_id);
      const teamIds = [...new Set(filled.flatMap(r => [r.home_team_id, r.away_team_id]).filter(Boolean) as string[])];
      const { data: teamRows } = await supabase.from('pickem_teams').select('id, name, short_name').in('id', teamIds);
      const teamById = new Map((teamRows ?? []).map(t => [t.id as string, t]));
      const matchups: R32Matchup[] = filled.map(r => {
        const h = teamById.get(r.home_team_id as string); const a = teamById.get(r.away_team_id as string);
        return {
          teamA: (h?.name as string) ?? 'TBD', flagA: flagFor(h?.short_name as string),
          teamB: (a?.name as string) ?? 'TBD', flagB: flagFor(a?.short_name as string),
          date: r.kickoff_at ? new Date(r.kickoff_at as string).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) : '',
          venue: [r.venue, r.city].filter(Boolean).join(', '),
        };
      });
      const base = (process.env.APP_BASE_URL ?? 'https://clearway.verxyl.com').replace(/\/+$/, '');
      sendGroupStageCompleteBlast({ competitionId: comp.id, matchups, r32Deadline: '', r32PredictionsUrl: `${base}/playoffs/bracket`, leaderboardUrl: `${base}/pickem` });
      return NextResponse.json({ ok: true, queued: true });
    }

    if (emailType === 'final_standings') {
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
      return NextResponse.json({ ok: true, queued: true });
    }
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
