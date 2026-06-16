'use client';

import { useState, useEffect, useMemo } from 'react';
import type { PlayoffMatch, BracketTeam } from '@/lib/playoffs/types';

const FLAG_BY_CODE: Record<string, string> = {
  MEX:'🇲🇽', RSA:'🇿🇦', KOR:'🇰🇷', CZE:'🇨🇿', CAN:'🇨🇦', BIH:'🇧🇦', QAT:'🇶🇦', SUI:'🇨🇭',
  BRA:'🇧🇷', MAR:'🇲🇦', HAI:'🇭🇹', SCO:'🏴󠁧󠁢󠁳󠁣󠁴󠁿', USA:'🇺🇸', PAR:'🇵🇾', AUS:'🇦🇺', TUR:'🇹🇷',
  GER:'🇩🇪', CUW:'🇨🇼', CIV:'🇨🇮', ECU:'🇪🇨', NED:'🇳🇱', JPN:'🇯🇵', SWE:'🇸🇪', TUN:'🇹🇳',
  BEL:'🇧🇪', EGY:'🇪🇬', IRN:'🇮🇷', NZL:'🇳🇿', ESP:'🇪🇸', CPV:'🇨🇻', KSA:'🇸🇦', URU:'🇺🇾',
  FRA:'🇫🇷', SEN:'🇸🇳', IRQ:'🇮🇶', NOR:'🇳🇴', ARG:'🇦🇷', ALG:'🇩🇿', AUT:'🇦🇹', JOR:'🇯🇴',
  POR:'🇵🇹', COD:'🇨🇩', UZB:'🇺🇿', COL:'🇨🇴', ENG:'🏴󠁧󠁢󠁥󠁮󠁧󠁿', CRO:'🇭🇷', GHA:'🇬🇭', PAN:'🇵🇦',
};

function toTeam(t: unknown): BracketTeam | null {
  if (!t || typeof t !== 'object') return null;
  const obj = t as Record<string, unknown>;
  const shortName = (obj.short_name as string) || (obj.name as string);
  return {
    id: obj.id as string,
    name: obj.name as string,
    shortName,
    flag: (obj.flag_emoji as string | null) || FLAG_BY_CODE[shortName] || '',
    groupCode: obj.group_code as string,
    crestUrl: (obj.crest_url as string | null) ?? null,
  };
}

interface UsePlayoffMatchesResult {
  matches: PlayoffMatch[];
  matchesByCode: Record<string, PlayoffMatch>;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function usePlayoffMatches(): UsePlayoffMatchesResult {
  const [matches, setMatches] = useState<PlayoffMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  // Re-fetch when the user switches back to this tab (admin may have published results)
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') setTick(t => t + 1);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch('/api/playoffs/matches')
      .then(r => r.json())
      .then(({ matches: rows, error: err }: { matches?: Record<string, unknown>[]; error?: string }) => {
        if (cancelled) return;
        if (err) { setError(err); setLoading(false); return; }

        const parsed: PlayoffMatch[] = (rows || []).map((row) => ({
          id: row.id as string,
          matchNumber: row.match_number as number,
          round: row.round as PlayoffMatch['round'],
          matchCode: row.match_code as string,
          homeTeamId: row.home_team_id as string | null,
          awayTeamId: row.away_team_id as string | null,
          homeScore: row.home_score as number | null,
          awayScore: row.away_score as number | null,
          winnerTeamId: row.winner_team_id as string | null,
          kickoffAt: row.kickoff_at as string | null,
          venue: row.venue as string | null,
          city: row.city as string | null,
          isLocked: row.is_locked as boolean,
          createdAt: row.created_at as string,
          homeTeam: toTeam(row.homeTeam),
          awayTeam: toTeam(row.awayTeam),
        }));

        setMatches(parsed);
        setLoading(false);
      })
      .catch(e => {
        if (!cancelled) { setError(String(e)); setLoading(false); }
      });

    return () => { cancelled = true; };
  }, [tick]);

  const matchesByCode = useMemo(() =>
    Object.fromEntries(matches.map(m => [m.matchCode, m])),
  [matches]);

  return { matches, matchesByCode, loading, error, reload: () => setTick(t => t + 1) };
}
