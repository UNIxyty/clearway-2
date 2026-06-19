'use client';

import { PlayoffsGate } from '@/components/playoffs/PlayoffsGate';
import { FullBracketView } from '@/components/playoffs/FullBracketView';

/*
 * Standalone Full Bracket route. Access is governed by the playoffs launch gate
 * (admins always; regular users only once an admin opens playoffs + sets a
 * deadline) — the same gate used by the /playoffs tab shell.
 */
export default function FullBracketPage() {
  return (
    <PlayoffsGate>
      <FullBracketView />
    </PlayoffsGate>
  );
}
