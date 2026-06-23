'use client';

import dynamic from 'next/dynamic';
import { PlayoffsGate } from '@/components/playoffs/PlayoffsGate';

// Client-only: the shell initializes its active tab from ?view= in a useState
// initializer. Under Next SSR that would render the default first then correct
// on hydration (flash + mismatch). ssr:false makes the URL-init run once on the
// client, so ?view=bracket is honored on direct load with no flash.
const PlayoffsPageShell = dynamic(() => import('@/components/playoffs/PlayoffsPageShell'), { ssr: false });

export default function PlayoffsRoutePage() {
  return (
    <PlayoffsGate>
      <div className="max-w-[1280px] mx-auto px-4 sm:px-5 pt-6 pb-10">
        <PlayoffsPageShell />
      </div>
    </PlayoffsGate>
  );
}
