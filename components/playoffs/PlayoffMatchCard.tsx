'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { CheckIcon, XIcon, LockIcon } from './icons';
import { FlagImg } from './FlagImg';
import type { BracketTeam } from '@/lib/playoffs/types';

interface ScoreInputProps {
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}

function ScoreInput({ value, onChange, disabled }: ScoreInputProps) {
  return (
    <input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      maxLength={2}
      value={value}
      disabled={disabled}
      onChange={e => onChange(e.target.value.replace(/[^0-9]/g, '').slice(0, 2))}
      className={[
        'w-9 h-7 text-center text-[14px] font-extrabold tabular-nums rounded-md border transition outline-none',
        disabled
          ? 'border-black/10 bg-black/[0.03] text-navy/60'
          : 'border-black/15 bg-white text-navy focus:border-bk-blue focus:ring-2 focus:ring-bk-blue/20',
      ].join(' ')}
    />
  );
}

interface NameSwapProps {
  team: BracketTeam | null;
  selected: boolean;
  placeholder: string;
  fontSize: string;
}

function NameSwap({ team, selected, placeholder, fontSize }: NameSwapProps) {
  if (!team) {
    return (
      <span className="flex-1 min-w-0 truncate text-[11.5px] italic font-semibold text-black/35">
        {placeholder}
      </span>
    );
  }
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.span
        key={team.name}
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 6 }}
        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
        className={`flex-1 min-w-0 truncate ${fontSize} ${selected ? 'font-extrabold text-bk-blue-dark' : 'font-bold text-navy'}`}
      >
        {team.name}
      </motion.span>
    </AnimatePresence>
  );
}

interface TeamRowProps {
  team: BracketTeam | null;
  selected: boolean;
  locked: boolean;
  scoreBlocked?: boolean;
  onPick: () => void;
  fontSize: string;
  placeholder: string;
}

function TeamRow({ team, selected, locked, scoreBlocked, onPick, fontSize, placeholder }: TeamRowProps) {
  const disabled = locked || !team || !!scoreBlocked;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => !disabled && onPick()}
      className={[
        'group/row w-full flex items-center gap-2.5 pl-3 pr-2.5 py-2 text-left transition-colors',
        selected ? 'bg-pickfill' : 'bg-white',
        disabled ? 'cursor-default' : 'hover:bg-black/[0.025] cursor-pointer',
      ].join(' ')}
    >
      {team
        ? <FlagImg emoji={team.flag} size={22} />
        : <span className="w-[22px] h-[16px] rounded-[3px] bg-black/[0.05] border border-dashed border-black/20 shrink-0 inline-block" />}

      <NameSwap team={team} selected={selected} placeholder={placeholder} fontSize={fontSize} />

      <span className={[
        'shrink-0 w-[18px] h-[18px] rounded-full border-2 flex items-center justify-center transition-all',
        selected
          ? 'bg-bk-blue border-bk-blue'
          : disabled
          ? 'border-black/12 bg-black/[0.03]'
          : 'border-black/20 bg-white group-hover/row:border-bk-blue/60',
      ].join(' ')}>
        {selected && <CheckIcon className="w-2.5 h-2.5 text-white" />}
      </span>
    </button>
  );
}

interface ScoreRowProps {
  home: BracketTeam | null;
  away: BracketTeam | null;
  scores: { home: string; away: string };
  enabled: boolean;
  official?: { home: number; away: number } | null;
  live?: boolean;
  onScore: (side: 'home' | 'away', v: string) => void;
}

function ScoreRow({ home, away, scores, enabled, official, live, onScore }: ScoreRowProps) {
  return (
    <div className={`px-3 pt-2 pb-2.5 transition-opacity duration-300 ${enabled ? 'opacity-100' : 'opacity-40 pointer-events-none select-none'}`}>
      <div className="flex items-center justify-center gap-1.5">
        {home
          ? <FlagImg emoji={home.flag} size={18} />
          : <span style={{ width: 18, height: 14, borderRadius: 2, background: '#e5e7eb', display: 'inline-block', flexShrink: 0 }} />}
        <ScoreInput value={scores.home} disabled={!enabled} onChange={v => onScore('home', v)} />
        <span className="text-[13px] font-black text-black/25 px-0.5">–</span>
        <ScoreInput value={scores.away} disabled={!enabled} onChange={v => onScore('away', v)} />
        {away
          ? <FlagImg emoji={away.flag} size={18} />
          : <span style={{ width: 18, height: 14, borderRadius: 2, background: '#e5e7eb', display: 'inline-block', flexShrink: 0 }} />}
      </div>
      {official && (
        <div className={`mt-1.5 text-center text-[10px] font-bold ${live ? 'text-red-600' : 'text-emerald-600'}`}>
          {live ? `LIVE ${official.home}–${official.away}` : `Actual ${official.home}–${official.away}`}
        </div>
      )}
    </div>
  );
}

export interface PlayoffMatchCardProps {
  id: string;
  round: string;
  /** Official FIFA match number (e.g. 73–104), shown on the card. */
  matchNumber?: number | null;
  width: number;
  venue: string | null;
  date: string | null;
  home: BracketTeam | null;
  away: BracketTeam | null;
  pick: 'home' | 'away' | null;
  locked: boolean;
  official?: { home: number; away: number } | null;
  result?: 'correct' | 'wrong' | null;
  pointsLabel?: string | null;
  scores: { home: string; away: string };
  flashing: boolean;
  index: number;
  onPick: (side: 'home' | 'away') => void;
  onScore: (side: 'home' | 'away', v: string) => void;
  big?: boolean;
  fullWidth?: boolean;
  homePlaceholder?: string;
  awayPlaceholder?: string;
  /** Unsaved sessionStorage draft exists for this match → show an orange dot. */
  unsavedDraft?: boolean;
  /** Match in progress (scores entered by admin, not yet published) → LIVE badge. */
  live?: boolean;
}

