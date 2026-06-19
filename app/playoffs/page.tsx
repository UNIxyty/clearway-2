'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useIsAdmin } from '@/lib/hooks/useIsAdmin';
import { usePlayoffMatches } from '@/lib/hooks/usePlayoffMatches';
import { usePlayoffPredictions } from '@/lib/hooks/usePlayoffPredictions';
import { FullBracketView } from '@/components/playoffs/FullBracketView';
import { R32DrawView } from '@/components/playoffs/R32DrawView';
import { PlayoffsGate } from '@/components/playoffs/PlayoffsGate';
import { OpenPlayoffsCard } from '@/components/playoffs/OpenPlayoffsCard';

/*
 * Playoffs — single-page in-app tab shell (ported from design playoffs/app.jsx).
 * Hosts the real R32 Draw and Full Bracket views as in-page tabs (no navigation),
 * plus an Admin tab for admins. The design's iframe/postMessage approach is
 * replaced by mounting the real data-wired views directly with `embedded`.
 */

type Tab = 'r32-draw' | 'full-bracket' | 'admin';

const VIEWS: Record<'r32-draw' | 'full-bracket', { label: string; summary: string; steps: string[] }> = {
  'r32-draw': {
    label: 'R32 Draw',
    summary: 'Groups A–L produce 2 qualifiers each + 8 best third-place teams · 16 R32 matchups are auto-set from your predicted standings',
    steps: [
      'The top two of each group (A–L) plus the eight best third-place teams qualify, filling all 32 knockout places.',
      'FIFA’s predetermined bracket positions slot those qualifiers into the 16 Round-of-32 matchups automatically — no draw ceremony.',
      'Predict each match winner before the playoffs kick off. Add the exact score for bonus points.',
      'Once a match is played your pick locks and is graded: a correct winner scores, an exact scoreline earns the bonus.',
    ],
  },
  'full-bracket': {
    label: 'Full Bracket',
    summary: 'Click a team to pick them as the winner · Picks cascade — changing an R32 pick clears later rounds',
    steps: [
      'Click a team in any matchup to pick them as the winner; they advance to the next round.',
      'Picks cascade forward — your R32 winners populate the Round of 16, and so on through to the Final.',
      'Changing an earlier pick clears any later picks that depended on it — you’ll see them flash as they reset.',
      'Every round scores the same: +1 for a correct winner, +2 bonus for an exact scoreline.',
    ],
  },
};

const TAB_ORDER: Array<'r32-draw' | 'full-bracket'> = ['r32-draw', 'full-bracket'];

const ADMIN_CARDS = [
  { title: 'Bracket Setup', desc: 'Assign qualifying teams to each knockout slot before the draw locks.', href: '/admin/playoffs/bracket-setup' },
  { title: 'Enter Results', desc: 'Post official scores — grades every prediction instantly.', href: '/admin/playoffs/results' },
  { title: 'Email Tools', desc: 'Send confirmations, results recaps & update alerts.', href: '/admin/email-tools' },
];

const ICON = {
  info: 'M12 11v5M12 7.5h.01',
  chevron: 'm6 9 6 6 6-6',
  arrow: 'M5 12h14m-6-6 6 6-6 6',
};

function viewFromUrl(): Tab | null {
  try {
    const v = new URLSearchParams(window.location.search).get('view');
    if (v === 'r32-draw' || v === 'full-bracket' || v === 'admin') return v;
  } catch { /* ignore */ }
  return null;
}

