'use client';

import { useMemo, useEffect, useState } from 'react';
import { R32DrawBracket } from '@/components/playoffs/R32DrawBracket';
import { R32_PAIRINGS } from '@/lib/playoffs/r32Bracket';
import { usePlayoffMatches } from '@/lib/hooks/usePlayoffMatches';
import { usePlayoffPredictions } from '@/lib/hooks/usePlayoffPredictions';
import type { ResolvedPairing, BracketTeam } from '@/lib/playoffs/types';

interface PredictedPairing {
  matchCode: string;
  predictedHome: BracketTeam | null;
  predictedAway: BracketTeam | null;
}

/** Data-wired R32 Draw. Reused by the standalone page and the Playoffs tab shell. */
export function R32DrawView({ embedded = false }: { embedded?: boolean }) {
  const { matchesByCode, loading: matchesLoading } = usePlayoffMatches();
  const { predictionsByMatchId } = usePlayoffPredictions();
  const [predictedPairings, setPredictedPairings] = useState<PredictedPairing[]>([]);

  useEffect(() => {
    fetch('/api/pickem/predicted-r32')
      .then(r => r.json())
      .then(data => { if (data.pairings) setPredictedPairings(data.pairings as PredictedPairing[]); })
      .catch(() => {});
  }, []);

  const predictedByCode = useMemo(() =>
    Object.fromEntries(predictedPairings.map(p => [p.matchCode, p])),
  [predictedPairings]);

  const pairings = useMemo<ResolvedPairing[]>(() =>
    R32_PAIRINGS.map(p => {
      const dbMatch = matchesByCode[p.matchCode];
      const pred = predictedByCode[p.matchCode];
      return {
        matchCode: p.matchCode,
        home: dbMatch?.homeTeam ?? null,
        away: dbMatch?.awayTeam ?? null,
        predictedHome: pred?.predictedHome ?? null,
        predictedAway: pred?.predictedAway ?? null,
        homeQualifier: p.home,
        awayQualifier: p.away,
      };
    }),
  [matchesByCode, predictedByCode]);

  const isGroupStageComplete = pairings.every(p => p.home !== null && p.away !== null);
  const hasUserPredictions = R32_PAIRINGS.some(p => {
    const dbMatch = matchesByCode[p.matchCode];
    return dbMatch && predictionsByMatchId[dbMatch.id];
  });

  if (matchesLoading) {
    return (
      <div className={`${embedded ? 'min-h-[480px]' : 'min-h-screen'} bg-page flex items-center justify-center`}>
        <div className="w-8 h-8 rounded-full border-2 border-bk-blue/30 border-t-bk-blue animate-spin" />
      </div>
    );
  }

  return (
    <R32DrawBracket
      pairings={pairings}
      isGroupStageComplete={isGroupStageComplete}
      hasUserPredictions={hasUserPredictions}
      embedded={embedded}
    />
  );
}
