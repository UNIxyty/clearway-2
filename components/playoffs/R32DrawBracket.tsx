'use client';

import { useState, useEffect, useRef, useCallback, useLayoutEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FlagImg } from './FlagImg';
import { ArrowLeftIcon, CheckIcon } from './icons';
import { GROUPS_LEFT, GROUPS_RIGHT } from '@/lib/playoffs/bracketData';
import type { ResolvedPairing, GroupDef } from '@/lib/playoffs/types';
import { qualifierLabel } from '@/lib/playoffs/r32Bracket';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

// ─── Group Badge ────────────────────────────────────────────────────────────

function GroupBadge({ group, dir }: { group: GroupDef; dir: 'left' | 'right' }) {
  return (
    <div className="relative flex flex-col items-center" style={{ width: 80 }}>
      <div className="relative w-[80px] rounded-lg bg-navy overflow-hidden" style={{ boxShadow: '0 2px 8px rgba(15,30,60,0.18)' }}>
        <div className="absolute top-0 bottom-0 left-0 w-[3px]" style={{ background: group.accent }} />
        <div className="grid grid-cols-2 gap-y-1 gap-x-1.5 place-items-center px-2.5 pt-2.5 pb-1.5">
          {group.flags.map((f, i) => (
            <FlagImg key={i} emoji={f} size={18} />
          ))}
        </div>
        <div className="text-center pb-1.5">
          <span className="text-[9.5px] font-extrabold tracking-[0.08em] text-white/85">GROUP {group.letter}</span>
        </div>
      </div>
      <div
        className="absolute top-1/2 h-px bg-black/15"
        style={dir === 'right' ? { left: '100%', width: 30 } : { right: '100%', width: 30 }}
      />
    </div>
  );
}

// ─── Draw Match Card (read-only) ─────────────────────────────────────────────

function DrawMatchCard({
  pairing,
  index,
  fromLeft,
}: {
  pairing: ResolvedPairing;
  index: number;
  fromLeft: boolean;
}) {
  const { home, away, homeQualifier, awayQualifier } = pairing;
  return (
    <motion.div
      initial={{ opacity: 0, x: fromLeft ? -26 : 26 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4, delay: 0.04 + index * 0.03, ease: [0.22, 1, 0.36, 1] }}
      className="w-[160px] bg-white rounded-[10px] border border-black/[0.09] overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.05)]"
    >
      {/* Home row */}
      <div className="flex items-center gap-2 pl-3 pr-2.5 py-2.5">
        {home
          ? <FlagImg emoji={home.flag} size={20} />
          : <span className="w-[20px] h-[15px] rounded-sm bg-black/[0.06] border border-dashed border-black/20 shrink-0" />}
        <div className="flex-1 min-w-0">
          {home
            ? <div className="truncate text-[12.5px] font-bold text-navy">{home.name}</div>
            : <div className="text-[11px] italic font-semibold text-black/35 truncate">{qualifierLabel(homeQualifier)}</div>}
        </div>
      </div>

      <div className="relative flex items-center px-3 py-0.5">
        <div className="flex-1 h-px bg-black/[0.07]" />
        <span className="px-1.5 text-[9px] font-bold italic text-black/30">vs</span>
        <div className="flex-1 h-px bg-black/[0.07]" />
      </div>

      {/* Away row */}
      <div className="flex items-center gap-2 pl-3 pr-2.5 py-2.5">
        {away
          ? <FlagImg emoji={away.flag} size={20} />
          : <span className="w-[20px] h-[15px] rounded-sm bg-black/[0.06] border border-dashed border-black/20 shrink-0" />}
        <div className="flex-1 min-w-0">
          {away
            ? <div className="truncate text-[12.5px] font-bold text-navy">{away.name}</div>
            : <div className="text-[11px] italic font-semibold text-black/35 truncate">{qualifierLabel(awayQualifier)}</div>}
        </div>
      </div>
    </motion.div>
  );
}

// ─── Connector tree (binary reduction) ───────────────────────────────────────

const SEG_COLOR = { gray: '#cbd5e1', blue: '#1a56db' };

interface Leaf { y: number; x: number; hasTeam: boolean }
interface Seg { d: string; color: string; wide: boolean }

function buildTree(leaves: Leaf[], startX: number, dir: number, dx: number): Seg[] {
  const segs: Seg[] = [];
  let level = leaves.map(l => ({ x: startX, y: l.y, has: l.hasTeam }));
  const push = (d: string, has: boolean) =>
    segs.push({ d, color: has ? SEG_COLOR.blue : SEG_COLOR.gray, wide: has });

  while (level.length > 1) {
    const next: typeof level = [];
    for (let i = 0; i < level.length; i += 2) {
      const a = level[i], b = level[i + 1];
      const nx = a.x + dir * dx;
      const merged = a.has && b.has;
      push(`M ${a.x} ${a.y} H ${nx}`, merged);
      push(`M ${b.x} ${b.y} H ${nx}`, merged);
      push(`M ${nx} ${a.y} V ${b.y}`, merged);
      next.push({ x: nx, y: (a.y + b.y) / 2, has: merged });
    }
    level = next;
  }
  const last = level[0];
  if (last) push(`M ${last.x} ${last.y} H ${last.x + dir * dx}`, last.has);
  return segs;
}

