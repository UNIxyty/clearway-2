'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TeamRow } from './TeamRow';
import { useR32, qualifiedTop2 } from './context';
import type { GroupProjection, ScoringStatus, RowState } from './types';

/* props: group, status, index (stagger), mobile */
export function GroupProjectionCard({ group, status, index, mobile }: {
  group: GroupProjection; status: ScoringStatus; index: number; mobile: boolean;
}) {
  const ctx = useR32();
  const scored = status === 'scored';
  const awaiting = status === 'awaiting_confirmation';
  const correct = scored ? (ctx.scoreByGroup[group.groupCode] ?? 0) : 0;

  const rowStatus = (t: GroupProjection['teams'][number], i: number): RowState => {
    if (i > 1) return null;                 // positions 3 & 4 never scored
    if (!scored) return 'pending';
    return qualifiedTop2(ctx, t.teamId, group.groupCode) ? 'qualified' : 'out';
  };

  const topBorder = scored
    ? (correct === 2 ? '#16a34a' : 'transparent')
    : 'transparent';

  return (
    <motion.div
      id={`group-${group.groupCode}`}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.04, ease: [0.22, 1, 0.36, 1] }}
      className="scroll-mt-[150px] rounded-[12px] border bg-white overflow-hidden transition-colors"
      style={{
        padding: 16,
        borderColor: awaiting ? '#BFDBFE' : '#e5e7eb',
        background: awaiting ? '#F0F7FF' : '#ffffff',
        borderTop: `3px solid ${topBorder === 'transparent' ? (awaiting ? '#BFDBFE' : '#e5e7eb') : topBorder}`,
        boxShadow: '0 1px 2px rgba(15,30,60,0.04)',
      }}
    >
      {/* header */}
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <span className="inline-flex items-center gap-1 h-[22px] px-2 rounded-md bg-navy text-white text-[11px] font-extrabold uppercase tracking-[0.06em]">
          <span>Group</span><span>{group.groupCode}</span>
        </span>
        <AnimatePresence>
          {scored && (
            <motion.span
              key="pts"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.15, ease: 'easeOut' }}
              className={`inline-flex items-center h-[22px] px-2 rounded-full text-[11px] font-extrabold tabular-nums
                          ${correct > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-black/[0.06] text-black/40'}`}
            >
              +{correct} {correct === 1 ? 'pt' : 'pts'}
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      {/* divider above R32 positions */}
      <div>
        {group.teams.map((t, i) => (
          <React.Fragment key={t.teamId}>
            <TeamRow position={i + 1} team={t} status={rowStatus(t, i)} mobile={mobile} />
            {i === 1 && <div className="my-1 border-t border-dashed border-black/10" />}
          </React.Fragment>
        ))}
      </div>

      {/* footer summary */}
      {scored && (
        <div className="mt-2.5 pt-2.5 border-t border-black/[0.07] text-[11px] font-semibold text-black/45">
          {correct} / 2 qualifiers correct
          <span className="text-black/20"> · </span>
          <span className={correct > 0 ? 'text-emerald-600' : 'text-black/40'}>+{correct} {correct === 1 ? 'pt' : 'pts'}</span>
        </div>
      )}
      {awaiting && (
        <div className="mt-2.5 pt-2.5 border-t border-blue-200/60 text-[11px] font-medium italic text-bk-blue/70">
          Pending official confirmation
        </div>
      )}
    </motion.div>
  );
}
