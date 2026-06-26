/* Shared types for the R32 Projection page (per-user). teamId is the real
 * pickem_teams UUID throughout; countryCode is flagcdn alpha-2 for <FlagImage>. */
export interface ProjTeam {
  teamId: string;
  name: string;
  countryCode: string | null;
  emoji: string;
}
export interface GroupProjection {
  groupCode: string;
  teams: ProjTeam[];
}
export interface OfficialGroupResult {
  groupCode: string;
  qualifiedTeamIds: string[];
}
export interface R32Pairing {
  matchCode: string;
  home: string; // team id (or "tbd-…")
  away: string;
}
export interface GroupScore {
  groupCode: string;
  correct: number;
  total: number;
}
export type ScoringStatus = 'in_progress' | 'awaiting_confirmation' | 'scored';

export interface R32ProjectionData {
  userProjection: GroupProjection[];
  officialResults: OfficialGroupResult[] | null;
  r32Pairings: R32Pairing[] | null;
  perGroupScoring: GroupScore[];
  scoringStatus: ScoringStatus;
  totalR32Points: number;
  teamLookup: Record<string, ProjTeam>;
}

export type MatchupState = 'confirmed' | 'partial' | 'miss';
export type RowState = 'pending' | 'qualified' | 'out' | null;
