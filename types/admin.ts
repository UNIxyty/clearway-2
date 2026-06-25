/* =============================================================================
 * INTEGRATION MAPPING (design export → real app) — read before wiring.
 *
 * STACK NOTE: the brief says "React + Vite + React Router v6" but this app is
 * NEXT.JS (App Router, file-based routing). So: adminRedirects.tsx (react-router
 * <Navigate>) is NOT portable — redirects become Next redirect() pages; the
 * shells' ?param= sync uses window.history (already framework-agnostic in the
 * export, so it ports fine). @/* maps to repo root, so @/types, @/hooks,
 * @/components all resolve at root-level dirs.
 *
 * HOOK MAPPING:
 *   useIsAdmin()            assumed: boolean
 *       real: lib/hooks/useIsAdmin → { isAdmin, loading }  → ADAPTER (hooks/useIsAdmin.ts)
 *   usePlayoffsLaunchState() assumed: { playoffsOpenedAt, predictionsLocked }
 *       real: lib/hooks/usePlayoffsLaunchState → { openedAt, deadline, isOpen,
 *             isPastDeadline, ... } → ADAPTER (openedAt→playoffsOpenedAt,
 *             isPastDeadline→predictionsLocked)
 *   usePlayoffMatches()     assumed: { matches: {round, isResolved}[] }
 *       real: lib/hooks/usePlayoffMatches → { matches: PlayoffMatch[] } → ADAPTER
 *             (isResolved := !!(homeTeamId && awayTeamId))
 *   usePlayoffPredictions() assumed: { made, total }
 *       real: lib/hooks/usePlayoffPredictions → { predictions, ... } → ADAPTER
 *             (made := predictions with winner; total := unlocked match count)
 *   useAdminProfile()       assumed: { name, initials }  → NEEDS CREATING
 *   useTournamentState()    assumed: { state: TournamentState } → NEEDS CREATING
 *             (tournament_state is service-role only → new GET endpoint)
 *   useAdminStats()         assumed: AdminStats → NEEDS CREATING (count endpoint)
 *   useEmailLogs()          assumed: { logs: EmailLog[] } → wraps existing
 *             GET /api/admin/email-logs (camelCase mapping)
 *   useR32Bracket()         assumed: { assignedSlots } → NEEDS CREATING
 *             (count playoff_matches R32 with both teams)
 *
 * COMPONENT MAPPING:
 *   R32DrawView, FullBracketView, OpenPlayoffsCard → EXIST at components/playoffs/,
 *       already accept `embedded` (R32/FullBracket). Drop-in.
 *   BracketSetupView / ResultsView / EmailToolsView → DO NOT EXIST as components.
 *       The live equivalents are PAGES (app/admin/playoffs/bracket-setup, /results,
 *       app/admin/email-tools). Their content must be extracted into
 *       components/admin/{BracketSetupView,ResultsView,EmailToolsView}.tsx with an
 *       `embedded` prop (hide the page header) + BracketSetupView `initialAction`.
 *   AdminSubNav (prior session) → superseded by AdminConsole; remove after wiring.
 * ===========================================================================*/

/** The nine internal sections of the unified console, reflected in ?section=. */
export type AdminSection =
  | 'overview'
  | 'bracket-setup'
  | 'results'
  | 'email-tools'
  | 'email-logs'
  | 'guide'
  | 'group-standings'
  | 'match-results'
  | 'pick-locks';

export const ADMIN_SECTIONS: readonly AdminSection[] = [
  'overview',
  'bracket-setup',
  'results',
  'email-tools',
  'email-logs',
  'guide',
  'group-standings',
  'match-results',
  'pick-locks',
] as const;

export function isAdminSection(value: string | null): value is AdminSection {
  return value !== null && (ADMIN_SECTIONS as readonly string[]).includes(value);
}

/** tournament_state row — single source of truth for lifecycle flags. */
export interface TournamentState {
  groupStageComplete: boolean;
  r32ConfirmedAt: string | null;
  playoffsOpenedAt: string | null;
  playoffsDeadlineAt: string | null;
  finalEmailSentAt: string | null;
}

/** Aggregate counters surfaced on the Overview dashboard. */
export interface AdminStats {
  participants: number;
  groupMatchesPredicted: number;
  playoffPredictionsMade: number;
  emailsSent: number;
  emailOptOuts: number;
  /** Groups (of 12) with all 4 final positions published (finalized rows / 4). */
  groupsFinalized: number;
}

export type EmailType =
  | 'bracket_confirmation'
  | 'prediction_update'
  | 'group_stage_complete'
  | 'final_standings'
  | 'playoffs_opened';

export type EmailStatus = 'sent' | 'failed' | 'pending';

/** email_logs row. */
export interface EmailLog {
  id: string;
  createdAt: string;
  emailType: EmailType;
  recipient: string;
  status: EmailStatus;
  isTest: boolean;
  errorMessage: string | null;
}
