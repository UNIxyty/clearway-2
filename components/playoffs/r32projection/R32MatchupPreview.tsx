'use client';

import { motion } from 'framer-motion';
import { FlagImage } from '@/components/FlagImage';
import { Lock } from './icons';
import { useR32, matchupStatus } from './context';
import type { R32Pairing, ScoringStatus, MatchupState } from './types';

function MatchupRow({ pairing, status, mobile, index }: {
  pairing: R32Pairing; status: MatchupState | 'pending'; mobile: boolean; index: number;
}) {
  const ctx = useR32();
  const home = ctx.teamById[pairing.home];
  const away = ctx.teamById[pairing.away];
  const fs = mobile ? 13 : 14;
  const fl = mobile ? 16 : 18;

  const badge = status === 'confirmed'
    ? { cls: 'bg-emerald-100 text-emerald-700', txt: 'Match confirmed ✓' }
    : status === 'partial'
      ? { cls: 'bg-orange-100 text-orange-600', txt: 'Partially correct' }
      : status === 'miss'
        ? { cls: 'bg-black/[0.06] text-black/45', txt: 'Neither qualified' }
        : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: 0.04 + index * 0.02, ease: [0.22, 1, 0.36, 1] }}
      className="flex items-center gap-2 rounded-[10px] border border-black/[0.08] bg-white px-3 py-2.5"
      style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}
    >
      <div className="flex items-center gap-2 min-w-0 flex-1 justify-end text-right">
        <span className="truncate font-bold text-navy" style={{ fontSize: fs }}>{home?.name ?? 'TBD'}</span>
        <FlagImage countryCode={home?.countryCode ?? null} emoji={home?.emoji} size={fl} />
      </div>
      <span className="shrink-0 text-[10px] font-bold italic text-black/30 px-1">vs</span>
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <FlagImage countryCode={away?.countryCode ?? null} emoji={away?.emoji} size={fl} />
        <span className="truncate font-bold text-navy" style={{ fontSize: fs }}>{away?.name ?? 'TBD'}</span>
      </div>
      {badge && (
        <span className={`shrink-0 hidden sm:inline-flex items-center h-[20px] px-2 rounded-full text-[10px] font-extrabold tracking-tight ${badge.cls}`}>
          {badge.txt}
        </span>
      )}
    </motion.div>
  );
}

export function R32MatchupPreview({ pairings, scoringStatus, mobile }: {
  pairings: R32Pairing[] | null; scoringStatus: ScoringStatus; mobile: boolean;
}) {
  const ctx = useR32();
  const show = scoringStatus === 'awaiting_confirmation' || scoringStatus === 'scored';
  return (
    <section className="mt-8">
      <div className="flex items-end gap-3 mb-4">
        <h2 className="text-[18px] sm:text-[20px] font-black tracking-tight text-navy">Your Projected R32 Matchups</h2>
        <span className="flex-1 h-[3px] rounded-full bg-bk-amber/80 mb-1.5" />
      </div>

      {!show || !pairings ? (
        <div className="rounded-[12px] border border-dashed border-black/15 bg-white/60 py-14 flex flex-col items-center justify-center text-center px-6">
          <span className="w-12 h-12 rounded-full bg-black/[0.04] flex items-center justify-center mb-3 text-black/30">
            <Lock className="w-5 h-5" />
          </span>
          <p className="text-[13.5px] font-medium italic text-black/45 max-w-[340px]">
            Your R32 matchups will appear here once the group stage ends.
          </p>
        </div>
      ) : (
        <div className={`grid gap-3 ${mobile ? 'grid-cols-1' : 'grid-cols-2'}`}>
          {pairings.map((p, i) => (
            <MatchupRow key={p.matchCode} pairing={p}
              status={scoringStatus === 'scored' ? matchupStatus(ctx, p.home, p.away) : 'pending'}
              mobile={mobile} index={i} />
          ))}
        </div>
      )}
    </section>
  );
}
