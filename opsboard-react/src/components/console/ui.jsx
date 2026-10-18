import { createContext, useContext, useEffect, useRef, useState } from 'react';
import Icon from './icons';
import portalTokensCss from '../../../../shared/portal-tokens.css?raw';
import clientTokensCss from '../../../../shared/client-tokens.css?raw';
import mobileTokensCss from '../../../../shared/mobile-tokens.css?raw';

// Display Console UI kit — the portal's design system ("Console Screen.dc.html", wall console Stage 1, 2026-10-18):
// Public Sans / IBM Plex Mono, 10/14/16px radii, hairline borders and soft card shadows, and every colour a --cw-*
// token (shared/portal-tokens.json), so the console follows the portal's light / dark / match-device theme
// (theme/portalTheme.js sets data-theme on <html>). Flight status pills use --ca-st-* and check chips --mx-chk-*
// (shared/client-tokens.css, shared/mobile-tokens.css), as the design does. Every Console page composes from this
// kit; the wall display keeps its own per-account colours and font and reads none of this (components/wall-preview/).
//
// ONE rule, checked by scripts/check-console-theme.mjs: no hard-coded colour in a console file. A line that must
// carry a literal (a colour picker's own gradients) says why and ends in `// colour-data`.

// ── Design tokens ────────────────────────────────────────────────────────────
// The console's names for the portal's tokens (docs/portal-tokens.md). Each is a var(--cw-*) reference, so a value
// is never copied here and the theme can change under a running page.
const v = (name) => `var(--cw-${name})`;

export const t = {
  font: "'Public Sans', system-ui, sans-serif",
  mono: "'IBM Plex Mono', monospace",
  // text
  ink: v('text'),
  body: v('text-body'),
  muted: v('text-muted'),
  faint: v('text-muted'),
  ghost: v('text-disabled'),
  // surfaces
  canvas: v('bg-sunken'),
  surface: v('bg-sunken'),
  card: v('bg-surface'),
  raised: v('bg-raised'),
  subtle: v('bg-sunken'),
  wash: v('bg-hover'),
  segment: v('bg-sunken'),
  scrim: v('bg-scrim'),
  // borders
  border: v('border'),
  borderInput: v('border-control'),
  borderStrong: v('border-strong'),
  borderInner: v('divider'),
  rowLine: v('divider'),
  // accents
  blue: v('primary'),
  blueHover: v('primary-hover'),
  blueDeep: v('text-link'),
  blueTint: v('primary-tint'),
  blueChip: v('primary-tint'),
  blueWash: v('primary-tint'),
  blueBorder: v('primary-tint-border'),
  blueInk: v('text-body'),
  onPrimary: v('text-on-primary'),
  green: v('success'),
  greenDeep: v('success-text'),
  greenTint: v('success-tint'),
  greenBorder: v('success-border'),
  red: v('danger'),
  redDeep: v('danger-text'),
  redTint: v('danger-tint'),
  redBorder: v('danger-border'),
  redSolid: v('danger-solid'),
  amber: v('warning-text'),
  amberDeep: v('warning-text'),
  amberDot: v('warning'),
  amberTint: v('warning-tint'),
  amberWash: v('warning-tint'),
  amberBorder: v('warning-border'),
  orange: v('orange'),
  orangeText: v('orange-text'),
  orangeTint: v('orange-tint'),
  info: v('info'),
  infoText: v('info-text'),
  infoTint: v('info-tint'),
  neutralText: v('neutral-text'),
  neutralTint: v('neutral-tint'),
  diffText: v('diff-text'),
  diffTint: v('diff-tint'),
  // inverse (toasts, active filter chips)
  inkFill: v('ink'),
  onInk: v('on-ink'),
  // skeletons
  skeleton: v('skeleton'),
  // elevation
  shadow: v('shadow-1'),
  shadowPanel: v('shadow-2'),
  shadowPop: v('shadow-pop'),
};

