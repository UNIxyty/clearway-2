import { Resend } from 'resend';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

// Sender display name + address, e.g. "Clearway WC2026 Pickems <noreply@verxyl.com>".
// Required — no hardcoded fallback. Throws (and the send is logged failed) if unset.
function getFrom(): string {
  const from = process.env.PICKEM_EMAIL_FROM;
  if (!from || !from.trim()) {
    throw new Error('PICKEM_EMAIL_FROM is not set — refusing to send email without a configured sender address.');
  }
  return from;
}

let _resend: Resend | null = null;
function getResend(): Resend {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

export interface SendEmailResult {
  success: boolean;
  error?: string;
}

export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  opts?: { userId?: string; emailType?: string; isTest?: boolean },
): Promise<SendEmailResult> {
  const supabase = createSupabaseAdminClient();
  const logRow = {
    user_id: opts?.userId ?? null,
    email_type: opts?.emailType ?? 'unknown',
    recipient_email: to,
    subject,
    status: 'pending' as string,
    error_message: null as string | null,
    sent_at: null as string | null,
    is_test: opts?.isTest ?? false,
  };

  let result: SendEmailResult;
  try {
    const { error } = await getResend().emails.send({ from: getFrom(), to, subject, html });
    if (error) {
      logRow.status = 'failed';
      logRow.error_message = error.message;
      result = { success: false, error: error.message };
    } else {
      logRow.status = 'sent';
      logRow.sent_at = new Date().toISOString();
      result = { success: true };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logRow.status = 'failed';
    logRow.error_message = msg;
    result = { success: false, error: msg };
  }

  try { await supabase.from('email_logs').insert(logRow); } catch { /* non-blocking */ }
  return result;
}
