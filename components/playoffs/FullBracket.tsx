'use client';

import {
  useState, useEffect, useRef, useCallback, useLayoutEffect, useMemo,
} from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PlayoffMatchCard } from './PlayoffMatchCard';
import { BracketConnectors, buildElbow, type ElbowPath } from './BracketConnectors';
import { FlagImg } from './FlagImg';
import { ChevronLeft, ChevronRight, Trophy } from './icons';
import {
  MATCHES, BRACKET_H, CARD_WIDTHS, GROUPS_LEFT, GROUPS_RIGHT,
  R32_LEFT_IDS, R32_RIGHT_IDS, R16_LEFT_IDS, R16_RIGHT_IDS,
  QF_LEFT_IDS, QF_RIGHT_IDS, downstreamOf, feederLabel,
} from '@/lib/playoffs/bracketData';
import type { BracketTeam, PickMap, PlayoffMatch, PlayoffPrediction, GroupDef } from '@/lib/playoffs/types';
import { teamInSlot } from '@/lib/hooks/usePlayoffBracket';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FullBracketProps {
  matches: PlayoffMatch[];
  userPredictions: PlayoffPrediction[];
  teams: BracketTeam[];
  onSavePrediction: (matchId: string, winnerId: string, homeScore: number, awayScore: number) => Promise<void>;
}

// ─── Group column box ─────────────────────────────────────────────────────────

function GroupBox({ group, dir }: { group: GroupDef; dir: 'left' | 'right' }) {
  return (
    <div className="relative flex flex-col items-center" style={{ width: 80 }}>
      <div className="relative w-[80px] rounded-lg bg-navy overflow-hidden" style={{ boxShadow: '0 2px 8px rgba(15,30,60,0.18)' }}>
        <div className="absolute top-0 bottom-0 left-0 w-[3px]" style={{ background: group.accent }} />
        <div className="grid grid-cols-2 gap-y-1 gap-x-1.5 place-items-center px-2.5 py-2.5">
          {group.flags.map((f, i) => <FlagImg key={i} emoji={f} size={24} />)}
        </div>
        <div className="text-center pb-1.5 -mt-0.5">
          <span className="text-[9.5px] font-extrabold tracking-[0.08em] text-white/85">GROUP {group.letter}</span>
        </div>
      </div>
      <div
        className="absolute top-1/2 h-px bg-black/15"
        style={dir === 'right' ? { left: '100%', width: 26 } : { right: '100%', width: 26 }}
      />
    </div>
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ show, label }: { show: boolean; label: string }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: 18, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.97 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          className="fixed left-1/2 -translate-x-1/2 bottom-[86px] z-50 flex items-center gap-2 px-4 h-10 rounded-full bg-navy text-white text-[12.5px] font-bold shadow-[0_10px_30px_rgba(15,30,60,0.3)]"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-bk-accent" />
          {label}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── MiniMap ──────────────────────────────────────────────────────────────────

interface MiniMapRound { id: string; label: string; state: 'done' | 'todo'; onClick: () => void }

function MiniMap({ rounds }: { rounds: MiniMapRound[] }) {
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 px-4 h-11 rounded-full bg-white/95 backdrop-blur border border-black/[0.07] shadow-[0_8px_28px_rgba(15,30,60,0.14)]">
      {rounds.map((r, i) => (
        <div key={r.id} className="flex items-center gap-3">
          {i > 0 && <span className="w-3 h-px bg-black/10" />}
          <button onClick={r.onClick} className="flex items-center gap-1.5 group/mm">
            <span className={`w-2.5 h-2.5 rounded-full transition-all ${r.state === 'done' ? 'bg-bk-blue' : 'bg-white border-[1.5px] border-black/25 group-hover/mm:border-bk-blue'}`} />
            <span className={`text-[11px] font-extrabold tracking-tight ${r.state === 'done' ? 'text-bk-blue' : 'text-black/45'}`}>{r.label}</span>
          </button>
        </div>
      ))}
    </div>
  );
}

