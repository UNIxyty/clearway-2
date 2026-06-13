'use client';

import { useState, useEffect, useMemo } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import type { PlayoffMatch, BracketTeam } from '@/lib/playoffs/types';

interface UsePlayoffMatchesResult {
  matches: PlayoffMatch[];
  matchesByCode: Record<string, PlayoffMatch>;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function usePlayoffMatches(): UsePlayoffMatchesResult {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [matches, setMatches] = useState<PlayoffMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    supabase
      .from('playoff_matches')
      .select(`
        *,
        homeTeam:pickem_teams!home_team_id(id, name, short_name, group_code, crest_url),
        awayTeam:pickem_teams!away_team_id(id, name, short_name, group_code, crest_url)
      `)
      .order('match_number')
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err) { setError(err.message); setLoading(false); return; }

        const parsed: PlayoffMatch[] = (data || []).map((row: Record<string, unknown>) => {
          const toTeam = (t: unknown): BracketTeam | null => {
            if (!t || typeof t !== 'object') return null;
            const obj = t as Record<string, unknown>;
            // infer flag from name — real data would have crest_url or flag stored
            return {
              id: obj.id as string,
              name: obj.name as string,
              shortName: (obj.short_name as string) || (obj.name as string),
              flag: '',
              groupCode: obj.group_code as string,
              crestUrl: (obj.crest_url as string | null) ?? null,
            };
          };
          return {
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
          };
        });

        setMatches(parsed);
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [supabase, tick]);

  const matchesByCode = useMemo(() =>
    Object.fromEntries(matches.map(m => [m.matchCode, m])),
  [matches]);

  return { matches, matchesByCode, loading, error, reload: () => setTick(t => t + 1) };
}
