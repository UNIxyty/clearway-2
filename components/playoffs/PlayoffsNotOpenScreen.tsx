'use client';

import Link from 'next/link';

/**
 * Shown to non-admin users when the playoffs feature is closed. Renders WITHIN
 * the app shell (the main nav stays), replacing only the page content — it's a
 * "not available yet" state, not a 403.
 */
export function PlayoffsNotOpenScreen() {
  return (
    <div className="min-h-[60vh] bg-[#f5f5f5] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-[480px] bg-white rounded-2xl border border-black/[0.08] shadow-[0_2px_12px_rgba(15,30,60,0.06)] p-8 text-center">
        <div className="mx-auto mb-5 w-12 h-12 rounded-full bg-bk-blue/10 flex items-center justify-center">
          <svg viewBox="0 0 24 24" className="w-7 h-7 text-bk-blue/70" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="11" width="16" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" />
          </svg>
        </div>
        <h1 className="text-[20px] font-black tracking-tight text-navy">Playoffs Predictions Aren&apos;t Open Yet</h1>
        <p className="mt-2 text-[14px] font-semibold text-black/45 leading-relaxed">
          Check back soon — we&apos;ll let you know when you can start predicting the knockout stage.
        </p>
        <Link href="/pickem"
          className="mt-6 inline-flex items-center justify-center h-10 px-5 rounded-xl bg-bk-blue hover:bg-bk-blue-dark text-white text-[13.5px] font-extrabold transition">
          ← Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