export default function PlayoffsPage() {
  const { isAdmin } = useIsAdmin();
  const { matches } = usePlayoffMatches();
  const { predictions } = usePlayoffPredictions();

  const [tab, setTab] = useState<Tab>('r32-draw');
  const [info, setInfo] = useState(false);

  // hydrate initial tab from ?view= once mounted (avoids SSR window access)
  useEffect(() => { const v = viewFromUrl(); if (v) setTab(v); }, []);

  // keep ?view= in sync + support back/forward without a full remount of the shell
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('view', tab);
      window.history.replaceState(null, '', url);
    } catch { /* ignore */ }
  }, [tab]);
  useEffect(() => {
    const onPop = () => { const v = viewFromUrl(); if (v) setTab(v); };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => { setInfo(false); }, [tab]);
  useEffect(() => { if (!isAdmin && tab === 'admin') setTab('full-bracket'); }, [isAdmin, tab]);

  const tabs: Tab[] = isAdmin ? [...TAB_ORDER, 'admin'] : TAB_ORDER;

  const progress = useMemo(() => {
    const unlocked = matches.filter(m => !m.isLocked);
    const made = predictions.filter(p => p.predictedWinnerId).length;
    const r32Resolved = matches.filter(m => m.round === 'R32' && m.homeTeamId && m.awayTeamId).length;
    return { made, total: unlocked.length || 16, r32Resolved };
  }, [matches, predictions]);

  const view = tab === 'admin' ? null : VIEWS[tab];

  return (
    <PlayoffsGate>
    <div className="min-h-screen bg-page text-navy">
      <main className="max-w-[1280px] mx-auto px-4 sm:px-5 pt-6 pb-10">
        {/* header row */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="flex items-start justify-between gap-4 mb-5">
          <div>
            <p className="text-[12px] font-extrabold uppercase tracking-[0.14em] text-bk-amber">Knockout Stage · World Cup 2026</p>
            <h1 className="text-[26px] sm:text-[30px] font-black tracking-tight leading-none text-navy mt-1">Playoffs</h1>
          </div>
          <div className="shrink-0 pt-1">
            <ProgressPill tab={tab} progress={progress} />
          </div>
        </motion.div>

        {/* tab pills with sliding indicator */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
          className="inline-flex items-center gap-1 p-1 rounded-full bg-black/[0.05] border border-black/[0.06]">
          {tabs.map(id => (
            <TabPill key={id} label={id === 'admin' ? 'Admin Tools' : VIEWS[id].label}
              active={tab === id} admin={id === 'admin'} onClick={() => setTab(id)} />
          ))}
        </motion.div>

        {/* info banner */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4, delay: 0.08 }} className="mt-3">
          <div className="rounded-xl bg-pickfill border border-bk-blue/15 overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-2.5">
              <span className="shrink-0 w-6 h-6 rounded-full bg-bk-blue/15 text-bk-blue-dark flex items-center justify-center">
                <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d={ICON.info} /></svg>
              </span>
              <p className="flex-1 min-w-0 text-[12.5px] sm:text-[13px] font-semibold text-navy/80 leading-snug">
                {tab === 'admin' ? 'Admin tools — set up the bracket, enter official results, and manage participant emails, all without leaving this page.' : view!.summary}
              </p>
              {tab !== 'admin' && (
                <button onClick={() => setInfo(v => !v)} className="shrink-0 inline-flex items-center gap-1 text-[12.5px] font-extrabold text-bk-blue hover:text-bk-blue-dark transition">
                  {info ? 'Less' : 'Learn more'}
                  <motion.span animate={{ rotate: info ? 180 : 0 }} transition={{ duration: 0.2 }} className="inline-flex">
                    <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d={ICON.chevron} /></svg>
                  </motion.span>
                </button>
              )}
            </div>
            <AnimatePresence initial={false}>
              {info && tab !== 'admin' && (
                <motion.div key="learn" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }} className="overflow-hidden">
                  <div className="px-4 pb-4 pt-1 border-t border-bk-blue/15">
                    <div className="text-[11px] font-extrabold tracking-[0.14em] text-bk-blue-dark/70 uppercase mt-3 mb-2">How it works</div>
                    <ol className="flex flex-col gap-2.5">
                      {view!.steps.map((s, i) => (
                        <li key={i} className="flex gap-3">
                          <span className="shrink-0 w-5 h-5 rounded-full bg-bk-blue text-white text-[11px] font-extrabold flex items-center justify-center tabular-nums">{i + 1}</span>
                          <span className="text-[13px] font-semibold text-navy/75 leading-snug">{s}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        {/* content area */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: 0.16, ease: [0.22, 1, 0.36, 1] }}
          className="mt-4 relative rounded-2xl bg-white border border-black/[0.08] shadow-[0_2px_10px_rgba(15,30,60,0.05)] overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.div key={tab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2, ease: 'easeOut' }}>
              {tab === 'r32-draw' && <R32DrawView embedded />}
              {tab === 'full-bracket' && <FullBracketView embedded />}
              {tab === 'admin' && isAdmin && <AdminPanel />}
            </motion.div>
          </AnimatePresence>
        </motion.div>
      </main>
    </div>
    </PlayoffsGate>
  );
}

function ProgressPill({ tab, progress }: { tab: Tab; progress: { made: number; total: number; r32Resolved: number } }) {
  if (tab === 'admin') {
    return <span className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full text-[12.5px] font-extrabold bg-navy text-white whitespace-nowrap">Admin mode</span>;
  }
  let tone = 'bg-bk-blue/10 text-bk-blue-dark';
  let text: string;
  if (tab === 'r32-draw') {
    const resolved = progress.r32Resolved;
    if (resolved >= 16) { tone = 'bg-emerald-100 text-emerald-700'; text = '16/16 matchups resolved'; }
    else { tone = 'bg-bk-amber/15 text-bk-amber-dark'; text = `${resolved}/16 resolved`; }
  } else {
    text = `${progress.made}/${progress.total} picks made`;
  }
  return (
    <motion.span key={tab + text} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}
      className={`inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full text-[12.5px] font-extrabold tabular-nums whitespace-nowrap ${tone}`}>
      {text}
    </motion.span>
  );
}

function TabPill({ label, active, admin, onClick }: { label: string; active: boolean; admin: boolean; onClick: () => void }) {
  const color = active ? 'text-white' : (admin ? 'text-navy/70 hover:text-navy' : 'text-navy/60 hover:text-navy');
  return (
    <button onClick={onClick} className={`relative z-10 flex items-center gap-1.5 h-10 px-4 sm:px-5 rounded-full text-[13.5px] font-extrabold tracking-tight transition-colors whitespace-nowrap select-none ${color}`}>
      {active && (
        <motion.span layoutId="playoffTabIndicator" transition={{ type: 'spring', stiffness: 520, damping: 40, mass: 0.7 }}
          className="absolute inset-0 -z-10 rounded-full shadow-[0_4px_14px_rgba(15,30,60,0.18)]"
          style={{ background: admin ? '#0f1e3c' : '#1a56db' }} />
      )}
      {label}
    </button>
  );
}

function AdminPanel() {
  return (
    <div className="px-5 sm:px-7 py-7 bg-page">
      <h2 className="text-[17px] font-black tracking-tight text-navy mb-1">Admin Tools</h2>
      <p className="text-[13px] font-semibold text-black/45 mb-5">Manage the playoffs bracket without leaving this view.</p>
      <div className="mb-4"><OpenPlayoffsCard /></div>
      <div className="grid gap-3 sm:grid-cols-3">
        {ADMIN_CARDS.map(c => (
          <Link key={c.title} href={c.href}
            className="group flex flex-col gap-2.5 p-4 rounded-xl bg-navy text-white border border-white/10 shadow-[0_1px_2px_rgba(0,0,0,0.05)] hover:shadow-[0_8px_24px_rgba(15,30,60,0.18)] transition">
            <div className="text-[14.5px] font-extrabold">{c.title}</div>
            <div className="text-[12.5px] font-semibold text-white/55 leading-snug flex-1">{c.desc}</div>
            <span className="inline-flex items-center gap-1 text-[12.5px] font-extrabold text-bk-amber group-hover:gap-1.5 transition-all">
              Open
              <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d={ICON.arrow} /></svg>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
