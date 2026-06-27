'use client';

import { useEffect, useState } from 'react';

interface LaunchData {
  openedAt: string | null;
  deadline: string | null;
  openedByName: string | null;
  // This user's own per-user playoff-access grant (Pick-Locks-style). When set
  // and in the future, the gate opens for them regardless of the global state.
  accessUntil: string | null;
}

const EMPTY: LaunchData = { openedAt: null, deadline: null, openedByName: null, accessUntil: null };

// Module-level cache so the launch state is fetched once and shared app-wide
// rather than refetched per page.
let _cache: LaunchData | null = null;
let _inflight: Promise<LaunchData> | null = null;

async function fetchLaunch(): Promise<LaunchData> {
  if (_cache) return _cache;
  if (!_inflight) {
    _inflight = fetch('/api/playoffs/launch-state', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : EMPTY))
      .then((d: LaunchData) => { _cache = d; return d; })
      .catch(() => EMPTY)
      .finally(() => { _inflight = null; });
  }
  return _inflight;
}

export interface PlayoffsLaunchState extends LaunchData {
  loading: boolean;
  isOpen: boolean;          // global open (openedAt+deadline) OR a live per-user grant
  isPastDeadline: boolean;  // global open AND now >= deadline (a per-user grant stays interactive)
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
  const accessUntil = data?.accessUntil ?? null;

  // A per-user grant (in the future) opens the gate AND keeps it interactive —
  // it's a deliberate "let this user in early" override, so it ignores the global
  // deadline lock. Otherwise fall back to the global open+deadline rules.
  const userAccess = !!accessUntil && new Date(accessUntil).getTime() > Date.now();
  const globalOpen = !!openedAt && !!deadline;
  const isOpen = userAccess || globalOpen;
  const isPastDeadline = userAccess
    ? false
    : globalOpen && deadline
      ? Date.now() >= new Date(deadline).getTime()
      : false;

  return {
    openedAt, deadline, openedByName: data?.openedByName ?? null, accessUntil,
    loading, isOpen, isPastDeadline,
    refresh: async () => { _cache = null; const d = await fetchLaunch(); setData(d); },
  };
}
