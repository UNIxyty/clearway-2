'use client';

import { useMemo } from 'react';
import { AdminRoute } from '@/components/AdminRoute';
import { FullBracket } from '@/components/playoffs/FullBracket';
import { usePlayoffBracket } from '@/lib/hooks/usePlayoffBracket';

/*
 * ADMIN-ONLY for now. Remove <AdminRoute> wrapper to open to all users.
 *
 * DATA SOURCE — IMPORTANT:
 * This page is the real playoff-prediction interface. Its ONLY valid source of
 * team data is the `playoff_matches` table as entered by an admin via Bracket
 * Setup (the official FIFA-published bracket). It must NEVER read from
 * computeGroupStandings / computeBestThird / R32_PAIRINGS or the group-derived
 * /api/pickem/predicted-r32 projection — that is the deliberately separate R32
 * Draw page system. When an R32 slot has no admin-entered team, the bracket
 * shows a "not set by admin" placeholder rather than guessing from group results.
 */
export default function FullBracketPage() {
  return (
    <AdminRoute>
      <FullBracketContent />
    </AdminRoute>
  );
}

function FullBracketContent() {
  const {
    matchesByCode, predictionsByMatchId, loading, error, savePrediction,
  } = usePlayoffBracket();

  const matches = useMemo(() => Object.values(matchesByCode), [matchesByCode]);
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
