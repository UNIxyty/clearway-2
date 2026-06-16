/*
 * SCOPE — READ BEFORE USING:
 * computeGroupStandings / computeBestThird / resolveR32Pairings / resolveQualifier
 * are used EXCLUSIVELY for scoring/displaying the user's group-stage-derived R32
 * projection on the R32 Draw page (/playoffs/r32-draw) and in the Group Stage
 * Complete email, plus the admin-side "populate from group results" convenience
 * tools that an admin explicitly triggers to pre-fill playoff_matches.
 *
 * They must NEVER be used as a runtime data source for the actual Full Bracket /
 * playoff_matches system, which is populated solely by admin input reflecting the
 * real FIFA-published bracket. The Full Bracket and the Bracket Confirmation /
 * Prediction Update emails read only from playoff_matches + playoff_predictions
 * (via lib/playoffs/resolveBracketServer.ts), never from group computation.
 */
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
 *
 * NOTE: for best-third ('3…') slots this resolves each slot in isolation and so
 * can return the SAME third-place team for multiple slots. Use
 * {@link resolveR32Pairings} to resolve a whole bracket with unique third-place
 * assignment. This single-slot helper is kept for non-third qualifiers.
 */
export function resolveQualifier(
  qualifier: string,
  allStandings: Map<string, StandingRow[]>,
  bestThirds: StandingRow[],
): BracketTeam | null {
  if (qualifier.startsWith('3')) {
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

export interface R32Slot {
  matchCode: string;
  home: string; // qualifier code, e.g. '1E' or '3ABCDF'
  away: string;
}

export interface ResolvedR32 {
  matchCode: string;
  home: BracketTeam | null;
  away: BracketTeam | null;
}

/**
 * Assign best-third teams to best-third slots so that each qualifying third-place
 * team fills exactly one slot, respecting each slot's eligible group set. Uses
 * backtracking over the (at most 8×8) slot/third space, trying higher-ranked
 * thirds first for a deterministic result. Returns a map keyed `${matchCode}:${side}`.
 */
function assignBestThirds(
  thirdSlots: Array<{ key: string; groups: string[] }>,
  bestThirds: StandingRow[],
): Map<string, BracketTeam> {
  const result = new Map<string, BracketTeam>();
  const used = new Set<string>();

  // Constrain search order to the most-restricted slots first (fewest eligible
  // available thirds) to make backtracking find a complete matching quickly.
  const order = [...thirdSlots.keys()].sort((a, b) => {
    const ea = bestThirds.filter(t => thirdSlots[a].groups.includes(t.groupCode)).length;
    const eb = bestThirds.filter(t => thirdSlots[b].groups.includes(t.groupCode)).length;
    return ea - eb;
  });

  const backtrack = (i: number): boolean => {
    if (i === order.length) return true;
    const slot = thirdSlots[order[i]];
    for (const third of bestThirds) {
      if (used.has(third.team.id)) continue;
      if (!slot.groups.includes(third.groupCode)) continue;
      used.add(third.team.id);
      result.set(slot.key, third.team);
      if (backtrack(i + 1)) return true;
      used.delete(third.team.id);
      result.delete(slot.key);
    }
    // Allow leaving a slot unfilled when no complete matching exists yet (e.g.
    // group stage not finished) rather than aborting the whole assignment.
    return backtrack(i + 1);
  };
  backtrack(0);
  return result;
}

/**
 * Resolve a full R32 pairing list to concrete teams, assigning best-third slots
 * uniquely so no third-place team appears in more than one match.
 */
export function resolveR32Pairings(
  pairings: ReadonlyArray<R32Slot>,
  allStandings: Map<string, StandingRow[]>,
  bestThirds: StandingRow[],
): ResolvedR32[] {
  const thirdSlots: Array<{ key: string; groups: string[] }> = [];
  for (const p of pairings) {
    (['home', 'away'] as const).forEach(side => {
      const q = p[side];
      if (q.startsWith('3')) {
        thirdSlots.push({ key: `${p.matchCode}:${side}`, groups: q.slice(1).split('') });
      }
    });
  }
  const thirdAssign = assignBestThirds(thirdSlots, bestThirds);

  const resolveSide = (matchCode: string, side: 'home' | 'away', q: string): BracketTeam | null => {
    if (q.startsWith('3')) return thirdAssign.get(`${matchCode}:${side}`) ?? null;
    const pos = parseInt(q[0], 10);
    const rows = allStandings.get(q.slice(1));
    return rows?.find(r => r.position === pos)?.team ?? null;
  };

  return pairings.map(p => ({
    matchCode: p.matchCode,
    home: resolveSide(p.matchCode, 'home', p.home),
    away: resolveSide(p.matchCode, 'away', p.away),
  }));
}
