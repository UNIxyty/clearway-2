import { Resend } from 'resend';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

const FROM = process.env.EMAIL_FROM_ADDRESS
  ? `WC2026 Pick'em <${process.env.EMAIL_FROM_ADDRESS}>`
  : "WC2026 Pick'em <noreply@verxyl.com>";

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
  opts?: { userId?: string; emailType?: string },
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
  };

  let result: SendEmailResult;
  try {
    const { error } = await getResend().emails.send({ from: FROM, to, subject, html });
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
