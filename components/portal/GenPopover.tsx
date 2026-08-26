"use client";

// GEN loading-steps hover popover, rendered through a React portal to
// document.body so it overlays the Leaflet map (whose panes/controls use
// z-index up to ~1000). Position is measured from the anchor element with
// getBoundingClientRect at open time and applied with fixed positioning.

import { useLayoutEffect, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

const POPOVER_WIDTH = 288; // matches the previous w-72 popover

export default function GenPopover({
  open,
  anchorRef,
  onMouseEnter,
  onMouseLeave,
  children,
}: {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  children: ReactNode;
}) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const anchor = anchorRef.current;
    if (!anchor) {
      setPos(null);
      return;
    }
    const rect = anchor.getBoundingClientRect();
    setPos({
      top: rect.bottom,
      left: Math.max(8, Math.min(rect.right - POPOVER_WIDTH, window.innerWidth - POPOVER_WIDTH - 8)),
    });
  }, [open, anchorRef]);

  if (!open || !pos || typeof document === "undefined") return null;

  return createPortal(
    <div
      style={{ position: "fixed", top: pos.top, left: pos.left, width: POPOVER_WIDTH }}
      className="z-[2100] pt-1"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="rounded-[14px] border border-[#e6e7ea] bg-white p-3.5 shadow-[0_16px_44px_rgba(16,18,22,.16)]">
        {children}
      </div>
    </div>,
    document.body,
  );
}
