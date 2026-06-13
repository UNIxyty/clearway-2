export type PlayoffRound = 'R32' | 'R16' | 'QF' | 'SF' | 'FINAL' | 'THIRD';
export type BracketSide = 'L' | 'R' | 'C';

export interface BracketTeam {
  id: string;
  name: string;
  shortName: string;
  flag: string;
  groupCode: string;
  crestUrl: string | null;
}

export interface PlayoffMatch {
  id: string;
  matchNumber: number;
  round: PlayoffRound;
  matchCode: string;
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeScore: number | null;
  awayScore: number | null;
  winnerTeamId: string | null;
  kickoffAt: string | null;
  venue: string | null;
  city: string | null;
  isLocked: boolean;
  createdAt: string;
  homeTeam?: BracketTeam | null;
  awayTeam?: BracketTeam | null;
}

export interface PlayoffPrediction {
  id: string;
  userId: string;
  matchId: string;
  predictedWinnerId: string | null;
  predictedHomeScore: number | null;
  predictedAwayScore: number | null;
  pointsAwarded: number;
  createdAt: string;
}

/** Keyed picks: matchCode → 'home' | 'away' */
export type PickMap = Record<string, 'home' | 'away'>;
/** Score map: matchCode → { home: string; away: string } */
export type ScoreMap = Record<string, { home: string; away: string }>;

export interface BracketMatchDef {
  id: string; // matches match_code in playoff_matches
  round: PlayoffRound;
  side: BracketSide;
  /** feeder match codes [home-feeder, away-feeder] — undefined for R32 leaf matches */
  feeders?: [string, string];
  /** true for bronze match (uses losers of SF feeders) */
  losers?: boolean;
  /** display order within the round */
  order: number;
}

export interface GroupDef {
  letter: string;
  accent: string;
  flags: string[];
}

export interface ResolvedPairing {
  matchCode: string;
  home: BracketTeam | null;           // actual team (admin-assigned)
  away: BracketTeam | null;
  predictedHome: BracketTeam | null;  // user's predicted team for this slot
  predictedAway: BracketTeam | null;
  homeQualifier: string;
  awayQualifier: string;
}

export interface R32Pairing {
  matchCode: string;
  home: string;  // qualifier like '1E', '2A', '3ABCDF'
  away: string;
}
