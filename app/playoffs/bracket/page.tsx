'use client';

import { AdminRoute } from '@/components/AdminRoute';
import { FullBracket } from '@/components/playoffs/FullBracket';
import { usePlayoffBracket } from '@/lib/hooks/usePlayoffBracket';

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

function FullBracketContent() {
  const {
    matchesByCode, predictionsByMatchId, loading, error, savePrediction,
  } = usePlayoffBracket();

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

  const matches = Object.values(matchesByCode);
  const predictions = Object.values(predictionsByMatchId);

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
