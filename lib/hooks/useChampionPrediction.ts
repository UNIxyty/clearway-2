'use client';

import { useCallback, useEffect, useState } from 'react';

export interface ChampionTeam {
  id: string;
  name: string;
  shortName: string;
}

export interface ChampionData {
  competitionId: string;
  teams: ChampionTeam[];
  prediction: { predictedTeamId: string | null; pointsAwarded: number } | null;
  deadline: string | null;
  isLocked: boolean;
  finalPlayed: boolean;
  championTeamId: string | null;
}

export interface UseChampionPredictionResult {
  data: ChampionData | null;
  loading: boolean;
  error: string | null;
  saving: boolean;
  isLocked: boolean;
  savePrediction: (teamId: string) => Promise<void>;
  refresh: () => Promise<void>;
}

/**
 * World Champion prediction for the current user. All state (teams, the pick,
 * lock + final result) comes from /api/pickem/champion so the 4 UI states can be
 * derived without piecing together client-side reads.
 */
export function useChampionPrediction(): UseChampionPredictionResult {
  const [data, setData] = useState<ChampionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/pickem/champion', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? 'Failed to load champion prediction.'); return; }
      setData(json as ChampionData);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load champion prediction.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const savePrediction = useCallback(async (teamId: string) => {
    setSaving(true);
    try {
      const res = await fetch('/api/pickem/champion', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Save failed');
      await refresh();
    } finally {
      setSaving(false);
    }
  }, [refresh]);

  return {
    data, loading, error, saving,
    isLocked: data?.isLocked ?? false,
    savePrediction, refresh,
  };
}
