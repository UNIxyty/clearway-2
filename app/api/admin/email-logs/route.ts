import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

// Read-only view of the email_logs table so send failures are visible to admins
// without querying the database directly.
export async function GET() {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from('email_logs')
    .select('id, user_id, email_type, recipient_email, subject, status, error_message, sent_at, created_at, is_test')
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    console.error('[admin/email-logs] query failed', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ logs: data ?? [] });
}
