import { MATCHES } from './bracketData';

/**
 * Server-side bracket resolution.
 *
 * The DB stores `home_team_id` / `away_team_id` only for R32 matches. For every
 * later round those columns stay null until the real match is played, so the
 * teams in each slot must be derived from the user's own predictions by walking
 * the bracket feeder graph. `predicted_winner_id` is always a real team id, which
 * makes this resolution reliable regardless of round.
 */

export interface ServerTeam {
  id: string;
  name: string;
  flag: string;
}

export interface ServerMatch {
  id: string;
  matchCode: string;
  round: string;
  matchNumber: number | null;
  homeTeamId: string | null;
  awayTeamId: string | null;
}

export interface ServerPrediction {
  predictedWinnerId: string | null;
  predictedHomeScore: number | null;
  predictedAwayScore: number | null;
}

export interface ResolveContext {
  matchesByCode: Record<string, ServerMatch>;
  /** keyed by match id */
  predsByMatchId: Map<string, ServerPrediction>;
  teamsById: Map<string, ServerTeam>;
}

/**
 * Resolve which team occupies a given slot (home/away) of a bracket match,
 * using the user's predictions to walk upstream feeders. Returns null when the
 * upstream pick that would fill the slot has not been made.
 */
export function resolveSlotServer(
  matchCode: string,
  side: 'home' | 'away',
  ctx: ResolveContext,
): ServerTeam | null {
  const def = MATCHES[matchCode];
  if (!def) return null;

  // R32 leaf — teams are fixed in the DB
  if (!def.feeders) {
    const m = ctx.matchesByCode[matchCode];
    const tid = side === 'home' ? m?.homeTeamId : m?.awayTeamId;
    return tid ? (ctx.teamsById.get(tid) ?? null) : null;
  }

  const feederCode = def.feeders[side === 'home' ? 0 : 1];
  const feederMatch = ctx.matchesByCode[feederCode];
  if (!feederMatch) return null;
  const pred = ctx.predsByMatchId.get(feederMatch.id);
  if (!pred?.predictedWinnerId) return null;

  if (def.losers) {
    // 3rd-place match: each slot is the LOSER of the feeder semi-final
    const fHome = resolveSlotServer(feederCode, 'home', ctx);
    const fAway = resolveSlotServer(feederCode, 'away', ctx);
    return fHome?.id === pred.predictedWinnerId ? fAway : fHome;
  }

  return ctx.teamsById.get(pred.predictedWinnerId) ?? null;
}

/** Resolve the predicted winner team for a match code. */
export function resolveWinnerServer(matchCode: string, ctx: ResolveContext): ServerTeam | null {
  const m = ctx.matchesByCode[matchCode];
  if (!m) return null;
  const pred = ctx.predsByMatchId.get(m.id);
  if (!pred?.predictedWinnerId) return null;
  return ctx.teamsById.get(pred.predictedWinnerId) ?? null;
}
