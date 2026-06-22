'use client';

import { PlayoffsGate } from '@/components/playoffs/PlayoffsGate';
import PlayoffsPageShell from '@/components/playoffs/PlayoffsPageShell';

/*
 * /playoffs — the launch gate (admins always; regular users once opened) wraps
 * the design's tab-switcher shell, which mounts the real R32DrawView /
 * FullBracketView (embedded) + the Admin Tools panel.
 */
export default function PlayoffsRoutePage() {
  return (
    <PlayoffsGate>
      <div className="max-w-[1280px] mx-auto px-4 sm:px-5 pt-6 pb-10">
        <PlayoffsPageShell />
      </div>
    </PlayoffsGate>
  );
}
