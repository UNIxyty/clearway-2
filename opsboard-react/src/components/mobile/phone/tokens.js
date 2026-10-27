// The phone wall's colours, from the ROOM's palette (2026-10-27): the same resolved wall colours the ops-room display
// paints with (useWallColors — per-account settings, defaults otherwise), mapped onto the design's roles. The design
// supplied the roles and the structure (clearway-mobile-tokens.css); the shades are the wall's. Switching the portal to
// light or dark changes nothing here — the portal's theme is not an input.
import { chromeFor, limStylesFor, markerChipsFor, withAlpha } from '../../../theme/wallColors';
import { MONO_FONT, WALL_FONT } from '../../../theme/wallFont';

const hex = (v) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : null);
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
/** a → b by t (0..1), both "#rrggbb"; anything else falls back to a. */
export function mix(a, b, t) {
  const A = hex(a), B = hex(b);
  if (!A || !B) return a;
  const x = rgb(A), y = rgb(B);
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
}

/** Every --mw-* custom property, as a style object for the phone wall's root. */
export function phoneTokens(c) {
  const chrome = chromeFor(c);
  const chips = markerChipsFor(c);
  const lim = limStylesFor(c);
  const bg1 = hex(c.boardBg) || '#0b111e';
  const bar = hex(c.sidebarBg) || '#0e1524';
  const grid = hex(c.gridLines) || '#232c3d';
  const text = hex(c.sidebarText) || '#b7c2dc';
  const head = hex(chrome.sidebarHeading) || hex(c.textCallsign) || '#f2f5fb';
  const body = hex(c.tableText) || '#ccd6ee';
  const utc = hex(chrome.clockUtc) || '#6dc4ff';
  const accentText = hex(chrome.accent) || '#6dc4ff';
  const ok = hex(c.textDeltaEarly) || '#3fe97a';
  const warn = hex(c.textDeltaLate) || '#ffb224';
  const bad = hex(chrome.limNum) || '#ff6b60';
  const t = {
    '--mw-font': WALL_FONT,
    '--mw-font-raw': MONO_FONT,
    '--mw-scrim': withAlpha(mix(bg1, '#000000', 0.6), 0.72),
    '--mw-bg-0': mix(bg1, '#000000', 0.35),
    '--mw-bg-1': bg1,
    '--mw-bg-2': bar,
    '--mw-surface-1': mix(bg1, '#ffffff', 0.025),
    '--mw-surface-2': mix(bg1, '#ffffff', 0.045),
    '--mw-surface-3': mix(bg1, '#ffffff', 0.085),
    '--mw-surface-4': mix(bg1, '#ffffff', 0.15),
    '--mw-line-1': mix(grid, bg1, 0.35),
    '--mw-line-2': grid,
    '--mw-line-3': mix(grid, '#ffffff', 0.1),
    '--mw-text-1': head,
    '--mw-text-2': body,
    '--mw-text-3': mix(text, bg1, 0.22),
    '--mw-text-4': mix(text, bg1, 0.42),
    '--mw-on-solid': bg1,
    '--mw-accent-text': accentText,
    '--mw-accent-soft': withAlpha(accentText, 0.16),
    '--mw-accent-line': withAlpha(accentText, 0.45),
    '--mw-utc': utc,
    '--mw-utc-soft': withAlpha(utc, 0.11),
    '--mw-utc-line': withAlpha(utc, 0.45),
    '--mw-ok': ok, '--mw-ok-soft': withAlpha(ok, 0.16), '--mw-ok-line': withAlpha(ok, 0.45),
    '--mw-warn': warn, '--mw-warn-soft': withAlpha(warn, 0.14), '--mw-warn-line': withAlpha(warn, 0.45),
    '--mw-bad': bad, '--mw-bad-solid': mix(bad, '#000000', 0.12), '--mw-bad-soft': withAlpha(bad, 0.16), '--mw-bad-line': withAlpha(bad, 0.5),
    '--mw-wall-edit': warn, '--mw-wall-edit-soft': withAlpha(warn, 0.12),
    '--mw-st-scheduled': hex(c.stateScheduled) || head,
    '--mw-st-delayed': hex(c.stateDelayed) || warn,
    '--mw-st-ctot': hex(c.stateCtot) || '#af92e8',
    '--mw-st-airborne': hex(c.stateAirborne) || '#74aef0',
    '--mw-st-arrived': hex(c.stateArrived) || '#dd93bd',
    '--mw-st-cancelled': hex(c.textCancelled) || '#a7aec4',
    '--mw-fc-vfr': hex(c.wxVfr) || ok,
    '--mw-fc-mvfr': hex(c.wxMvfr) || warn,
    '--mw-fc-ifr': hex(c.wxIfr) || bad,
    '--mw-fc-lifr': hex(c.wxLifr) || '#d84ad0',
  };
  // The five checks: IMP, NTM and CAA are the wall's marker chips; LIM is the wall's limitation colour; WX has no
  // marker of its own on the wall, so it is the neutral chip.
  for (const [k, m] of [['imp', chips.IMP], ['ntm', chips.NTM], ['caa', chips.CAA]]) {
    t[`--mw-chk-${k}-bg`] = m.bg; t[`--mw-chk-${k}-fg`] = m.text; t[`--mw-chk-${k}-line`] = m.border;
  }
  const limHex = hex(c.limUnchecked) || bad;
  t['--mw-chk-lim-bg'] = withAlpha(limHex, 0.2); t['--mw-chk-lim-fg'] = limHex; t['--mw-chk-lim-line'] = lim.checkedBorder || withAlpha(limHex, 0.5);
  t['--mw-chk-wx-bg'] = t['--mw-surface-4']; t['--mw-chk-wx-fg'] = body; t['--mw-chk-wx-line'] = t['--mw-line-3'];
  return t;
}

/** "var(--mw-…)" — the only way component code names a colour or a font. */
export const v = (name) => `var(--mw-${name})`;
