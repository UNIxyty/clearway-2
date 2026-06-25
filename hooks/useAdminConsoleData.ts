'use client';
// Shared, module-cached fetch of /api/admin/console powering the admin hooks.
import { useEffect, useState } from 'react';
import type { TournamentState, AdminStats } from '@/types/admin';

export interface AdminConsoleData {
  profile: { name: string; initials: string };
  state: TournamentState;
  stats: AdminStats;
  assignedSlots: number;
}

const DEFAULTS: AdminConsoleData = {
  profile: { name: 'Admin', initials: 'A' },
  state: { groupStageComplete: false, r32ConfirmedAt: null, playoffsOpenedAt: null, playoffsDeadlineAt: null, finalEmailSentAt: null },
  stats: { participants: 0, groupMatchesPredicted: 0, playoffPredictionsMade: 0, emailsSent: 0, emailOptOuts: 0, groupsFinalized: 0 },
  assignedSlots: 0,
};

let _cache: AdminConsoleData | null = null;
let _inflight: Promise<AdminConsoleData> | null = null;

function fetchConsole(): Promise<AdminConsoleData> {
  if (_cache) return Promise.resolve(_cache);
  if (!_inflight) {
    _inflight = fetch('/api/admin/console', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : DEFAULTS))
      .then((d: AdminConsoleData) => { _cache = d; return d; })
      .catch(() => DEFAULTS)
      .finally(() => { _inflight = null; });
  }
  return _inflight;
}

export function useAdminConsoleData(): AdminConsoleData {
  const [data, setData] = useState<AdminConsoleData>(_cache ?? DEFAULTS);
  useEffect(() => {
    let mounted = true;
    fetchConsole().then(d => { if (mounted) setData(d); });
    return () => { mounted = false; };
  }, []);
  return data;
}
