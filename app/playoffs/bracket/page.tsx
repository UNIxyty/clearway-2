'use client';

import { useEffect, useMemo, useState } from 'react';
import { AdminRoute } from '@/components/AdminRoute';
import { FullBracket } from '@/components/playoffs/FullBracket';
import { usePlayoffBracket } from '@/lib/hooks/usePlayoffBracket';
import type { BracketTeam, PlayoffMatch } from '@/lib/playoffs/types';

/*
 * ADMIN-ONLY for now.
 * Remove <AdminRoute> wrapper to open to all users.
 */
export default function FullBracketPage() {
  return (
    <AdminRoute>
      <FullBracketContent />
    </AdminRoute>
  );
}

interface PredictedPairing {
  matchCode: string;
  predictedHome: BracketTeam | null;
  predictedAway: BracketTeam | null;
}

function FullBracketContent() {
  const {
    matchesByCode, predictionsByMatchId, loading, error, savePrediction,
  } = usePlayoffBracket();

  // The user's predicted R32 qualifiers, derived from their group-stage picks.
  // Used to auto-fill R32 slots while the official bracket is still empty.
  const [predictedR32, setPredictedR32] = useState<PredictedPairing[]>([]);

  useEffect(() => {
    fetch('/api/pickem/predicted-r32', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => { if (d.pairings) setPredictedR32(d.pairings as PredictedPairing[]); })
      .catch(() => {});
  }, []);

  const predByCode = useMemo(
    () => Object.fromEntries(predictedR32.map(p => [p.matchCode, p])),
    [predictedR32],
  );

  // Merge the predicted qualifiers into R32 slots that have no official team yet.
  // Official teams (set by admin in Bracket Setup) always take precedence, so once
  // the real draw is published the bracket switches to the official matchups and
  // scoring compares the user's predicted winners against the real results.
  const matches = useMemo<PlayoffMatch[]>(() =>
    Object.values(matchesByCode).map(m => {
      if (m.round !== 'R32' || (m.homeTeamId && m.awayTeamId)) return m;
      const pred = predByCode[m.matchCode];
      if (!pred) return m;
      return {
        ...m,
        homeTeam: m.homeTeam ?? pred.predictedHome,
        awayTeam: m.awayTeam ?? pred.predictedAway,
        homeTeamId: m.homeTeamId ?? pred.predictedHome?.id ?? null,
        awayTeamId: m.awayTeamId ?? pred.predictedAway?.id ?? null,
      };
    }),
  [matchesByCode, predByCode]);

  const predictions = useMemo(() => Object.values(predictionsByMatchId), [predictionsByMatchId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-page flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-bk-blue/30 border-t-bk-blue animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-page flex items-center justify-center">
        <p className="text-red-600 font-semibold">{error}</p>
      </div>
    );
  }

  async function handleSavePrediction(
    matchId: string,
    winnerId: string | null,
    homeScore: number | null,
    awayScore: number | null,
  ) {
    await savePrediction(matchId, winnerId, homeScore, awayScore);
  }

  return (
    <FullBracket
      matches={matches}
      userPredictions={predictions}
      teams={[]}
      onSavePrediction={handleSavePrediction}
    />
  );
}
