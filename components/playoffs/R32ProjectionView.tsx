'use client';

/* =============================================================================
 * R32 Projection — per-user. Each user sees their OWN predicted group standings
 * (from their group-stage score picks) and the 16 teams they personally
 * projected into the R32. Reads only user predictions + group_results + ledger +
 * tournament_state (via /api/pickem/r32-projection) — never playoff_matches.
 *
 * Ported from the design export (app.jsx / components.jsx); JSX/animation kept
 * intact. Differences from the export: data comes from useR32Projection (not the
 * mock globals); the preview-state switcher is removed (status is real); flags
 * use <FlagImage>; the design's `primary`/`amber` tokens map 1:1 (same hex) to
 * the repo's bk-blue / bk-amber.
 * ===========================================================================*/
import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

import { useR32Projection } from '@/lib/hooks/useR32Projection';
import { R32Provider, matchupStatus, type R32Ctx } from '@/components/playoffs/r32projection/context';
import { GroupProjectionCard } from '@/components/playoffs/r32projection/GroupProjectionCard';
import { R32MatchupPreview } from '@/components/playoffs/r32projection/R32MatchupPreview';
import { ScoringStrip } from '@/components/playoffs/r32projection/ScoringStrip';
import { GroupJumpNav } from '@/components/playoffs/r32projection/GroupJumpNav';
import { Check } from '@/components/playoffs/r32projection/icons';
import type { ScoringStatus } from '@/components/playoffs/r32projection/types';

function useMedia(q: string): boolean {
  const [m, setM] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(q);
    setM(mq.matches);
    const fn = () => setM(mq.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, [q]);
  return m;
}

