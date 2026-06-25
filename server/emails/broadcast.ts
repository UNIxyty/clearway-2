/* =============================================================================
 * One-off broadcast email — shared core used by BOTH the CLI
 * (scripts/send-broadcast.ts) and the admin endpoint
 * (app/api/admin/email-tools/broadcast). Renders a custom template and sends to
 * a recipient set, logging each send to email_logs via the existing sendEmail.
 *
 * Recipients come from the same source the other blasts use: auth.users joined
 * to user_preferences (email_opt_out / display_name). There is no `profiles`
 * table in this app.
 * ===========================================================================*/
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { renderTemplate } from '@/server/emails/renderTemplate';
import { sendEmail } from '@/server/emails/sendEmail';
import { unsubscribeUrl } from '@/server/utils/unsubscribeToken';

/** Allow-list of broadcast templates (filename without .html in templates dir). */
export const BROADCAST_TEMPLATES = ['apology'] as const;
export type BroadcastTemplate = (typeof BROADCAST_TEMPLATES)[number];

export function isBroadcastTemplate(value: string): value is BroadcastTemplate {
  return (BROADCAST_TEMPLATES as readonly string[]).includes(value);
}

export interface BroadcastRecipient {
  id: string;
  email: string;
  firstName: string;
}

export interface BroadcastResult {
  sent: number;
  failed: number;
  errors: string[];
}

function appBase(): string {
  return (process.env.APP_BASE_URL ?? 'https://clearway.verxyl.com').replace(/\/+$/, '');
}

function firstNameFrom(displayName: string | null, meta: Record<string, unknown> | undefined, email: string): string {
  const raw = String(
    displayName || (meta?.display_name as string) || (meta?.name as string) || '',
  ).trim() || email.split('@')[0];
  return raw.split(/\s+/)[0] || 'there';
}

/** Template variables for one recipient (content + shared chrome/logos). */
export function broadcastVars(recipient: BroadcastRecipient): Record<string, string> {
  const base = appBase();
  return {
    firstName: recipient.firstName,
    dashboardUrl: `${base}/pickem`,
    unsubscribeLink: unsubscribeUrl(recipient.id),
    wc2026LogoUrl: `${base}/wc2026-logo.png`,
    clearwayLogoUrl: `${base}/clearway-logo.svg`,
    verxylLogoUrl: `${base}/verxyl-logo.png`,
  };
}

export function renderBroadcast(template: BroadcastTemplate, recipient: BroadcastRecipient): string {
  return renderTemplate(`${template}.html`, broadcastVars(recipient));
}

/**
 * All users who have NOT opted out, with a resolved first name, plus how many
 * were skipped for opting out (for the CLI summary line).
 * @param onlyEmail when set, restrict to that single address (targeted test).
 */
export async function fetchBroadcastRecipients(
  onlyEmail?: string,
): Promise<{ recipients: BroadcastRecipient[]; skippedOptOut: number }> {
  const supabase = createSupabaseAdminClient();

  const { data: authData, error } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw new Error(`Failed to list users: ${error.message}`);

  const { data: prefRows } = await supabase
    .from('user_preferences')
    .select('user_id, display_name, email_opt_out');
  const prefByUser = new Map(
    (prefRows ?? []).map(p => [p.user_id as string, p as { display_name: string | null; email_opt_out: boolean | null }]),
  );

  const wanted = onlyEmail?.trim().toLowerCase();
  const recipients: BroadcastRecipient[] = [];
  let skippedOptOut = 0;
  for (const user of authData.users) {
    if (!user.email) continue;
    if (wanted && user.email.toLowerCase() !== wanted) continue;
    const prefs = prefByUser.get(user.id);
    if (prefs?.email_opt_out) { skippedOptOut++; continue; }
    recipients.push({
      id: user.id,
      email: user.email,
      firstName: firstNameFrom(prefs?.display_name ?? null, user.user_metadata as Record<string, unknown> | undefined, user.email),
    });
  }
  return { recipients, skippedOptOut };
}

export interface SendBroadcastOptions {
  template: BroadcastTemplate;
  subject: string;
  recipients: BroadcastRecipient[];
  isTest?: boolean;
  /** Delay between sends (ms) to respect Resend rate limits. */
  delayMs?: number;
  /** Per-send progress callback (1-based index). */
  onProgress?: (info: { index: number; total: number; email: string; ok: boolean; error?: string }) => void;
}

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/**
 * Render + send the broadcast to every recipient. Never aborts on a single
 * failure — each error is captured and the batch continues.
 */
export async function sendBroadcast(opts: SendBroadcastOptions): Promise<BroadcastResult> {
  const { template, subject, recipients, isTest = false, delayMs = 150, onProgress } = opts;
  const result: BroadcastResult = { sent: 0, failed: 0, errors: [] };

  for (let i = 0; i < recipients.length; i++) {
    const r = recipients[i];
    try {
      const html = renderBroadcast(template, r);
      const res = await sendEmail(r.email, subject, html, {
        userId: r.id,
        emailType: 'broadcast',
        isTest,
      });
      if (res.success) {
        result.sent++;
        onProgress?.({ index: i + 1, total: recipients.length, email: r.email, ok: true });
      } else {
        result.failed++;
        result.errors.push(`${r.email}: ${res.error ?? 'send failed'}`);
        onProgress?.({ index: i + 1, total: recipients.length, email: r.email, ok: false, error: res.error });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.failed++;
      result.errors.push(`${r.email}: ${msg}`);
      onProgress?.({ index: i + 1, total: recipients.length, email: r.email, ok: false, error: msg });
    }
    if (i < recipients.length - 1 && delayMs > 0) await sleep(delayMs);
  }

  return result;
}
