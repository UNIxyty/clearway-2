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
    case 'group_stage_complete': {
      // Mirror the real trigger shape exactly: all 12 groups with full 4-position
      // predicted/actual order, and a full 16-matchup R32 projection.
      const ORD = (n: number): string => (n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th');
      const order = (rows: Array<[string, string]>) =>
        rows.map(([name, flag], i) => ({ position: i + 1, ord: ORD(i + 1), name, flag }));
      const mkGroup = (
        groupCode: string,
        predicted: Array<[string, string]>,
        actual: Array<[string, string]>,
        pointsEarned: number,
        idx: number,
      ) => ({
        groupCode,
        predictedOrder: order(predicted),
        actualOrder: order(actual),
        pointsEarned,
        rowAlt: idx % 2 === 1,
        hasPoints: pointsEarned > 0,
      });
      const groups = [
        mkGroup('A', [['MEX', '🇲🇽'], ['CAN', '🇨🇦'], ['CRC', '🇨🇷'], ['JAM', '🇯🇲']], [['MEX', '🇲🇽'], ['CRC', '🇨🇷'], ['CAN', '🇨🇦'], ['JAM', '🇯🇲']], 2, 0),
        mkGroup('B', [['USA', '🇺🇸'], ['WAL', '🏴󠁧󠁢󠁷󠁬󠁳󠁿'], ['IRN', '🇮🇷'], ['QAT', '🇶🇦']], [['USA', '🇺🇸'], ['WAL', '🏴󠁧󠁢󠁷󠁬󠁳󠁿'], ['IRN', '🇮🇷'], ['QAT', '🇶🇦']], 4, 1),
        mkGroup('C', [['ARG', '🇦🇷'], ['POL', '🇵🇱'], ['MEX', '🇲🇽'], ['KSA', '🇸🇦']], [['ARG', '🇦🇷'], ['MEX', '🇲🇽'], ['POL', '🇵🇱'], ['KSA', '🇸🇦']], 2, 2),
        mkGroup('D', [['FRA', '🇫🇷'], ['DEN', '🇩🇰'], ['TUN', '🇹🇳'], ['AUS', '🇦🇺']], [['AUS', '🇦🇺'], ['FRA', '🇫🇷'], ['TUN', '🇹🇳'], ['DEN', '🇩🇰']], 1, 3),
        mkGroup('E', [['ESP', '🇪🇸'], ['GER', '🇩🇪'], ['JPN', '🇯🇵'], ['CRC', '🇨🇷']], [['JPN', '🇯🇵'], ['ESP', '🇪🇸'], ['GER', '🇩🇪'], ['CRC', '🇨🇷']], 1, 4),
        mkGroup('F', [['BEL', '🇧🇪'], ['CRO', '🇭🇷'], ['MAR', '🇲🇦'], ['CAN', '🇨🇦']], [['MAR', '🇲🇦'], ['CRO', '🇭🇷'], ['BEL', '🇧🇪'], ['CAN', '🇨🇦']], 2, 5),
        mkGroup('G', [['BRA', '🇧🇷'], ['SUI', '🇨🇭'], ['SRB', '🇷🇸'], ['CMR', '🇨🇲']], [['BRA', '🇧🇷'], ['SUI', '🇨🇭'], ['CMR', '🇨🇲'], ['SRB', '🇷🇸']], 2, 6),
        mkGroup('H', [['POR', '🇵🇹'], ['URU', '🇺🇾'], ['GHA', '🇬🇭'], ['KOR', '🇰🇷']], [['POR', '🇵🇹'], ['KOR', '🇰🇷'], ['URU', '🇺🇾'], ['GHA', '🇬🇭']], 1, 7),
        mkGroup('I', [['ENG', '🏴󠁧󠁢󠁥󠁮󠁧󠁿'], ['NED', '🇳🇱'], ['SEN', '🇸🇳'], ['ECU', '🇪🇨']], [['ENG', '🏴󠁧󠁢󠁥󠁮󠁧󠁿'], ['NED', '🇳🇱'], ['SEN', '🇸🇳'], ['ECU', '🇪🇨']], 4, 8),
        mkGroup('J', [['ITA', '🇮🇹'], ['COL', '🇨🇴'], ['EGY', '🇪🇬'], ['NZL', '🇳🇿']], [['COL', '🇨🇴'], ['ITA', '🇮🇹'], ['EGY', '🇪🇬'], ['NZL', '🇳🇿']], 2, 9),
        mkGroup('K', [['NGA', '🇳🇬'], ['PER', '🇵🇪'], ['SCO', '🏴󠁧󠁢󠁳󠁣󠁴󠁿'], ['UAE', '🇦🇪']], [['SCO', '🏴󠁧󠁢󠁳󠁣󠁴󠁿'], ['NGA', '🇳🇬'], ['PER', '🇵🇪'], ['UAE', '🇦🇪']], 1, 10),
        mkGroup('L', [['NOR', '🇳🇴'], ['CHI', '🇨🇱'], ['CIV', '🇨🇮'], ['UZB', '🇺🇿']], [['NOR', '🇳🇴'], ['CHI', '🇨🇱'], ['CIV', '🇨🇮'], ['UZB', '🇺🇿']], 4, 11),
      ];
      const matchups = [
        { matchCode: 'R32_M01', flagA: '🇲🇽', teamA: 'Mexico', flagB: '🏴󠁧󠁢󠁷󠁬󠁳󠁿', teamB: 'Wales', date: '29 Jun, 20:30', venue: 'Estadio Azteca' },
        { matchCode: 'R32_M02', flagA: '🇦🇷', teamA: 'Argentina', flagB: '🇩🇰', teamB: 'Denmark', date: '29 Jun, 17:00', venue: 'MetLife Stadium' },
        { matchCode: 'R32_M03', flagA: '🇪🇸', teamA: 'Spain', flagB: '🇭🇷', teamB: 'Croatia', date: '30 Jun, 20:30', venue: 'SoFi Stadium' },
        { matchCode: 'R32_M04', flagA: '🇧🇷', teamA: 'Brazil', flagB: '🇺🇾', teamB: 'Uruguay', date: '30 Jun, 17:00', venue: 'AT&T Stadium' },
        { matchCode: 'R32_M05', flagA: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', teamA: 'England', flagB: '🇨🇴', teamB: 'Colombia', date: '1 Jul, 20:30', venue: 'Lincoln Financial Field' },
        { matchCode: 'R32_M06', flagA: '🇳🇬', teamA: 'Nigeria', flagB: '🇨🇱', teamB: 'Chile', date: '1 Jul, 17:00', venue: 'Hard Rock Stadium' },
        { matchCode: 'R32_M07', flagA: '🇺🇸', teamA: 'USA', flagB: '🇵🇱', teamB: 'Poland', date: '2 Jul, 20:30', venue: 'Levi\'s Stadium' },
        { matchCode: 'R32_M08', flagA: '🇫🇷', teamA: 'France', flagB: '🇩🇪', teamB: 'Germany', date: '2 Jul, 17:00', venue: 'Arrowhead Stadium' },
        { matchCode: 'R32_M09', flagA: '🇧🇪', teamA: 'Belgium', flagB: '🇨🇭', teamB: 'Switzerland', date: '3 Jul, 20:30', venue: 'Gillette Stadium' },
        { matchCode: 'R32_M10', flagA: '🇵🇹', teamA: 'Portugal', flagB: '🇳🇱', teamB: 'Netherlands', date: '3 Jul, 17:00', venue: 'NRG Stadium' },
        { matchCode: 'R32_M11', flagA: '🇮🇹', teamA: 'Italy', flagB: '🇵🇪', teamB: 'Peru', date: '4 Jul, 20:30', venue: 'Mercedes-Benz Stadium' },
        { matchCode: 'R32_M12', flagA: '🇳🇴', teamA: 'Norway', flagB: '🇲🇦', teamB: 'Morocco', date: '4 Jul, 17:00', venue: 'BMO Field' },
        { matchCode: 'R32_M13', flagA: '🇯🇵', teamA: 'Japan', flagB: '🇨🇦', teamB: 'Canada', date: '5 Jul, 20:30', venue: 'BC Place' },
        { matchCode: 'R32_M14', flagA: '🇰🇷', teamA: 'South Korea', flagB: '🇸🇳', teamB: 'Senegal', date: '5 Jul, 17:00', venue: 'Lumen Field' },
        { matchCode: 'R32_M15', flagA: '🏴󠁧󠁢󠁳󠁣󠁴󠁿', teamA: 'Scotland', flagB: '🇨🇮', teamB: 'Ivory Coast', date: '6 Jul, 20:30', venue: 'Estadio BBVA' },
        { matchCode: 'R32_M16', flagA: '🇦🇺', teamA: 'Australia', flagB: '🇨🇷', teamB: 'Costa Rica', date: '6 Jul, 17:00', venue: 'Estadio Akron' },
      ];
      return {
        subject: meta.subject,
        html: renderTemplate('groupStageComplete.html', {
          firstName: 'Alex', totalGroupPoints: 26, rank: 4, totalUsers: 26, avgPoints: 12.5,
          groups,
          matchupsLeft: matchups.slice(0, 8),
          matchupsRight: matchups.slice(8, 16),
          r32PredictionsUrl: `${base}/playoffs/bracket`, r32Deadline: '28 Jun 2026, 22:00', leaderboardUrl: `${base}/pickem`, ...L,
        }),
      };
    }
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
