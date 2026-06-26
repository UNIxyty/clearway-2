'use client';

/* Provides the per-user lookups the design components used as globals in the
 * standalone export (TEAM_BY_ID / officialByGroup / ADVANCED / groupScore /
 * matchupStatus). Built once in R32ProjectionView from the hook data, so the
 * component JSX is unchanged — only the data source moves to context. */
import { createContext, useContext } from 'react';
import type { ProjTeam, MatchupState } from './types';

export interface R32Ctx {
  teamById: Record<string, ProjTeam>;
  officialByGroup: Record<string, string[]>;
  advanced: Set<string>;
  scoreByGroup: Record<string, number>;
}

const Ctx = createContext<R32Ctx | null>(null);
export const R32Provider = Ctx.Provider;

export function useR32(): R32Ctx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useR32 must be used inside R32Provider');
  return c;
}

/** did this teamId actually qualify from its own group's top 2? */
export function qualifiedTop2(ctx: R32Ctx, teamId: string, groupCode: string): boolean {
  const q = ctx.officialByGroup[groupCode];
  return !!q && q.indexOf(teamId) !== -1;
}

/** both advanced -> 'confirmed', one -> 'partial', none -> 'miss' */
export function matchupStatus(ctx: R32Ctx, home: string, away: string): MatchupState {
  const a = ctx.advanced.has(home), b = ctx.advanced.has(away);
  if (a && b) return 'confirmed';
  if (a || b) return 'partial';
  return 'miss';
}
