'use client';

/* =============================================================================
 * PlayoffsPage — /playoffs route shell (chrome only)
 * -----------------------------------------------------------------------------
 * In-page tab switcher hosting the R32 Draw and Full Bracket views plus an
 * Admin tools panel. This is a shell/chrome component: it owns the header,
 * the tab pills + sliding indicator, the collapsible info banner, the
 * context-aware progress pill, and tab-content transitions. It does NOT own
 * scoring, prediction persistence, or email logic — those live inside the
 * embedded views / linked admin routes.
 *
 * Assumed contracts of imported hooks (typed in their own modules):
 *   useIsAdmin(): boolean
 *   usePlayoffsLaunchState(): {
 *     playoffsOpenedAt: string | null;   // ISO timestamp, null = not yet opened
 *     predictionsLocked: boolean;        // true once past the pick deadline
 *   }
 *   usePlayoffMatches(): { matches: { round: string; isResolved: boolean }[] }
 *   usePlayoffPredictions(): { made: number; total: number }
 *
 * Adjust the import paths / property names below to match the real modules.
 * ===========================================================================*/

import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

import { useIsAdmin } from '@/hooks/useIsAdmin';
import { usePlayoffsLaunchState } from '@/hooks/usePlayoffsLaunchState';
import { usePlayoffMatches } from '@/hooks/usePlayoffMatches';
import { usePlayoffPredictions } from '@/hooks/usePlayoffPredictions';

import { R32DrawView } from '@/components/playoffs/R32DrawView';
import { FullBracketView } from '@/components/playoffs/FullBracketView';
import { OpenPlayoffsCard } from '@/components/playoffs/OpenPlayoffsCard';
import { BackToDashboard } from '@/components/playoffs/BackToDashboard';

/* ----------------------------------------------------------------- types --- */
type TabId = 'r32' | 'bracket' | 'admin';

const R32_MATCHUP_COUNT = 16;

/* ----------------------------------------------------------------- icons --- */
type IconProps = { className?: string };

const InfoIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 7.5h.01" />
  </svg>
);
const ChevronIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
    <path d="m6 9 6 6 6-6" />
  </svg>
);
const LockIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="11" width="16" height="9" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </svg>
);
const CheckIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);
const ArrowIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14m-6-6 6 6-6 6" />
  </svg>
);
const SetupIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
    <rect x="14" y="14" width="7" height="7" rx="1.5" />
  </svg>
);
const TrophyIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
    <path d="M7 4h10v5a5 5 0 0 1-10 0V4z" />
    <path d="M7 5H4v2a3 3 0 0 0 3 3M17 5h3v2a3 3 0 0 1-3 3M9 18h6M10 18l.5-3.5h3L14 18M8 21h8" />
  </svg>
);
const MailIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="m4 7 8 6 8-6" />
  </svg>
);

/* -------------------------------------------------------------- url sync --- */
const TAB_IDS: readonly TabId[] = ['r32', 'bracket', 'admin'];

function isTabId(value: string | null): value is TabId {
  return value !== null && (TAB_IDS as readonly string[]).includes(value);
}

function tabFromUrl(): TabId | null {
  if (typeof window === 'undefined') return null;
  const v = new URLSearchParams(window.location.search).get('view');
  return isTabId(v) ? v : null;
}

/* ------------------------------------------------------ banner content --- */
type BannerContent = { summary: string; steps: string[] };

const BANNER: Record<TabId, BannerContent> = {
  r32: {
    summary:
      'Groups A–L each produce 2 qualifiers + 8 best third-place teams · matchups are auto-set by FIFA bracket rules',
    steps: [
      'Groups A–L produce 2 qualifiers each + 8 best third-place teams.',
      '16 R32 matchups are auto-set by FIFA bracket rules.',
      'The draw page shows who plays who.',
    ],
  },
  bracket: {
    summary:
      'Click a team to pick them as the winner · Optionally predict the exact score for a bonus point · Changing an early pick clears later dependent rounds',
    steps: [
      'Click a team to pick them as the winner.',
      'Optionally enter a predicted scoreline for bonus points.',
      'Picks cascade — changing an R32 pick clears later rounds.',
    ],
  },
  admin: {
    summary: 'Manage bracket setup, enter results, and send emails from here',
    steps: [
      'Use Bracket Setup to assign real teams to playoff slots.',
      'Use Enter Results to publish scores and calculate points.',
      'Use Email Tools to send and test emails.',
    ],
  },
};

/* -------------------------------------------------------- progress pill --- */
type ProgressPillProps = {
  tab: TabId;
  resolvedCount: number;
  picksMade: number;
  picksTotal: number;
  predictionsLocked: boolean;
};

