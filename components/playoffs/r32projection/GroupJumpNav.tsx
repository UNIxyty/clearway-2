'use client';

import type { GroupProjection } from './types';

/* mobile sticky pill row — A..L, smooth-scroll, active highlight */
export function GroupJumpNav({ groups, active, onJump }: {
  groups: GroupProjection[]; active: string; onJump: (code: string) => void;
}) {
  return (
    <div className="sticky top-[var(--jump-top,0px)] z-30 bg-page/95 backdrop-blur border-b border-black/[0.07] -mx-4 px-4 py-2">
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
        {groups.map(g => (
          <button key={g.groupCode} onClick={() => onJump(g.groupCode)}
            className={`shrink-0 w-8 h-8 rounded-full text-[12.5px] font-extrabold transition
                        ${active === g.groupCode ? 'bg-bk-blue text-white' : 'bg-white text-navy border border-black/10'}`}>
            {g.groupCode}
          </button>
        ))}
      </div>
    </div>
  );
}
