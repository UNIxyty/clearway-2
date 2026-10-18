"use client";

// The phone shell's one breakpoint (mobile Stages 2–3): under PHONE_MAX_WIDTH the person is on a phone and the
// portal's Tier 1 pages send them to their /m counterpart; at or above it, /m pages still work (a 430 px column) and
// the desktop pages keep their own layout. One number, used by the redirect and by the checks.
import { useEffect, useState } from "react";

export const PHONE_MAX_WIDTH = 768;

export function useViewportWidth() {
  const [w, setW] = useState<number | null>(null);
  useEffect(() => {
    const read = () => setW(window.innerWidth);
    read();
    window.addEventListener("resize", read);
    return () => window.removeEventListener("resize", read);
  }, []);
  return w;
}

export const isPhoneWidth = (w: number | null) => w !== null && w < PHONE_MAX_WIDTH;
