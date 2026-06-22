'use client';
// Adapter: { made, total } for the picks-made progress pill.
import { usePlayoffPredictions as useRealPreds } from '@/lib/hooks/usePlayoffPredictions';
import { usePlayoffMatches as useRealMatches } from '@/lib/hooks/usePlayoffMatches';
export function usePlayoffPredictions(): { made: number; total: number } {
  const { predictions } = useRealPreds();
  const { matches } = useRealMatches();
  const made = predictions.filter(p => p.predictedWinnerId).length;
  const total = matches.filter(m => !m.isLocked).length;
  return { made, total };
}
