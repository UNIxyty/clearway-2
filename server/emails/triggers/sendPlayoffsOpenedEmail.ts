import * as fs from 'fs';
import * as path from 'path';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { renderTemplate } from '@/server/emails/renderTemplate';
import { sendEmail } from '@/server/emails/sendEmail';
import { unsubscribeUrl } from '@/server/utils/unsubscribeToken';
import { getTournamentState } from '@/lib/pickem-store';

/*
 * Stage — "Playoffs Are Open" blast.
 *
 * Fired automatically when the last group-stage match result is published (so the
 * playoffs feature auto-opens). The HTML template is produced separately via the
 * Claude Design prompt; until that file lands this trigger is a safe no-op that
 * logs instead of sending — never attempt to render/send without the template.
 */
const TEMPLATE = 'playoffsOpened.html';
const TEMPLATE_PATH = path.join(process.cwd(), 'server', 'emails', 'templates', TEMPLATE);

/** True once the designer has added server/emails/templates/playoffsOpened.html. */
export function playoffsOpenedTemplateExists(): boolean {
  return fs.existsSync(TEMPLATE_PATH);
}

function appBase(): string {
  return (process.env.APP_BASE_URL ?? 'https://clearway.verxyl.com').replace(/\/+$/, '');
}

/** Test render with mock data (used by the Email Tools "Send Test" button). Only
 * call when playoffsOpenedTemplateExists() is true. */
export function renderPlayoffsOpenedMock(): { subject: string; html: string } {
  const base = appBase();
  return {
    subject: "WC2026 Pick'em — Playoffs Are Open",
    html: renderTemplate(TEMPLATE, {
      firstName: 'Admin',
      deadline: 'coming soon',
      playoffsBracketUrl: `${base}/playoffs`,
      dashboardUrl: `${base}/pickem`,
      unsubscribeLink: `${base}/unsubscribe?token=mock`,
      wc2026LogoUrl: `${base}/wc2026-logo.png`,
      clearwayLogoUrl: `${base}/clearway-logo.svg`,
      verxylLogoUrl: `${base}/verxyl-logo.png`,
    }),
  };
}

export interface PlayoffsOpenedBlastOptions {
  competitionId: string;
  /** Restrict the send to this allow-list (case-insensitive) — review send. */
  onlyEmails?: string[];
}

/** Fire-and-forget blast. No-ops (with a log) if the template isn't designed yet. */
export function sendPlayoffsOpenedBlast(opts: PlayoffsOpenedBlastOptions): void {
  void _blast(opts).catch(err =>
    console.error('[playoffs-opened-blast] fatal — blast aborted', err),
  );
}

async function _blast(opts: PlayoffsOpenedBlastOptions): Promise<void> {
  if (!playoffsOpenedTemplateExists()) {
    console.log('Playoffs opened automatically — email will be sent once template is available');
    return;
  }

  const supabase = createSupabaseAdminClient();
  const base = appBase();

  const state = await getTournamentState(opts.competitionId);
  const deadline = state.playoffsPredictionDeadline
    ? new Date(state.playoffsPredictionDeadline).toLocaleString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
      })
    : null;

  const { data: allPrefs } = await supabase
    .from('user_preferences')
    .select('user_id, email_opt_out');
  const optOutByUser = new Map((allPrefs ?? []).map(p => [p.user_id as string, Boolean(p.email_opt_out)]));

  const { data: { users } } = await supabase.auth.admin.listUsers({ perPage: 1000 });

  const onlySet = opts.onlyEmails && opts.onlyEmails.length > 0
    ? new Set(opts.onlyEmails.map(e => e.trim().toLowerCase()))
    : null;

  let sent = 0;
  let failed = 0;
  for (const user of users) {
    if (!user.email) continue;
    if (onlySet && !onlySet.has(user.email.toLowerCase())) continue;
    if (optOutByUser.get(user.id)) continue;

    const displayName = String(
      user.user_metadata?.display_name || user.user_metadata?.name || '',
    ).trim() || user.email.split('@')[0];
    const firstName = displayName.split(/\s+/)[0] || 'there';

    const html = renderTemplate(TEMPLATE, {
      firstName,
      deadline,
      playoffsBracketUrl: `${base}/playoffs`,
      dashboardUrl: `${base}/pickem`,
      unsubscribeLink: unsubscribeUrl(user.id),
      wc2026LogoUrl: `${base}/wc2026-logo.png`,
      clearwayLogoUrl: `${base}/clearway-logo.svg`,
      verxylLogoUrl: `${base}/verxyl-logo.png`,
    });

    try {
      await sendEmail(user.email, "WC2026 Pick'em — Playoffs Are Open", html, {
        userId: user.id, emailType: 'playoffs_opened',
      });
      sent++;
    } catch (err) {
      failed++;
      console.error('[playoffs-opened-blast] send failed', {
        userId: user.id, error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  console.log('[playoffs-opened-blast] complete', {
    competitionId: opts.competitionId, mode: onlySet ? 'test' : 'all', sent, failed,
  });
}