// Limitation type chips, each by its meaning: the wall's check colours (--mx-chk-*) where the type is a check, the
// wall legend's status colours (--ca-st-*) where it is a flight state, the portal's semantic tints for the rest.
export const LIM_CHIP = {
  OPS: { c: 'var(--cw-neutral-text)', b: 'var(--cw-neutral-tint)' },
  AOG: { c: 'var(--ca-st-aog-fg)', b: 'var(--ca-st-aog-bg)' },
  WX: { c: 'var(--mx-chk-wx-fg)', b: 'var(--mx-chk-wx-bg)' },
  CTOT: { c: 'var(--ca-st-ctot-fg)', b: 'var(--ca-st-ctot-bg)' },
  PAX: { c: 'var(--ca-sens-text)', b: 'var(--ca-sens-tint)' },
  CREW: { c: 'var(--cw-info-text)', b: 'var(--cw-info-tint)' },
  NTM: { c: 'var(--mx-chk-ntm-fg)', b: 'var(--mx-chk-ntm-bg)' },
  IMP: { c: 'var(--mx-chk-imp-fg)', b: 'var(--mx-chk-imp-bg)' },
};
export function limChip(type) {
  return LIM_CHIP[type] || LIM_CHIP.OPS;
}

// ── Global console CSS (tokens, hover states, keyframes, placeholders) ──────
// The three token sheets travel inside the console's own <style>, so they exist only while the console is mounted:
// the wall display's document never defines a --cw-* token (the rig's console-theme check reads that back).
const GLOBAL_CSS = `
  html[data-theme] body, html[data-theme] #root { background: var(--cw-bg-page); color: var(--cw-text); }
  .cw-console { font-family: ${t.font}; color: ${t.ink}; }
  .cw-console ::selection { background: var(--cw-primary-tint); }
  .cw-console input::placeholder, .cw-console textarea::placeholder { color: var(--cw-text-placeholder); }
  .cw-console input, .cw-console textarea, .cw-console button { font-family: inherit; }
  @keyframes cwspin { to { transform: rotate(360deg); } }
  @keyframes cwfade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
  @keyframes cw-shimmer { 0% { background-position: -320px 0; } 100% { background-position: 320px 0; } }
  .cw-fade { animation: cwfade .22s ease; }
  /* The portal's skeleton: shimmer 1400 ms linear (app/globals.css, §1.5). */
  .cw-skel { background: linear-gradient(90deg, var(--cw-skeleton) 0, var(--cw-skeleton-shine) 50%, var(--cw-skeleton) 100%); background-size: 640px 100%; animation: cw-shimmer 1400ms linear infinite; border-radius: 4px; }
  .cw-skel-still { background: var(--cw-skeleton); border-radius: 4px; }
  /* Motion: the OS setting when the portal's Motion is "Match device"; the portal's "Reduce" (data-motion) regardless. */
  @media (prefers-reduced-motion: reduce) {
    .cw-fade, .cw-skel, .cw-motion-decor { animation: none !important; }
  }
  html[data-motion="reduce"] .cw-console *, html[data-motion="reduce"] .cw-console *::before, html[data-motion="reduce"] .cw-console *::after { animation-duration: 0.001ms !important; animation-iteration-count: 1 !important; transition-duration: 0.001ms !important; scroll-behavior: auto !important; }
  html[data-motion="reduce"] .cw-skel, html[data-motion="reduce"] .cw-fade, html[data-motion="reduce"] .cw-motion-decor { animation: none !important; }
  .cw-hover-surface:hover { background: var(--cw-bg-hover) !important; }
  .cw-hover-primary:hover { background: var(--cw-primary-hover) !important; }
  .cw-hover-danger:hover { background: var(--cw-danger-border) !important; }
  .cw-hover-row:hover { background: var(--cw-bg-hover); }
`;

export function ConsoleStyles() {
  return <style>{`${portalTokensCss}\n${clientTokensCss}\n${mobileTokensCss}\n${GLOBAL_CSS}`}</style>;
}

// ── Loading: the portal's skeletons and the 120 / 400 ms rule ───────────────
// A skeleton draws the shape of what is coming, in the page's real grid. It is skipped when data lands within
// 120 ms (nothing flashes), and once shown it stays at least 400 ms (nothing flickers); each region then swaps in
// one step. The phase is 'blank' (waiting, under 120 ms), 'skeleton' or 'content'.
export function useLoadPhase(loading, { delay = 120, minShow = 400 } = {}) {
  const [phase, setPhase] = useState(loading ? 'blank' : 'content');
  const shownAt = useRef(0);
  useEffect(() => {
    if (loading) {
      const id = setTimeout(() => { shownAt.current = Date.now(); setPhase('skeleton'); }, delay);
      return () => clearTimeout(id);
    }
    const held = shownAt.current ? Math.max(0, minShow - (Date.now() - shownAt.current)) : 0;
    const id = setTimeout(() => { shownAt.current = 0; setPhase('content'); }, held);
    return () => clearTimeout(id);
  }, [loading, delay, minShow]);
  return phase;
}

