import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { renderTemplate } from '@/server/emails/renderTemplate';
import { sendEmail } from '@/server/emails/sendEmail';
import { unsubscribeUrl } from '@/server/utils/unsubscribeToken';

const DEBOUNCE_MS = 5 * 60 * 1000; // 5 minutes

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
  changeTimestamp: string;
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

  for (const change of input.changes) {
    changesByMatch.set(change.matchLabel, change);
  }

  const timer = setTimeout(() => {
    pending.delete(input.userId);
    void _send(input.userId, input.email, firstName, changesByMatch, input.unchangedCount, input.deadline);
  }, DEBOUNCE_MS);

  pending.set(input.userId, {
    timer,
    userId: input.userId,
    email: input.email,
    firstName,
    changeTimestamp: new Date().toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
      timeZone: 'Europe/Riga',
    }),
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
    clearwayLogoUrl: `${base}/header_logo_white.svg`,
    verxylLogoUrl: `${base}/logo.png`,
  });

  await sendEmail(
    email,
    `Your WC2026 bracket was updated (${changes.length} change${changes.length !== 1 ? 's' : ''})`,
    html,
    { userId, emailType: 'prediction_update' },
  );
}
