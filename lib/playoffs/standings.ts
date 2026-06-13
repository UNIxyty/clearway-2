import type { BracketTeam } from './types';
export type { BracketTeam };

export interface GroupMatch {
  id: string;
  groupCode: string;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number | null;
  awayScore: number | null;
  status: string;
}

export interface StandingRow {
  team: BracketTeam;
  groupCode: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  position: number;
}

function compareStandings(a: StandingRow, b: StandingRow, h2h?: Map<string, { gf: number; ga: number }>): number {
  if (b.points !== a.points) return b.points - a.points;
  if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
  if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
  // Head-to-head
  if (h2h) {
    const key = `${a.team.id}:${b.team.id}`;
    const rev = `${b.team.id}:${a.team.id}`;
    const ab = h2h.get(key);
    const ba = h2h.get(rev);
    if (ab && ba) {
      const aPts = ab.gf > ab.ga ? 3 : ab.gf === ab.ga ? 1 : 0;
      const bPts = ba.gf > ba.ga ? 3 : ba.gf === ba.ga ? 1 : 0;
      if (bPts !== aPts) return bPts - aPts;
      if ((ab.gf - ab.ga) !== (ba.gf - ba.ga)) return (ba.gf - ba.ga) - (ab.gf - ab.ga);
    }
  }
  return a.team.name.localeCompare(b.team.name);
}

/**
 * Compute final standings for one group from finished matches.
 * FIFA WC rules: pts → GD → GF → H2H → alphabet.
 */
export function computeGroupStandings(
  matches: GroupMatch[],
  teams: BracketTeam[],
  groupCode: string
): StandingRow[] {
  const groupMatches = matches.filter(m => m.groupCode === groupCode && m.homeScore !== null && m.awayScore !== null);
  const groupTeams = teams.filter(t => t.groupCode === groupCode);

  const rows = new Map<string, StandingRow>();
  groupTeams.forEach(t => {
    rows.set(t.id, {
      team: t, groupCode, played: 0, won: 0, drawn: 0, lost: 0,
      goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0, position: 0,
    });
  });

  // Head-to-head: teamA:teamB → { gf, ga } from A's perspective
  const h2h = new Map<string, { gf: number; ga: number }>();

  groupMatches.forEach(m => {
    const hs = m.homeScore!;
    const as_ = m.awayScore!;
    const home = rows.get(m.homeTeamId);
    const away = rows.get(m.awayTeamId);
    if (!home || !away) return;

    home.played++; home.goalsFor += hs; home.goalsAgainst += as_;
    away.played++; away.goalsFor += as_; away.goalsAgainst += hs;

    if (hs > as_) { home.won++; home.points += 3; away.lost++; }
    else if (hs === as_) { home.drawn++; home.points++; away.drawn++; away.points++; }
    else { away.won++; away.points += 3; home.lost++; }

    h2h.set(`${m.homeTeamId}:${m.awayTeamId}`, { gf: hs, ga: as_ });
    h2h.set(`${m.awayTeamId}:${m.homeTeamId}`, { gf: as_, ga: hs });
  });

  rows.forEach(r => { r.goalDifference = r.goalsFor - r.goalsAgainst; });

  const sorted = Array.from(rows.values()).sort((a, b) => compareStandings(a, b, h2h));
  sorted.forEach((r, i) => { r.position = i + 1; });
  return sorted;
}

/**
 * Determine the 8 best third-place teams across all 12 groups.
 * Tiebreaker: pts → GD → GF → alphabet.
 */
export function computeBestThird(allStandings: Map<string, StandingRow[]>): StandingRow[] {
  const thirds: StandingRow[] = [];
  allStandings.forEach(rows => {
    const third = rows.find(r => r.position === 3);
    if (third) thirds.push(third);
  });
  return thirds
    .sort((a, b) => compareStandings(a, b))
    .slice(0, 8);
}

/**
 * Resolve a qualifier code to a team from computed standings.
 * e.g. '1A' → 1st-place team of Group A
 *      '3ABCDF' → best 3rd from groups A,B,C,D,F
 */
export function resolveQualifier(
  qualifier: string,
  allStandings: Map<string, StandingRow[]>,
  bestThirds: StandingRow[],
): BracketTeam | null {
  if (qualifier.startsWith('3')) {
    // best-third slot; which third actually goes here depends on FIFA draw rules
    // for now return the highest-ranking available third not yet assigned
    const groups = qualifier.slice(1).split('');
    const eligible = bestThirds.filter(r => groups.includes(r.groupCode));
    return eligible[0]?.team ?? null;
  }
  const pos = parseInt(qualifier[0], 10);
  const group = qualifier.slice(1);
  const rows = allStandings.get(group);
  if (!rows) return null;
  return rows.find(r => r.position === pos)?.team ?? null;
}