function ProgressPill({ tab, resolvedCount, picksMade, picksTotal, predictionsLocked }: ProgressPillProps) {
  if (tab === 'admin') return null;

  let tone = 'bg-[#1a56db]/10 text-[#1647b8]';
  let icon: React.ReactNode = null;
  let text = '';

  if (tab === 'r32') {
    const complete = resolvedCount >= R32_MATCHUP_COUNT;
    if (complete) {
      tone = 'bg-emerald-100 text-emerald-700';
      icon = <CheckIcon className="w-3.5 h-3.5" />;
      text = `${R32_MATCHUP_COUNT}/${R32_MATCHUP_COUNT} matchups resolved`;
    } else {
      tone = 'bg-[#f59e0b]/15 text-[#d97706]';
      text = `${resolvedCount}/${R32_MATCHUP_COUNT} matchups resolved`;
    }
  } else {
    if (predictionsLocked) {
      tone = 'bg-black/[0.07] text-black/55';
      icon = <LockIcon className="w-3.5 h-3.5" />;
      text = 'Predictions locked';
    } else {
      tone = 'bg-[#1a56db]/10 text-[#1647b8]';
      text = `${picksMade}/${picksTotal} picks made`;
    }
  }

  return (
    <motion.span
      key={`${tab}-${text}`}
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={`inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full text-[12.5px] font-extrabold tabular-nums whitespace-nowrap ${tone}`}
    >
      {icon}
      {text}
    </motion.span>
  );
}

/* ------------------------------------------------------------ tab pills --- */
type TabDef = { id: TabId; label: string };

type TabPillsProps = {
  tabs: TabDef[];
  active: TabId;
  onSelect: (id: TabId) => void;
};

function TabPills({ tabs, active, onSelect }: TabPillsProps) {
  return (
    <div className="inline-flex items-center gap-1">
      {tabs.map(({ id, label }) => {
        const isActive = active === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onSelect(id)}
            aria-pressed={isActive}
            className={`relative flex items-center h-8 px-4 rounded-full text-[13px] font-bold tracking-tight transition-colors duration-150 whitespace-nowrap select-none ${
              isActive ? 'text-[#0f1e3c]' : 'text-black/45 hover:text-[#0f1e3c]'
            }`}
          >
            {isActive && (
              <motion.span
                layoutId="tab-indicator"
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                className="absolute inset-0 -z-10 rounded-full bg-white border border-[#e5e7eb] shadow-[0_1px_3px_rgba(15,30,60,0.12)]"
              />
            )}
            {label}
          </button>
        );
      })}
    </div>
  );
}

/* ----------------------------------------------------------- info banner --- */
type InfoBannerProps = {
  tab: TabId;
  expanded: boolean;
  onToggle: () => void;
};

function InfoBanner({ tab, expanded, onToggle }: InfoBannerProps) {
  const content = BANNER[tab];
  return (
    <div className="rounded-lg bg-[#EBF3FF] border border-[#BFDBFE] overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-2.5">
        <span className="shrink-0 w-5 h-5 rounded-full bg-[#1a56db]/15 text-[#1647b8] flex items-center justify-center">
          <InfoIcon className="w-3 h-3" />
        </span>
        <p className="flex-1 min-w-0 text-[12.5px] sm:text-[13px] font-semibold text-[#0f1e3c]/80 leading-snug" style={{ textWrap: 'pretty' }}>
          {content.summary}
        </p>
        <button
          type="button"
          onClick={onToggle}
          className="shrink-0 inline-flex items-center gap-1 text-[12px] font-bold text-[#1a56db] hover:text-[#1647b8] transition-colors"
        >
          {expanded ? 'Show less' : 'Learn more'}
          <motion.span animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.2 }} className="inline-flex">
            <ChevronIcon className="w-3.5 h-3.5" />
          </motion.span>
        </button>
      </div>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="steps"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <ol className="flex flex-col gap-2.5 px-4 pb-4 pt-1 border-t border-[#BFDBFE]">
              {content.steps.map((step, i) => (
                <li key={i} className="flex gap-3 pt-2.5 first:pt-3">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-[#1a56db] text-white text-[11px] font-extrabold flex items-center justify-center tabular-nums">
                    {i + 1}
                  </span>
                  <span className="text-[13px] font-semibold text-[#0f1e3c]/75 leading-snug" style={{ textWrap: 'pretty' }}>
                    {step}
                  </span>
                </li>
              ))}
            </ol>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ----------------------------------------------------------- admin panel --- */
type AdminCardDef = { title: string; subtitle: string; href: string; icon: (p: IconProps) => JSX.Element };

const ADMIN_CARDS: AdminCardDef[] = [
  {
    title: 'Bracket Setup',
    subtitle: 'Assign teams to playoff slots and confirm the R32 bracket',
    href: '/pickem/admin?section=bracket-setup',
    icon: SetupIcon,
  },
  {
    title: 'Enter Results',
    subtitle: 'Publish match scores and calculate points',
    href: '/pickem/admin?section=results',
    icon: TrophyIcon,
  },
  {
    title: 'Email Tools',
    subtitle: 'Send and test emails to all participants',
    href: '/pickem/admin?section=email-tools',
    icon: MailIcon,
  },
];

function AdminPanel() {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {ADMIN_CARDS.map(({ title, subtitle, href, icon: Icon }) => (
          <a
            key={title}
            href={href}
            className="group flex flex-col gap-3 p-5 rounded-xl bg-[#0f1e3c] text-white shadow-[0_2px_10px_rgba(15,30,60,0.12)] hover:shadow-[0_10px_30px_rgba(15,30,60,0.28)] transition-shadow"
          >
            <span className="w-10 h-10 rounded-lg bg-white/10 text-white flex items-center justify-center">
              <Icon className="w-5 h-5" />
            </span>
            <div className="text-[15px] font-extrabold tracking-tight">{title}</div>
            <div className="text-[12.5px] font-semibold text-white/55 leading-snug flex-1" style={{ textWrap: 'pretty' }}>
              {subtitle}
            </div>
            <span className="inline-flex items-center gap-1 text-[12.5px] font-extrabold text-[#5b9bff] group-hover:gap-1.5 transition-all">
              Open <ArrowIcon className="w-3.5 h-3.5" />
            </span>
          </a>
        ))}
      </div>

      {/* Already-built control for publishing the page to regular users */}
      <OpenPlayoffsCard />
    </div>
  );
}

