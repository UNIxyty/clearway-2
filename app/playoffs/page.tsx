'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { useMemo } from 'react';
import { usePlayoffMatches } from '@/lib/hooks/usePlayoffMatches';
import { usePlayoffPredictions } from '@/lib/hooks/usePlayoffPredictions';
import { useIsAdmin } from '@/lib/hooks/useIsAdmin';

const card = (i: number) => ({
  initial: { opacity: 0, y: 18 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.45, delay: i * 0.1, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
});

export default function PlayoffsLandingPage() {
  const { matches } = usePlayoffMatches();
  const { predictions } = usePlayoffPredictions();
  const { isAdmin } = useIsAdmin();

  const { predicted, total } = useMemo(() => {
    const total = matches.length || 32;
    const predicted = predictions.filter(p => p.predictedWinnerId).length;
    return { predicted, total };
  }, [matches, predictions]);

  return (
    <div className="min-h-screen bg-[#f5f5f5]">
      <div className="max-w-4xl mx-auto px-5 pt-10 pb-16">
        <motion.div {...card(0)}>
          <p className="text-[12px] font-extrabold uppercase tracking-[0.14em] text-[#f59e0b]">Knockout Stage · World Cup 2026</p>
          <h1 className="text-[34px] font-black tracking-tight text-navy mt-1">Playoffs</h1>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-7">
          <motion.div {...card(1)}
            className="bg-white rounded-2xl border border-black/[0.07] p-6 shadow-[0_1px_3px_rgba(0,0,0,0.05)] flex flex-col">
            <div className="w-11 h-11 rounded-xl bg-[#1a56db]/10 flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-[#1a56db]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
              </svg>
            </div>
            <h2 className="text-[18px] font-black text-navy">R32 Draw</h2>
            <p className="text-[13.5px] font-semibold text-black/45 mt-1 flex-1">See how teams qualified from your predicted groups</p>
            <Link href="/playoffs/r32-draw"
              className="mt-5 inline-flex items-center justify-center h-11 rounded-xl bg-[#1a56db] hover:bg-[#1648b8] text-white text-[14px] font-extrabold transition">
              View R32 Draw →
            </Link>
          </motion.div>

          <motion.div {...card(2)}
            className="bg-white rounded-2xl border border-black/[0.07] p-6 shadow-[0_1px_3px_rgba(0,0,0,0.05)] flex flex-col">
            <div className="w-11 h-11 rounded-xl bg-[#f59e0b]/10 flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-[#f59e0b]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 6h6M3 18h6M9 6v12M9 12h6M15 12h6M15 9v6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h2 className="text-[18px] font-black text-navy">Full Bracket</h2>
            <p className="text-[13.5px] font-semibold text-black/45 mt-1 flex-1">Pick your winners across all rounds</p>
            <Link href="/playoffs/bracket"
              className="mt-5 inline-flex items-center justify-center h-11 rounded-xl bg-[#f59e0b] hover:bg-[#e08c08] text-white text-[14px] font-extrabold transition">
              Open Bracket →
            </Link>
          </motion.div>
        </div>

        <motion.p {...card(3)} className="mt-5 text-center text-[13px] font-semibold text-black/40">
          You have predicted {predicted} / {total} matches
        </motion.p>

        {isAdmin && (
          <motion.div {...card(4)}
            className="mt-6 rounded-2xl bg-navy text-white p-6 shadow-[0_8px_28px_rgba(15,30,60,0.18)]">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-bk-amber">Admin Tools</p>
            <div className="mt-3 flex flex-wrap gap-2.5">
              <Link href="/admin/playoffs/bracket-setup"
                className="inline-flex items-center h-10 px-4 rounded-lg bg-white/10 hover:bg-white/20 text-white text-[13px] font-bold transition">
                Bracket Setup
              </Link>
              <Link href="/admin/playoffs/results"
                className="inline-flex items-center h-10 px-4 rounded-lg bg-white/10 hover:bg-white/20 text-white text-[13px] font-bold transition">
                Enter Results
              </Link>
              <Link href="/admin/email-tools"
                className="inline-flex items-center h-10 px-4 rounded-lg bg-white/10 hover:bg-white/20 text-white text-[13px] font-bold transition">
                Email Tools
              </Link>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
