export type PickemStage = "group" | "knockout";

export type PickemCompetition = {
  id: string;
  slug: string;
  name: string;
  startsAt: string;
  groupLockAt: string;
  createdAt: string;
};

export type PickemGroup = {
  id: string;
  competitionId: string;
  code: string;
  name: string;
};

export type PickemTeam = {
  id: string;
  competitionId: string;
  groupCode: string;
  fifaTeamId: string | null;
  name: string;
  shortName: string;
  crestUrl: string | null;
  sortOrder: number;
};

export type PickemMatch = {
  id: string;
  competitionId: string;
  apiMatchId: string | null;
  stage: PickemStage;
  roundLabel: string | null;
  groupCode: string | null;
  homeTeamId: string;
  awayTeamId: string;
  kickoffAt: string;
  venue: string | null;
  homeScore: number | null;
  awayScore: number | null;
  status: string;
  updatedAt: string;
};

export type PickemGroupPrediction = {
  userId: string;
  competitionId: string;
  groupCode: string;
  teamId: string;
  predictedPosition: number;
};

export type PickemMatchPrediction = {
  userId: string;
  competitionId: string;
  matchId: string;
  predictedHomeScore: number;
  predictedAwayScore: number;
  predictedOutcome: "home" | "away" | "draw";
};

export type PickemSubmission = {
  userId: string;
  competitionId: string;
  submittedAt: string;
};

export type PickemLeaderboardRow = {
  userId: string;
  displayName: string;
  email: string | null;
  groupPoints: number;
  matchPoints: number;
  exactPoints: number;
  points: number;
  rank: number;
};

export const PICKEM_POINTS = {
  GROUP_POSITION: 2,
  MATCH_OUTCOME: 1,
  MATCH_SCORE: 3,
} as const;
