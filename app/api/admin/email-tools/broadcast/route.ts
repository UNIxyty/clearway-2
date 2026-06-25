import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import {
  isBroadcastTemplate,
  fetchBroadcastRecipients,
  sendBroadcast,
  type BroadcastRecipient,
} from '@/server/emails/broadcast';

export const dynamic = 'force-dynamic';

/*
 * One-off custom broadcast — the admin-UI twin of scripts/send-broadcast.ts.
 * Shares the exact same core (server/emails/broadcast.ts).
 *   body: { template: string, subject: string, testOnly: boolean }
 *   testOnly=true  -> send only to the requesting admin (logged is_test=true)
 *   testOnly=false -> batch to all non-opted-out users
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;

  const body = await req.json().catch(() => ({}));
  const template = String(body.template ?? '');
  const subject = String(body.subject ?? '').trim();
  const testOnly = Boolean(body.testOnly);

  if (!isBroadcastTemplate(template)) {
    return NextResponse.json({ error: `Unknown template "${template}"` }, { status: 400 });
  }
  if (!subject) {
    return NextResponse.json({ error: 'Subject is required' }, { status: 400 });
  }

  if (testOnly) {
    const email = auth.user.email;
    if (!email) return NextResponse.json({ error: 'Admin account has no email address' }, { status: 400 });
    const meta = auth.user.user_metadata as Record<string, unknown> | undefined;
    const name = String((meta?.display_name as string) || (meta?.name as string) || '').trim() || email.split('@')[0];
    const recipient: BroadcastRecipient = {
      id: auth.user.id,
      email,
      firstName: name.split(/\s+/)[0] || 'there',
    };
    const result = await sendBroadcast({ template, subject, recipients: [recipient], isTest: true });
    return NextResponse.json(result);
  }

  const { recipients } = await fetchBroadcastRecipients();
  const result = await sendBroadcast({ template, subject, recipients, isTest: false });
  return NextResponse.json(result);
}
