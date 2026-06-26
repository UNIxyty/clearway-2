'use client';

import { motion } from 'framer-motion';
import { FlagImage } from '@/components/FlagImage';
import { Check, XMark } from './icons';
import type { ProjTeam, RowState } from './types';

/* state: 'pending' | 'qualified' | 'out'  (positions 3/4 pass state=null) */
export function StatusIndicator({ state, mobile }: { state: RowState; mobile: boolean }) {
  if (!state) return null;
  const d = mobile ? 16 : 18;

  if (state === 'pending') {
    return (
      <span
        className="shrink-0 rounded-full border-[1.6px] border-dashed border-black/25"
        style={{ width: d, height: d }}
        title="Pending official confirmation"
      />
    );
  }

  const qualified = state === 'qualified';
  return (
    <span className="shrink-0 inline-flex items-center gap-1.5">
      <span
        className={`hidden sm:inline-flex items-center h-[18px] px-1.5 rounded-full text-[9.5px] font-extrabold tracking-tight whitespace-nowrap
                    ${qualified ? 'bg-emerald-100 text-emerald-700' : 'bg-black/[0.07] text-black/45'}`}
      >
        {qualified ? 'Qualified ✓' : 'Did not qualify'}
      </span>
      <motion.span
        initial={{ scale: 0.8 }}
        animate={{ scale: [0.8, 1.12, 1] }}
        transition={{ duration: 0.3, times: [0, 0.6, 1], ease: 'easeOut' }}
        className={`inline-flex items-center justify-center rounded-full text-white
                    ${qualified ? 'bg-emerald-500' : 'bg-slate-400'}`}
        style={{ width: d, height: d }}
      >
        {qualified ? <Check className="w-2.5 h-2.5" /> : <XMark className="w-2.5 h-2.5" />}
      </motion.span>
    </span>
  );
}

/* status: 'pending' | 'qualified' | 'out' | null(pos 3/4) */
export function TeamRow({ position, team, status, mobile }: {
  position: number; team: ProjTeam; status: RowState; mobile: boolean;
}) {
  const scored = status === 'qualified' || status === 'out';
  return (
    <div className="flex items-center gap-2.5 py-[7px]">
      <span className="shrink-0 w-5 text-left text-[12px] font-bold text-black/35 tabular-nums">{position}</span>
      <FlagImage countryCode={team.countryCode} emoji={team.emoji} size={mobile ? 16 : 20} />
      <span className={`flex-1 min-w-0 truncate ${mobile ? 'text-[13px]' : 'text-[14px]'} font-bold
                        ${status === 'out' ? 'text-black/45' : 'text-navy'}`}>
        {team.name}
      </span>
      {scored && (
        <span className={`hidden xl:inline shrink-0 text-[9px] font-extrabold uppercase tracking-wide
                          ${status === 'qualified' ? 'text-emerald-600/70' : 'text-black/30'}`}>
          {position <= 2 ? 'R32' : ''}
        </span>
      )}
      <StatusIndicator state={status} mobile={mobile} />
    </div>
  );
}