// ─── Mobile list ──────────────────────────────────────────────────────────────

function MobileList({ left, right }: { left: ResolvedPairing[]; right: ResolvedPairing[] }) {
  const [tab, setTab] = useState<'A' | 'B'>('A');
  const list = tab === 'A' ? left : right;
  return (
    <div className="px-4 pt-4 pb-28 max-w-[520px] mx-auto">
      <div className="flex p-1 rounded-xl bg-black/[0.05] mb-4">
        {(['A', 'B'] as const).map(k => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`flex-1 h-9 rounded-lg text-[13px] font-extrabold tracking-tight transition ${tab === k ? 'bg-white text-navy shadow-sm' : 'text-black/45'}`}
          >
            Pathway {k}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-3">
        {list.map((p, i) => (
          <DrawMatchCard key={p.matchCode} pairing={p} index={i} fromLeft={tab === 'A'} />
        ))}
      </div>
    </div>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface R32DrawBracketProps {
  pairings: ResolvedPairing[];
  isGroupStageComplete: boolean;
  hasUserPredictions?: boolean;
}

// ─── Main component ───────────────────────────────────────────────────────────

export function R32DrawBracket({ pairings, isGroupStageComplete, hasUserPredictions = false }: R32DrawBracketProps) {
  const left = useMemo(() => pairings.slice(0, 8), [pairings]);
  const right = useMemo(() => pairings.slice(8, 16), [pairings]);
  const resolved = pairings.filter(p => p.home !== null).length;
  const pct = Math.round((resolved / 16) * 100);

  const scrollerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [segs, setSegs] = useState<Seg[]>([]);
  const [dims, setDims] = useState({ w: 1320, h: 1200 });
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    setIsMobile(mq.matches);
    const fn = () => setIsMobile(mq.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);

  const measure = useCallback(() => {
    const c = contentRef.current;
    if (!c) return;
    const cr = c.getBoundingClientRect();
    const rect: Record<string, { left: number; right: number; mid: number }> = {};
    c.querySelectorAll('[data-r32card]').forEach(el => {
      const r = el.getBoundingClientRect();
      const code = el.getAttribute('data-r32card')!;
      rect[code] = { left: r.left - cr.left, right: r.right - cr.left, mid: r.top - cr.top + r.height / 2 };
    });

    const leftLeaves: Leaf[] = left.map(p => {
      const r = rect[p.matchCode];
      if (!r) return null;
      return { x: r.right, y: r.mid, hasTeam: p.home !== null };
    }).filter(Boolean) as Leaf[];

    const rightLeaves: Leaf[] = right.map(p => {
      const r = rect[p.matchCode];
      if (!r) return null;
      return { x: r.left, y: r.mid, hasTeam: p.home !== null };
    }).filter(Boolean) as Leaf[];

    const out: Seg[] = [];
    if (leftLeaves.length === 8) out.push(...buildTree(leftLeaves, leftLeaves[0].x, 1, 34));
    if (rightLeaves.length === 8) out.push(...buildTree(rightLeaves, rightLeaves[0].x, -1, 34));
    setSegs(out);
    const nw = c.scrollWidth, nh = Math.max(c.scrollHeight, 600);
    setDims(d => (Math.abs(d.w - nw) < 2 && Math.abs(d.h - nh) < 2) ? d : { w: nw, h: nh });
  }, [left, right]);

  useLayoutEffect(() => { if (!isMobile) measure(); }, [isMobile, measure, pairings]);

  useEffect(() => {
    if (isMobile) return;
    const ts = [60, 280, 650].map(t => setTimeout(measure, t));
    const ro = new ResizeObserver(measure);
    if (contentRef.current) ro.observe(contentRef.current);
    window.addEventListener('resize', measure);
    return () => { ts.forEach(clearTimeout); ro.disconnect(); window.removeEventListener('resize', measure); };
  }, [measure, isMobile]);

  useEffect(() => {
    if (isMobile) return;
    const sc = scrollerRef.current;
    if (!sc) return;
    const t = setTimeout(() => { sc.scrollLeft = Math.max(0, (sc.scrollWidth - sc.clientWidth) / 2); }, 120);
    return () => clearTimeout(t);
  }, [isMobile]);

  return (
    <div className="min-h-screen bg-page text-navy font-sans">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-black/[0.07]">
        <div className="max-w-[1320px] mx-auto px-4 sm:px-6 h-[60px] flex items-center justify-between gap-3">
          <Link href="/pickem" className="flex items-center gap-1.5 text-[13px] font-bold text-black/45 hover:text-navy transition shrink-0">
            <ArrowLeftIcon className="w-4 h-4" />
            <span className="hidden sm:inline">Back to Pickem</span>
          </Link>
          <div className="text-center min-w-0">
            <div className="text-[19px] sm:text-[20px] font-black tracking-tight text-navy leading-none">Round of 32</div>
            <div className="text-[12px] sm:text-[13px] font-semibold text-black/45 truncate">
              Auto-filled from group stage results
            </div>
          </div>
          <div className="shrink-0 flex items-center gap-1.5 px-3 h-9 rounded-full bg-bk-blue/10 text-bk-blue-dark">
            <span className="text-[13px] font-extrabold tabular-nums">{resolved}</span>
            <span className="text-[12px] font-bold text-bk-blue/70">/ 16</span>
            <span className="hidden sm:inline text-[12px] font-bold text-bk-blue/70">resolved</span>
          </div>
        </div>
        <div className="h-[3px] w-full bg-black/[0.06]">
          <div className="h-full bg-bk-amber transition-[width] duration-500 ease-out" style={{ width: `${pct}%` }} />
        </div>
      </header>

      {/* Stats strip */}
      <div className="bg-white border-b border-black/[0.07] px-4 sm:px-6 py-2.5 text-center text-[12.5px] font-bold text-black/55">
        {isGroupStageComplete
          ? <span className="text-emerald-600">Group stage complete — all 16 matchups resolved</span>
          : <span><span className="text-bk-blue-dark">{resolved}/16</span> matchups known · waiting for group stage to finish</span>}
      </div>

      {isMobile ? (
        <MobileList left={left} right={right} />
      ) : (
        <div
          ref={scrollerRef}
          className="overflow-x-auto overflow-y-hidden"
          style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(15,30,60,0.16) transparent' }}
        >
          <div ref={contentRef} className="relative w-max mx-auto px-8 py-8">
            {/* SVG connector layer */}
            <svg className="absolute top-0 left-0 pointer-events-none z-0" width={dims.w} height={dims.h}>
              {segs.map((s, i) => (
                <path
                  key={i}
                  d={s.d}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={s.wide ? 2 : 1.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ transition: 'stroke 0.4s ease' }}
                />
              ))}
            </svg>

            <div className="relative z-10 flex items-stretch" style={{ gap: 12 }}>
              {/* Group badges left */}
              <div className="shrink-0 flex flex-col justify-around items-center mr-2">
                {GROUPS_LEFT.map(g => <GroupBadge key={g.letter} group={g} dir="right" />)}
              </div>

              {/* Left R32 column */}
              <div className="shrink-0 flex flex-col gap-3.5">
                {left.map((p, i) => (
                  <div key={p.matchCode} data-r32card={p.matchCode}>
                    <DrawMatchCard pairing={p} index={i} fromLeft />
                  </div>
                ))}
              </div>

              <div className="shrink-0" style={{ width: 110 }} />

              {/* Center divider */}
              <div className="shrink-0 relative flex items-center justify-center" style={{ width: 44 }}>
                <div className="absolute top-6 bottom-6 left-1/2 -translate-x-1/2 w-px bg-black/12" />
                <div
                  className="relative z-10 whitespace-nowrap text-[10.5px] font-extrabold tracking-[0.14em] text-black/35 bg-page px-1.5 py-3"
                  style={{ transform: 'rotate(-90deg)' }}
                >
                  16 WINNERS ADVANCE TO R16 →
                </div>
              </div>

              <div className="shrink-0" style={{ width: 110 }} />

              {/* Right R32 column */}
              <div className="shrink-0 flex flex-col gap-3.5">
                {right.map((p, i) => (
                  <div key={p.matchCode} data-r32card={p.matchCode}>
                    <DrawMatchCard pairing={p} index={i} fromLeft={false} />
                  </div>
                ))}
              </div>

              {/* Group badges right */}
              <div className="shrink-0 flex flex-col justify-around items-center ml-2">
                {GROUPS_RIGHT.map(g => <GroupBadge key={g.letter} group={g} dir="left" />)}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bottom CTA bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur border-t border-black/[0.08]">
        <div className="max-w-[1320px] mx-auto px-4 sm:px-6 h-[60px] flex items-center justify-between gap-3">
          <span className="text-[12px] font-semibold text-black/45 truncate hidden sm:block">
            16 R32 matchups · auto-calculated from group standings
          </span>
          <div className="flex items-center gap-2 shrink-0 mx-auto sm:mx-0">
            <AnimatePresence mode="wait">
              {isGroupStageComplete && !hasUserPredictions ? (
                <motion.a
                  key="cta"
                  href="/playoffs/bracket"
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  className="inline-flex items-center justify-center h-10 px-5 rounded-full bg-bk-blue hover:bg-bk-blue-dark text-[13px] font-extrabold text-white shadow-sm transition active:scale-[0.97] whitespace-nowrap"
                >
                  Make Your R32 Predictions →
                </motion.a>
              ) : isGroupStageComplete && hasUserPredictions ? (
                <motion.a
                  key="done"
                  href="/playoffs/bracket"
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="inline-flex items-center gap-1.5 h-10 px-5 rounded-full border-2 border-emerald-500/60 text-[13px] font-extrabold text-emerald-700 bg-white whitespace-nowrap"
                >
                  <CheckIcon className="w-4 h-4" /> View Your R32 Predictions ✓
                </motion.a>
              ) : (
                <span className="text-[13px] font-bold text-black/40 whitespace-nowrap">
                  Available once group stage ends
                </span>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
