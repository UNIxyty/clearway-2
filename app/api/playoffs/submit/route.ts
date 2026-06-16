import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@/lib/admin-auth';
import { sendBracketConfirmation } from '@/server/emails/triggers/sendBracketConfirmation';
import { sendPredictionUpdateEmail, type PredictionChange } from '@/server/emails/triggers/sendPredictionUpdateEmail';

interface PickRow {
  round: string;
  matchLabel?: string;
  homeName: string;
  awayName: string;
  homeFlag?: string;
  awayFlag?: string;
  homeScore: number | null;
  awayScore: number | null;
  // update-email fields
  winnerName?: string;
  winnerFlag?: string;
  oldWinnerName?: string;
  oldWinnerFlag?: string;
  oldHomeScore?: number | null;
  oldAwayScore?: number | null;
  hasChanged?: boolean;
}

function formatPick(flag: string, name: string, hs: number | null, as_: number | null): string {
  const score = (hs !== null && as_ !== null) ? `, ${hs}–${as_}` : '';
  return `${flag} ${name} to win${score}`.trim();
}

export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedUser();
  if ('error' in auth) return auth.error;
  if (!auth.user.email) {
    return NextResponse.json({ error: 'No email on account.' }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const picks: PickRow[] = Array.isArray(body.picks) ? body.picks : [];
  const isFirstSubmit: boolean = body.isFirstSubmit !== false;
  const deadline = String(body.deadline ?? '');

  const displayName =
    String(auth.user.user_metadata?.display_name || auth.user.user_metadata?.name || '').trim() ||
    String(auth.user.email).split('@')[0];

  if (isFirstSubmit) {
    const submittedAt = new Date().toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
      timeZone: 'Europe/Riga',
    });

    sendBracketConfirmation({
      userId: auth.user.id,
      email: auth.user.email,
      displayName,
      picks: picks.map(p => ({
        round: p.round,
        homeName: p.homeName,
        awayName: p.awayName,
        homeFlag: p.homeFlag,
        awayFlag: p.awayFlag,
        homeScore: p.homeScore,
        awayScore: p.awayScore,
      })),
      submittedAt,
      deadline,
    });
  } else {
    const changedPicks = picks.filter(p => p.hasChanged);
    if (changedPicks.length > 0) {
      const changes: PredictionChange[] = changedPicks.map(p => ({
        round: p.round,
        matchLabel: p.matchLabel ?? '',
        teamA: `${p.homeFlag ?? ''} ${p.homeName}`.trim(),
        teamB: `${p.awayFlag ?? ''} ${p.awayName}`.trim(),
        previousPick: formatPick(p.oldWinnerFlag ?? '', p.oldWinnerName ?? '?', p.oldHomeScore ?? null, p.oldAwayScore ?? null),
        updatedPick: formatPick(p.winnerFlag ?? '', p.winnerName ?? '?', p.homeScore, p.awayScore),
      }));

      sendPredictionUpdateEmail({
        userId: auth.user.id,
        email: auth.user.email,
        displayName,
        changes,
        unchangedCount: picks.length - changedPicks.length,
        deadline,
      });
    }
  }

  return NextResponse.json({ ok: true });
}
