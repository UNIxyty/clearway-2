import { createContext, useContext, useEffect, useRef, useState } from 'react';
import Icon from './icons';

// Display Console UI kit — implements the approved Claude Design system
// ("Display Console.dc.html" + "Console Shell & Style Tile"): light surfaces,
// Public Sans / IBM Plex Mono, blue #2563eb primary, 10/14/16px radii,
// hairline borders and soft card shadows. Every Console page composes from
// this kit; the wall display keeps its own dark styling and is untouched.

// ── Design tokens ────────────────────────────────────────────────────────────
export const t = {
  font: "'Public Sans', system-ui, -apple-system, sans-serif",
  mono: "'IBM Plex Mono', ui-monospace, monospace",
  // text
  ink: '#17181c',
  body: '#3a3d44',
  muted: '#6c7079',
  faint: '#9aa0a8',
  ghost: '#c3c7cd',
  // surfaces
  canvas: '#e8e9ec',
  surface: '#f5f6f7',
  card: '#ffffff',
  subtle: '#fbfbfc',
  wash: '#f0f1f3',
  segment: '#eef0f2',
  // borders
  border: '#e6e7ea',
  borderInput: '#d6d8dc',
  borderInner: '#eef0f2',
  rowLine: '#f2f3f5',
  // accents
  blue: '#2563eb',
  blueDeep: '#1d4ed8',
  blueTint: '#eef4ff',
  blueChip: '#e8effe',
  blueWash: '#f2f7ff',
  blueBorder: '#dbe6ff',
  blueInk: '#3a5170',
  green: '#16a34a',
  greenDeep: '#15803d',
  greenTint: '#e7f6ec',
  greenBorder: '#c7ead2',
  red: '#e5484d',
  redDeep: '#b3383c',
  redTint: '#fdecec',
  redBorder: '#f4cdcd',
  amber: '#b45309',
  amberTint: '#fef3e2',
  amberWash: '#fffaf3',
  amberBorder: '#f0d3ba',
  orange: '#ea8a4e',
  orangeTint: '#fdf1e8',
  // dark wall previews
  dark: '#0e1116',
  darkCard: '#171b22',
  // elevation
  shadow: '0 1px 2px rgba(16,18,22,.04)',
  shadowPanel: '0 1px 2px rgba(16,18,22,.04), 0 16px 40px rgba(16,18,22,.06)',
  shadowPop: '0 12px 34px rgba(0,0,0,.18)',
};

// Limitation type chip palette (from the design's limChip map).
export const LIM_CHIP = {
  OPS: { c: '#475569', b: '#eef1f5' },
  AOG: { c: '#b91c1c', b: '#fee2e2' },
  WX: { c: '#0369a1', b: '#e0f2fe' },
  CTOT: { c: '#b45309', b: '#fef3e2' },
  PAX: { c: '#7c3aed', b: '#ede9fe' },
  CREW: { c: '#0e7490', b: '#cffafe' },
  NTM: { c: '#c2703b', b: '#fdf1e8' },
  IMP: { c: '#b45309', b: '#fef3e2' },
};
export function limChip(type) {
  return LIM_CHIP[type] || LIM_CHIP.OPS;
}

// ── Global console CSS (hover states, keyframes, placeholders) ──────────────
const GLOBAL_CSS = `
  .cw-console { font-family: ${t.font}; color: ${t.ink}; }
  .cw-console ::selection { background: #c9ddff; }
  .cw-console input::placeholder, .cw-console textarea::placeholder { color: ${t.faint}; }
  .cw-console input, .cw-console textarea, .cw-console button { font-family: inherit; }
  @keyframes cwspin { to { transform: rotate(360deg); } }
  @keyframes cwfade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
  @keyframes cwshimmer { 0% { background-position: -360px 0; } 100% { background-position: 360px 0; } }
  @keyframes cwpulseDot { 0%, 100% { box-shadow: 0 0 0 0 rgba(229,72,77,.30); } 70% { box-shadow: 0 0 0 9px rgba(229,72,77,0); } }
  @keyframes cwglow { 0%, 100% { box-shadow: 0 0 0 0 rgba(229,72,77,0); } 50% { box-shadow: 0 0 20px 0 rgba(229,72,77,.32); } }
  .cw-fade { animation: cwfade .22s ease; }
  .cw-skel { background: linear-gradient(90deg, #eef0f2 25%, #f6f7f8 37%, #eef0f2 63%); background-size: 720px 100%; animation: cwshimmer 1.3s infinite linear; border-radius: 7px; }
  @media (prefers-reduced-motion: reduce) {
    .cw-fade, .cw-skel, .cw-motion-decor { animation: none !important; }
  }
  .cw-hover-surface:hover { background: ${t.surface} !important; }
  .cw-hover-primary:hover { background: ${t.blueDeep} !important; }
  .cw-hover-danger:hover { background: #fbdcdc !important; }
  .cw-hover-row:hover { background: ${t.subtle}; }
`;

