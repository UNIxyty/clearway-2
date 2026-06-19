'use client';

import { PlayoffsGate } from '@/components/playoffs/PlayoffsGate';
import { R32DrawView } from '@/components/playoffs/R32DrawView';

export default function R32DrawPage() {
  return (
    <PlayoffsGate>
      <R32DrawView />
    </PlayoffsGate>
  );
}
