'use client';

import { R32ProjectionView } from '@/components/playoffs/R32ProjectionView';

/**
 * R32 Draw is now the per-user R32 Projection page. It reads ONLY the user's own
 * predictions + pickem_group_results + the ledger + tournament_state (via
 * /api/pickem/r32-projection) — it no longer reads playoff_matches (that is the
 * official Full Bracket system).
 *
 * Kept this filename + the `embedded` prop unchanged so the standalone route
 * (/playoffs/r32-draw) and the Playoffs tab shell both pick it up without edits.
 */
export function R32DrawView({ embedded = false }: { embedded?: boolean }) {
  return <R32ProjectionView embedded={embedded} />;
}
