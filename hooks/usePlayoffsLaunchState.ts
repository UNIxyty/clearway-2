'use client';
// Adapter: { playoffsOpenedAt, predictionsLocked } from the real launch-state hook.
import { usePlayoffsLaunchState as useReal } from '@/lib/hooks/usePlayoffsLaunchState';
export function usePlayoffsLaunchState(): { playoffsOpenedAt: string | null; predictionsLocked: boolean } {
  const s = useReal();
  return { playoffsOpenedAt: s.openedAt, predictionsLocked: s.isPastDeadline };
}