export function PlayoffMatchCard({
  id, round, matchNumber, width, venue, date, home, away, pick, locked, official,
  result, pointsLabel, scores, flashing, index, onPick, onScore, big = false, fullWidth = false,
  homePlaceholder = 'TBD', awayPlaceholder = 'TBD', unsavedDraft = false, live = false,
}: PlayoffMatchCardProps) {
  const scoresEnabled = !locked && !!home && !!away;

  // When scores clearly indicate a winner, block picking the other team
  const hs = parseInt(scores.home, 10);
  const as_ = parseInt(scores.away, 10);
  const scoreWinner = (!locked && !isNaN(hs) && !isNaN(as_) && hs !== as_)
    ? (hs > as_ ? 'home' : 'away')
    : null;

  return (
    <motion.div
      data-card={id}
      initial={{ opacity: 0, y: 14, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.5, delay: 0.04 + index * 0.018, ease: [0.22, 1, 0.36, 1] }}
      style={fullWidth ? undefined : { width }}
      className={[
        'relative z-10 bg-white rounded-lg border overflow-hidden',
        flashing ? 'flash-clear' : '',
        big
          ? 'border-bk-amber/40 shadow-[0_10px_30px_rgba(15,30,60,0.12)]'
          : locked
          ? 'border-black/[0.07]'
          : 'border-black/[0.09] shadow-[0_1px_2px_rgba(0,0,0,0.05)]',
      ].join(' ')}
    >
      {big && <div className="h-1 w-full bg-gradient-to-r from-bk-amber via-bk-accent to-bk-amber" />}

      {/* Unsaved-draft dot — top-right corner, separate from the status badge. */}
      {unsavedDraft && (
        <span
          className="absolute top-1 right-1 z-30 rounded-full pointer-events-none"
          style={{ width: 6, height: 6, background: '#f59e0b' }}
          aria-label="Unsaved pick"
        />
      )}

      {/* Points pill — top-left. Shown once the match is scored and the user had
          a prediction: green earned pill, or a muted "Missed" pill for 0 pts. */}
      {pointsLabel && (
        <div className="absolute top-2 left-2 z-20 pointer-events-none">
          {pointsLabel === 'miss' ? (
            <span className="px-1.5 py-0.5 rounded-full bg-black/[0.06] text-[9.5px] font-extrabold tracking-tight text-black/45">Missed</span>
          ) : (
            <span className="px-1.5 py-0.5 rounded-full bg-emerald-100 text-[9.5px] font-extrabold tracking-tight text-emerald-700">{pointsLabel}</span>
          )}
        </div>
      )}

      {/* Status circle — top-right. Green ✓ correct, gray ✕ miss, lock when
          still open. Distinct "miss" state ≠ the blank pre-match state. */}
      <div className="absolute top-2 right-2 z-20 flex items-center gap-1 pointer-events-none">
        {live && !result && (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-1.5 py-0.5 text-[8.5px] font-extrabold tracking-wide text-red-600">
            <span className="relative flex w-1.5 h-1.5">
              <span className="absolute inline-flex w-full h-full rounded-full bg-red-500 opacity-70 animate-ping" />
              <span className="relative inline-flex w-1.5 h-1.5 rounded-full bg-red-500" />
            </span>
            LIVE
          </span>
        )}
        {result === 'correct' && (
          <span className="w-[18px] h-[18px] rounded-full bg-emerald-500 flex items-center justify-center">
            <CheckIcon className="w-2.5 h-2.5 text-white" />
          </span>
        )}
        {result === 'wrong' && (
          <span className="w-[18px] h-[18px] rounded-full bg-slate-400 flex items-center justify-center">
            <XIcon className="w-2.5 h-2.5 text-white" />
          </span>
        )}
        {locked && !result && <LockIcon className="w-[14px] h-[14px] text-black/35" />}
      </div>

      {/* Official match number + venue + date */}
      <div className={`px-3 ${big ? 'pt-2.5' : 'pt-7'} pb-1.5 text-center`}>
        {matchNumber != null && (
          <div className="text-[9.5px] font-extrabold tracking-[0.1em] text-black/40">MATCH {matchNumber}</div>
        )}
        <div className="text-[10px] font-bold tracking-tight text-bk-amber truncate">{venue}</div>
        <div className="text-[9.5px] font-semibold tracking-tight text-bk-amber/70">{date}</div>
      </div>

      <TeamRow
        team={home} selected={pick === 'home'} locked={locked}
        scoreBlocked={scoreWinner !== null && scoreWinner !== 'home'}
        onPick={() => onPick('home')}
        fontSize={big ? 'text-[14px]' : 'text-[12.5px]'}
        placeholder={homePlaceholder}
      />
      <div className="h-px bg-black/[0.06] mx-3" />
      <TeamRow
        team={away} selected={pick === 'away'} locked={locked}
        scoreBlocked={scoreWinner !== null && scoreWinner !== 'away'}
        onPick={() => onPick('away')}
        fontSize={big ? 'text-[14px]' : 'text-[12.5px]'}
        placeholder={awayPlaceholder}
      />

      <div className="h-px bg-black/[0.08]" />
      <ScoreRow
        home={home} away={away} scores={scores}
        enabled={scoresEnabled} official={official ?? null} live={live}
        onScore={onScore}
      />
    </motion.div>
  );
}