export function ConsoleStyles() {
  return <style>{GLOBAL_CSS}</style>;
}

// ── Spinner ──────────────────────────────────────────────────────────────────
export function Spinner({ size = 16, track = '#cbd5e1', color = t.blue }) {
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
    style: { color: '#fff', background: t.blue, border: 'none' },
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
    style: { color: '#fff', background: t.red, border: 'none' },
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

export function Button({
  variant = 'secondary',
  icon,
  iconColor,
  spin = false,
  size = 'md',
  disabled = false,
  style = {},
  children,
  ...rest
}) {
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

export function IconButton({ icon, title, onClick, size = 30, color = t.muted, style = {} }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      style={{
        border: 'none',
        background: t.wash,
        width: size,
        height: size,
        borderRadius: 8,
        cursor: 'pointer',
        color,
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
export function Toggle({ on, onToggle, disabled = false, size = 'md' }) {
  const w = size === 'sm' ? 44 : 46;
  const h = size === 'sm' ? 26 : 27;
  const knob = h - 6;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={Boolean(on)}
      disabled={disabled}
      onClick={onToggle}
      style={{
        width: w,
        height: h,
        borderRadius: 999,
        border: 'none',
        cursor: disabled ? 'default' : 'pointer',
        padding: 3,
        display: 'flex',
        background: on ? t.green : '#cfd3d8',
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
          background: '#fff',
          boxShadow: '0 1px 3px rgba(0,0,0,.2)',
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

export function MonoChip({ children, color = '#334155', bg = '#f1f5f9', onRemove }) {
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
            background: 'rgba(0,0,0,.06)',
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
export function ChipInput({ values = [], onAdd, onRemove, placeholder = 'Add…', chipColor, chipBg, suggest, minHeight = 44 }) {
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
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add(query);
            }
          }}
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
              onClick={() => add(option.value)}
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
    <div style={{ display: 'flex', background: t.segment, borderRadius: 10, padding: 3 }}>
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
              background: on ? '#fff' : 'transparent',
              border: 'none',
              padding: '8px 14px',
              borderRadius: 8,
              cursor: 'pointer',
              boxShadow: on ? '0 1px 2px rgba(0,0,0,.06)' : 'none',
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
export function LoadingState({ children = 'Loading…' }) {
  return (
    <div style={{ padding: '38px 24px', textAlign: 'center', color: t.faint, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      <Spinner size={20} />
      <div style={{ fontSize: 13.5, color: t.muted }}>{children}</div>
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
        background: '#fdf0f0',
        border: '1px solid #f6d8d8',
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

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);
  const timerRef = useRef(null);

  function flash(message, dot = '#4ade80') {
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
            background: t.ink,
            color: '#fff',
            padding: '13px 20px',
            borderRadius: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 11,
            boxShadow: '0 12px 34px rgba(0,0,0,.28)',
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

// Deterministic avatar color per user (presence stack, account chip).
const AVATAR_COLORS = ['#2563eb', '#6d28d9', '#0e9f6e', '#b45309', '#be185d', '#0e7490'];
export function avatarColor(seed) {
  let hash = 0;
  const str = String(seed || '');
  for (let i = 0; i < str.length; i += 1) hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export function Avatar({ name, initials, seed, size = 32, style = {} }) {
  return (
    <div
      title={name}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: avatarColor(seed || name),
        color: '#fff',
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
