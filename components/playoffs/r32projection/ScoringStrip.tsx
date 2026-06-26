'use client';

import { motion } from 'framer-motion';
import { Arrow } from './icons';

function Pill({ tone, label, value }: { tone: 'blue' | 'green' | 'orange'; label: string; value: string | number }) {
  const map = {
    blue: 'bg-white text-bk-blue-dark ring-bk-blue/15',
    green: 'bg-white text-emerald-700 ring-emerald-500/15',
    orange: 'bg-white text-bk-amber-dark ring-bk-amber/20',
  }[tone];
  return (
    <span className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[12px] font-bold ring-1 ${map}`}>
      <span className="text-black/45 font-semibold hidden md:inline">{label}:</span>
      <span className="md:hidden font-semibold text-black/45">{label.split(' ')[1] || label}:</span>
      <span className="font-extrabold tabular-nums">{value}</span>
    </span>
  );
}

export function ScoringStrip({ correctQualifiers, correctMatchups, totalPoints }: {
  correctQualifiers: number; correctMatchups: number; totalPoints: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
      className="rounded-[8px] flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4"
      style={{ background: '#EBF3FF', padding: '14px 20px' }}
    >
      <span className="text-[14px] font-extrabold text-navy shrink-0">Your R32 Projection</span>
      <div className="flex flex-wrap items-center gap-2 flex-1">
        <Pill tone="blue" label="Correct qualifiers" value={`${correctQualifiers}/24`} />
        <Pill tone="green" label="Correct matchups" value={`${correctMatchups}/16`} />
        <Pill tone="orange" label="Total R32 pts" value={totalPoints} />
      </div>
      <a href="/playoffs?view=bracket" className="shrink-0 inline-flex items-center gap-1 text-[13px] font-bold text-bk-blue hover:text-bk-blue-dark transition">
        View Full Bracket <Arrow className="w-3.5 h-3.5" />
      </a>
    </motion.div>
  );
}
