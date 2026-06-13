'use client';

import { useMemo } from 'react';
import { AdminRoute } from '@/components/AdminRoute';
import { R32DrawBracket } from '@/components/playoffs/R32DrawBracket';
import { R32_PAIRINGS } from '@/lib/playoffs/r32Bracket';
import { usePlayoffMatches } from '@/lib/hooks/usePlayoffMatches';
import { usePlayoffPredictions } from '@/lib/hooks/usePlayoffPredictions';
import { computeGroupStandings, computeBestThird, resolveQualifier } from '@/lib/playoffs/standings';
import type { ResolvedPairing, BracketTeam } from '@/lib/playoffs/types';

/*
 * This page is ADMIN-ONLY for now.
 * To open it to all users later, remove the <AdminRoute> wrapper.
 */
export default function R32DrawPage() {
  return (
    <AdminRoute>
      <R32DrawContent />
    </AdminRoute>
  );
}

function R32DrawContent() {
  const { matchesByCode, loading } = usePlayoffMatches();
  const { predictionsByMatchId } = usePlayoffPredictions();

  // For now, teams are sourced from playoff_matches (set by admin).
  // Later: compute from pickem group standings.
  const pairings = useMemo<ResolvedPairing[]>(() => {
    return R32_PAIRINGS.map(p => {
      const dbMatch = matchesByCode[p.matchCode];
      return {
        matchCode: p.matchCode,
        home: dbMatch?.homeTeam ?? null,
        away: dbMatch?.awayTeam ?? null,
        homeQualifier: p.home,
        awayQualifier: p.away,
      };
    });
  }, [matchesByCode]);

  // Group stage completeness — true if all R32 match slots have been filled by admin
  const isGroupStageComplete = pairings.every(p => p.home !== null && p.away !== null);

  // Check if user already has predictions for R32 matches
  const hasUserPredictions = R32_PAIRINGS.some(p => {
    const dbMatch = matchesByCode[p.matchCode];
    return dbMatch && predictionsByMatchId[dbMatch.id];
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-page flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-bk-blue/30 border-t-bk-blue animate-spin" />
      </div>
    );
  }

  return (
    <R32DrawBracket
      pairings={pairings}
      isGroupStageComplete={isGroupStageComplete}
      hasUserPredictions={hasUserPredictions}
    />
  );
}
