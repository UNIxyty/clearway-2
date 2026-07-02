'use client';

/*
 * Lightweight points-breakdown tooltip. Wraps a badge trigger and shows a small
 * white popover listing the ✓/✗ scoring components + total for a scored match.
 *
 * - Desktop: appears on hover (mouse enter/leave).
 * - Mobile: tap the badge toggles it; tapping elsewhere closes it.
 *
 * Rendered through a portal to document.body with fixed positioning so it escapes
 * the card's `overflow-hidden` and framer-motion transform (which would otherwise
 * clip a narrow bracket card). No tooltip library — just React + createPortal.
 */
import {
  useCallback, useEffect, useRef, useState, type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { CheckIcon, XIcon } from './icons';
import type { BreakdownLine } from '@/lib/playoffs/pointsBreakdown';

interface Props {
  lines: BreakdownLine[];
  total: number;
  /** The badge/pill that triggers the tooltip. */
  children: ReactNode;
}

interface Coords {
  left: number;
  top: number;
  placement: 'above' | 'below';
}

export function PointsBreakdownTooltip({ lines, total, children }: Props) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<Coords | null>(null);
  const [mounted, setMounted] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => setMounted(true), []);

  const place = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    // Flip below when the badge sits near the top of the viewport.
    const placement: 'above' | 'below' = r.top < 160 ? 'below' : 'above';
    setCoords({
      left: r.left + r.width / 2,
      top: placement === 'above' ? r.top : r.bottom,
      placement,
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    place();
    const onScroll = () => place();
    const onDown = (e: Event) => {
      if (triggerRef.current && !triggerRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    document.addEventListener('pointerdown', onDown);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [open, place]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label="Points breakdown"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
        className="inline-flex cursor-pointer transition-transform active:scale-95"
      >
        {children}
      </button>

      {mounted && open && coords && createPortal(
        <div
          role="tooltip"
          className="pointer-events-none fixed z-[100] transition-opacity duration-150"
          style={{
            left: coords.left,
            top: coords.top,
            transform: `translate(-50%, ${coords.placement === 'above' ? 'calc(-100% - 8px)' : '8px'})`,
            opacity: 1,
          }}
        >
          <div
            className="rounded-lg border border-black/[0.06] bg-white shadow-[0_6px_24px_rgba(15,30,60,0.18)]"
            style={{ maxWidth: 200, padding: '10px 12px' }}
          >
            {lines.map((l, i) => (
              <div
                key={i}
                className="flex items-center gap-1.5 whitespace-nowrap text-[12px] font-semibold leading-5 text-slate-600"
              >
                {l.ok
                  ? <CheckIcon className="h-3 w-3 shrink-0 text-emerald-500" />
                  : <XIcon className="h-3 w-3 shrink-0 text-slate-400" />}
                {l.label}
              </div>
            ))}
            <div className="mt-1.5 border-t border-black/[0.08] pt-1.5 text-[12px] font-black text-navy">
              Total: +{total} pt{total === 1 ? '' : 's'}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
