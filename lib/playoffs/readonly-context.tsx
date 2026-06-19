'use client';

import { createContext, useContext } from 'react';

/**
 * Feature-level read-only flag for the playoffs bracket — true when a non-admin
 * views after the prediction deadline. Layered ON TOP of per-match is_locked
 * (it does not replace it). FullBracket reads this to disable all picking/scoring.
 */
const PlayoffsReadOnlyContext = createContext(false);

export function PlayoffsReadOnlyProvider({ value, children }: { value: boolean; children: React.ReactNode }) {
  return <PlayoffsReadOnlyContext.Provider value={value}>{children}</PlayoffsReadOnlyContext.Provider>;
}

export function usePlayoffsReadOnly(): boolean {
  return useContext(PlayoffsReadOnlyContext);
}
