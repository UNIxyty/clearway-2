import type { PickemCompetition, PickemMatch } from "@/lib/pickem-shared";

export function isGroupPredictionsLocked(competition: PickemCompetition): boolean {
  const lockTs = new Date(competition.groupLockAt).getTime();
  if (!Number.isFinite(lockTs)) return false;
  return Date.now() >= lockTs;
}

export function isMatchPredictionLocked(match: PickemMatch): boolean {
  const kickoffTs = new Date(match.kickoffAt).getTime();
  if (!Number.isFinite(kickoffTs)) return false;
  return Date.now() >= kickoffTs;
}

export function getFirstGroupKickoffTs(matches: PickemMatch[]): number | null {
  const groupKickoffTimes = matches
    .filter((match) => match.stage === "group")
    .map((match) => new Date(match.kickoffAt).getTime())
    .filter((ts) => Number.isFinite(ts));
  if (!groupKickoffTimes.length) return null;
  return Math.min(...groupKickoffTimes);
}

export function isAllPicksLockedAfterFirstKickoff(matches: PickemMatch[]): boolean {
  const firstKickoffTs = getFirstGroupKickoffTs(matches);
  if (firstKickoffTs === null) return false;
  return Date.now() >= firstKickoffTs;
}
