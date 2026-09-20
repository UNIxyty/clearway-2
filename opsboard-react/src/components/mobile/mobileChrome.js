import { WALL_FONT } from '../../theme/wallFont';
// Mobile/tablet-only CHROME hues that exist nowhere in the wall colour token
// registry (theme/wallColors.js): the connection chips, the stale-feed
// banner, the primary action blue, link blue and the attention badge. Each
// literal lives ONCE, here, with the exact values from the design
// (mobile-tablet.dc.html). Flight / marker / state / limitation rendering
// NEVER reads this map — those colours all flow through the wallColors
// bridge functions (statusThemesFor, markerChipsFor, limStylesFor, wx*For,
// chromeFor, legendSwatchesFor), so a colour changed in Settings → Colours
// applies to the mobile views exactly like it does to the ops-room wall.
export const MOBILE_CHROME = {
  // LIVE connection chip (green family)
  liveBg: 'rgba(22,163,74,.16)',
  liveBorder: 'rgba(22,163,74,.4)',
  liveDot: '#16a34a',
  liveText: '#4ade80',
  // STALE banner + MVT-overdue card chrome (red family)
  staleBannerBg: '#3a1114',
  staleBannerBorder: '#5c1f23',
  staleTitle: '#fca5a5',
  staleBody: '#e3b4b6',
  staleDot: '#f87171',
  retryBg: '#5c1f23',
  retryBorder: '#7f2b30',
  retryText: '#fde2e2',
  overdueCardBg: '#1a1013',
  overdueCardBorder: '#5c1f23',
  overdueBody: '#c8a2a5',
  // Actions / links / attention accents
  actionBlue: '#2563eb',
  linkBlue: '#7fb6ea',
  attnOrange: '#f0a350',
  attnBadgeBg: '#c2410c',
  onAccent: '#ffffff', // ink on the action blue / attention badge
};

export const MONO = WALL_FONT;
