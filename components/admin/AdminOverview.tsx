/* =============================================================================
 * AdminOverview — section 1. Dashboard summary of tournament lifecycle state,
 * quick stats, and shortcut actions. Read-only except the two shortcut buttons,
 * which invoke the same handlers used in their home sections (passed in).
 * ===========================================================================*/
import type { AdminSection, AdminStats, TournamentState } from '@/types/admin';
import { CheckIcon, UsersIcon } from './icons';

type AdminOverviewProps = {
  state: TournamentState;
  stats: AdminStats;
  onNavigate: (section: AdminSection) => void;
  /** Shortcut to the Confirm R32 Bracket flow (lives in Bracket Setup). */
  onConfirmR32: () => void;
  /** Shortcut to the Open Playoffs flow. */
  onOpenPlayoffs: () => void;
  /** Disable Confirm R32 until all 16 slots are assigned. */
  canConfirmR32: boolean;
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

type FlagRowProps = { label: string; done: boolean; detail?: string };

function FlagRow({ label, done, detail }: FlagRowProps) {
  return (
    <li className="flex items-center justify-between gap-3 py-3">
      <div className="flex items-center gap-3">
        <span
          className={`flex h-6 w-6 items-center justify-center rounded-full ${
            done ? 'bg-[#16a34a]/15 text-[#15803d]' : 'bg-black/[0.06] text-black/30'
          }`}
        >
          {done ? <CheckIcon className="h-3.5 w-3.5" /> : <span className="h-[2px] w-2.5 rounded-full bg-current" />}
        </span>
        <span className="text-[14px] font-semibold text-[#0f1e3c]">{label}</span>
      </div>
      <span className={`text-[12.5px] font-bold tabular-nums ${done ? 'text-[#15803d]' : 'text-black/35'}`}>
        {detail ?? (done ? 'Done' : 'Not yet')}
      </span>
    </li>
  );
}

type StatCardProps = { label: string; value: number };

function StatCard({ label, value }: StatCardProps) {
  return (
    <div className="rounded-xl border border-black/[0.07] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <div className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-black/40">{label}</div>
      <div className="mt-1 text-[26px] font-black leading-none text-[#0f1e3c] tabular-nums">
        {value.toLocaleString()}
      </div>
    </div>
  );
}

export function AdminOverview({
  state,
  stats,
  onConfirmR32,
  onOpenPlayoffs,
  canConfirmR32,
}: AdminOverviewProps) {
  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
      {/* tournament state — full width */}
      <section className="rounded-2xl border border-black/[0.07] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05)] md:col-span-2">
        <h2 className="text-[15px] font-extrabold tracking-tight text-[#0f1e3c]">Tournament State</h2>
        <ul className="mt-2 divide-y divide-black/[0.06]">
          <FlagRow label="Group Stage Complete" done={state.groupStageComplete} />
          <FlagRow
            label="R32 Confirmed"
            done={state.r32ConfirmedAt !== null}
            detail={state.r32ConfirmedAt ? fmtDate(state.r32ConfirmedAt) : undefined}
          />
          <FlagRow
            label="Playoffs Opened"
            done={state.playoffsOpenedAt !== null}
            detail={
              state.playoffsDeadlineAt
                ? `Deadline ${fmtDate(state.playoffsDeadlineAt)}`
                : state.playoffsOpenedAt
                  ? fmtDate(state.playoffsOpenedAt)
                  : undefined
            }
          />
          <FlagRow
            label="Final Email Sent"
            done={state.finalEmailSentAt !== null}
            detail={state.finalEmailSentAt ? fmtDate(state.finalEmailSentAt) : undefined}
          />
        </ul>
      </section>

      {/* quick stats */}
      <section className="md:col-span-2">
        <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
          <StatCard label="Participants" value={stats.participants} />
          <StatCard label="Matches Predicted" value={stats.groupMatchesPredicted} />
          <StatCard label="Playoff Predictions" value={stats.playoffPredictionsMade} />
          <StatCard label="Emails Sent" value={stats.emailsSent} />
        </div>
      </section>

      {/* quick actions */}
      <section className="rounded-2xl border border-black/[0.07] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05)] md:col-span-2">
        <h2 className="text-[15px] font-extrabold tracking-tight text-[#0f1e3c]">Quick Actions</h2>
        <p className="mt-1 text-[13px] font-semibold text-black/45">
          Shortcuts to the two batch actions that change live data. Each opens the same guarded flow used in its
          section.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={onConfirmR32}
            disabled={!canConfirmR32}
            className={`flex flex-col gap-1 rounded-xl p-4 text-left transition active:scale-[0.99] ${
              canConfirmR32
                ? 'bg-[#f59e0b] text-white shadow-sm hover:bg-[#d97706]'
                : 'cursor-not-allowed bg-[#f59e0b]/40 text-white/80'
            }`}
          >
            <span className="inline-flex items-center gap-2 text-[14px] font-extrabold">
              <CheckIcon className="h-4 w-4" /> Confirm R32 Bracket
            </span>
            <span className="text-[12px] font-semibold text-white/85">
              {canConfirmR32
                ? 'Recomputes group-stage points + sends the Group Stage Complete email to everyone.'
                : 'All 16 R32 slots must be assigned before this can run.'}
            </span>
          </button>

          <button
            type="button"
            onClick={onOpenPlayoffs}
            className="flex flex-col gap-1 rounded-xl bg-[#f59e0b] p-4 text-left text-white shadow-sm transition hover:bg-[#d97706] active:scale-[0.99]"
          >
            <span className="inline-flex items-center gap-2 text-[14px] font-extrabold">
              <UsersIcon className="h-4 w-4" /> Open Playoffs to Users
            </span>
            <span className="text-[12px] font-semibold text-white/85">
              Makes the playoff bracket visible to all users and sets the prediction deadline.
            </span>
          </button>
        </div>
      </section>
    </div>
  );
}
