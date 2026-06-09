import type { PickemGroup, PickemMatch, PickemMatchPrediction, PickemTeam } from "@/lib/pickem-shared";

export type PickemGroupTableRow = {
  teamId: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  points: number;
};

function compareRows(a: PickemGroupTableRow, b: PickemGroupTableRow, teamNameById: Map<string, string>): number {
  if (b.points !== a.points) return b.points - a.points;
  if (b.goalDiff !== a.goalDiff) return b.goalDiff - a.goalDiff;
  if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
  const nameA = teamNameById.get(a.teamId) || a.teamId;
  const nameB = teamNameById.get(b.teamId) || b.teamId;
  return nameA.localeCompare(nameB);
}

export function computePredictedGroupTable(input: {
  groupCode: string;
  groups: PickemGroup[];
  teams: PickemTeam[];
  matches: PickemMatch[];
  scoreByMatchId: Map<string, { home: number; away: number }>;
}): PickemGroupTableRow[] {
  const group = input.groups.find((item) => item.code === input.groupCode);
  if (!group) return [];

  const groupTeams = input.teams
    .filter((team) => team.groupCode === group.code)
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  const teamNameById = new Map(groupTeams.map((team) => [team.id, team.name]));
  const table = new Map<string, PickemGroupTableRow>();

  for (const team of groupTeams) {
    table.set(team.id, {
      teamId: team.id,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDiff: 0,
      points: 0,
    });
  }

  const groupMatches = input.matches.filter((match) => match.stage === "group" && match.groupCode === group.code);
  for (const match of groupMatches) {
    const score = input.scoreByMatchId.get(match.id);
    if (!score) continue;
    const home = table.get(match.homeTeamId);
    const away = table.get(match.awayTeamId);
    if (!home || !away) continue;

    home.played += 1;
    away.played += 1;
    home.goalsFor += score.home;
    home.goalsAgainst += score.away;
    away.goalsFor += score.away;
    away.goalsAgainst += score.home;

    if (score.home === score.away) {
      home.draws += 1;
      away.draws += 1;
      home.points += 1;
      away.points += 1;
    } else if (score.home > score.away) {
      home.wins += 1;
      away.losses += 1;
      home.points += 3;
    } else {
      away.wins += 1;
      home.losses += 1;
      away.points += 3;
    }
  }

  const rows = [...table.values()];
  for (const row of rows) {
    row.goalDiff = row.goalsFor - row.goalsAgainst;
  }
  rows.sort((a, b) => compareRows(a, b, teamNameById));
  return rows;
}

export function derivePredictedGroupPositions(input: {
  groups: PickemGroup[];
  teams: PickemTeam[];
  matches: PickemMatch[];
  matchPredictions: PickemMatchPrediction[];
}): Array<{ groupCode: string; teamId: string; predictedPosition: number }> {
  const scoreByMatchId = new Map<string, { home: number; away: number }>();
  for (const prediction of input.matchPredictions) {
    scoreByMatchId.set(prediction.matchId, {
      home: prediction.predictedHomeScore,
      away: prediction.predictedAwayScore,
    });
  }
  const rows: Array<{ groupCode: string; teamId: string; predictedPosition: number }> = [];
  for (const group of input.groups) {
    const table = computePredictedGroupTable({
      groupCode: group.code,
      groups: input.groups,
      teams: input.teams,
      matches: input.matches,
      scoreByMatchId,
    });
    table.forEach((row, idx) => {
      rows.push({
        groupCode: group.code,
        teamId: row.teamId,
        predictedPosition: idx + 1,
      });
    });
  }
  return rows;
}
