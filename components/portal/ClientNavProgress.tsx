"use client";

// Slim 2px top progress bar for pending client-side navigations
// (Cloudflare-console feel). Next 14 App Router exposes no router events, so
// the Shell wraps router.push in startTransition and feeds isPending here.
// The bar sweeps while pending and fades out (<300ms) once the new route
// commits; usePathname is the commit signal that forces the fade even if a
// pending flag lingers across the shell's per-page remount.

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

export default function ClientNavProgress({ pending }: { pending: boolean }) {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const [fading, setFading] = useState(false);
  const fadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (pending) {
      if (fadeTimer.current) clearTimeout(fadeTimer.current);
      setVisible(true);
      setFading(false);
      return;
    }
    // pending -> false (or the route committed): fade, then unmount.
    setFading(true);
    fadeTimer.current = setTimeout(() => {
      setVisible(false);
      setFading(false);
    }, 240);
    return () => {
      if (fadeTimer.current) clearTimeout(fadeTimer.current);
    };
  }, [pending, pathname]);

  if (!visible) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[2400] h-[2px] overflow-hidden"
      style={{ opacity: fading ? 0 : 1, transition: "opacity 220ms ease" }}
    >
      <div className="cw-nav-progress-bar h-full w-1/3 rounded-full bg-cw-primary" />
    </div>
  );
}
