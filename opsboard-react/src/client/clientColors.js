// The client surface's wall palette (2026-11-10): the Board draws from WallColorsProvider's hex tokens, not from CSS
// variables, so the design's timeline tokens (shared/timeline-tokens.css) and portal tokens are given to it here as
// hex, one set per theme. The ops wall display keeps its own per-account colours and never reads this.
const LIGHT = {
  stateScheduled: '#dde2ea', stateAirborne: '#8fadd9', stateDelayed: '#e2bb67', stateCtot: '#ad99d8', stateArrived: '#c58ea9', stateAog: '#d0575b', // colour-data
  estimatedOutline: '#7d9cc4', stateCancelled: '#eceef1', textCancelled: '#5f646d', // colour-data
  hatchLight: '#f7f8fa', hatchDark: '#e0e3e7', // colour-data
  textCallsign: '#17181c', textIcao: '#14161b', textTimes: '#4b5563', textDeltaLate: '#8a4b00', textDeltaEarly: '#1f7a3a', textRegistration: '#17181c', textOperator: '#5f646d', textTicks: '#4b5563', // colour-data
  markerImp: '#b45309', markerNtm: '#c2410c', markerCaa: '#0f766e', limUnchecked: '#b91c1c', limChecked: '#dc2626', mvtRing: '#dc2626', unconfirmedRing: '#dc2626', // colour-data
  clockUtc: '#1d4ed8', clockLocal: '#17181c', // colour-data
  wxVfr: '#15803d', wxMvfr: '#b45309', wxIfr: '#b91c1c', wxLifr: '#9d174d', // colour-data
  boardBg: '#ffffff', rowAltTint: '#fafbfc', gridLines: '#eceef1', nowLine: '#2563eb', nowBadgeBg: '#eef4ff', sidebarBg: '#ffffff', sidebarText: '#5f646d', // colour-data
  tableText: '#17181c', tableRed: '#b91c1c', tableOrange: '#b45309', tableGreen: '#15803d', // colour-data
};
const DARK = {
  ...LIGHT,
  stateCancelled: '#1c2129', textCancelled: '#959ca8', // colour-data
  hatchLight: '#1a1f27', hatchDark: '#14181e', // colour-data
  textCallsign: '#eceef2', textIcao: '#14161b', textTimes: '#a7b4c8', textDeltaLate: '#f0b252', textDeltaEarly: '#5bd08a', textRegistration: '#eceef2', textOperator: '#959ca8', textTicks: '#a7b4c8', // colour-data
  markerImp: '#f0b252', markerNtm: '#ff9150', markerCaa: '#5ed3c3', limUnchecked: '#ff8f8f', limChecked: '#ff8f8f', mvtRing: '#ff8f8f', unconfirmedRing: '#ff8f8f', // colour-data
  clockUtc: '#6cbcff', clockLocal: '#eceef2', // colour-data
  wxVfr: '#5bd08a', wxMvfr: '#f0b252', wxIfr: '#ff8f8f', wxLifr: '#f9a8d4', // colour-data
  boardBg: '#14181e', rowAltTint: '#12161c', gridLines: '#1c2129', nowLine: '#5aa9f5', nowBadgeBg: '#0f2338', sidebarBg: '#14181e', sidebarText: '#959ca8', // colour-data
  tableText: '#eceef2', tableRed: '#ff8f8f', tableOrange: '#f0b252', tableGreen: '#5bd08a', // colour-data
};
export function clientWallColors(theme) { return theme === 'dark' ? DARK : LIGHT; }