/** One shimmering bar. `w` may be a number (px) or a CSS width. */
export function Skel({ w = '60%', h = 11, round = 4, still = false, style = {} }) {
  return <span aria-hidden className={still ? 'cw-skel-still' : 'cw-skel'} style={{ display: 'block', width: w, height: h, borderRadius: round, ...style }} />;
}

const SKEL_WIDTHS = ['70%', '55%', '80%', '45%', '62%', '50%', '38%', '66%'];
/** Table rows in the page's real column grid: the same `columns` the TableShell draws. */
export function TableSkeleton({ columns, rows = 7, rowHeight = 52, label = 'Loading' }) {
  return (
    <div role="status" aria-label={label} aria-busy="true">
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} style={{ display: 'grid', gridTemplateColumns: columns, gap: 16, alignItems: 'center', minHeight: rowHeight, padding: '0 18px', borderBottom: `1px solid ${t.rowLine}` }}>
          {columns.split(/\s+/).map((_, c) => <Skel key={c} w={SKEL_WIDTHS[(r + c) % SKEL_WIDTHS.length]} />)}
        </div>
      ))}
    </div>
  );
}

/** Card lists: three cards of the real card's shape. */
export function SkeletonCards({ count = 3, height = 140, label = 'Loading' }) {
  return (
    <div role="status" aria-label={label} aria-busy="true" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} style={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: 14, padding: '16px 18px', minHeight: height, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Skel w="38%" h={14} />
          <Skel w="72%" />
          <Skel w="55%" still />
        </div>
      ))}
    </div>
  );
}

// ── Spinner ──────────────────────────────────────────────────────────────────
export function Spinner({ size = 16, track = t.borderInput, color = t.blue }) {
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        border: `2px solid ${track}`,
        borderTopColor: color,
        animation: 'cwspin .7s linear infinite',
        flexShrink: 0,
        display: 'inline-block',
      }}
    />
  );
}

// ── Buttons ──────────────────────────────────────────────────────────────────
const BUTTON_VARIANTS = {
  primary: {
    style: { color: t.onPrimary, background: t.blue, border: 'none' },
    hover: 'cw-hover-primary',
  },
  secondary: {
    style: { color: t.ink, background: t.card, border: `1px solid ${t.borderInput}` },
    hover: 'cw-hover-surface',
  },
  ghost: {
    style: { color: t.body, background: 'transparent', border: 'none' },
    hover: 'cw-hover-surface',
  },
  soft: {
    style: { color: t.body, background: t.wash, border: 'none' },
    hover: '',
  },
  softBlue: {
    style: { color: t.blueDeep, background: t.blueTint, border: 'none' },
    hover: '',
  },
  danger: {
    style: { color: t.onPrimary, background: t.redSolid, border: 'none' },
    hover: '',
  },
  dangerSoft: {
    style: { color: t.red, background: t.redTint, border: 'none' },
    hover: 'cw-hover-danger',
  },
  successSoft: {
    style: { color: t.greenDeep, background: t.greenTint, border: 'none' },
    hover: '',
  },
};

// ── Permissions (docs/permissions.md) ───────────────────────────────────────
// A Button / IconButton / Toggle that changes something names its `action` (lib/permissions/catalogue.mjs); it is
// disabled, with the reason, unless the signed-in person's role holds it (Admin → Permissions). Inside
// <ViewOnly when>, every control is disabled unless it carries `viewOnlyOk` (reads: refresh, close, history). The wall
// server refuses a write without the permission regardless; this only stops the console offering it.
const ViewOnlyContext = createContext(false);
const CanContext = createContext(() => false);
export const VIEW_ONLY_TITLE = "You don't have permission to change this";
export function PermissionsProvider({ can, children }) {
  return <CanContext.Provider value={can}>{children}</CanContext.Provider>;
}
export function useCan() {
  return useContext(CanContext);
}
function useLocked(action, viewOnlyOk) {
  const viewOnly = useContext(ViewOnlyContext);
  const can = useContext(CanContext);
  if (action) return !can(action);
  return viewOnly && !viewOnlyOk;
}
export function ViewOnly({ when, children }) {
  return <ViewOnlyContext.Provider value={Boolean(when)}>{children}</ViewOnlyContext.Provider>;
}
export function useViewOnly() {
  return useContext(ViewOnlyContext);
}