function StatusPill({ status, correctMatchups }: { status: ScoringStatus; correctMatchups: number }) {
  if (status === 'in_progress') {
    return (
      <span className="inline-flex items-center gap-2 h-9 px-3.5 rounded-full bg-bk-amber/15 text-bk-amber-dark text-[12.5px] font-extrabold whitespace-nowrap">
        <span className="relative flex w-2 h-2">
          <span className="absolute inline-flex w-full h-full rounded-full bg-bk-amber opacity-70 animate-ping" />
          <span className="relative inline-flex w-2 h-2 rounded-full bg-bk-amber" />
        </span>
        Group Stage In Progress
      </span>
    );
  }
  if (status === 'awaiting_confirmation') {
    return (
      <span className="inline-flex items-center gap-2 h-9 px-3.5 rounded-full bg-bk-blue/12 text-bk-blue-dark text-[12.5px] font-extrabold whitespace-nowrap">
        <span className="w-2 h-2 rounded-full bg-bk-blue" />
        Awaiting Official Draw
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2 h-9 px-3.5 rounded-full bg-emerald-100 text-emerald-700 text-[12.5px] font-extrabold whitespace-nowrap">
      <Check className="w-3.5 h-3.5" />
      Scored — {correctMatchups}/16 correct
    </span>
  );
}

export function R32ProjectionView({ embedded = false }: { embedded?: boolean }) {
  const { data, loading, error } = useR32Projection();
  const [activeGroup, setActiveGroup] = useState('A');
  const isMobile = useMedia('(max-width: 767px)');

  // ── build the per-user context maps from the hook payload ──
  const ctx = useMemo<R32Ctx>(() => {
    const officialByGroup: Record<string, string[]> = {};
    for (const o of data?.officialResults ?? []) officialByGroup[o.groupCode] = o.qualifiedTeamIds;
    const advanced = new Set<string>();
    for (const o of data?.officialResults ?? []) o.qualifiedTeamIds.forEach(id => advanced.add(id));
    const scoreByGroup: Record<string, number> = {};
    for (const s of data?.perGroupScoring ?? []) scoreByGroup[s.groupCode] = s.correct;
    return { teamById: data?.teamLookup ?? {}, officialByGroup, advanced, scoreByGroup };
  }, [data]);

  const status: ScoringStatus = data?.scoringStatus ?? 'in_progress';
  const scored = status === 'scored';
  const userProjection = data?.userProjection ?? [];
  const r32Pairings = data?.r32Pairings ?? null;

  const correctQualifiers = (data?.perGroupScoring ?? []).reduce((s, g) => s + g.correct, 0);
  const correctMatchups = (r32Pairings ?? []).filter(p => matchupStatus(ctx, p.home, p.away) === 'confirmed').length;
  const progressPct = scored ? 100 : 0;

  /* mobile scroll-spy → active jump pill */
  useEffect(() => {
    if (!isMobile || userProjection.length === 0) return;
    const els = userProjection.map(g => document.getElementById(`group-${g.groupCode}`)).filter((e): e is HTMLElement => !!e);
    if (!els.length) return;
    const io = new IntersectionObserver((entries) => {
      const vis = entries.filter(e => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio);
      if (vis[0]) setActiveGroup(vis[0].target.id.replace('group-', ''));
    }, { rootMargin: '-160px 0px -55% 0px', threshold: [0.1, 0.5] });
    els.forEach(el => io.observe(el));
    return () => io.disconnect();
  }, [isMobile, status, userProjection]);

  const jump = useCallback((code: string) => {
    const el = document.getElementById(`group-${code}`);
    if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 150, behavior: 'smooth' });
  }, []);

  if (loading) {
    return (
      <div className={`${embedded ? 'min-h-[480px]' : 'min-h-screen'} bg-page flex items-center justify-center`}>
        <div className="w-8 h-8 rounded-full border-2 border-bk-blue/30 border-t-bk-blue animate-spin" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className={`${embedded ? 'min-h-[480px]' : 'min-h-screen'} bg-page flex items-center justify-center`}>
        <p className="text-red-600 font-semibold">{error ?? 'Failed to load projection.'}</p>
      </div>
    );
  }

  return (
    <R32Provider value={ctx}>
      <div className={`${embedded ? '' : 'min-h-screen'} bg-page text-navy pb-20`}>
        {/* header — hidden when embedded (the Playoffs shell owns the chrome) */}
        {!embedded && (
          <header className="bg-white border-b border-black/[0.07]">
            <div className="max-w-[1180px] mx-auto px-4 sm:px-6 pt-6 pb-0">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div className="min-w-0">
                  <h1 className="text-[22px] sm:text-[24px] font-black tracking-tight text-navy leading-tight">Round of 32 Projection</h1>
                  <p className="text-[13px] sm:text-[14px] font-medium text-black/45 mt-0.5">Based on your group stage predictions</p>
                </div>
                <div className="hidden sm:block shrink-0 pt-0.5">
                  <StatusPill status={status} correctMatchups={correctMatchups} />
                </div>
                <div className="sm:hidden flex justify-center">
                  <StatusPill status={status} correctMatchups={correctMatchups} />
                </div>
              </div>
            </div>
            <div className="mt-4 h-[4px] w-full bg-black/[0.06]">
              {scored && (
                <motion.div
                  className="h-full bg-bk-amber"
                  initial={{ width: 0 }} animate={{ width: `${progressPct}%` }}
                  transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                />
              )}
            </div>
          </header>
        )}

        {/* embedded: show the status pill inline (shell has no R32-specific pill) */}
        {embedded && (
          <div className="flex justify-end mb-3">
            <StatusPill status={status} correctMatchups={correctMatchups} />
          </div>
        )}

        {isMobile && (
          <div className="px-4" style={{ ['--jump-top' as string]: '0px' }}>
            <GroupJumpNav groups={userProjection} active={activeGroup} onJump={jump} />
          </div>
        )}

        <div className={`max-w-[1180px] mx-auto ${embedded ? '' : 'px-4 sm:px-6'} pt-5`}>
          <AnimatePresence>
            {scored && (
              <div className="mb-5">
                <ScoringStrip
                  correctQualifiers={correctQualifiers}
                  correctMatchups={correctMatchups}
                  totalPoints={data.totalR32Points}
                />
              </div>
            )}
          </AnimatePresence>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {userProjection.map((g, i) => (
              <GroupProjectionCard key={g.groupCode} group={g} status={status} index={i} mobile={isMobile} />
            ))}
          </div>

          <R32MatchupPreview pairings={r32Pairings} scoringStatus={status} mobile={isMobile} />
        </div>
      </div>
    </R32Provider>
  );
}
