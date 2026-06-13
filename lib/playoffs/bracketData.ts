import type { BracketMatchDef, GroupDef } from './types';

export const BRACKET_H = 1520;

export const CARD_WIDTHS: Record<string, number> = {
  group: 80,
  r32: 160,
  r16: 180,
  qf: 200,
  sf: 220,
  final: 260,
  bronze: 220,
};

export const ROUND_POINTS: Record<string, string> = {
  R32: '+3 pts',
  R16: '+3 pts',
  QF: '+3 pts',
  SF: '+3 pts',
  FINAL: '+3 pts',
  THIRD: '+3 pts',
};

/* ---- Group cosmetic data ---- */
export const GROUPS_LEFT: GroupDef[] = [
  { letter: 'A', accent: '#16a34a', flags: ['🇦🇷', '🇦🇺', '🇮🇸', '🇨🇲'] },
  { letter: 'B', accent: '#dc2626', flags: ['🇫🇷', '🇳🇬', '🇨🇷', '🇶🇦'] },
  { letter: 'C', accent: '#f97316', flags: ['🇪🇸', '🇸🇳', '🇵🇪', '🇳🇿'] },
  { letter: 'D', accent: '#2563eb', flags: ['🇧🇷', '🇪🇬', '🇸🇰', '🇭🇳'] },
  { letter: 'E', accent: '#7c3aed', flags: ['🇵🇹', '🇰🇷', '🇺🇿', '🇵🇦'] },
  { letter: 'F', accent: '#eab308', flags: ['🇳🇱', '🇯🇵', '🇨🇮', '🇯🇲'] },
];

export const GROUPS_RIGHT: GroupDef[] = [
  { letter: 'G', accent: '#0d9488', flags: ['🇲🇽', '🇵🇱', '🇳🇴', '🇮🇶'] },
  { letter: 'H', accent: '#db2777', flags: ['🇺🇸', '🇪🇨', '🇩🇿', '🇺🇬'] },
  { letter: 'I', accent: '#06b6d4', flags: ['🇭🇷', '🇦🇹', '🇨🇱', '🇿🇦'] },
  { letter: 'J', accent: '#4f46e5', flags: ['🇺🇾', '🇨🇭', '🇷🇴', '🇨🇩'] },
  { letter: 'K', accent: '#f43f5e', flags: ['🇷🇸', '🇬🇭', '🇸🇪', '🇸🇦'] },
  { letter: 'L', accent: '#84cc16', flags: ['🇮🇹', '🇨🇴', '🇩🇰', '🇨🇦'] },
];

/* ---- Bracket structure ---- */
const MATCHES: Record<string, BracketMatchDef> = {};

function add(m: BracketMatchDef) { MATCHES[m.id] = m; }

/* R32 — left pathway (M01–M08) */
['R32_M01','R32_M02','R32_M03','R32_M04','R32_M05','R32_M06','R32_M07','R32_M08']
  .forEach((id, i) => add({ id, round: 'R32', side: 'L', order: i }));

/* R32 — right pathway (M09–M16) */
['R32_M09','R32_M10','R32_M11','R32_M12','R32_M13','R32_M14','R32_M15','R32_M16']
  .forEach((id, i) => add({ id, round: 'R32', side: 'R', order: i }));

/* R16 — left (pairs of R32_L) */
const R16_L_FEEDERS: [string, string][] = [
  ['R32_M01','R32_M02'], ['R32_M03','R32_M04'],
  ['R32_M05','R32_M06'], ['R32_M07','R32_M08'],
];
R16_L_FEEDERS.forEach(([a, b], i) =>
  add({ id: `R16_M0${i+1}`, round: 'R16', side: 'L', feeders: [a, b], order: i })
);

/* R16 — right (pairs of R32_R) */
const R16_R_FEEDERS: [string, string][] = [
  ['R32_M09','R32_M10'], ['R32_M11','R32_M12'],
  ['R32_M13','R32_M14'], ['R32_M15','R32_M16'],
];
R16_R_FEEDERS.forEach(([a, b], i) =>
  add({ id: `R16_M0${i+5}`, round: 'R16', side: 'R', feeders: [a, b], order: i })
);

/* QF — left */
add({ id: 'QF_M01', round: 'QF', side: 'L', feeders: ['R16_M01','R16_M02'], order: 0 });
add({ id: 'QF_M02', round: 'QF', side: 'L', feeders: ['R16_M03','R16_M04'], order: 1 });

/* QF — right */
add({ id: 'QF_M03', round: 'QF', side: 'R', feeders: ['R16_M05','R16_M06'], order: 0 });
add({ id: 'QF_M04', round: 'QF', side: 'R', feeders: ['R16_M07','R16_M08'], order: 1 });

/* SF */
add({ id: 'SF_M01', round: 'SF', side: 'L', feeders: ['QF_M01','QF_M02'], order: 0 });
add({ id: 'SF_M02', round: 'SF', side: 'R', feeders: ['QF_M03','QF_M04'], order: 0 });

/* Final + Bronze */
add({ id: 'FINAL_M01', round: 'FINAL', side: 'C', feeders: ['SF_M01','SF_M02'], order: 0 });
add({ id: 'THIRD_M01', round: 'THIRD', side: 'C', feeders: ['SF_M01','SF_M02'], losers: true, order: 0 });

export { MATCHES };

/* Round ID lists for the column layout */
export const R32_LEFT_IDS  = ['R32_M01','R32_M02','R32_M03','R32_M04','R32_M05','R32_M06','R32_M07','R32_M08'];
export const R32_RIGHT_IDS = ['R32_M09','R32_M10','R32_M11','R32_M12','R32_M13','R32_M14','R32_M15','R32_M16'];
export const R16_LEFT_IDS  = ['R16_M01','R16_M02','R16_M03','R16_M04'];
export const R16_RIGHT_IDS = ['R16_M05','R16_M06','R16_M07','R16_M08'];
export const QF_LEFT_IDS   = ['QF_M01','QF_M02'];
export const QF_RIGHT_IDS  = ['QF_M03','QF_M04'];

/* Downstream cascade map */
const DOWNSTREAM: Record<string, string[]> = {};
Object.values(MATCHES).forEach(m => {
  if (m.feeders) {
    m.feeders.forEach(fid => {
      if (!DOWNSTREAM[fid]) DOWNSTREAM[fid] = [];
      DOWNSTREAM[fid].push(m.id);
    });
  }
});

export function downstreamOf(id: string, acc: string[] = []): string[] {
  (DOWNSTREAM[id] || []).forEach(d => {
    if (!acc.includes(d)) { acc.push(d); downstreamOf(d, acc); }
  });
  return acc;
}

/* Placeholder labels for unresolved slots */
const RLABEL: Record<string, string> = { R32: 'R32', R16: 'R16', QF: 'QF', SF: 'SF', FINAL: 'Final', THIRD: 'Third' };

export function feederLabel(feederId: string, losers?: boolean): string {
  const m = MATCHES[feederId];
  if (!m) return 'TBD';
  const n = (m.order ?? 0) + 1;
  const side = m.side === 'L' ? 'L' : m.side === 'R' ? 'R' : '';
  return `${losers ? 'Loser' : 'Winner'} ${RLABEL[m.round]} ${side}${n}`;
}
