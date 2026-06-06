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
