/* =============================================================================
 * One-off broadcast email sender (CLI).
 *
 * Runs standalone (no Next dev server) — connects to Supabase via the service
 * role key and reuses the shared broadcast core (server/emails/broadcast.ts).
 *
 *   npx tsx scripts/send-broadcast.ts --template apology --subject "..." [--dry-run] [--limit N] [--user email]
 *
 * SAFETY: it uses whatever NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
 * are in .env.local/.env — it prints the URL on start so you can confirm you're
 * pointed at the PRODUCTION project before sending.
 * ===========================================================================*/
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  BROADCAST_TEMPLATES,
  isBroadcastTemplate,
  fetchBroadcastRecipients,
  renderBroadcast,
  broadcastVars,
  sendBroadcast,
  type BroadcastRecipient,
} from '@/server/emails/broadcast';
import { resolveRecipients, type RecipientFilters } from '@/server/emails/resolveRecipients';

/** Minimal .env loader (dotenv isn't a dependency). .env.local wins over .env. */
function loadEnv(): void {
  for (const file of ['.env.local', '.env']) {
    const p = path.join(process.cwd(), file);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf-8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = val;
    }
  }
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}
function argValue(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}
function fail(msg: string): never {
  console.error(`Error: ${msg}`);
  process.exit(1);
}

async function main(): Promise<void> {
  loadEnv();

  const template = argValue('template');
  const subject = argValue('subject');
  const dryRun = hasFlag('dry-run');
  const limitRaw = argValue('limit');
  const onlyUser = argValue('user');
  const filterRaw = argValue('filter');

  if (!template) fail('--template is required (e.g. --template apology)');
  if (!isBroadcastTemplate(template)) fail(`Unknown template "${template}". Available: ${BROADCAST_TEMPLATES.join(', ')}`);
  if (!subject) fail('--subject is required');
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    fail('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — check .env.local / .env');
  }

  console.log(`Supabase project: ${process.env.NEXT_PUBLIC_SUPABASE_URL}`);
  console.log(`Template: ${template}.html   Subject: "${subject}"`);

  // --filter '{"hasPlayoffPicks":true}' | '{"minPoints":10}' | '{"topN":5}'
  // resolves via the shared resolveRecipients (combined-standings aware). No
  // --filter => existing behavior (all non-opted-out, optionally one --user).
  let recipients: BroadcastRecipient[];
  let skippedOptOut = 0;
  if (filterRaw) {
    const parsed = ((): Record<string, unknown> => {
      try { return JSON.parse(filterRaw) as Record<string, unknown>; }
      catch { fail('--filter must be a valid JSON string'); }
    })();
    const filters: RecipientFilters = {
      mode: 'filtered',
      hasGroupPicks: parsed.hasGroupPicks === true || undefined,
      hasPlayoffPicks: parsed.hasPlayoffPicks === true || undefined,
      noPlayoffPicks: parsed.noPlayoffPicks === true || undefined,
      minPoints: typeof parsed.minPoints === 'number' ? parsed.minPoints : undefined,
      maxPoints: typeof parsed.maxPoints === 'number' ? parsed.maxPoints : undefined,
      topN: typeof parsed.topN === 'number' ? parsed.topN : undefined,
    };
    const resolved = await resolveRecipients(filters);
    recipients = resolved.map(r => ({ id: r.userId, email: r.email, firstName: r.firstName }));
  } else {
    const res = await fetchBroadcastRecipients(onlyUser);
    recipients = res.recipients;
    skippedOptOut = res.skippedOptOut;
  }

  // ── Dry run: render the first recipient, print vars + HTML, send nothing ──
  if (dryRun) {
    if (recipients.length === 0) fail('No recipients available to preview (none matched / all opted out).');
    const r = recipients[0];
    console.log('\n──────── DRY RUN — nothing is sent, nothing is logged ────────');
    console.log(`Preview recipient: ${r.email}`);
    console.log('Resolved variables:');
    console.log(JSON.stringify(broadcastVars(r), null, 2));
    console.log('\n──────── RENDERED HTML ────────\n');
    console.log(renderBroadcast(template, r));
    return;
  }

  let toSend = recipients;
  if (limitRaw !== undefined) {
    const limit = Number(limitRaw);
    if (!Number.isInteger(limit) || limit <= 0) fail('--limit must be a positive integer');
    toSend = recipients.slice(0, limit);
  }

  if (toSend.length === 0) {
    console.log(`No recipients to send to (skipped opt-out: ${skippedOptOut}).`);
    return;
  }

  console.log(`\nSending to ${toSend.length} users...`);
  const result = await sendBroadcast({
    template,
    subject,
    recipients: toSend,
    isTest: false,
    delayMs: 150,
    onProgress: ({ index, total, email, ok, error }) => {
      console.log(
        ok
          ? `[${index}/${total}] Sent → ${email}`
          : `[${index}/${total}] FAILED → ${email} — Error: ${error ?? 'unknown'}`,
      );
    },
  });

  console.log(`\nDone. Sent: ${result.sent}, Failed: ${result.failed}, Skipped (opt-out): ${skippedOptOut}`);
  if (result.failed > 0) process.exitCode = 1;
}

main().catch(err => {
  console.error('Fatal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
