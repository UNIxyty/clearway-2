'use client';

import { useMemo } from 'react';
import { FullBracket } from '@/components/playoffs/FullBracket';
import { usePlayoffBracket } from '@/lib/hooks/usePlayoffBracket';

/**
 * Data-wired Full Bracket. Reused by the standalone /playoffs/bracket page and the
 * Playoffs tab shell (pass embedded to hide the standalone navbar).
 *
 * DATA SOURCE: reads only playoff_matches (admin-entered) via usePlayoffBracket —
 * never the group-derived R32 projection (that is the separate R32 Draw system).
 */
export function FullBracketView({ embedded = false }: { embedded?: boolean }) {
  const { matchesByCode, predictionsByMatchId, loading, error, savePrediction } = usePlayoffBracket();

  const matches = useMemo(() => Object.values(matchesByCode), [matchesByCode]);
  const predictions = useMemo(() => Object.values(predictionsByMatchId), [predictionsByMatchId]);

  if (loading) {
    return (
      <div className={`${embedded ? 'min-h-[480px]' : 'min-h-screen'} bg-page flex items-center justify-center`}>
        <div className="w-8 h-8 rounded-full border-2 border-bk-blue/30 border-t-bk-blue animate-spin" />
      </div>
    );
  }
  if (error) {
    return (
      <div className={`${embedded ? 'min-h-[480px]' : 'min-h-screen'} bg-page flex items-center justify-center`}>
        <p className="text-red-600 font-semibold">{error}</p>
      </div>
    );
  }

  return (
    <FullBracket
      matches={matches}
      userPredictions={predictions}
      teams={[]}
      onSavePrediction={(matchId, winnerId, homeScore, awayScore) => savePrediction(matchId, winnerId, homeScore, awayScore)}
      embedded={embedded}
    />
  );
}
