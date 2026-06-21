'use client';

import { useRef, useState } from 'react';
import { FlagImage } from '@/components/FlagImage';
import { flagCdnCodeFor } from '@/lib/playoffs/flags';

export interface SortableTeam {
  id: string;
  name: string;
  shortName: string;
}

const ROW_H = 44;
const GAP = 8;
const SLOT = ROW_H + GAP;

interface DragState { index: number; startY: number; delta: number; target: number }

/**
 * Drag-to-sort group standings (ported from Admin Console.html's GroupSortable —
 * native Pointer Events, no library). The top 2 rows are visually marked as
 * advancing. onCommit fires with the new team-id order when a drag is dropped.
 */
export function GroupSortable({
  items, onCommit, disabled = false,
}: {
  items: SortableTeam[];
  onCommit: (orderedIds: string[]) => void;
  disabled?: boolean;
}) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  dragRef.current = drag;

  const down = (e: React.PointerEvent, i: number) => {
    if (disabled || !e.isPrimary || e.button > 0) return;
    try { (e.currentTarget as Element).setPointerCapture(e.pointerId); } catch { /* noop */ }
    setDrag({ index: i, startY: e.clientY, delta: 0, target: i });
  };
  const move = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const delta = e.clientY - d.startY;
    let target = d.index + Math.round(delta / SLOT);
    target = Math.max(0, Math.min(items.length - 1, target));
    if (delta !== d.delta || target !== d.target) setDrag({ ...d, delta, target });
  };
  const up = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    try { (e.currentTarget as Element).releasePointerCapture(e.pointerId); } catch { /* noop */ }
    let target = d.index + Math.round((e.clientY - d.startY) / SLOT);
    target = Math.max(0, Math.min(items.length - 1, target));
    if (target !== d.index) {
      const arr = items.slice();
      const [m] = arr.splice(d.index, 1);
      arr.splice(target, 0, m);
      onCommit(arr.map(t => t.id));
    }
    setDrag(null);
  };

  const slotOf = (i: number) => {
    if (!drag) return i;
    const { index, target } = drag;
    if (i === index) return target;
    if (index < target && i > index && i <= target) return i - 1;
    if (index > target && i < index && i >= target) return i + 1;
    return i;
  };
  const style = (i: number): React.CSSProperties => {
    if (!drag) return { transition: 'transform 200ms cubic-bezier(.2,.8,.2,1)' };
    if (i === drag.index) return { transform: `translateY(${drag.delta}px) scale(1.02)`, zIndex: 40, transition: 'none', boxShadow: '0 14px 30px -6px rgba(0,0,0,.5)' };
    return { transform: `translateY(${(slotOf(i) - i) * SLOT}px)`, transition: 'transform 200ms cubic-bezier(.2,.8,.2,1)' };
  };

  return (
    <div className="relative select-none" style={{ height: items.length * SLOT - GAP }}>
      {/* advance divider after the top 2 */}
      <div className="absolute left-2 right-2 flex items-center gap-2 pointer-events-none" style={{ top: SLOT * 2 - GAP / 2 - 0.5 }}>
        <span className="text-[9px] font-semibold tracking-[0.18em] text-white/25">ADVANCE</span>
        <div className="flex-1 border-t border-dashed border-white/15" />
      </div>
      {items.map((team, i) => {
        const rank = slotOf(i) + 1;
        const adv = rank <= 2;
        const dr = drag && drag.index === i;
        return (
          <div
            key={team.id}
            onPointerDown={(e) => down(e, i)}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
            style={{ height: ROW_H, marginBottom: GAP, touchAction: 'none', position: 'relative', ...style(i) }}
            className={`flex items-center gap-3 rounded-lg pl-2.5 pr-2 ${disabled ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'} ${dr ? 'bg-white/[0.12] ring-1 ring-white/15' : 'bg-white/[0.045] ' + (disabled ? '' : 'hover:bg-white/[0.08]')}`}
          >
            <span className={`w-4 text-center text-[13px] font-bold tabular-nums ${adv ? 'text-blue-300' : 'text-white/30'}`}>{rank}</span>
            <FlagImage countryCode={flagCdnCodeFor(team.shortName)} emoji="" size={18} />
            <span className="flex-1 text-[13.5px] font-semibold text-white truncate tracking-tight">{team.name}</span>
            {!disabled && (
              <svg viewBox="0 0 24 24" className="w-4 h-4 text-white/25" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="9" cy="6" r="1" /><circle cx="9" cy="12" r="1" /><circle cx="9" cy="18" r="1" /><circle cx="15" cy="6" r="1" /><circle cx="15" cy="12" r="1" /><circle cx="15" cy="18" r="1" /></svg>
            )}
          </div>
        );
      })}
    </div>
  );
}