export function Button({
  variant = 'secondary',
  icon,
  iconColor,
  spin = false,
  size = 'md',
  disabled = false,
  style = {},
  children,
  viewOnlyOk = false,
  action = null,
  ...rest
}) {
  const locked = useLocked(action, viewOnlyOk);
  if (locked) {
    disabled = true;
    rest.title = VIEW_ONLY_TITLE;
  }
  const v = BUTTON_VARIANTS[variant] || BUTTON_VARIANTS.secondary;
  const pad = size === 'sm' ? '7px 13px' : size === 'lg' ? '11px 20px' : '10px 16px';
  const fontSize = size === 'sm' ? 13 : 14;
  return (
    <button
      type="button"
      className={disabled ? '' : v.hover}
      disabled={disabled}
      style={{
        fontFamily: 'inherit',
        fontSize,
        fontWeight: 600,
        padding: pad,
        borderRadius: 10,
        cursor: disabled ? 'default' : 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        whiteSpace: 'nowrap',
        opacity: disabled ? 0.55 : 1,
        ...v.style,
        ...style,
      }}
      {...rest}
    >
      {spin ? (
        <Icon name="loader" size={15} color={iconColor} style={{ animation: 'cwspin .7s linear infinite' }} />
      ) : (
        icon && <Icon name={icon} size={size === 'sm' ? 14 : 16} color={iconColor} />
      )}
      {children}
    </button>
  );
}

export function IconButton({ icon, title, onClick, size = 30, color = t.muted, disabled = false, style = {}, viewOnlyOk = false, action = null }) {
  if (useLocked(action, viewOnlyOk)) {
    disabled = true;
    title = `${title ? `${title} — ` : ''}${VIEW_ONLY_TITLE.toLowerCase()}`;
  }
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      style={{
        border: 'none',
        background: t.wash,
        width: size,
        height: size,
        borderRadius: 8,
        cursor: disabled ? 'default' : 'pointer',
        color,
        opacity: disabled ? 0.5 : 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        ...style,
      }}
    >
      <Icon name={icon} size={Math.round(size / 2)} />
    </button>
  );
}

// ── Toggle switch (46×27, green when on) ─────────────────────────────────────
export function Toggle({ on, onToggle, disabled = false, size = 'md', action = null }) {
  const locked = useLocked(action, false);
  if (locked) disabled = true;
  const w = size === 'sm' ? 44 : 46;
  const h = size === 'sm' ? 26 : 27;
  const knob = h - 6;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={Boolean(on)}
      disabled={disabled}
      title={locked ? VIEW_ONLY_TITLE : undefined}
      onClick={onToggle}
      style={{
        width: w,
        height: h,
        borderRadius: 999,
        border: 'none',
        cursor: disabled ? 'default' : 'pointer',
        padding: 3,
        display: 'flex',
        background: on ? t.green : t.borderStrong,
        justifyContent: on ? 'flex-end' : 'flex-start',
        transition: 'background .15s',
        opacity: disabled ? 0.6 : 1,
        flexShrink: 0,
      }}
    >
      <span
        style={{
          width: knob,
          height: knob,
          borderRadius: '50%',
          background: 'var(--cw-knob)',
          boxShadow: t.shadow,
        }}
      />
    </button>
  );
}

// ── Pills / chips / badges ───────────────────────────────────────────────────
export function StatusPill({ color, bg, dot, children, style = {} }) {
  return (
    <span
      style={{
        fontSize: 12,
        fontWeight: 600,
        color,
        background: bg,
        padding: '5px 11px',
        borderRadius: 999,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {dot && <span style={{ width: 7, height: 7, borderRadius: '50%', background: dot, flexShrink: 0 }} />}
      {children}
    </span>
  );
}

export function TypeChip({ type, style = {} }) {
  const c = limChip(type);
  return (
    <span
      style={{
        fontSize: 11.5,
        fontWeight: 800,
        letterSpacing: '0.05em',
        color: c.c,
        background: c.b,
        padding: '4px 10px',
        borderRadius: 7,
        ...style,
      }}
    >
      {type}
    </span>
  );
}

export function ImpMark({ size = 18, title = 'Important limitation' }) {
  return (
    <span
      title={title}
      style={{
        width: size,
        height: size,
        borderRadius: 5,
        background: t.amberTint,
        color: t.amber,
        fontSize: size * 0.61,
        fontWeight: 800,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      !
    </span>
  );
}

export function MonoChip({ children, color = t.neutralText, bg = t.neutralTint, onRemove }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontFamily: t.mono,
        fontSize: 12.5,
        fontWeight: 600,
        background: bg,
        color,
        padding: onRemove ? '5px 6px 5px 10px' : '5px 10px',
        borderRadius: 7,
      }}
    >
      {children}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          style={{
            border: 'none',
            background: t.wash,
            width: 16,
            height: 16,
            borderRadius: '50%',
            color: 'inherit',
            fontSize: 11,
            cursor: 'pointer',
            lineHeight: 1,
            padding: 0,
          }}
        >
          ×
        </button>
      )}
    </span>
  );
}

