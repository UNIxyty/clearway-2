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
  onSavePrediction: (matchId: string, winnerId: string | null, homeScore: number | null, awayScore: number | null) => Promise<void>;
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
  pointsLabels: Record<string, string>;
  onPick: (id: string, side: 'home' | 'away') => void;
  onScore: (id: string, side: 'home' | 'away', v: string) => void;
}

function RoundColumn({
  label, ids, width, picks, scores, flash, startIndex,
  matchesByCode, results, pointsLabels, onPick, onScore,
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

          // R32 leaves (no feeders) get their teams from playoff_matches via the
          // admin Bracket Setup. Until an admin sets them, show that explicitly —
          // this page never guesses teams from group-stage results.
          const homePlaceholder = def.feeders ? feederLabel(def.feeders[0], def.losers) : 'Not set by admin';
          const awayPlaceholder = def.feeders ? feederLabel(def.feeders[1], def.losers) : 'Not set by admin';

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
                pointsLabel={pointsLabels[id] ?? null}
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

export function FullBracket({ matches, userPredictions, teams, onSavePrediction }: FullBracketProps) {
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
  const [isDirty, setIsDirty] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [paths, setPaths] = useState<ElbowPath[]>([]);
  const [dims, setDims] = useState({ w: 3000, h: BRACKET_H + 60 });
  const [scrollState, setScrollState] = useState({ left: false, right: true });
  const [isMobile, setIsMobile] = useState(false);
  const [mobileRound, setMobileRound] = useState('R32');

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
  // Process rounds in depth order (R32 first) so that upstream picks are in the partial
  // seed when we need teamInSlot to resolve teams for knockout rounds (where
  // match.homeTeamId/awayTeamId are null until the actual match is played).
  useEffect(() => {
    const ROUND_DEPTH: Record<string, number> = { R32: 0, R16: 1, QF: 2, SF: 3, THIRD: 4, FINAL: 5 };
    const seed: PickMap = {};
    const seedScores: Record<string, { home: string; away: string }> = {};

    const predsWithMatches = userPredictions
      .map(pred => ({ pred, match: matches.find(m => m.id === pred.matchId) }))
      .filter((x): x is { pred: typeof x['pred']; match: PlayoffMatch } =>
        !!x.match && !!x.pred.predictedWinnerId)
      .sort((a, b) =>
        (ROUND_DEPTH[a.match.round] ?? 0) - (ROUND_DEPTH[b.match.round] ?? 0));

    predsWithMatches.forEach(({ pred, match }) => {
      let side: 'home' | 'away';
      if (match.homeTeamId && match.awayTeamId) {
        // R32: teams are fixed in DB — direct comparison is safe
        side = pred.predictedWinnerId === match.homeTeamId ? 'home' : 'away';
      } else {
        // Knockout round (R16/QF/SF/Final): homeTeamId is null until played.
        // Resolve teams dynamically using the partial seed built so far.
        const homeTeam = teamInSlot(match.matchCode, 'home', seed, matchesByCode);
        const awayTeam = teamInSlot(match.matchCode, 'away', seed, matchesByCode);
        if (homeTeam?.id === pred.predictedWinnerId) side = 'home';
        else if (awayTeam?.id === pred.predictedWinnerId) side = 'away';
        else return; // upstream not seeded yet or data inconsistency — skip
      }
      seed[match.matchCode] = side;
      if (pred.predictedHomeScore !== null && pred.predictedAwayScore !== null) {
        seedScores[match.matchCode] = {
          home: String(pred.predictedHomeScore),
          away: String(pred.predictedAwayScore),
        };
      }
    });

    setLocalPicks(prev => ({ ...prev, ...seed }));
    setScores(prev => {
      const next = { ...prev };
      Object.entries(seedScores).forEach(([code, sc]) => {
        if (!next[code] || (next[code].home === '' && next[code].away === '')) {
          next[code] = sc;
        }
      });
      return next;
    });
  }, [matches, userPredictions, matchesByCode]);

  // A match is "scored" once its real result is published (home_score set) and a
  // winner is decided — gate on that, NOT on is_locked, so the badges stay in
  // sync with the "Actual X–Y" score (which also keys off home_score) and still
  // show even if a result was published without the lock flag.
  const ROUND_PTS: Record<string, number> = { R32: 1, R16: 2, QF: 5, SF: 8, FINAL: 10, THIRD: 3 };

  // Results (correct/wrong) for the current user's prediction on scored matches.
  const results = useMemo<Record<string, 'correct' | 'wrong'>>(() => {
    const out: Record<string, 'correct' | 'wrong'> = {};
    matches.forEach(m => {
      if (!m.winnerTeamId || m.homeScore == null) return;
      const pred = userPredictions.find(p => p.matchId === m.id);
      if (!pred?.predictedWinnerId) return;
      out[m.matchCode] = pred.predictedWinnerId === m.winnerTeamId ? 'correct' : 'wrong';
    });
    return out;
  }, [matches, userPredictions]);

  // Points pill text per match code. Uses the authoritative points_awarded
  // written by calculate_playoff_points; 'miss' when the user predicted but
  // earned 0. '★' prefix marks an exact-score bonus.
  const pointsLabels = useMemo<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    matches.forEach(m => {
      if (!m.winnerTeamId || m.homeScore == null) return;
      const pred = userPredictions.find(p => p.matchId === m.id);
      if (!pred?.predictedWinnerId) return;
      const winnerCorrect = pred.predictedWinnerId === m.winnerTeamId;
      const earned = pred.pointsAwarded ?? (winnerCorrect ? (ROUND_PTS[m.round] ?? 1) : 0);
      if (earned <= 0) { out[m.matchCode] = 'miss'; return; }
      const scoreCorrect = pred.predictedHomeScore !== null && pred.predictedAwayScore !== null
        && pred.predictedHomeScore === m.homeScore && pred.predictedAwayScore === m.awayScore;
      out[m.matchCode] = `${scoreCorrect ? '★ ' : ''}+${earned} ${earned === 1 ? 'pt' : 'pts'}`;
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

  // ---- Shared cascade helper ----
  // Precomputes which downstream picks are invalidated when `id` switches to `newSide`.
  // Uses picksRef.current (the full merged picks) so locked official results are included.
  const computeCascade = useCallback((id: string, newSide: 'home' | 'away' | null) => {
    const curPicks = picksRef.current;
    const nextPicks: PickMap = { ...curPicks };
    if (newSide === null) delete nextPicks[id]; else nextPicks[id] = newSide;

    const downs = downstreamOf(id);
    const clearedCodes: string[] = [];
    let changed = true;
    while (changed) {
      changed = false;
      downs.forEach(d => {
        if (nextPicks[d] == null) return;
        const newTeam = teamInSlot(d, nextPicks[d] as 'home' | 'away', nextPicks, matchesByCode);
        const oldTeam = teamInSlot(d, nextPicks[d] as 'home' | 'away', curPicks, matchesByCode);
        if (!newTeam || !oldTeam || newTeam.name !== oldTeam.name) {
          delete nextPicks[d]; clearedCodes.push(d); changed = true;
        }
      });
    }
    return clearedCodes;
  }, [matchesByCode]);

  const applyCascade = useCallback((clearedCodes: string[]) => {
    if (!clearedCodes.length) return;
    const fset: Record<string, boolean> = {};
    clearedCodes.forEach(c => { fset[c] = true; });
    setFlash(f => ({ ...f, ...fset }));
    setToast(true);
    setTimeout(() => setFlash(f => { const n = { ...f }; clearedCodes.forEach(c => delete n[c]); return n; }), 950);
    clearTimeout((window as unknown as Record<string, unknown>).__toastT as ReturnType<typeof setTimeout>);
    (window as unknown as Record<string, unknown>).__toastT = setTimeout(() => setToast(false), 2100);
    setScores(s => { const n = { ...s }; clearedCodes.forEach(c => delete n[c]); return n; });
  }, [matchesByCode]);

  // ---- Pick handler with downstream cascade ----
  const onPick = useCallback((id: string, side: 'home' | 'away') => {
    const dbMatch = matchesByCode[id];
    if (dbMatch?.isLocked) return;

    const isToggleOff = picksRef.current[id] === side;
    const newSide = isToggleOff ? null : side;
    const clearedCodes = computeCascade(id, newSide);

    setLocalPicks(prev => {
      const next = { ...prev };
      if (next[id] === side) delete next[id]; else next[id] = side;
      clearedCodes.forEach(c => delete next[c]);
      return next;
    });

    applyCascade(clearedCodes);
    setIsDirty(true);
  }, [matchesByCode, computeCascade, applyCascade]);

  const onScore = useCallback((id: string, side: 'home' | 'away', v: string) => {
    const newSc = { ...(scores[id] ?? { home: '', away: '' }), [side]: v };
    setScores(s => ({ ...s, [id]: newSc }));

    const hs = parseInt(newSc.home, 10);
    const as_ = parseInt(newSc.away, 10);
    const scoresClear = !isNaN(hs) && !isNaN(as_) && hs !== as_;

    if (scoresClear) {
      const autoPick: 'home' | 'away' = hs > as_ ? 'home' : 'away';
      // Use picksRef.current for the freshest merged picks (not the closure snapshot)
      if (picksRef.current[id] !== autoPick) {
        const clearedCodes = computeCascade(id, autoPick);
        setLocalPicks(prev => {
          const next = { ...prev, [id]: autoPick };
          clearedCodes.forEach(c => delete next[c]);
          return next;
        });
        applyCascade(clearedCodes);
      }
    }

    setIsDirty(true);
  }, [matchesByCode, scores, computeCascade, applyCascade]);

  // ---- Batch submit ----
  const handleSubmitAll = useCallback(async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setSaveError(null);
    try {
      // Snapshot BEFORE any saves so we can compute the diff for the update email
      const oldPredsMap = new Map(userPredictions.map(p => [p.matchId, p]));
      const isFirstSubmit = userPredictions.filter(p => p.predictedWinnerId).length === 0;

      const pickedMatches = unlockedMatches.filter(m => picks[m.matchCode]);

      // Resolve + save the winner for every picked match. teamInSlot walks the
      // live `picks` map (all rounds), so QF/SF/Final resolve correctly even
      // though their DB home/away team ids are still null.
      //
      // Each save is awaited independently via allSettled so that a single failed
      // upsert can be reported per-match instead of aborting the whole batch and
      // leaving a partial (e.g. 16/32) save silently behind a green "saved" UI.
      const newWinnerByMatchId = new Map<string, string>();
      type SaveUnit = { code: string; promise: Promise<unknown> };
      const saveUnits: SaveUnit[] = [];

      for (const m of pickedMatches) {
        const side = picks[m.matchCode]!;
        const winner = teamInSlot(m.matchCode, side, picks, matchesByCode)
          ?? (side === 'home' ? m.homeTeam : m.awayTeam) ?? null;
        if (!winner) {
          // A picked match whose team can't be resolved (upstream gap) — this
          // would silently drop the pick, so surface it rather than skip quietly.
          console.warn('[playoff-save] could not resolve winner for picked match', {
            matchCode: m.matchCode, side,
          });
          saveUnits.push({ code: m.matchCode, promise: Promise.reject(new Error('unresolved team')) });
          continue;
        }
        newWinnerByMatchId.set(m.id, winner.id);
        const sc = scores[m.matchCode] ?? { home: '', away: '' };
        saveUnits.push({
          code: m.matchCode,
          promise: onSavePrediction(
            m.id, winner.id,
            sc.home !== '' ? parseInt(sc.home, 10) : null,
            sc.away !== '' ? parseInt(sc.away, 10) : null,
          ),
        });
      }

      // Clear stale DB predictions for downstream picks that were cascade-cleared locally
      const pickedMatchIds = new Set(pickedMatches.map(m => m.id));
      const clearUnits: SaveUnit[] = userPredictions
        .filter(p => p.predictedWinnerId && !pickedMatchIds.has(p.matchId))
        .map(p => ({
          code: matches.find(m => m.id === p.matchId)?.matchCode ?? p.matchId,
          promise: onSavePrediction(p.matchId, null, null, null),
        }));

      const allUnits = [...saveUnits, ...clearUnits];
      const settled = await Promise.allSettled(allUnits.map(u => u.promise));

      const failedCodes = allUnits
        .filter((_, i) => settled[i].status === 'rejected')
        .map(u => u.code);

      if (failedCodes.length > 0) {
        settled.forEach((s, i) => {
          if (s.status === 'rejected') {
            console.error('[playoff-save] failed to persist prediction', {
              matchCode: allUnits[i].code,
              reason: s.reason instanceof Error ? s.reason.message : s.reason,
            });
          }
        });
        const shown = failedCodes.slice(0, 4).join(', ');
        const more = failedCodes.length > 4 ? ` +${failedCodes.length - 4} more` : '';
        setSaveError(`${failedCodes.length} pick${failedCodes.length !== 1 ? 's' : ''} failed to save (${shown}${more}). Please try again.`);
        // Keep the form dirty so the user can retry; do NOT show success.
        return;
      }

      // Compute which matches actually changed vs the pre-submit snapshot. The
      // email itself is built server-side from the freshly-saved DB rows; here we
      // only pass the diff (old values) so the route can render the change email.
      const changes = pickedMatches.flatMap(m => {
        const sc = scores[m.matchCode] ?? { home: '', away: '' };
        const newHomeScore = sc.home !== '' ? parseInt(sc.home, 10) : null;
        const newAwayScore = sc.away !== '' ? parseInt(sc.away, 10) : null;
        const newWinnerId = newWinnerByMatchId.get(m.id) ?? null;
        const oldPred = oldPredsMap.get(m.id);
        const changed =
          (oldPred?.predictedWinnerId ?? null) !== newWinnerId ||
          (oldPred?.predictedHomeScore ?? null) !== newHomeScore ||
          (oldPred?.predictedAwayScore ?? null) !== newAwayScore;
        if (!changed) return [];
        return [{
          matchId: m.id,
          oldWinnerId: oldPred?.predictedWinnerId ?? null,
          oldHomeScore: oldPred?.predictedHomeScore ?? null,
          oldAwayScore: oldPred?.predictedAwayScore ?? null,
        }];
      });

      fetch('/api/playoffs/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isFirstSubmit, changes }),
      }).catch(() => {});

      setSubmitDone(true);
      setIsDirty(false);
      setTimeout(() => setSubmitDone(false), 2500);
    } catch (err) {
      console.error('[playoff-save] unexpected error during submit', err);
      setSaveError('Something went wrong saving your picks. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }, [isSubmitting, unlockedMatches, picks, scores, matchesByCode, matches, onSavePrediction, userPredictions]);

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

  // ---- Mobile detection ----
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    setIsMobile(mq.matches);
    const fn = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);

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

  const colProps = { picks, scores, flash, matchesByCode, results, pointsLabels, onPick, onScore };

  // ---- Mobile round data ----
  const MOBILE_ROUNDS = [
    { key: 'R32',   label: 'R32',   ids: [...R32_LEFT_IDS, ...R32_RIGHT_IDS] },
    { key: 'R16',   label: 'R16',   ids: [...R16_LEFT_IDS, ...R16_RIGHT_IDS] },
    { key: 'QF',    label: 'QF',    ids: [...QF_LEFT_IDS, ...QF_RIGHT_IDS]   },
    { key: 'SF',    label: 'SF',    ids: ['SF_M01', 'SF_M02']                },
    { key: 'FINAL', label: 'Final', ids: ['FINAL_M01']                       },
    { key: 'THIRD', label: '3rd',   ids: ['THIRD_M01']                       },
  ];
  const mobileRoundIds = MOBILE_ROUNDS.find(r => r.key === mobileRound)?.ids ?? [];

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
        {/* Mobile round tabs */}
        {isMobile && (
          <div className="flex overflow-x-auto px-3 pb-0 gap-0.5 scrollbar-none">
            {MOBILE_ROUNDS.map(r => (
              <button
                key={r.key}
                onClick={() => setMobileRound(r.key)}
                className={`shrink-0 h-9 px-3.5 text-[12px] font-extrabold tracking-tight border-b-2 transition whitespace-nowrap ${mobileRound === r.key ? 'text-bk-blue border-bk-blue' : 'text-black/40 border-transparent'}`}
              >
                {r.label}
              </button>
            ))}
          </div>
        )}
      </header>


      {/* Mobile view: single-round vertical list */}
      {isMobile && (
        <div className="px-4 pt-4 pb-28 flex flex-col gap-3 max-w-[520px] mx-auto">
          {mobileRoundIds.map((id, i) => {
            const def = MATCHES[id];
            const dbMatch = matchesByCode[id];
            const isLocked = dbMatch?.isLocked ?? false;
            const pick = picks[id] ?? null;
            const home = teamInSlot(id, 'home', picks, matchesByCode) ?? dbMatch?.homeTeam ?? null;
            const away = teamInSlot(id, 'away', picks, matchesByCode) ?? dbMatch?.awayTeam ?? null;
            const homePlaceholder = def.feeders ? feederLabel(def.feeders[0], def.losers) : 'TBD';
            const awayPlaceholder = def.feeders ? feederLabel(def.feeders[1], def.losers) : 'TBD';
            const official = (dbMatch?.homeScore != null && dbMatch?.awayScore != null)
              ? { home: dbMatch.homeScore, away: dbMatch.awayScore } : null;
            return (
              <PlayoffMatchCard
                key={id}
                id={id}
                round={def.round}
                width={0}
                fullWidth
                venue={dbMatch?.venue ?? def.round}
                date={dbMatch?.kickoffAt ? new Date(dbMatch.kickoffAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : null}
                home={home}
                away={away}
                pick={pick}
                locked={isLocked}
                official={official}
                result={results[id] ?? null}
                pointsLabel={pointsLabels[id] ?? null}
                scores={scores[id] ?? { home: '', away: '' }}
                flashing={!!flash[id]}
                index={i}
                onPick={s => onPick(id, s)}
                onScore={(s, v) => onScore(id, s, v)}
                homePlaceholder={homePlaceholder}
                awayPlaceholder={awayPlaceholder}
              />
            );
          })}
        </div>
      )}

      {/* Scroll region */}
      <div className={`relative${isMobile ? ' hidden' : ''}`}>
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
                      pointsLabel={pointsLabels['FINAL_M01'] ?? null}
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
                      pointsLabel={pointsLabels['THIRD_M01'] ?? null}
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
              {saveError && (
                <span className="text-[11px] font-bold text-red-600 ml-1 truncate">· {saveError}</span>
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
            disabled={!isDirty || isSubmitting}
            className={[
              'shrink-0 h-10 px-6 rounded-full text-[13px] font-extrabold tracking-tight transition-all duration-200',
              submitDone
                ? 'bg-emerald-500 text-white shadow-[0_4px_16px_rgba(16,185,129,0.30)]'
                : !isDirty || isSubmitting
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
