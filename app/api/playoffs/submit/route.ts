import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@/lib/admin-auth';
import { sendPlayoffPicksEmail } from '@/lib/pickem-email';

interface PickRow {
  round: string;
  homeName: string;
  awayName: string;
  homeScore: number | null;
  awayScore: number | null;
  homeFlag?: string;
  awayFlag?: string;
}

export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedUser();
  if ('error' in auth) return auth.error;
  if (!auth.user.email) {
    return NextResponse.json({ error: 'No email on account.' }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const picks: PickRow[] = Array.isArray(body.picks) ? body.picks : [];

  const displayName =
    String(auth.user.user_metadata?.display_name || auth.user.user_metadata?.name || '').trim() ||
    String(auth.user.email).split('@')[0];

  const submittedAt = new Date().toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'Europe/Riga',
  });

  const sent = await sendPlayoffPicksEmail({
    to: auth.user.email,
    displayName,
    picksMade: picks.length,
    matchPicks: picks,
    submittedAt,
  });

  if (!sent) {
    return NextResponse.json({ error: 'Email could not be sent.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
