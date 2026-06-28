'use client';

import { PlayoffsGate } from '@/components/playoffs/PlayoffsGate';
import { ChampionView } from '@/components/playoffs/ChampionView';
import { BackToDashboard } from '@/components/playoffs/BackToDashboard';

/*
 * Standalone World Champion pick page. Gated by the same playoffs launch gate as
 * the rest of the playoffs routes; the in-page version lives as a tab on /playoffs.
 */
export default function ChampionPage() {
  return (
    <PlayoffsGate>
      <div className="max-w-[1280px] mx-auto px-4 sm:px-5 pt-6">
        <BackToDashboard />
      </div>
      <ChampionView />
    </PlayoffsGate>
  );
}
