import { useEffect, useState } from 'react';

// The breakpoint story (design section E). Four breakpoints, both apps:
//   0–429     phone portrait
//   430–767   large phone / phone landscape
//   768–1023  tablet portrait
//   1024+     tablet landscape and desktop
// The wall is the ONLY surface that changes with rotation (portrait = Now
// list, landscape = mini timeline); the console ignores rotation. The
// ops-room wall keeps today's rendering from 1920 up ("the ops-room wall
// above 1920" — design E, wall primary row).
//
// Width alone cannot tell a laptop from a tablet: a 13" MacBook is ~1440px
// and an iPad Pro in landscape is 1366px, so any single cut between them is
// arbitrary and gets one of the two wrong. The thing that actually differs is
// the input device — a dispatcher at a laptop has a trackpad, a tablet is
// touched — so the full wall is given to the ops-room display at 1920+ OR to
// a fine-pointer device with room for it. A touch tablet stays on the reduced
// wall at any width, because the dense ops layout has no touch affordances.

export const BP = { phone: 429, phoneWide: 767, tabletPortrait: 1023 };
export const WALL_DESKTOP_MIN_WIDTH = 1920;
// The narrowest a laptop wall may get. Below this the ops layout is cramped
// enough that the reduced timeline is the better view even with a trackpad.
export const WALL_DESKTOP_MIN_WIDTH_POINTER = 1280;

const FINE_POINTER = '(pointer: fine)';

function read() {
  if (typeof window === 'undefined') return { width: 1920, height: 1080 };
  return { width: window.innerWidth, height: window.innerHeight };
}

// Matches a mouse or trackpad, not a finger. iPadOS reports `coarse` as its
// PRIMARY pointer even with a Magic Keyboard attached, which is what we want:
// a tablet someone may also point at is still a tablet.
function readFinePointer() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true;
  return window.matchMedia(FINE_POINTER).matches;
}

export default function useViewport() {
  const [size, setSize] = useState(read);
  const [finePointer, setFinePointer] = useState(readFinePointer);

  // Re-evaluated on change, so plugging a mouse into a touch device switches
  // the wall without a reload.
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const mq = window.matchMedia(FINE_POINTER);
    const onChange = (event) => setFinePointer(event.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    let frame = 0;
    const onResize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setSize(read()));
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);
  const { width, height } = size;
  const isWallDesktop =
    width >= WALL_DESKTOP_MIN_WIDTH || (finePointer && width >= WALL_DESKTOP_MIN_WIDTH_POINTER);
  return {
    width,
    height,
    landscape: width > height,
    isPhone: width <= BP.phoneWide,
    isTabletPortrait: width >= BP.phoneWide + 1 && width <= BP.tabletPortrait,
    finePointer,
    // The reduced (tablet) timeline serves everything above phone width that
    // did not earn the full wall. Written as the complement so the two can
    // never both be true, or both false, whatever the rule above becomes.
    isWallReduced: width > BP.phoneWide && !isWallDesktop,
    isWallDesktop,
  };
}
