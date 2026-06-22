'use client';
// Adapter: { matches: {round, isResolved}[] } — isResolved = both teams assigned.
import { usePlayoffMatches as useReal } from '@/lib/hooks/usePlayoffMatches';
export function usePlayoffMatches(): { matches: { round: string; isResolved: boolean }[] } {
  const { matches } = useReal();
  return { matches: matches.map(m => ({ round: m.round, isResolved: !!(m.homeTeamId && m.awayTeamId) })) };
}
