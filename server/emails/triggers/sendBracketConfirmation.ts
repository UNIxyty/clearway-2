import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { renderTemplate } from '@/server/emails/renderTemplate';
import { sendEmail } from '@/server/emails/sendEmail';
import { unsubscribeUrl } from '@/server/utils/unsubscribeToken';

const ROUND_LABEL: Record<string, string> = {
  R32: 'Round of 32',
  R16: 'Round of 16',
  QF: 'Quarterfinal',
  SF: 'Semifinal',
  FINAL: 'Final',
  THIRD: '3rd Place',
};

export interface BracketPickRow {
  round: string;
  homeName: string;
  awayName: string;
  homeScore: number | null;
  awayScore: number | null;
  homeFlag?: string;
  awayFlag?: string;
}

export interface SendBracketConfirmationInput {
  userId: string;
  email: string;
  displayName: string;
  picks: BracketPickRow[];
  submittedAt: string;
  deadline: string;
}

export function sendBracketConfirmation(input: SendBracketConfirmationInput): void {
  void _send(input);
}

async function _send(input: SendBracketConfirmationInput): Promise<void> {
  const supabase = createSupabaseAdminClient();

  const { data: prefs } = await supabase
    .from('user_preferences')
    .select('email_opt_out')
    .eq('user_id', input.userId)
    .maybeSingle();

  if (prefs?.email_opt_out) return;

  const base = (process.env.APP_BASE_URL ?? 'https://clearway.verxyl.com').replace(/\/+$/, '');
  const firstName = input.displayName.trim().split(/\s+/)[0] || 'there';

  // Group picks by round, preserving order: R32 → R16 → QF → SF → FINAL/THIRD
  const roundOrder = ['R32', 'R16', 'QF', 'SF', 'FINAL', 'THIRD'];
  const byRound = new Map<string, BracketPickRow[]>();
  for (const pick of input.picks) {
    const list = byRound.get(pick.round) ?? [];
    list.push(pick);
    byRound.set(pick.round, list);
  }

  const rounds = roundOrder
    .filter(r => byRound.has(r))
    .map(r => ({
      label: ROUND_LABEL[r] ?? r,
      isFinal: r === 'FINAL',
      matches: (byRound.get(r) ?? []).map((p, i) => ({
        flagA: p.homeFlag ?? '',
        teamA: p.homeName,
        flagB: p.awayFlag ?? '',
        teamB: p.awayName,
        scoreA: p.homeScore !== null ? String(p.homeScore) : '–',
        scoreB: p.awayScore !== null ? String(p.awayScore) : '–',
        rowAlt: i % 2 === 1,
      })),
    }));

  const html = renderTemplate('bracketConfirmation.html', {
    firstName,
    count: input.picks.length,
    timestamp: input.submittedAt,
    deadline: input.deadline,
    rounds,
    bracketUrl: `${base}/playoffs/bracket`,
    unsubscribeLink: unsubscribeUrl(input.userId),
    wc2026LogoUrl: `${base}/wc2026-logo.png`,
    clearwayLogoUrl: `${base}/clearway-logo.svg`,
    verxylLogoUrl: `${base}/verxyl-logo.png`,
  });

  await sendEmail(
    input.email,
    "Your WC2026 Playoff Picks Are Locked In",
    html,
    { userId: input.userId, emailType: 'bracket_confirmation' },
  );
}
