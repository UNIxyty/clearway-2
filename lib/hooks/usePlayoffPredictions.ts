'use client';

import { useState, useEffect, useMemo } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import type { PlayoffPrediction } from '@/lib/playoffs/types';

interface UsePlayoffPredictionsResult {
  predictions: PlayoffPrediction[];
  predictionsByMatchId: Record<string, PlayoffPrediction>;
  loading: boolean;
  error: string | null;
  savePrediction: (matchId: string, winnerId: string | null, homeScore: number | null, awayScore: number | null) => Promise<void>;
}

export function usePlayoffPredictions(): UsePlayoffPredictionsResult {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [predictions, setPredictions] = useState<PlayoffPrediction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  // Fetch current user ID once
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, [supabase]);

  // Re-fetch when tab becomes visible (admin may have scored a match)
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') setTick(t => t + 1);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  // Fetch predictions when userId is known
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setLoading(true);

    supabase
      .from('playoff_predictions')
      .select('*')
      .eq('user_id', userId)
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err) { setError(err.message); setLoading(false); return; }
        const parsed: PlayoffPrediction[] = (data || []).map((row: Record<string, unknown>) => ({
          id: row.id as string,
          userId: row.user_id as string,
          matchId: row.match_id as string,
          predictedWinnerId: row.predicted_winner_id as string | null,
          predictedHomeScore: row.predicted_home_score as number | null,
          predictedAwayScore: row.predicted_away_score as number | null,
          pointsAwarded: row.points_awarded as number,
          createdAt: row.created_at as string,
        }));
        setPredictions(parsed);
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [supabase, userId, tick]);

  const predictionsByMatchId = useMemo(() =>
    Object.fromEntries(predictions.map(p => [p.matchId, p])),
  [predictions]);

  async function savePrediction(
    matchId: string,
    winnerId: string | null,
    homeScore: number | null,
    awayScore: number | null,
  ): Promise<void> {
    if (!userId) return;

    // Optimistic update
    setPredictions(prev => {
      const existing = prev.find(p => p.matchId === matchId);
      if (existing) {
        return prev.map(p => p.matchId === matchId
          ? { ...p, predictedWinnerId: winnerId, predictedHomeScore: homeScore, predictedAwayScore: awayScore }
          : p);
      }
      return [...prev, {
        id: crypto.randomUUID(),
        userId,
        matchId,
        predictedWinnerId: winnerId,
        predictedHomeScore: homeScore,
        predictedAwayScore: awayScore,
        pointsAwarded: 0,
        createdAt: new Date().toISOString(),
      }];
    });

    const { error: err } = await supabase
      .from('playoff_predictions')
      .upsert({
        user_id: userId,
        match_id: matchId,
        predicted_winner_id: winnerId,
        predicted_home_score: homeScore,
        predicted_away_score: awayScore,
      }, { onConflict: 'user_id,match_id' });

    if (err) throw new Error(err.message);
  }

  return { predictions, predictionsByMatchId, loading, error, savePrediction };
}