// ── Inputs ───────────────────────────────────────────────────────────────────
export function FieldLabel({ children, extra }) {
  return (
    <label style={{ fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
      {children}
      {extra}
    </label>
  );
}

const inputBase = {
  width: '100%',
  border: `1px solid ${t.borderInput}`,
  borderRadius: 10,
  padding: '11px 13px',
  fontFamily: 'inherit',
  fontSize: 14,
  outline: 'none',
  background: t.card,
  color: t.ink,
  boxSizing: 'border-box',
};

export function TextInput({ mono = false, style = {}, ...rest }) {
  return <input style={{ ...inputBase, ...(mono ? { fontFamily: t.mono } : {}), ...style }} {...rest} />;
}

export function TextArea({ style = {}, ...rest }) {
  return <textarea style={{ ...inputBase, minHeight: 70, resize: 'vertical', ...style }} {...rest} />;
}

export function SearchBox({ value, onChange, placeholder, style = {} }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        background: t.card,
        border: `1px solid ${t.borderInput}`,
        borderRadius: 10,
        padding: '0 13px',
        height: 42,
        ...style,
      }}
    >
      <Icon name="search" size={16} color={t.faint} />
      <input
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        style={{ border: 'none', outline: 'none', fontFamily: 'inherit', fontSize: 14, flex: 1, background: 'transparent', color: t.ink }}
      />
    </div>
  );
}

