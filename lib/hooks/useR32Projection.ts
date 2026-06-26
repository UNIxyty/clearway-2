'use client';

import { useEffect, useState } from 'react';
import type { R32ProjectionData } from '@/components/playoffs/r32projection/types';

export interface UseR32ProjectionResult {
  data: R32ProjectionData | null;
  loading: boolean;
  error: string | null;
}

/**
 * Per-user R32 Projection data. All computation (predictions → derived standings
 * → computeUserPredictedR32, group_results, tournament_state, ledger) happens in
 * the server route; this hook just fetches it. no-store so a freshly published
 * group result / confirmation shows on refresh.
 */
export function useR32Projection(): UseR32ProjectionResult {
  const [data, setData] = useState<R32ProjectionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch('/api/pickem/r32-projection', { cache: 'no-store' })
      .then(r => r.json())
      .then((d: R32ProjectionData & { error?: string }) => {
        if (cancelled) return;
        if (d.error) setError(d.error);
        else setData(d);
        setLoading(false);
      })
      .catch(e => { if (!cancelled) { setError(String(e)); setLoading(false); } });
    return () => { cancelled = true; };
  }, []);

  return { data, loading, error };
}
