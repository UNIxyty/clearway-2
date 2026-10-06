// Wall text font — the ONE source every wall surface reads, built like the colour tokens (wallColors.js):
// a registry of options here, the chosen id stored per account in display settings (`settings.font`, next to
// `settings.colors`), resolved by the display and applied LIVE through the config.changed refetch.
//
// The font reaches components as a CSS variable, `--wall-font-sans`, set on <html> by applyWallFont(); every
// `fontFamily: WALL_FONT` therefore follows the setting without a reload. Its default is the shared design
// token font.wallSans: the wall's own dotted-zero Nunito build (bug 6 item 6), so a wall with no saved choice
// renders exactly as it did before this setting existed.
//
// Numbers: the wall renders times, codes and callsigns in this same text font (there is no IBM Plex Mono on the
// wall; the dotted zero was patched into Nunito for exactly that reason), so the setting moves them too. The wall
// shell sets font-variant-numeric: tabular-nums (index.css), which makes Public Sans's digits equal-width (its
// default figures are proportional); Nunito, Roboto and Avenir are tabular already; tabularDigits() measures it.
import sharedTokens from '../../../shared/design-tokens.json';

export const WALL_FONT_VAR = '--wall-font-sans';
/** The one monospace surface on the wall (LimToast's tiny code label): the shared mono token, never the setting. */
export const MONO_FONT = sharedTokens.font.mono;

/**
 * The options, in the order the settings page shows them. `stack` always ends in sans-serif: a missing font
 * falls back to another sans, never a serif. `hosted` = served from our own nginx (public/fonts); the others are
 * commercial fonts we can only name — the settings page measures whether the machine has them.
 */
export const WALL_FONTS = [
  // Zeros that cannot be read as O come first, so the default path is the safe one.
  // Dotted (the wall's own construction; tools/dotted-zero.py for Roboto and Public Sans):
  { id: 'nunito', label: 'Nunito', stack: sharedTokens.font.wallSans, hosted: true, dottedZero: true, zero: 'dotted', local: [], note: 'The wall’s own build. The default.',
    zeroVariants: { dotted: sharedTokens.font.wallSans, slashed: "'Nunito Slashed', Roboto, Avenir, Helvetica, Arial, sans-serif", plain: "'Nunito Plain', Roboto, Avenir, Helvetica, Arial, sans-serif" } },
  { id: 'roboto', label: 'Roboto', stack: "'Roboto Dotted', sans-serif", hosted: true, dottedZero: true, zero: 'dotted', local: [],
    zeroVariants: { dotted: "'Roboto Dotted', sans-serif", slashed: "'Roboto Slashed', sans-serif", plain: "'Roboto Plain', sans-serif" } },
  { id: 'public-sans', label: 'Public Sans', stack: "'Public Sans Dotted', sans-serif", hosted: true, dottedZero: true, zero: 'dotted', local: [],
    zeroVariants: { dotted: "'Public Sans Dotted', sans-serif", slashed: "'Public Sans Slashed', sans-serif", plain: "'Public Sans Plain', sans-serif" } },
  // Slashed — each font's own designed zero (bug report 7 item 4c; tools/slashed-zero.py freezes it in):
  { id: 'atkinson', label: 'Atkinson Hyperlegible Next (slashed zero)', stack: "'Atkinson Hyperlegible Next', sans-serif", hosted: true, dottedZero: true, zero: 'slashed', local: [], note: 'Braille Institute: designed so 0/O and 1/l/I cannot be confused at low acuity.' },
  { id: 'inter', label: 'Inter (slashed zero)', stack: "'Inter Slashed', sans-serif", hosted: true, dottedZero: true, zero: 'slashed', local: [], note: 'Built for screens; its own slashed zero.' },
  { id: 'plex-sans', label: 'IBM Plex Sans (slashed zero)', stack: "'CW Slashed Sans P', sans-serif", hosted: true, dottedZero: true, zero: 'slashed', local: [], note: 'Modified build, served as “CW Slashed Sans P” (OFL reserved name).' },
  { id: 'source-sans', label: 'Source Sans 3 (slashed zero)', stack: "'CW Slashed Sans S', sans-serif", hosted: true, dottedZero: true, zero: 'slashed', local: [], note: 'Holds up at small sizes. Modified build, served as “CW Slashed Sans S” (OFL reserved name).' },
  // Plain zero:
  { id: 'old-wall', label: 'Old Digital Wall', stack: "'Nunito Original', Roboto, Avenir, Helvetica, Arial, sans-serif", hosted: true, dottedZero: false, zero: 'plain', local: [], note: 'The previous wall’s exact chain — Nunito, Roboto, Avenir, Helvetica, Arial, sans-serif — with the plain Nunito 400 it loaded (its bold was synthesised).' },
  // Licensed or machine-supplied: we cannot touch their glyphs, so their zero is plain.
  { id: 'avenir', label: 'Avenir / Helvetica', stack: "'Avenir Next', 'Avenir', 'Helvetica Neue', 'Helvetica', sans-serif", hosted: false, dottedZero: false, zero: 'plain', local: ['Avenir Next', 'Avenir', 'Helvetica Neue', 'Helvetica'] },
  { id: 'arial', label: 'Arial', stack: "'Arial', 'Liberation Sans', sans-serif", hosted: false, dottedZero: false, zero: 'plain', local: ['Arial', 'Liberation Sans'] },
  { id: 'system', label: 'System sans-serif', stack: 'sans-serif', hosted: false, dottedZero: false, zero: 'plain', local: [] },
];
/** The line the settings card shows beside every plain-zero option, before it is applied. */
export const PLAIN_ZERO_WARNING = 'Plain zero — 0 and O look alike at wall distance.';
export const DEFAULT_WALL_FONT_ID = 'nunito';
/** Bug report 7 item 4b: the zero on the three fonts we build (Nunito, Roboto, Public Sans). Default: dotted. */
export const ZERO_STYLES = [{ value: 'dotted', label: 'Dotted' }, { value: 'slashed', label: 'Slashed' }, { value: 'plain', label: 'Plain' }];
export const DEFAULT_ZERO_STYLE = 'dotted';
const BY_ID = new Map(WALL_FONTS.map((f) => [f.id, f]));

