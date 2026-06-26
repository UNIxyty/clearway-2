import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { resolveRecipients, filtersFromParams } from '@/server/emails/resolveRecipients';

export const dynamic = 'force-dynamic';

/* GET /api/admin/email-tools/recipient-count?mode=…&minPoints=… → { count, userIds, preview } */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;

  const filters = filtersFromParams(req.nextUrl.searchParams);
  const recipients = await resolveRecipients(filters);
  return NextResponse.json({
    count: recipients.length,
    userIds: recipients.map(r => r.userId),
    // first 50 for the preview popover (name + email); client shows "+N more"
    preview: recipients.slice(0, 50).map(r => ({ userId: r.userId, email: r.email, firstName: r.firstName })),
  });
}
