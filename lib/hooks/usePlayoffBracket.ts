'use client';

import { useMemo } from 'react';
import { usePlayoffMatches } from './usePlayoffMatches';
import { usePlayoffPredictions } from './usePlayoffPredictions';
import { MATCHES } from '@/lib/playoffs/bracketData';
import type { BracketTeam, PickMap } from '@/lib/playoffs/types';

export type { PlayoffMatch } from '@/lib/playoffs/types';
export type { PlayoffPrediction } from '@/lib/playoffs/types';

/**
 * Resolve which team sits in a given slot (home or away) of a bracket match,
 * given the current user picks and locked official results.
 */
export function teamInSlot(
  matchCode: string,
  side: 'home' | 'away',
  picks: PickMap,
  matchesByCode: Record<string, { homeTeam?: BracketTeam | null; awayTeam?: BracketTeam | null }>,
): BracketTeam | null {
  const def = MATCHES[matchCode];
  if (!def) return null;

  // R32 leaf: team comes from DB match row
  if (!def.feeders) {
    const dbMatch = matchesByCode[matchCode];
    return side === 'home' ? (dbMatch?.homeTeam ?? null) : (dbMatch?.awayTeam ?? null);
  }

  const feederCode = def.feeders[side === 'home' ? 0 : 1];

  if (def.losers) {
    return loserOf(feederCode, picks, matchesByCode);
  }
  return winnerOf(feederCode, picks, matchesByCode);
}

function winnerOf(
  matchCode: string,
  picks: PickMap,
  matchesByCode: Record<string, { homeTeam?: BracketTeam | null; awayTeam?: BracketTeam | null }>,
): BracketTeam | null {
  const pick = picks[matchCode];
  if (!pick) return null;
  return teamInSlot(matchCode, pick, picks, matchesByCode);
}

function loserOf(
  matchCode: string,
  picks: PickMap,
  matchesByCode: Record<string, { homeTeam?: BracketTeam | null; awayTeam?: BracketTeam | null }>,
): BracketTeam | null {
  const pick = picks[matchCode];
  if (!pick) return null;
  const other = pick === 'home' ? 'away' : 'home';
  return teamInSlot(matchCode, other, picks, matchesByCode);
}

export interface UsePlayoffBracketResult {
  matchesByCode: Record<string, import('@/lib/playoffs/types').PlayoffMatch>;
  predictionsByMatchId: Record<string, import('@/lib/playoffs/types').PlayoffPrediction>;
  picks: PickMap;
  loading: boolean;
  error: string | null;
  savePrediction: (matchId: string, winnerId: string | null, home: number | null, away: number | null) => Promise<void>;
  teamInSlotFn: (matchCode: string, side: 'home' | 'away', picks: PickMap) => BracketTeam | null;
}

export function usePlayoffBracket(): UsePlayoffBracketResult {
  const { matchesByCode, loading: mLoading, error: mError } = usePlayoffMatches();
  const { predictionsByMatchId, loading: pLoading, error: pError, savePrediction } = usePlayoffPredictions();

  /** Build the current pick map from saved predictions + official locked results */
  const picks = useMemo<PickMap>(() => {
    const out: PickMap = {};
    Object.values(matchesByCode).forEach(m => {
      // If match has a locked winner, treat that as the pick for downstream resolution
      if (m.winnerTeamId) {
        out[m.matchCode] = m.winnerTeamId === m.homeTeamId ? 'home' : 'away';
        return;
      }
      // Use user prediction
      const pred = predictionsByMatchId[m.id];
      if (pred?.predictedWinnerId) {
        out[m.matchCode] = pred.predictedWinnerId === m.homeTeamId ? 'home' : 'away';
      }
    });
    return out;
  }, [matchesByCode, predictionsByMatchId]);

  const teamInSlotFn = useMemo(() =>
    (matchCode: string, side: 'home' | 'away', p: PickMap) =>
      teamInSlot(matchCode, side, p, matchesByCode),
  [matchesByCode]);

  return {
    matchesByCode,
    predictionsByMatchId,
    picks,
    loading: mLoading || pLoading,
    error: mError || pError,
    savePrediction,
    teamInSlotFn,
  };
}
