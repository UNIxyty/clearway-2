'use client';

import { useIsAdmin } from '@/lib/hooks/useIsAdmin';
import { usePlayoffsLaunchState } from '@/lib/hooks/usePlayoffsLaunchState';
import { PlayoffsReadOnlyProvider } from '@/lib/playoffs/readonly-context';
import { PlayoffsNotOpenScreen } from '@/components/playoffs/PlayoffsNotOpenScreen';

/**
 * Launch gate for all playoffs routes. Replaces the temporary AdminRoute gate:
 * - Admin: always sees content (+ an "admin preview" banner while closed to users).
 * - Non-admin, closed: the "not open yet" block screen (within the app shell).
 * - Non-admin, open & before deadline: content, fully interactive.
 * - Non-admin, open & past deadline: content in read-only mode (+ closed banner).
 *
 * Does NOT touch per-match is_locked — this is a higher-level gate layered on top.
 * Read-only is delivered via PlayoffsReadOnlyProvider, which FullBracket consumes.
 */
export function PlayoffsGate({ children }: { children: React.ReactNode }) {
  const { isAdmin, loading: adminLoading } = useIsAdmin();
  const { isOpen, isPastDeadline, deadline, loading: launchLoading } = usePlayoffsLaunchState();

  if (adminLoading || launchLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center bg-[#f5f5f5]">
        <div className="w-8 h-8 rounded-full border-2 border-bk-blue/30 border-t-bk-blue animate-spin" />
      </div>
    );
  }

  // Admin — always full access, with a reminder banner while still closed to users.
  if (isAdmin) {
    return (
      <PlayoffsReadOnlyProvider value={false}>
        {!isOpen && (
          <div className="bg-bk-amber/15 border-b border-bk-amber/30 px-4 py-2 text-center text-[12.5px] font-bold text-bk-amber-dark">
            Admin preview — playoffs isn&apos;t open to other users yet.
          </div>
        )}
        {children}
      </PlayoffsReadOnlyProvider>
    );
  }

  // Non-admin, feature closed → informational block screen (not a 403).
  if (!isOpen) {
    return <PlayoffsNotOpenScreen />;
  }

  // Non-admin, open but past deadline → read-only content + closed banner.
  if (isPastDeadline) {
    return (
      <PlayoffsReadOnlyProvider value={true}>
        <div className="bg-black/[0.06] border-b border-black/10 px-4 py-2 text-center text-[12.5px] font-bold text-black/55">
          Predictions are closed. You can still view the bracket and your past picks.
        </div>
        {children}
      </PlayoffsReadOnlyProvider>
    );
  }

  // Non-admin, open and before deadline → fully interactive.
  void deadline;
  return <PlayoffsReadOnlyProvider value={false}>{children}</PlayoffsReadOnlyProvider>;
}
