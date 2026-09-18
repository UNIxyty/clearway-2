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

export const BP = { phone: 429, phoneWide: 767, tabletPortrait: 1023 };
export const WALL_DESKTOP_MIN_WIDTH = 1920;

function read() {
  if (typeof window === 'undefined') return { width: 1920, height: 1080 };
  return { width: window.innerWidth, height: window.innerHeight };
}

export default function useViewport() {
  const [size, setSize] = useState(read);
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
  return {
    width,
    height,
    landscape: width > height,
    isPhone: width <= BP.phoneWide,
    isTabletPortrait: width >= BP.phoneWide + 1 && width <= BP.tabletPortrait,
    // The wall's reduced (tablet) timeline serves 768 up to the ops wall.
    isWallReduced: width > BP.phoneWide && width < WALL_DESKTOP_MIN_WIDTH,
    isWallDesktop: width >= WALL_DESKTOP_MIN_WIDTH,
  };
}