// Chip input: freeform tokens with optional async suggestions.
export function ChipInput({ values = [], onAdd, onRemove, onSelect, placeholder = 'Add…', chipColor, chipBg, suggest, minHeight = 44 }) {
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState([]);

  useEffect(() => {
    if (!suggest) return undefined;
    const id = setTimeout(async () => {
      if (!query.trim()) {
        setOptions([]);
        return;
      }
      try {
        setOptions((await suggest(query.trim())) || []);
      } catch {
        setOptions([]);
      }
    }, 180);
    return () => clearTimeout(id);
  }, [query, suggest]);

  function add(value) {
    const v = String(value || '').trim();
    if (!v) return;
    onAdd(v);
    setQuery('');
    setOptions([]);
  }

  return (
    <div style={{ position: 'relative' }}>
      <div
        style={{
          border: `1px solid ${t.borderInput}`,
          borderRadius: 10,
          padding: 8,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 6,
          alignItems: 'center',
          minHeight,
          background: t.card,
        }}
      >
        {values.map((v) => (
          <MonoChip key={v} color={chipColor} bg={chipBg} onRemove={() => onRemove(v)}>
            {v}
          </MonoChip>
        ))}
        <input
          value={query}
          placeholder={placeholder}
          onChange={(e) => {
            const raw = e.target.value;
            // Pasted/typed text with separators: commit every complete part,
            // keep the remainder in the input (nothing is silently lost).
            if (/[,\n]/.test(raw)) {
              const parts = raw.split(/[,\n]+/);
              const rest = parts.pop();
              for (const part of parts) {
                if (part.trim()) onAdd(part.trim());
              }
              setQuery(rest);
              return;
            }
            setQuery(raw);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              add(query);
            } else if (e.key === 'Backspace' && !query && values.length > 0) {
              onRemove(values[values.length - 1]);
            }
          }}
          onBlur={() => add(query)}
          style={{ border: 'none', outline: 'none', fontFamily: 'inherit', fontSize: 13, flex: 1, minWidth: 70, background: 'transparent', color: t.ink }}
        />
      </div>
      {options.length > 0 && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            marginTop: 4,
            background: t.card,
            border: `1px solid ${t.borderInput}`,
            borderRadius: 10,
            boxShadow: t.shadowPanel,
            zIndex: 30,
            maxHeight: 180,
            overflowY: 'auto',
          }}
        >
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              className="cw-hover-surface"
              onMouseDown={(e) => {
                e.preventDefault(); // keep the text input focused
              }}
              onClick={() => {
                // onSelect gets the FULL option (value + label) — used where
                // the chip needs more than the raw value (e.g. flight picks).
                if (onSelect) {
                  onSelect(option);
                  setQuery('');
                  setOptions([]);
                } else {
                  add(option.value);
                }
              }}
              style={{
                width: '100%',
                textAlign: 'left',
                border: 'none',
                background: 'transparent',
                padding: '8px 12px',
                fontSize: 13,
                cursor: 'pointer',
                color: t.body,
                display: 'block',
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Dropdown filter (Operator / Airport buttons in the design) ──────────────
export function Dropdown({ icon, label, value, options, onChange, style = {} }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const active = options.find((o) => o.value === value);

  return (
    <div ref={ref} style={{ position: 'relative', ...style }}>
      <button
        type="button"
        className="cw-hover-surface"
        onClick={() => setOpen((v) => !v)}
        style={{
          fontFamily: 'inherit',
          fontSize: 13.5,
          fontWeight: 600,
          color: value ? t.blueDeep : t.ink,
          background: value ? t.blueTint : t.card,
          border: `1px solid ${value ? t.blue : t.borderInput}`,
          height: 42,
          padding: '0 15px',
          borderRadius: 10,
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        {icon && <Icon name={icon} size={15} color={value ? t.blueDeep : t.muted} />}
        {active && active.value ? active.label : label}
        <Icon name="chevron-down" size={14} color={t.faint} />
      </button>
      {open && (
        <div
          className="cw-fade"
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            marginTop: 6,
            minWidth: 190,
            background: t.card,
            border: `1px solid ${t.border}`,
            borderRadius: 12,
            boxShadow: t.shadowPanel,
            zIndex: 40,
            padding: 5,
            maxHeight: 280,
            overflowY: 'auto',
          }}
        >
          {options.map((option) => (
            <button
              key={String(option.value)}
              type="button"
              className="cw-hover-surface"
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
              style={{
                width: '100%',
                textAlign: 'left',
                border: 'none',
                background: option.value === value ? t.blueTint : 'transparent',
                color: option.value === value ? t.blueDeep : t.body,
                fontWeight: option.value === value ? 700 : 500,
                padding: '9px 11px',
                borderRadius: 8,
                fontSize: 13.5,
                cursor: 'pointer',
                display: 'block',
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Segmented control (Today / All) ──────────────────────────────────────────
export function Segmented({ options, value, onChange }) {
  return (
    <div style={{ display: 'flex', background: t.segment, border: `1px solid ${t.border}`, borderRadius: 10, padding: 3 }}>
      {options.map((option) => {
        const on = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            onClick={() => onChange(option.value)}
            style={{
              fontFamily: 'inherit',
              fontSize: 13.5,
              fontWeight: 600,
              color: on ? t.ink : t.muted,
              background: on ? t.card : 'transparent',
              border: 'none',
              padding: '8px 14px',
              borderRadius: 8,
              cursor: 'pointer',
              boxShadow: on ? t.shadow : 'none',
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Layout blocks ────────────────────────────────────────────────────────────
export function Card({ children, style = {}, className }) {
  return (
    <div
      className={className}
      style={{
        background: t.card,
        border: `1px solid ${t.border}`,
        borderRadius: 16,
        padding: 22,
        boxShadow: t.shadow,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function PageHeader({ title, desc, actions, descMax = 560 }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 24, marginBottom: 18 }}>
      <div>
        <h2 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 6px' }}>{title}</h2>
        {desc && (
          <p style={{ fontSize: 15, color: t.muted, margin: 0, maxWidth: descMax, lineHeight: 1.5 }}>{desc}</p>
        )}
      </div>
      {actions && <div style={{ display: 'flex', gap: 10, flex: 'none' }}>{actions}</div>}
    </div>
  );
}

// Top of a page (or section) that a non-admin can view but not change (portal foundations 1.1).
export function ViewOnlyNote({ children }) {
  if (!useContext(ViewOnlyContext)) return null;
  return <InfoBanner><strong>View only.</strong> {children || "You don't have permission to change what is on this page."}</InfoBanner>;
}

export function InfoBanner({ children, style = {} }) {
  return (
    <div
      style={{
        border: `1px solid ${t.blueBorder}`,
        background: t.blueWash,
        borderRadius: 14,
        padding: '14px 18px',
        marginBottom: 20,
        display: 'flex',
        gap: 12,
        alignItems: 'flex-start',
        ...style,
      }}
    >
      <Icon name="info" size={18} color={t.blue} style={{ marginTop: 1 }} />
      <div style={{ fontSize: 14, lineHeight: 1.55, color: t.blueInk }}>{children}</div>
    </div>
  );
}

// Collapsible "How this page works" banner.
export function HelpBanner({ title = 'How this page works', items }) {
  const [open, setOpen] = useState(true);
  return (
    <div style={{ border: `1px solid ${t.blueBorder}`, background: t.blueWash, borderRadius: 14, overflow: 'hidden', marginBottom: 22 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%',
          fontFamily: 'inherit',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '14px 18px',
          border: 'none',
          background: 'transparent',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <Icon name="info" size={18} color={t.blue} />
        <span style={{ fontSize: 14.5, fontWeight: 700, color: t.blueDeep, flex: 1 }}>{title}</span>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={18} color={t.blue} />
      </button>
      {open && (
        <div style={{ padding: '0 18px 18px 48px', display: 'flex', flexDirection: 'column', gap: 9 }}>
          {items.map((item) => (
            <div key={item.title} style={{ fontSize: 14, lineHeight: 1.55, color: t.blueInk }}>
              <strong style={{ color: t.blueDeep, fontWeight: 700 }}>{item.title}</strong> — {item.body}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Table helpers ────────────────────────────────────────────────────────────
export function TableShell({ columns, header, children, style = {} }) {
  return (
    <div
      style={{
        background: t.card,
        border: `1px solid ${t.border}`,
        borderRadius: 14,
        overflow: 'hidden',
        boxShadow: t.shadow,
        ...style,
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: columns,
          padding: '12px 18px',
          borderBottom: `1px solid ${t.borderInner}`,
          background: t.subtle,
        }}
      >
        {header.map((h) => (
          <div
            key={h.label}
            onClick={h.onSort}
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.06em',
              color: t.faint,
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              justifyContent: h.align === 'right' ? 'flex-end' : 'flex-start',
              cursor: h.onSort ? 'pointer' : 'default',
              userSelect: 'none',
            }}
          >
            {h.label}
            {h.sort && <Icon name="chevrons-up-down" size={13} />}
          </div>
        ))}
      </div>
      {children}
    </div>
  );
}

// ── States: loading / empty / error ─────────────────────────────────────────
export function LoadingState({ children = 'Loading…', rows = 3 }) {
  return (
    <div role="status" aria-label={typeof children === 'string' ? children : 'Loading'} aria-busy="true" style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {Array.from({ length: rows }, (_, i) => <Skel key={i} w={SKEL_WIDTHS[i % SKEL_WIDTHS.length]} h={i ? 11 : 14} />)}
    </div>
  );
}

export function EmptyState({ icon = 'mouse-pointer-click', title, children }) {
  return (
    <div style={{ padding: '40px 24px', textAlign: 'center', color: t.faint }}>
      <Icon name={icon} size={26} color={t.ghost} />
      <div style={{ fontSize: 15, fontWeight: 600, color: t.muted, marginTop: 12 }}>{title}</div>
      {children && <div style={{ fontSize: 13, marginTop: 5, lineHeight: 1.5 }}>{children}</div>}
    </div>
  );
}

export function ErrorBanner({ children }) {
  if (!children) return null;
  return (
    <div
      style={{
        fontSize: 13,
        color: t.redDeep,
        background: t.redTint,
        border: `1px solid ${t.redBorder}`,
        borderRadius: 9,
        padding: '9px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        marginBottom: 14,
      }}
    >
      <Icon name="alert-triangle" size={15} style={{ flexShrink: 0 }} />
      {children}
    </div>
  );
}

// TODO seam marker for controls whose backend fix hasn't merged yet.
export function PendingNote({ children }) {
  return (
    <div style={{ fontSize: 12, color: t.faint, display: 'flex', alignItems: 'center', gap: 7, lineHeight: 1.45 }}>
      <Icon name="info" size={13} style={{ flexShrink: 0 }} />
      {children}
    </div>
  );
}

// ── Toasts (dark, bottom-center) ─────────────────────────────────────────────
const ToastContext = createContext(() => {});

/**
 * Design-system confirmation dialog — replaces window.confirm so destructive
 * actions look and behave like the rest of the console.
 */
export function ConfirmDialog({ open, title, body, confirmLabel = 'Delete', danger = true, busy = false, onConfirm, onCancel }) {
  if (!open) return null;
  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 220, background: t.scrim, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={onCancel}
    >
      <div
        className="cw-fade"
        onClick={(e) => e.stopPropagation()}
        style={{ background: t.raised, borderRadius: 16, boxShadow: t.shadowPop, border: `1px solid ${t.border}`, maxWidth: 470, width: '100%', padding: '22px 24px' }}
      >
        <div style={{ display: 'flex', gap: 13, alignItems: 'flex-start', marginBottom: 16 }}>
          <span style={{ width: 38, height: 38, flexShrink: 0, borderRadius: 11, background: danger ? t.redTint : t.blueTint, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="alert-triangle" size={19} color={danger ? t.red : t.blueDeep} />
          </span>
          <div style={{ minWidth: 0 }}>
            <h3 style={{ fontSize: 16.5, fontWeight: 800, margin: '3px 0 6px' }}>{title}</h3>
            {body && <div style={{ fontSize: 13.5, color: t.muted, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{body}</div>}
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <Button variant="ghost" viewOnlyOk onClick={onCancel}>Cancel</Button>
          <Button variant={danger ? 'danger' : 'primary'} spin={busy} disabled={busy} onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);
  const timerRef = useRef(null);

  function flash(message, dot = t.green) {
    setToast({ message, dot });
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setToast(null), 2400);
  }

  useEffect(() => () => clearTimeout(timerRef.current), []);

  return (
    <ToastContext.Provider value={flash}>
      {children}
      {toast && (
        <div
          className="cw-fade"
          style={{
            position: 'fixed',
            bottom: 28,
            left: '50%',
            transform: 'translateX(-50%)',
            background: t.inkFill,
            color: t.onInk,
            padding: '13px 20px',
            borderRadius: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 11,
            boxShadow: t.shadowPop,
            zIndex: 200,
            fontSize: 14,
            fontWeight: 600,
            whiteSpace: 'nowrap',
          }}
        >
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: toast.dot }} />
          {toast.message}
        </div>
      )}
    </ToastContext.Provider>
  );
}

// ── Misc helpers shared by pages ─────────────────────────────────────────────
export function timeAgo(iso) {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function hmZ(iso) {
  if (!iso) return '—';
  const dt = new Date(iso);
  if (!Number.isFinite(dt.getTime())) return '—';
  return `${String(dt.getUTCHours()).padStart(2, '0')}:${String(dt.getUTCMinutes()).padStart(2, '0')}Z`;
}

export function hm(iso) {
  if (!iso) return '—';
  const dt = new Date(iso);
  if (!Number.isFinite(dt.getTime())) return '—';
  return `${String(dt.getUTCHours()).padStart(2, '0')}:${String(dt.getUTCMinutes()).padStart(2, '0')}`;
}

// Deterministic avatar colour per user (presence stack, account chip): identity, not theme — the same six in both
// themes, all legible under white initials.
const AVATAR_COLORS = ['#2563eb', '#6d28d9', '#0e9f6e', '#b45309', '#be185d', '#0e7490']; // colour-data
export function avatarColor(seed) {
  let hash = 0;
  const str = String(seed || '');
  for (let i = 0; i < str.length; i += 1) hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

/**
 * ONE initials rule for console AND portal (they showed "DS" vs "DM" for
 * the same user): first character of the first two name parts, split on
 * whitespace / @ / dots. "Dmitrijs Starkovs" -> DS, "ops@clearway.aero"
 * -> OC. The portal's UserBadge mirrors this exact derivation.
 */
export function initialsOf(nameOrEmail) {
  const parts = String(nameOrEmail || '')
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2);
  if (parts.length === 0) return '??';
  return parts.map((part) => part[0]).join('').toUpperCase();
}

export function Avatar({ name, initials, seed, size = 32, color = null, style = {} }) {
  return (
    <div
      title={name}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: color || avatarColor(seed || name),
        color: t.onPrimary,
        fontSize: Math.round(size * 0.38),
        fontWeight: 700,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        ...style,
      }}
    >
      {initials}
    </div>
  );
}