/* -------------------------------------------------------- admin preview --- */
function AdminPreviewBanner() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="sticky top-0 z-20 -mt-1 mb-4 rounded-md bg-[#f59e0b] text-white text-[12px] font-bold px-4 py-2 text-center shadow-[0_2px_8px_rgba(245,158,11,0.35)]"
    >
      Admin preview — this page is not yet visible to regular users
    </motion.div>
  );
}

/* -------------------------------------------------------- tab content --- */
const CONTENT_TRANSITION = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.2 } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.15 } },
} as const;

/* --------------------------------------------------------------- page --- */
export default function PlayoffsPage() {
  const isAdmin = useIsAdmin();
  const { playoffsOpenedAt, predictionsLocked } = usePlayoffsLaunchState();
  const { matches } = usePlayoffMatches();
  const { made: picksMade, total: picksTotal } = usePlayoffPredictions();

  const [tab, setTab] = useState<TabId>(() => {
    const fromUrl = tabFromUrl();
    if (fromUrl === 'admin' && !isAdmin) return 'r32';
    return fromUrl ?? 'r32';
  });
  const [infoExpanded, setInfoExpanded] = useState(false);

  const resolvedCount = matches.filter((m) => m.round === 'R32' && m.isResolved).length;
  const showAdminPreview = isAdmin && playoffsOpenedAt === null;

  const tabs: TabDef[] = [
    { id: 'r32', label: 'R32 Draw' },
    { id: 'bracket', label: 'Full Bracket' },
    ...(isAdmin ? [{ id: 'admin' as const, label: 'Admin Tools' }] : []),
  ];

  /* fall back off the admin tab if admin access is revoked */
  useEffect(() => {
    if (!isAdmin && tab === 'admin') setTab('bracket');
  }, [isAdmin, tab]);

  /* keep ?view= in sync for shareable links (no reload) */
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set('view', tab);
    window.history.replaceState(null, '', url);
  }, [tab]);

  /* respond to back/forward */
  useEffect(() => {
    const onPop = () => {
      const fromUrl = tabFromUrl();
      if (fromUrl && (fromUrl !== 'admin' || isAdmin)) setTab(fromUrl);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [isAdmin]);

  /* collapse the info banner whenever the tab changes */
  useEffect(() => {
    setInfoExpanded(false);
  }, [tab]);

  const handleSelect = useCallback((id: TabId) => setTab(id), []);

  return (
    <div className="text-[#0f1e3c]">
      {/* 0 — back to dashboard (always visible, not behind a menu) */}
      <div className="mb-3">
        <BackToDashboard />
      </div>

      {/* 1 — page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[11px] font-extrabold tracking-[0.16em] uppercase text-[#f59e0b]">
            Knockout Stage · World Cup 2026
          </div>
          <h1 className="mt-1 text-[28px] sm:text-[32px] font-black tracking-tight leading-none text-[#0f1e3c]">
            Playoffs
          </h1>
        </div>
        <div className="shrink-0 pt-1">
          <ProgressPill
            tab={tab}
            resolvedCount={resolvedCount}
            picksMade={picksMade}
            picksTotal={picksTotal}
            predictionsLocked={predictionsLocked}
          />
        </div>
      </div>

      {/* 2 — tab pills + info banner */}
      <div className="mt-5">
        <TabPills tabs={tabs} active={tab} onSelect={handleSelect} />
      </div>
      <div className="mt-3">
        <InfoBanner tab={tab} expanded={infoExpanded} onToggle={() => setInfoExpanded((v) => !v)} />
      </div>

      {/* 3 — tab content */}
      <div className="mt-5 relative">
        {showAdminPreview && <AdminPreviewBanner />}

        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={CONTENT_TRANSITION.initial}
            animate={CONTENT_TRANSITION.animate}
            exit={CONTENT_TRANSITION.exit}
          >
            {tab === 'r32' && <R32DrawView embedded />}
            {tab === 'bracket' && <FullBracketView embedded />}
            {tab === 'admin' && <AdminPanel />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
