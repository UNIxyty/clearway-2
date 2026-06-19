import { renderTemplate } from '@/server/emails/renderTemplate';

/**
 * Render any of the 5 emails with realistic hardcoded mock data (no DB needed) for
 * admin test sends. Variable shapes mirror the real triggers exactly.
 */
export const EMAIL_TYPES = [
  'group_stage_complete',
  'bracket_confirmation',
  'prediction_update',
  'final_standings',
] as const;
export type EmailType = (typeof EMAIL_TYPES)[number];

export const EMAIL_META: Record<EmailType, { label: string; description: string; subject: string; batch: boolean }> = {
  group_stage_complete: {
    label: 'Group Stage Complete',
    description: 'Sent to all users when the admin confirms the R32 bracket (group points + R32 projection).',
    subject: 'WC2026 Group Stage Complete — Your Results Are In',
    batch: true,
  },
  bracket_confirmation: {
    label: 'Playoff Bracket Confirmation',
    description: 'Sent to a user the first time they save their playoff picks.',
    subject: 'Your WC2026 Playoff Picks Are Locked In',
    batch: false,
  },
  prediction_update: {
    label: 'Playoff Prediction Update',
    description: 'Sent (debounced ~90s) after a user edits already-saved picks.',
    subject: 'Your WC2026 Bracket Was Updated (2 changes)',
    batch: false,
  },
  final_standings: {
    label: 'Final Standings',
    description: 'Sent to all users once both the Final and Third-Place results are published.',
    subject: "WC2026 Pick'em Is Over — Here's How You Finished",
    batch: true,
  },
};

function logos(base: string) {
  return {
    wc2026LogoUrl: `${base}/wc2026-logo.png`,
    clearwayLogoUrl: `${base}/clearway-logo.svg`,
    verxylLogoUrl: `${base}/verxyl-logo.png`,
    unsubscribeLink: `${base}/unsubscribe?token=mock`,
  };
}

export function renderMockEmail(type: EmailType): { subject: string; html: string } {
  const base = (process.env.APP_BASE_URL ?? 'https://clearway.verxyl.com').replace(/\/+$/, '');
  const L = logos(base);
  const meta = EMAIL_META[type];

  switch (type) {
    case 'bracket_confirmation':
      return {
        subject: meta.subject,
        html: renderTemplate('bracketConfirmation.html', {
          firstName: 'Alex', count: 3, timestamp: '17 Jun 2026, 14:32', deadline: '28 Jun 2026, 22:00',
          rounds: [{
            label: 'Round of 32', isFinal: false,
            matches: [
              { flagA: '🇫🇷', teamA: 'France', flagB: '🇩🇪', teamB: 'Germany', scoreA: '2', scoreB: '1', rowAlt: false },
              { flagA: '🇧🇷', teamA: 'Brazil', flagB: '🇦🇷', teamB: 'Argentina', scoreA: '1', scoreB: '0', rowAlt: true },
            ],
          }],
          bracketUrl: `${base}/playoffs/bracket`, ...L,
        }),
      };
    case 'prediction_update':
      return {
        subject: meta.subject,
        html: renderTemplate('predictionUpdate.html', {
          firstName: 'Alex', changeTimestamp: '17 Jun 2026, 14:40', changeCount: 2,
          changes: [
            { round: 'R16', matchLabel: 'Match 5', teamA: '🇫🇷 France', teamB: '🇪🇸 Spain', previousPick: '🇪🇸 Spain to win, 1–0', updatedPick: '🇫🇷 France to win, 2–1' },
            { round: 'QF', matchLabel: 'Match 2', teamA: '🇧🇷 Brazil', teamB: '🏴󠁧󠁢󠁥󠁮󠁧󠁿 England', previousPick: '🏴󠁧󠁢󠁥󠁮󠁧󠁿 England to win', updatedPick: '🇧🇷 Brazil to win, 3–1' },
          ],
          unchangedCount: 14, securityUrl: `${base}/account`, bracketUrl: `${base}/playoffs/bracket`, deadline: '28 Jun 2026, 22:00', ...L,
        }),
      };
    case 'group_stage_complete':
      return {
        subject: meta.subject,
        html: renderTemplate('groupStageComplete.html', {
          firstName: 'Alex', totalGroupPoints: 18, rank: 4, totalUsers: 26, avgPoints: 12.5,
          groups: [
            { label: 'Group A', predicted: '🇦🇷 ARG, 🇮🇸 ISL', actual: '🇦🇷 ARG, 🇦🇺 AUS', points: 2, rowAlt: false, hasPoints: true },
            { label: 'Group B', predicted: '🇫🇷 FRA, 🇳🇬 NGA', actual: '🇫🇷 FRA, 🇳🇬 NGA', points: 4, rowAlt: true, hasPoints: true },
          ],
          matchupsLeft: [{ flagA: '🇪🇨', teamA: 'Ecuador', flagB: '🇧🇦', teamB: 'Bosnia', date: '29 Jun, 20:30', venue: 'Gillette Stadium' }],
          matchupsRight: [{ flagA: '🇲🇽', teamA: 'Mexico', flagB: '🇨🇦', teamB: 'Canada', date: '30 Jun, 17:00', venue: 'AT&T Stadium' }],
          r32PredictionsUrl: `${base}/playoffs/bracket`, r32Deadline: '28 Jun 2026, 22:00', leaderboardUrl: `${base}/pickem`, ...L,
        }),
      };
    case 'final_standings':
      return {
        subject: meta.subject,
        html: renderTemplate('finalStandings.html', {
          firstName: 'Alex', finalRank: 1, totalUsers: 26, totalPoints: 64,
          groupStagePoints: 22, r32ProjectionPoints: 9, r32Points: 12, r16Points: 6, qfPoints: 3, sfPoints: 2, finalPoints: 2,
          exactScoreBonusPoints: 8, bestRound: 'Round of 32', correctPicksCount: 19, totalPicksCount: 31, exactScoreCount: 4,
          avgPoints: 38, pointsAboveAverage: 26, aboveOrBelowText: 'above', deltaColor: '#16a34a',
          rankCardBg: '#FFFBEB', rankCardBorder: '#FFD700', rankMedal: '🥇', rankNumColor: '#B45309',
          leaderboardUrl: `${base}/pickem`, ...L,
        }),
      };
  }
}
