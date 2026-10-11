"use client";

// The floating layer under every select, menu, date picker and filter (portal redesign §2): portalled out of any
// clipping container, placed under its anchor (above it when there is no room), closed by Escape or a click outside,
// and focus goes back to the anchor. It renders inside the nearest [data-theme] element, so a popover opened in a
// themed preview (the component sheet's dark half) takes that theme.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { clsx } from "clsx";

export type Placement = "bottom-start" | "bottom-end";

export function themedRoot(el: Element | null): HTMLElement {
  const host = el?.closest<HTMLElement>("[data-theme]");
  return !host || host === document.documentElement ? document.body : host;
}

export function Popover({
  anchor, open, onClose, children, placement = "bottom-start", matchWidth = false, className, role, label, id, minWidth,
}: {
  anchor: RefObject<HTMLElement>;
  open: boolean;
  onClose: (reason: "escape" | "outside" | "select") => void;
  children: ReactNode;
  placement?: Placement;
  matchWidth?: boolean;
  className?: string;
  role?: string;
  label?: string;
  id?: string;
  minWidth?: number;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; width?: number; up: boolean } | null>(null);

  const place = useCallback(() => {
    const a = anchor.current; const p = panel.current;
    if (!a || !p) return;
    const r = a.getBoundingClientRect();
    const h = p.offsetHeight; const w = Math.max(p.offsetWidth, matchWidth ? r.width : 0, minWidth ?? 0);
    const below = window.innerHeight - r.bottom - 8; const up = below < h && r.top > below;
    let left = placement === "bottom-end" ? r.right - w : r.left;
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
    setPos({ left, top: up ? r.top - h - 6 : r.bottom + 6, width: matchWidth ? r.width : undefined, up });
  }, [anchor, placement, matchWidth, minWidth]);

  useLayoutEffect(() => { if (open) place(); else setPos(null); }, [open, place]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panel.current?.contains(t) || anchor.current?.contains(t)) return;
      onClose("outside");
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose("escape"); anchor.current?.focus(); } };
    const onMove = () => place();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
    };
  }, [open, onClose, anchor, place]);

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div
      ref={panel}
      id={id}
      role={role}
      aria-label={label}
      className={clsx("fixed z-[80] rounded-[10px] border border-cw-border bg-cw-bg-raised p-1 text-cw-text shadow-cw-pop", className)}
      style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999, width: pos?.width, minWidth, visibility: pos ? "visible" : "hidden" }}
    >
      {children}
    </div>,
    themedRoot(anchor.current),
  );
}

/** Arrow-key movement through a list of options (skipping disabled ones), with Home/End and type-ahead. */
export function useListKeys<T>(items: T[], opts: { isDisabled?: (item: T) => boolean; text?: (item: T) => string; initial?: number }) {
  const [active, setActive] = useState(opts.initial ?? -1);
  const typed = useRef({ s: "", at: 0 });
  const move = (from: number, step: number) => {
    if (!items.length) return -1;
    let i = from;
    for (let n = 0; n < items.length; n++) {
      i = (i + step + items.length) % items.length;
      if (!opts.isDisabled?.(items[i])) return i;
    }
    return from;
  };
  const onKey = (e: React.KeyboardEvent): boolean => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => move(a < 0 ? -1 : a, 1)); return true; }
    if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => move(a < 0 ? items.length : a, -1)); return true; }
    if (e.key === "Home") { e.preventDefault(); setActive(move(-1, 1)); return true; }
    if (e.key === "End") { e.preventDefault(); setActive(move(items.length, -1)); return true; }
    if (opts.text && e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey && e.key !== " ") {
      const now = Date.now(); typed.current = { s: (now - typed.current.at < 700 ? typed.current.s : "") + e.key.toLowerCase(), at: now };
      const i = items.findIndex((it) => !opts.isDisabled?.(it) && opts.text!(it).toLowerCase().startsWith(typed.current.s));
      if (i >= 0) setActive(i);
      return true;
    }
    return false;
  };
  return { active, setActive, onKey };
}