// ─── Round column ──────────────────────────────────────────────────────────────

interface RoundColumnProps {
  label: string;
  ids: string[];
  width: number;
  picks: PickMap;
  scores: Record<string, { home: string; away: string }>;
  flash: Record<string, boolean>;
  startIndex: number;
  matchesByCode: Record<string, PlayoffMatch>;
  results: Record<string, 'correct' | 'wrong'>;
  onPick: (id: string, side: 'home' | 'away') => void;
  onScore: (id: string, side: 'home' | 'away', v: string) => void;
}

function RoundColumn({
  label, ids, width, picks, scores, flash, startIndex,
  matchesByCode, results, onPick, onScore,
}: RoundColumnProps) {
  return (
    <div className="shrink-0 flex flex-col" style={{ width, height: BRACKET_H }}>
      <div className="text-center text-[10.5px] font-extrabold tracking-[0.16em] text-black/35 mb-1 shrink-0">{label}</div>
      <div className="flex-1 flex flex-col justify-around">
        {ids.map((id, i) => {
          const def = MATCHES[id];
          const dbMatch = matchesByCode[id];
          const isLocked = dbMatch?.isLocked ?? false;
          const pick = picks[id] ?? null;

          const home = teamInSlot(id, 'home', picks, matchesByCode) ?? dbMatch?.homeTeam ?? null;
          const away = teamInSlot(id, 'away', picks, matchesByCode) ?? dbMatch?.awayTeam ?? null;

          const homePlaceholder = def.feeders ? feederLabel(def.feeders[0], def.losers) : 'TBD';
          const awayPlaceholder = def.feeders ? feederLabel(def.feeders[1], def.losers) : 'TBD';

          const official = (dbMatch?.homeScore != null && dbMatch?.awayScore != null)
            ? { home: dbMatch.homeScore, away: dbMatch.awayScore }
            : null;

          return (
            <div key={id} className="flex justify-center">
              <PlayoffMatchCard
                id={id}
                round={def.round}
                width={width}
                venue={dbMatch?.venue ?? def.round}
                date={dbMatch?.kickoffAt ? new Date(dbMatch.kickoffAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : null}
                home={home}
                away={away}
                pick={pick}
                locked={isLocked}
                official={official}
                result={results[id] ?? null}
                scores={scores[id] ?? { home: '', away: '' }}
                flashing={!!flash[id]}
                index={startIndex + i}
                onPick={s => onPick(id, s)}
                onScore={(s, v) => onScore(id, s, v)}
                homePlaceholder={homePlaceholder}
                awayPlaceholder={awayPlaceholder}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── GroupColumn ──────────────────────────────────────────────────────────────

function GroupColumn({ groups, dir }: { groups: GroupDef[]; dir: 'left' | 'right' }) {
  return (
    <div className="shrink-0 flex flex-col" style={{ width: CARD_WIDTHS.group, height: BRACKET_H }}>
      <div className="text-center text-[10.5px] font-extrabold tracking-[0.16em] text-black/35 mb-1 shrink-0">GROUPS</div>
      <div className="flex-1 flex flex-col justify-around items-center">
        {groups.map(g => <GroupBox key={g.letter} group={g} dir={dir} />)}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function FullBracket({ matches, userPredictions, onSavePrediction }: FullBracketProps) {
  // Build matchesByCode map
  const matchesByCode = useMemo<Record<string, PlayoffMatch>>(
    () => Object.fromEntries(matches.map(m => [m.matchCode, m])),
    [matches],
  );

  // Build picks from userPredictions + locked official results
  const [localPicks, setLocalPicks] = useState<PickMap>({});
  const [scores, setScores] = useState<Record<string, { home: string; away: string }>>({});
  const [flash, setFlash] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitDone, setSubmitDone] = useState(false);
  const [paths, setPaths] = useState<ElbowPath[]>([]);
  const [dims, setDims] = useState({ w: 3000, h: BRACKET_H + 60 });
  const [scrollState, setScrollState] = useState({ left: false, right: true });

  const scrollerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const colRefs = useRef<Record<string, HTMLDivElement | null>>({});
  // picksRef tracks the fully-merged picks (locked official + local) so that
  // onPick's inline save can resolve teams through the bracket for any round.
  const picksRef = useRef<PickMap>({});

  // Merge locked official results into picks
  const picks = useMemo<PickMap>(() => {
    const out: PickMap = { ...localPicks };
    matches.forEach(m => {
      if (m.winnerTeamId && m.homeTeamId && m.awayTeamId) {
        out[m.matchCode] = m.winnerTeamId === m.homeTeamId ? 'home' : 'away';
      }
    });
    return out;
  }, [localPicks, matches]);

  useEffect(() => { picksRef.current = picks; }, [picks]);

  // Seed picks and scores from DB predictions.
  // We MERGE rather than replace so that:
  // (a) unsaved local picks aren't wiped when an unrelated save triggers a re-seed
  // (b) scores the user is currently typing aren't cleared by partial-save optimistic updates
  useEffect(() => {
    const seed: PickMap = {};
    const seedScores: Record<string, { home: string; away: string }> = {};
    userPredictions.forEach(pred => {
      const match = matches.find(m => m.id === pred.matchId);
      if (!match || !pred.predictedWinnerId) return;
      seed[match.matchCode] = pred.predictedWinnerId === match.homeTeamId ? 'home' : 'away';
      if (pred.predictedHomeScore !== null && pred.predictedAwayScore !== null) {
        seedScores[match.matchCode] = {
          home: String(pred.predictedHomeScore),
          away: String(pred.predictedAwayScore),
        };
      }
    });
    // DB picks win on conflict; local unsaved picks for other matches are preserved
    setLocalPicks(prev => ({ ...prev, ...seed }));
    // Only fill score slots that are currently empty (don't overwrite in-progress input)
    setScores(prev => {
      const next = { ...prev };
      Object.entries(seedScores).forEach(([code, sc]) => {
        if (!next[code] || (next[code].home === '' && next[code].away === '')) {
          next[code] = sc;
        }
      });
      return next;
    });
  }, [matches, userPredictions]);

  // Results (correct/wrong) from locked matches
  const results = useMemo<Record<string, 'correct' | 'wrong'>>(() => {
    const out: Record<string, 'correct' | 'wrong'> = {};
    matches.forEach(m => {
      if (!m.winnerTeamId || !m.isLocked) return;
      const pred = userPredictions.find(p => p.matchId === m.id);
      if (!pred) return;
      out[m.matchCode] = pred.predictedWinnerId === m.winnerTeamId ? 'correct' : 'wrong';
    });
    return out;
  }, [matches, userPredictions]);

  const unlockedMatches = useMemo(() => matches.filter(m => !m.isLocked), [matches]);

  const pickedCount = useMemo(() =>
    unlockedMatches.filter(m => picks[m.matchCode]).length,
  [unlockedMatches, picks]);

  const scoredCount = useMemo(() =>
    unlockedMatches.filter(m => {
      const sc = scores[m.matchCode];
      return picks[m.matchCode] && sc?.home !== '' && sc?.away !== '';
    }).length,
  [unlockedMatches, picks, scores]);

  // ---- Pick handler with downstream cascade ----
  const onPick = useCallback((id: string, side: 'home' | 'away') => {
    const dbMatch = matchesByCode[id];
    if (dbMatch?.isLocked) return;

    const isToggleOff = picksRef.current[id] === side;

    setLocalPicks(prev => {
      const next = { ...prev };
      if (next[id] === side) delete next[id]; else next[id] = side;

      // Clear downstream picks that no longer make sense
      const downs = downstreamOf(id);
      const cleared: string[] = [];
      let changed = true;
      while (changed) {
        changed = false;
        downs.forEach(d => {
          if (next[d] == null) return;
          const newTeam = teamInSlot(d, next[d] as 'home' | 'away', next, matchesByCode);
          const oldTeam = teamInSlot(d, next[d] as 'home' | 'away', prev, matchesByCode);
          if (!newTeam || !oldTeam || newTeam.name !== oldTeam.name) {
            delete next[d]; cleared.push(d); changed = true;
          }
        });
      }

      if (cleared.length) {
        const fset: Record<string, boolean> = {};
        cleared.forEach(c => { fset[c] = true; });
        setFlash(f => ({ ...f, ...fset }));
        setToast(true);
        setTimeout(() => setFlash(f => { const n = { ...f }; cleared.forEach(c => delete n[c]); return n; }), 950);
        clearTimeout((window as unknown as Record<string, unknown>).__toastT as ReturnType<typeof setTimeout>);
        (window as unknown as Record<string, unknown>).__toastT = setTimeout(() => setToast(false), 2100);
        setScores(s => { const n = { ...s }; cleared.forEach(c => delete n[c]); return n; });
      }

      return next;
    });

    // Persist to Supabase
    if (dbMatch) {
      if (isToggleOff) {
        // Uncheck: clear the prediction in DB
        onSavePrediction(dbMatch.id, null as unknown as string, null as unknown as number, null as unknown as number).catch(() => {});
      } else {
        // picksRef.current includes locked official results, so teamInSlot resolves for all rounds
        const mergedPicks = { ...picksRef.current, [id]: side };
        const winner = teamInSlot(id, side, mergedPicks, matchesByCode)
          ?? (side === 'home' ? dbMatch.homeTeam : dbMatch.awayTeam)
          ?? null;
        if (winner) {
          const sc = scores[id] ?? { home: '', away: '' };
          onSavePrediction(
            dbMatch.id,
            winner.id,
            sc.home !== '' ? parseInt(sc.home, 10) : null as unknown as number,
            sc.away !== '' ? parseInt(sc.away, 10) : null as unknown as number,
          ).catch(() => {});
        }
      }
    }
  }, [matchesByCode, scores, onSavePrediction]);

  const onScore = useCallback((id: string, side: 'home' | 'away', v: string) => {
    const newSc = { ...(scores[id] ?? { home: '', away: '' }), [side]: v };
    setScores(s => ({ ...s, [id]: newSc }));

    // Auto-pick (or correct) winner whenever both scores are present and unequal
    const hs = parseInt(newSc.home, 10);
    const as_ = parseInt(newSc.away, 10);
    const scoresClear = !isNaN(hs) && !isNaN(as_) && hs !== as_;
    if (scoresClear) {
      const autoPick: 'home' | 'away' = hs > as_ ? 'home' : 'away';
      if (picks[id] !== autoPick) {
        setLocalPicks(prev => ({ ...prev, [id]: autoPick }));
      }
    }

    const dbMatch = matchesByCode[id];
    const pick = picks[id] ?? (scoresClear ? (hs > as_ ? 'home' : 'away') : null);
    if (dbMatch && pick) {
      const winner = teamInSlot(id, pick, picks, matchesByCode)
        ?? (pick === 'home' ? dbMatch.homeTeam : dbMatch.awayTeam)
        ?? null;
      if (winner) {
        onSavePrediction(
          dbMatch.id, winner.id,
          newSc.home !== '' ? parseInt(newSc.home, 10) : null as unknown as number,
          newSc.away !== '' ? parseInt(newSc.away, 10) : null as unknown as number,
        ).catch(() => {});
      }
    }
  }, [matchesByCode, picks, scores, onSavePrediction]);

  // ---- Batch submit ----
  const handleSubmitAll = useCallback(async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const pickedMatches = unlockedMatches.filter(m => picks[m.matchCode]);

      await Promise.all(
        pickedMatches.map(m => {
          const side = picks[m.matchCode]!;
          const winner = teamInSlot(m.matchCode, side, picks, matchesByCode)
            ?? (side === 'home' ? m.homeTeam : m.awayTeam) ?? null;
          if (!winner) return Promise.resolve();
          const sc = scores[m.matchCode] ?? { home: '', away: '' };
          return onSavePrediction(
            m.id, winner.id,
            sc.home !== '' ? parseInt(sc.home, 10) : null as unknown as number,
            sc.away !== '' ? parseInt(sc.away, 10) : null as unknown as number,
          );
        })
      );

      // Send playoff picks confirmation email
      const emailPicks = pickedMatches.map(m => {
        const side = picks[m.matchCode]!;
        const home = m.homeTeam ?? matchesByCode[m.matchCode]?.homeTeam ?? null;
        const away = m.awayTeam ?? matchesByCode[m.matchCode]?.awayTeam ?? null;
        const sc = scores[m.matchCode] ?? { home: '', away: '' };
        return {
          round: m.round,
          homeName: home?.name ?? 'TBD',
          awayName: away?.name ?? 'TBD',
          homeScore: sc.home !== '' ? parseInt(sc.home, 10) : null,
          awayScore: sc.away !== '' ? parseInt(sc.away, 10) : null,
          homeFlag: home?.flag ?? '',
          awayFlag: away?.flag ?? '',
        };
      });
      fetch('/api/playoffs/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ picks: emailPicks }),
      }).catch(() => {});

      setSubmitDone(true);
      setTimeout(() => setSubmitDone(false), 2500);
    } catch { /* individual save errors are silently swallowed */ } finally {
      setIsSubmitting(false);
    }
  }, [isSubmitting, unlockedMatches, picks, scores, matchesByCode, onSavePrediction]);

  // ---- Connector paths ----
  const measure = useCallback(() => {
    const c = contentRef.current, sc = scrollerRef.current;
    if (!c || !sc) return;
    const cr = c.getBoundingClientRect();
    const rects: Record<string, { left: number; top: number; w: number; h: number }> = {};
    c.querySelectorAll('[data-card]').forEach(el => {
      const r = el.getBoundingClientRect();
      rects[el.getAttribute('data-card')!] = { left: r.left - cr.left, top: r.top - cr.top, w: r.width, h: r.height };
    });

    const out: ElbowPath[] = [];
    Object.values(MATCHES).forEach(def => {
      if (!def.feeders || def.losers) return;
      const t = rects[def.id];
      if (!t) return;
      const active = !!picks[def.id];

      if (def.round === 'FINAL') {
        const fL = rects[def.feeders[0]], fR = rects[def.feeders[1]];
        if (fL) out.push(buildElbow(fL.left + fL.w, fL.top + fL.h / 2, t.left, t.top + t.h / 2, active));
        if (fR) out.push(buildElbow(fR.left, fR.top + fR.h / 2, t.left + t.w, t.top + t.h / 2, active));
        return;
      }
      const leftSide = def.side === 'L';
      def.feeders.forEach(fid => {
        const f = rects[fid];
        if (!f) return;
        if (leftSide) out.push(buildElbow(f.left + f.w, f.top + f.h / 2, t.left, t.top + t.h / 2, active));
        else out.push(buildElbow(f.left, f.top + f.h / 2, t.left + t.w, t.top + t.h / 2, active));
      });
    });

    setPaths(out);
    const nw = c.scrollWidth, nh = Math.max(c.scrollHeight, BRACKET_H + 40);
    setDims(d => (Math.abs(d.w - nw) < 2 && Math.abs(d.h - nh) < 2) ? d : { w: nw, h: nh });
  }, [picks]);

  useLayoutEffect(() => { measure(); }, [picks, measure]);
  useEffect(() => {
    const ts = [60, 260, 600, 1100].map(t => setTimeout(measure, t));
    const ro = new ResizeObserver(measure);
    if (contentRef.current) ro.observe(contentRef.current);
    window.addEventListener('resize', measure);
    return () => { ts.forEach(clearTimeout); ro.disconnect(); window.removeEventListener('resize', measure); };
  }, [measure]);

  // ---- Scroll state ----
  const updateScroll = useCallback(() => {
    const sc = scrollerRef.current; if (!sc) return;
    const maxL = sc.scrollWidth - sc.clientWidth;
    setScrollState({ left: sc.scrollLeft > 8, right: sc.scrollLeft < maxL - 8 });
  }, []);

  useEffect(() => {
    const sc = scrollerRef.current; if (!sc) return;
    const center = () => {
      const el = colRefs.current.final;
      if (el) {
        const scr = sc.getBoundingClientRect();
        const r = el.getBoundingClientRect();
        sc.scrollLeft = Math.max(0, r.left - scr.left + sc.scrollLeft + r.width / 2 - sc.clientWidth / 2);
      }
      updateScroll();
    };
    const t = setTimeout(center, 120);
    sc.addEventListener('scroll', updateScroll, { passive: true });
    return () => { clearTimeout(t); sc.removeEventListener('scroll', updateScroll); };
  }, [updateScroll]);

  const scrollToCol = useCallback((key: string) => {
    const sc = scrollerRef.current, el = colRefs.current[key];
    if (!sc || !el) return;
    const scr = sc.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    sc.scrollTo({ left: Math.max(0, r.left - scr.left + sc.scrollLeft + r.width / 2 - sc.clientWidth / 2), behavior: 'smooth' });
  }, []);

  const nudge = (dir: -1 | 1) => {
    const sc = scrollerRef.current; if (!sc) return;
    sc.scrollBy({ left: dir * Math.min(520, sc.clientWidth * 0.8), behavior: 'smooth' });
  };

  const setColRef = (k: string) => (el: HTMLDivElement | null) => { colRefs.current[k] = el; };


  const fHome = teamInSlot('FINAL_M01', 'home', picks, matchesByCode);
  const fAway = teamInSlot('FINAL_M01', 'away', picks, matchesByCode);
  const bHome = teamInSlot('THIRD_M01', 'home', picks, matchesByCode);
  const bAway = teamInSlot('THIRD_M01', 'away', picks, matchesByCode);

  const colProps = { picks, scores, flash, matchesByCode, results, onPick, onScore };

  return (
    <div className="min-h-screen bg-page text-navy font-sans">
      {/* NavBar */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-black/[0.07]">
        <div className="max-w-[1280px] mx-auto px-5 h-[58px] flex items-center gap-4">
          <a href="/pickem" className="flex items-center shrink-0">
            <div className="h-9 bg-navy rounded-lg px-3 flex items-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/header_logo_white.svg" alt="Clearway" className="h-5 w-auto" />
            </div>
          </a>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-extrabold tracking-tight text-navy">Tournament Bracket</div>
            <div className="text-[11px] font-semibold text-black/40">WC 2026 · Knockout Stage</div>
          </div>
        </div>
      </header>


      {/* Scroll region */}
      <div className="relative">
        {scrollState.left && (
          <button onClick={() => nudge(-1)} className="hidden sm:flex absolute left-2 top-1/2 -translate-y-1/2 z-30 w-10 h-10 rounded-full bg-white border border-black/10 shadow-[0_6px_20px_rgba(15,30,60,0.16)] items-center justify-center text-navy hover:bg-black/[0.03] transition">
            <ChevronLeft className="w-5 h-5" />
          </button>
        )}
        {scrollState.right && (
          <button onClick={() => nudge(1)} className="hidden sm:flex absolute right-2 top-1/2 -translate-y-1/2 z-30 w-10 h-10 rounded-full bg-white border border-black/10 shadow-[0_6px_20px_rgba(15,30,60,0.16)] items-center justify-center text-navy hover:bg-black/[0.03] transition">
            <ChevronRight className="w-5 h-5" />
          </button>
        )}
        {scrollState.left && <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-16 z-20 bg-gradient-to-r from-page to-transparent" />}
        {scrollState.right && <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-16 z-20 bg-gradient-to-l from-page to-transparent" />}

        <div
          ref={scrollerRef}
          className="overflow-x-auto overflow-y-auto"
          style={{
            height: 'calc(100vh - 58px - 64px)',
            scrollbarWidth: 'thin',
            scrollbarColor: 'rgba(15,30,60,0.16) transparent',
          }}
        >
          <div ref={contentRef} className="relative w-max px-8 pt-2 pb-8">
            <BracketConnectors paths={paths} width={dims.w} height={dims.h} />

            <div className="relative z-10 flex items-stretch" style={{ gap: 54 }}>
              <div ref={setColRef('groups')}><GroupColumn groups={GROUPS_LEFT} dir="right" /></div>

              <div ref={setColRef('r32')}>
                <RoundColumn label="ROUND OF 32" ids={R32_LEFT_IDS} width={CARD_WIDTHS.r32} startIndex={0} {...colProps} />
              </div>
              <div ref={setColRef('r16')}>
                <RoundColumn label="ROUND OF 16" ids={R16_LEFT_IDS} width={CARD_WIDTHS.r16} startIndex={8} {...colProps} />
              </div>
              <div ref={setColRef('qf')}>
                <RoundColumn label="QUARTERFINAL" ids={QF_LEFT_IDS} width={CARD_WIDTHS.qf} startIndex={12} {...colProps} />
              </div>
              <div ref={setColRef('sf')}>
                <RoundColumn label="SEMIFINAL" ids={['SF_M01']} width={CARD_WIDTHS.sf} startIndex={14} {...colProps} />
              </div>

              {/* Final + Bronze center */}
              <div ref={setColRef('final')} className="relative shrink-0" style={{ width: CARD_WIDTHS.final, height: BRACKET_H }}>
                <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 flex justify-center">
                  <div className="relative">
                    <div className="absolute bottom-full left-0 right-0 mb-3 text-center">
                      <div className="flex justify-center mb-1.5">
                        <Trophy className="w-9 h-9 drop-shadow-[0_4px_8px_rgba(245,158,11,0.3)]" />
                      </div>
                      <div className="text-[15px] font-black tracking-[0.1em] text-navy leading-none">THE FINAL</div>
                      <div className="mt-1 text-[11px] font-semibold text-black/45">Jul 19 · MetLife Stadium</div>
                    </div>
                    <PlayoffMatchCard
                      id="FINAL_M01" round="FINAL" width={CARD_WIDTHS.final} big
                      venue="MetLife Stadium · New York" date="Jul 19, 2026"
                      home={fHome} away={fAway}
                      pick={picks['FINAL_M01'] ?? null}
                      locked={matchesByCode['FINAL_M01']?.isLocked ?? false}
                      official={matchesByCode['FINAL_M01']?.homeScore != null ? { home: matchesByCode['FINAL_M01'].homeScore!, away: matchesByCode['FINAL_M01'].awayScore! } : null}
                      result={results['FINAL_M01'] ?? null}
                      scores={scores['FINAL_M01'] ?? { home: '', away: '' }}
                      flashing={!!flash['FINAL_M01']}
                      index={15}
                      onPick={s => onPick('FINAL_M01', s)}
                      onScore={(s, v) => onScore('FINAL_M01', s, v)}
                      homePlaceholder="Winner SF L1"
                      awayPlaceholder="Winner SF R1"
                    />
                  </div>
                </div>
                {/* Bronze */}
                <div className="absolute left-0 right-0 flex justify-center" style={{ top: 'calc(50% + 168px)' }}>
                  <div className="relative">
                    <div className="absolute bottom-full left-0 right-0 mb-2 text-center text-[10.5px] font-bold tracking-[0.12em] text-black/40">3RD PLACE · BRONZE MATCH</div>
                    <PlayoffMatchCard
                      id="THIRD_M01" round="THIRD" width={CARD_WIDTHS.bronze}
                      venue="Hard Rock · Miami" date="Jul 18, 2026"
                      home={bHome} away={bAway}
                      pick={picks['THIRD_M01'] ?? null}
                      locked={matchesByCode['THIRD_M01']?.isLocked ?? false}
                      result={results['THIRD_M01'] ?? null}
                      scores={scores['THIRD_M01'] ?? { home: '', away: '' }}
                      flashing={!!flash['THIRD_M01']}
                      index={16}
                      onPick={s => onPick('THIRD_M01', s)}
                      onScore={(s, v) => onScore('THIRD_M01', s, v)}
                      homePlaceholder="Loser SF L1"
                      awayPlaceholder="Loser SF R1"
                    />
                  </div>
                </div>
              </div>

              <div ref={setColRef('sfR')}>
                <RoundColumn label="SEMIFINAL" ids={['SF_M02']} width={CARD_WIDTHS.sf} startIndex={14} {...colProps} />
              </div>
              <div>
                <RoundColumn label="QUARTERFINAL" ids={QF_RIGHT_IDS} width={CARD_WIDTHS.qf} startIndex={12} {...colProps} />
              </div>
              <div>
                <RoundColumn label="ROUND OF 16" ids={R16_RIGHT_IDS} width={CARD_WIDTHS.r16} startIndex={8} {...colProps} />
              </div>
              <div>
                <RoundColumn label="ROUND OF 32" ids={R32_RIGHT_IDS} width={CARD_WIDTHS.r32} startIndex={0} {...colProps} />
              </div>
              <div><GroupColumn groups={GROUPS_RIGHT} dir="left" /></div>
            </div>
          </div>
        </div>
      </div>

      <Toast show={toast} label="Downstream picks cleared" />

      {/* Submit bar */}
      <div className="fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur border-t border-black/[0.07]">
        <div className="max-w-[1280px] mx-auto px-5 h-16 flex items-center gap-5">
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-1.5 mb-1.5">
              <span className="text-[13px] font-extrabold text-navy">{pickedCount}</span>
              <span className="text-[12px] font-semibold text-black/40">of {unlockedMatches.length} picks made</span>
              {scoredCount > 0 && (
                <span className="text-[11px] font-semibold text-bk-blue ml-1">· {scoredCount} with scores</span>
              )}
            </div>
            <div className="h-1.5 rounded-full bg-black/[0.07] overflow-hidden">
              <div
                className="h-full rounded-full bg-bk-blue transition-all duration-500"
                style={{ width: `${unlockedMatches.length ? (pickedCount / unlockedMatches.length) * 100 : 0}%` }}
              />
            </div>
          </div>
          <button
            onClick={handleSubmitAll}
            disabled={pickedCount === 0 || isSubmitting}
            className={[
              'shrink-0 h-10 px-6 rounded-full text-[13px] font-extrabold tracking-tight transition-all duration-200',
              submitDone
                ? 'bg-emerald-500 text-white shadow-[0_4px_16px_rgba(16,185,129,0.30)]'
                : pickedCount === 0 || isSubmitting
                ? 'bg-black/[0.06] text-black/30 cursor-not-allowed'
                : 'bg-bk-blue text-white shadow-[0_4px_16px_rgba(37,99,235,0.28)] hover:opacity-90 active:scale-[0.97]',
            ].join(' ')}
          >
            {submitDone ? '✓ Picks Saved' : isSubmitting ? 'Saving…' : 'Submit Picks'}
          </button>
        </div>
      </div>
    </div>
  );
}
