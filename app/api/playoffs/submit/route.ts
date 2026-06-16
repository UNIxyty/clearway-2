import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@/lib/admin-auth';
import { sendBracketConfirmation } from '@/server/emails/triggers/sendBracketConfirmation';

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

  sendBracketConfirmation({
    userId: auth.user.id,
    email: auth.user.email,
    displayName,
    picks,
    submittedAt,
    deadline: String(body.deadline ?? ''),
  });

  return NextResponse.json({ ok: true });
}
