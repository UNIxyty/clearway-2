'use client';

import { useEffect, useState } from 'react';

interface LaunchData {
  openedAt: string | null;
  deadline: string | null;
  openedByName: string | null;
}

// Module-level cache so the launch state is fetched once and shared app-wide
// rather than refetched per page.
let _cache: LaunchData | null = null;
let _inflight: Promise<LaunchData> | null = null;

async function fetchLaunch(): Promise<LaunchData> {
  if (_cache) return _cache;
  if (!_inflight) {
    _inflight = fetch('/api/playoffs/launch-state', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : { openedAt: null, deadline: null, openedByName: null }))
      .then((d: LaunchData) => { _cache = d; return d; })
      .catch(() => ({ openedAt: null, deadline: null, openedByName: null }))
      .finally(() => { _inflight = null; });
  }
  return _inflight;
}

export interface PlayoffsLaunchState extends LaunchData {
  loading: boolean;
  isOpen: boolean;          // both openedAt and deadline set
  isPastDeadline: boolean;  // open AND now >= deadline
  refresh: () => Promise<void>;
}

export function usePlayoffsLaunchState(): PlayoffsLaunchState {
  const [data, setData] = useState<LaunchData | null>(_cache);
  const [loading, setLoading] = useState(!_cache);

  useEffect(() => {
    let mounted = true;
    fetchLaunch().then(d => { if (mounted) { setData(d); setLoading(false); } });
    return () => { mounted = false; };
  }, []);

  const openedAt = data?.openedAt ?? null;
  const deadline = data?.deadline ?? null;
  const isOpen = !!openedAt && !!deadline;
  const isPastDeadline = isOpen && deadline ? Date.now() >= new Date(deadline).getTime() : false;

  return {
    openedAt, deadline, openedByName: data?.openedByName ?? null,
    loading, isOpen, isPastDeadline,
    refresh: async () => { _cache = null; const d = await fetchLaunch(); setData(d); },
  };
}