/** The option for a saved id; unknown or missing → the default (never a serif, never nothing). */
export function resolveWallFont(id, zeroStyle = DEFAULT_ZERO_STYLE) {
  const font = BY_ID.get(String(id ?? '').trim()) ?? BY_ID.get(DEFAULT_WALL_FONT_ID);
  // A font we build carries the chosen zero; any other font's zero is part of the font and the choice is moot.
  const style = font.zeroVariants && font.zeroVariants[zeroStyle] ? zeroStyle : null;
  if (!style) return font;
  return { ...font, stack: font.zeroVariants[style], zero: style, dottedZero: style !== 'plain' };
}

/**
 * What components put in `fontFamily`: the variable, with the default stack as the fallback so a surface rendered
 * before applyWallFont() ran (or outside the display, e.g. a console preview) still gets the default font.
 */
export const WALL_FONT = `var(${WALL_FONT_VAR}, ${sharedTokens.font.wallSans})`;

/** Sets the variable on <html>; the whole wall re-renders in the new font with no reload. */
export function applyWallFont(id, zeroStyle = DEFAULT_ZERO_STYLE, root = typeof document !== 'undefined' ? document.documentElement : null) {
  const font = resolveWallFont(id, zeroStyle);
  if (root) root.style.setProperty(WALL_FONT_VAR, font.stack);
  return font;
}

// ── What actually renders (settings preview) ────────────────────────────────────────────────────────────────
// A font-family that the machine does not have falls through to the next name in the stack, silently. For the
// licensed options the settings page must say so: each name is measured against a known fallback — the width
// of a test string in "<name>, monospace" differs from plain "monospace" only when <name> exists. No library.
const PROBE_TEXT = 'CWY101 EVRA→EGGW 14:35Z 0123456789';
function widthIn(doc, fontFamily, weight = 400) {
  const span = doc.createElement('span');
  span.textContent = PROBE_TEXT;
  Object.assign(span.style, { position: 'absolute', left: '-9999px', top: '0', fontSize: '48px', fontFamily, fontWeight: String(weight), whiteSpace: 'nowrap' });
  doc.body.appendChild(span);
  const w = span.getBoundingClientRect().width;
  span.remove();
  return w;
}
/** Is a locally installed font with this family name available to this browser? */
export function localFontAvailable(name, doc = typeof document !== 'undefined' ? document : null) {
  if (!doc) return false;
  const mono = widthIn(doc, 'monospace'), serif = widthIn(doc, 'serif');
  return widthIn(doc, `'${name}', monospace`) !== mono || widthIn(doc, `'${name}', serif`) !== serif;
}
/**
 * Will a clock reading keep its width as the digits change, in this stack as the wall renders it (tabular-nums
 * on, kerning on)? "00:00" … "99:99" are measured at 64px after the font has loaded (self-hosted faces load
 * lazily); a spread above 4px there is under 1px at the wall's sizes and is tolerated (Arial's "11" kerning),
 * anything more (Public Sans without tabular-nums: proportional "1") would make the now-line columns jitter.
 */
export async function tabularDigits(stack, doc = typeof document !== 'undefined' ? document : null) {
  if (!doc) return null;
  try { await doc.fonts?.load?.(`700 64px ${stack}`, '0123456789:'); } catch { /* measured anyway */ }
  const span = doc.createElement('span');
  Object.assign(span.style, { position: 'absolute', left: '-9999px', top: '0', fontSize: '64px', fontFamily: stack, fontWeight: '700', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' });
  doc.body.appendChild(span);
  const widths = [];
  for (const d of '0123456789') { span.textContent = `${d}${d}:${d}${d}`; widths.push(span.getBoundingClientRect().width); }
  span.remove();
  return Math.max(...widths) - Math.min(...widths) <= 4;
}
/**
 * For one option: which family will render on THIS machine, and whether that is the one asked for.
 * → { rendered: name | null, fallback: boolean, message }
 */
export function wallFontProbe(font, doc = typeof document !== 'undefined' ? document : null) {
  if (!doc) return { rendered: null, fallback: false, message: '' };
  if (font.hosted) return { rendered: font.label.replace(/ \((dotted|slashed) zero\)$/, ''), fallback: false, message: `Served from our own server; renders the same on every screen. Zero: ${font.zero}.` };
  if (font.id === 'system') return { rendered: 'the system’s sans-serif', fallback: false, message: 'Whatever this machine’s default sans-serif is; it differs from screen to screen.' };
  const present = font.local.find((name) => localFontAvailable(name, doc)) ?? null;
  if (present) return { rendered: present, fallback: present !== font.local[0], message: present === font.local[0] ? `${present} is on this machine.` : `${font.local[0]} not found on this machine; ${present} renders instead.` };
  return { rendered: null, fallback: true, message: `${font.local.join(', ')}: none found on this machine. The system’s sans-serif renders instead (on a Linux kiosk usually Liberation Sans or DejaVu Sans).` };
}
