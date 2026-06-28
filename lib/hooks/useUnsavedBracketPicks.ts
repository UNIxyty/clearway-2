'use client';

/*
 * Draft persistence for the Full Bracket. Unsaved picks are kept in sessionStorage
 * (NOT localStorage — they should die when the tab closes) so they survive a
 * tab-switch within the Playoffs page (which unmounts the bracket and clears its
 * local state). This never touches Supabase; it sits between the user's edits and
 * the existing explicit save.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';

export interface DraftPick {
  matchId: string; // bracket slot key (matchCode, e.g. R32_M01)
  predictedWinnerId: string | null;
  predictedHomeScore: number | null;
  predictedAwayScore: number | null;
  timestamp: number; // Date.now() when created/updated
}

/** Last-saved values per slot, used only for the isDirty comparison. */
export interface SavedPick {
  predictedWinnerId: string | null;
  predictedHomeScore: number | null;
  predictedAwayScore: number | null;
}

export type DraftPickInput = Omit<DraftPick, 'matchId' | 'timestamp'> & { timestamp?: number };

const DAY_MS = 24 * 60 * 60 * 1000;
const keyFor = (competitionId: string) => `pickem_bracket_draft_${competitionId}`;

/** Read + prune (drop >24h old) the stored drafts. Never throws. */
function readDrafts(competitionId: string): Record<string, DraftPick> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.sessionStorage.getItem(keyFor(competitionId));
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const now = Date.now();
    const out: Record<string, DraftPick> = {};
    for (const [code, value] of Object.entries(parsed as Record<string, unknown>)) {
      const v = value as Partial<DraftPick> | null;
      if (v && typeof v === 'object' && typeof v.timestamp === 'number' && now - v.timestamp < DAY_MS) {
        out[code] = {
          matchId: code,
          predictedWinnerId: v.predictedWinnerId ?? null,
          predictedHomeScore: typeof v.predictedHomeScore === 'number' ? v.predictedHomeScore : null,
          predictedAwayScore: typeof v.predictedAwayScore === 'number' ? v.predictedAwayScore : null,
          timestamp: v.timestamp,
        };
      }
    }
    return out;
  } catch {
    return {};
  }
}

export interface UseUnsavedBracketPicksResult {
  draftPicks: Record<string, DraftPick>;
  setDraftPick: (matchId: string, pick: DraftPickInput) => void;
  clearDraftPick: (matchId: string) => void;
  clearAllDrafts: () => void;
  hasDraft: boolean;
  draftCount: number;
  isDirty: boolean;
  /** false until the first sessionStorage read completes (avoids restoring {}). */
  loaded: boolean;
}

export function useUnsavedBracketPicks(
  competitionId: string,
  savedPicks: Record<string, SavedPick> = {},
): UseUnsavedBracketPicksResult {
  const [draftPicks, setDraftPicks] = useState<Record<string, DraftPick>>({});
  const [loaded, setLoaded] = useState(false);

  // Read once on mount (and if the competition changes). Async so SSR/hydration
  // see the same empty initial state; the real drafts apply on the client.
  useEffect(() => {
    setDraftPicks(readDrafts(competitionId));
    setLoaded(true);
  }, [competitionId]);

  const persist = useCallback((next: Record<string, DraftPick>) => {
    if (typeof window === 'undefined') return;
    try {
      if (Object.keys(next).length === 0) window.sessionStorage.removeItem(keyFor(competitionId));
      else window.sessionStorage.setItem(keyFor(competitionId), JSON.stringify(next));
    } catch {
      /* storage full / disabled — drafts are best-effort */
    }
  }, [competitionId]);

  const setDraftPick = useCallback((matchId: string, pick: DraftPickInput) => {
    setDraftPicks(prev => {
      const next: Record<string, DraftPick> = {
        ...prev,
        [matchId]: {
          matchId,
          predictedWinnerId: pick.predictedWinnerId,
          predictedHomeScore: pick.predictedHomeScore,
          predictedAwayScore: pick.predictedAwayScore,
          timestamp: pick.timestamp ?? Date.now(),
        },
      };
      persist(next);
      return next;
    });
  }, [persist]);

  const clearDraftPick = useCallback((matchId: string) => {
    setDraftPicks(prev => {
      if (!(matchId in prev)) return prev;
      const next = { ...prev };
      delete next[matchId];
      persist(next);
      return next;
    });
  }, [persist]);

  const clearAllDrafts = useCallback(() => {
    setDraftPicks({});
    if (typeof window !== 'undefined') {
      try { window.sessionStorage.removeItem(keyFor(competitionId)); } catch { /* ignore */ }
    }
  }, [competitionId]);

  const draftCount = Object.keys(draftPicks).length;
  const hasDraft = draftCount > 0;

  const isDirty = useMemo(() => {
    for (const [code, d] of Object.entries(draftPicks)) {
      const s = savedPicks[code];
      if (!s) {
        if (d.predictedWinnerId !== null) return true;
        continue;
      }
      if (
        d.predictedWinnerId !== s.predictedWinnerId ||
        d.predictedHomeScore !== s.predictedHomeScore ||
        d.predictedAwayScore !== s.predictedAwayScore
      ) {
        return true;
      }
    }
    return false;
  }, [draftPicks, savedPicks]);

  return { draftPicks, setDraftPick, clearDraftPick, clearAllDrafts, hasDraft, draftCount, isDirty, loaded };
}
