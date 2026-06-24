'use client';

/* =============================================================================
 * AdminConsole — unified back-office at /pickem/admin.
 *
 * Consolidates the former /admin/playoffs/bracket-setup, /admin/playoffs/results
 * and /admin/email-tools routes into a single page with its own internal
 * section navigation (reflected in ?section=). Replaces the old AdminSubNav.
 *
 * This file owns the CHROME only — sidebar / mobile drawer, section routing,
 * the admin-preview banner, section headers, and the sections it authors in
 * full (Overview, Email Logs, Guide). The three ported sections mount the
 * EXISTING wired components untouched (faithful port = reuse, do not recreate).
 *
 * Assumed contracts of imported hooks (keep in sync with the real modules):
 *   useAdminProfile():   { name: string; initials: string }
 *   useTournamentState():{ state: TournamentState }
 *   useAdminStats():     AdminStats
 *   useEmailLogs():      { logs: EmailLog[] }
 *   useR32Bracket():     { assignedSlots: number }   // 0..16
 *
 * The two new enhancements (drag-sort group standings → pickem_group_results,
 * inline live points preview before publish) live INSIDE the ported
 * BracketSetupView / ResultsView components respectively — see notes there.
 * ===========================================================================*/
import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

import type { AdminSection } from '@/types/admin';
import { isAdminSection } from '@/types/admin';

import { useAdminProfile } from '@/hooks/useAdminProfile';
import { useTournamentState } from '@/hooks/useTournamentState';
import { useAdminStats } from '@/hooks/useAdminStats';
import { useEmailLogs } from '@/hooks/useEmailLogs';
import { useR32Bracket } from '@/hooks/useR32Bracket';

import { AdminSidebar } from '@/components/admin/AdminSidebar';
import { AdminOverview } from '@/components/admin/AdminOverview';
import { EmailLogs } from '@/components/admin/EmailLogs';
import { AdminGuide } from '@/components/admin/AdminGuide';

// Existing wired admin views — ported verbatim, mounted with `embedded` so they
// drop their own standalone page header/nav (the console provides chrome).
import { BracketSetupView } from '@/components/admin/BracketSetupView';
import { ResultsView } from '@/components/admin/ResultsView';
import { EmailToolsView } from '@/components/admin/EmailToolsView';
import { GroupStandingsView } from '@/components/admin/GroupStandingsView';
import { GroupMatchResultsView } from '@/components/admin/GroupMatchResultsView';
import { PickLocksView } from '@/components/admin/PickLocksView';

/** Intent forwarded to BracketSetupView when launched from an Overview shortcut. */
type BracketIntent = 'confirm-r32' | 'open-playoffs' | null;

const SECTION_HEADER: Partial<Record<AdminSection, { title: string; subtitle: string }>> = {
  'bracket-setup': {
    title: 'Bracket Setup',
    subtitle: 'Assign real teams to each playoff slot and finalize group standings',
  },
  results: {
    title: 'Enter Results',
    subtitle: 'Publish match scores to calculate points and advance the bracket',
  },
  'email-tools': {
    title: 'Email Tools',
    subtitle: 'Send and test all 5 email types',
  },
  'email-logs': {
    title: 'Email Logs',
    subtitle: 'Debug email delivery issues',
  },
  'group-standings': {
    title: 'Group Standings',
    subtitle: 'Set final group positions for all 12 groups',
  },
  'match-results': {
    title: 'Group Stage Matches',
    subtitle: 'Enter and publish group stage match scores',
  },
  'pick-locks': {
    title: 'Pick Locks',
    subtitle: 'Control when predictions open and close for each stage',
  },
};

function sectionFromUrl(): AdminSection | null {
  if (typeof window === 'undefined') return null;
  const v = new URLSearchParams(window.location.search).get('section');
  return isAdminSection(v) ? v : null;
}

const CONTENT_VARIANTS = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.2 } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.15 } },
} as const;

export default function AdminConsole() {
  const { name, initials } = useAdminProfile();
  const { state } = useTournamentState();
  const stats = useAdminStats();
  const { logs } = useEmailLogs();
  const { assignedSlots } = useR32Bracket();

  const [section, setSection] = useState<AdminSection>(() => sectionFromUrl() ?? 'overview');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [bracketIntent, setBracketIntent] = useState<BracketIntent>(null);

  const canConfirmR32 = assignedSlots >= 16;
  const showAdminPreview = state.playoffsOpenedAt === null;

  /* keep ?section= in sync for shareable links (no reload) */
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set('section', section);
    window.history.replaceState(null, '', url);
  }, [section]);

  /* respond to back/forward */
  useEffect(() => {
    const onPop = () => {
      const fromUrl = sectionFromUrl();
      if (fromUrl) setSection(fromUrl);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = useCallback((next: AdminSection) => {
    setSection(next);
    setBracketIntent(null);
  }, []);

  const handleConfirmR32 = useCallback(() => {
    setBracketIntent('confirm-r32');
    setSection('bracket-setup');
  }, []);

  // Decision (b): OpenPlayoffsCard lives on the /playoffs Admin tab — navigate
  // there rather than embedding the dialog in BracketSetupView.
  const handleOpenPlayoffs = useCallback(() => {
    window.location.assign('/playoffs?view=admin');
  }, []);

  const header = SECTION_HEADER[section];

  return (
    <div className="min-h-screen bg-[#f5f5f5]">
      <AdminSidebar
        active={section}
        onSelect={navigate}
        adminName={name}
        adminInitials={initials}
        drawerOpen={drawerOpen}
        onDrawerOpen={() => setDrawerOpen(true)}
        onDrawerClose={() => setDrawerOpen(false)}
      />

      {/* content column — offset by the desktop sidebar */}
      <div className="lg:pl-60">
        <main className="mx-auto max-w-[1080px] p-4 lg:p-8">
          {/* admin preview banner — only before the page is opened to users */}
          <AnimatePresence>
            {showAdminPreview && (
              <motion.div
                key="preview"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="sticky top-2 z-20 mb-5 rounded-md bg-[#f59e0b] px-4 py-2 text-center text-[12px] font-bold text-white shadow-[0_2px_8px_rgba(245,158,11,0.35)]"
              >
                Admin preview — this page is not yet visible to regular users
              </motion.div>
            )}
          </AnimatePresence>

          {header && (
            <div className="mb-6">
              <h1 className="text-[22px] font-bold tracking-tight text-[#0f1e3c]">{header.title}</h1>
              <p className="mt-1 text-[13.5px] font-semibold text-black/45">{header.subtitle}</p>
            </div>
          )}

          <AnimatePresence mode="wait">
            <motion.div
              key={section}
              initial={CONTENT_VARIANTS.initial}
              animate={CONTENT_VARIANTS.animate}
              exit={CONTENT_VARIANTS.exit}
            >
              {section === 'overview' && (
                <AdminOverview
                  state={state}
                  stats={stats}
                  onNavigate={navigate}
                  onConfirmR32={handleConfirmR32}
                  onOpenPlayoffs={handleOpenPlayoffs}
                  canConfirmR32={canConfirmR32}
                />
              )}
              {section === 'bracket-setup' && <BracketSetupView embedded initialAction={bracketIntent} />}
              {section === 'results' && <ResultsView embedded />}
              {section === 'email-tools' && <EmailToolsView embedded />}
              {section === 'email-logs' && <EmailLogs logs={logs} />}
              {section === 'guide' && <AdminGuide />}
              {section === 'group-standings' && <GroupStandingsView embedded />}
              {section === 'match-results' && <GroupMatchResultsView embedded />}
              {section === 'pick-locks' && <PickLocksView embedded />}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
