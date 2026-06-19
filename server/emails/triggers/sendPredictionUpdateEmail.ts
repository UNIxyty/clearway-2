import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { renderTemplate } from '@/server/emails/renderTemplate';
import { sendEmail } from '@/server/emails/sendEmail';
import { unsubscribeUrl } from '@/server/utils/unsubscribeToken';

const DEBOUNCE_MS = 90 * 1000;  // quiet-period after the latest change (target <2 min)
const MAX_WAIT_MS = 120 * 1000; // hard cap from the FIRST change so worst case ≈ 2 min

/*
 * NOTE ON DURABILITY: this debounce is in-memory (per Node process). A container
 * restart/redeploy drops any pending timers, so a batch mid-debounce would not be
 * emailed. For the current low-volume, fire-and-forget use that trade-off is
 * acceptable. If stronger guarantees are needed, persist batches to a
 * `pending_email_batches(user_id, email_type, first_change_at, scheduled_send_at,
 * payload, sent)` table and drain it from a 30s node-cron worker instead of setTimeout.
 */

export interface PredictionChange {
  round: string;
  matchLabel: string;
  teamA: string;
  teamB: string;
  previousPick: string;
  updatedPick: string;
}

export interface SendPredictionUpdateInput {
  userId: string;
  email: string;
  displayName: string;
  changes: PredictionChange[];
  unchangedCount: number;
  deadline: string;
}

interface Pending {
  timer: ReturnType<typeof setTimeout>;
  userId: string;
  email: string;
  firstName: string;
  firstChangeAt: number;
  unchangedCount: number;
  deadline: string;
  // matchLabel → latest change (newer overwrites older for same match)
  changesByMatch: Map<string, PredictionChange>;
}

const pending = new Map<string, Pending>();

export function sendPredictionUpdateEmail(input: SendPredictionUpdateInput): void {
  const existing = pending.get(input.userId);
  if (existing) clearTimeout(existing.timer);

  const firstName = input.displayName.trim().split(/\s+/)[0] || 'there';
  const changesByMatch = existing?.changesByMatch ?? new Map<string, PredictionChange>();
  // Anchor the max-wait window to the first change of this batch, not the latest.
  const firstChangeAt = existing?.firstChangeAt ?? Date.now();

  for (const change of input.changes) {
    changesByMatch.set(change.matchLabel, change);
  }

  // Quiet-period debounce, but never push the send past MAX_WAIT_MS from the
  // first change — otherwise a user who keeps editing would never get the email.
  const elapsed = Date.now() - firstChangeAt;
  const delay = Math.max(0, Math.min(DEBOUNCE_MS, MAX_WAIT_MS - elapsed));

  const timer = setTimeout(() => {
    pending.delete(input.userId);
    void _send(input.userId, input.email, firstName, changesByMatch, input.unchangedCount, input.deadline);
  }, delay);

  pending.set(input.userId, {
    timer,
    userId: input.userId,
    email: input.email,
    firstName,
    firstChangeAt,
    unchangedCount: input.unchangedCount,
    deadline: input.deadline,
    changesByMatch,
  });
}

async function _send(
  userId: string,
  email: string,
  firstName: string,
  changesByMatch: Map<string, PredictionChange>,
  unchangedCount: number,
  deadline: string,
): Promise<void> {
  const supabase = createSupabaseAdminClient();

  const { data: prefs } = await supabase
    .from('user_preferences')
    .select('email_opt_out')
    .eq('user_id', userId)
    .maybeSingle();

  if (prefs?.email_opt_out) return;

  const base = (process.env.APP_BASE_URL ?? 'https://clearway.verxyl.com').replace(/\/+$/, '');
  const changes = Array.from(changesByMatch.values());

  const changeTimestamp = new Date().toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'Europe/Riga',
  });

  const html = renderTemplate('predictionUpdate.html', {
    firstName,
    changeTimestamp,
    changeCount: changes.length,
    changes,
    unchangedCount,
    securityUrl: `${base}/account`,
    bracketUrl: `${base}/playoffs/bracket`,
    deadline,
    unsubscribeLink: unsubscribeUrl(userId),
    wc2026LogoUrl: `${base}/wc2026-logo.png`,
    clearwayLogoUrl: `${base}/clearway-logo.svg`,
    verxylLogoUrl: `${base}/verxyl-logo.png`,
  });

  try {
    await sendEmail(
      email,
      `Your WC2026 Bracket Was Updated (${changes.length} change${changes.length === 1 ? '' : 's'})`,
      html,
      { userId, emailType: 'prediction_update' },
    );
  } catch (err) {
    console.error('[prediction-update-email] send failed', {
      userId, changeCount: changes.length,
      reason: err instanceof Error ? err.message : err,
    });
  }
}
