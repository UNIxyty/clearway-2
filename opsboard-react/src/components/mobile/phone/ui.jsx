// Drawn controls for the phone wall (design §1.6: no native controls). Colours only through v('…') — the phone wall's
// own tokens, filled from the room's palette.
import { useCallback, useEffect, useRef, useState } from 'react';
import { v } from './tokens';

const PATHS = {
  timeline: <path d="M3 6h9M8 12h13M5 18h10" />,
  cards: <><rect x="4" y="4" width="16" height="7" rx="2" /><rect x="4" y="14" width="16" height="6" rx="2" /></>,
  gear: <><circle cx="12" cy="12" r="3.2" /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" /></>,
  funnel: <path d="M3 5h18l-7 8.2V19l-4 2v-7.8z" />,
  bell: <><path d="M6 16v-5a6 6 0 0 1 12 0v5l2 2H4z" /><path d="M10 21a2 2 0 0 0 4 0" /></>,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  person: <><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></>,
  lock: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  phone: <><rect x="6" y="2.5" width="12" height="19" rx="2.5" /><path d="M11 18.5h2" /></>,
  external: <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c1-3.5 3.6-5.5 6.5-5.5s5.5 2 6.5 5.5" /><path d="M15.5 4.8a3.5 3.5 0 0 1 0 6.4M17.5 14.8c2 .8 3.4 2.6 4 5.2" /></>,
  eye: <><path d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12z" /><circle cx="12" cy="12" r="3" /></>,
  'eye-off': <><path d="M3 3l18 18M10.6 5.6A10 10 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3 3.8M6.5 6.6C3.9 8.3 2.5 12 2.5 12s3.5 6.5 9.5 6.5a9.6 9.6 0 0 0 4.4-1" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></>,
  copy: <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></>,
  hand: <path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12M11 11V4.5a1.5 1.5 0 0 1 3 0V12M14 11V6a1.5 1.5 0 0 1 3 0v8a7 7 0 0 1-7 7h-.5a6 6 0 0 1-5-2.7L3 15.5a1.6 1.6 0 0 1 2.6-1.8L8 16" />,
  'cloud-off': <><path d="M3 3l18 18" /><path d="M8 7.2A5.5 5.5 0 0 1 17.4 10H18a4 4 0 0 1 2.5 7.1M16 19H7a5 5 0 0 1-2-9.6" /></>,
  up: <path d="M6 15l6-6 6 6" />,
  down: <path d="M6 9l6 6 6-6" />,
};

export function Icon({ name, size = 20, stroke = 2.2, fill = 'none', style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: 'none', ...style }}>
      {PATHS[name]}
    </svg>
  );
}

/** A 44 × 44 square control. */
export function Square({ label, onClick, children, style, ...rest }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} style={{ width: 44, height: 44, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none', position: 'relative', ...style }} {...rest}>
      {children}
    </button>
  );
}

export const CloseButton = ({ onClick, label = 'Close' }) => (
  <Square label={label} onClick={onClick} style={{ background: v('surface-3'), color: v('text-3') }}><Icon name="close" size={18} stroke={2.4} /></Square>
);

/** Segmented control — selected segment on text-1 with on-solid text (§2.6). */
export function Segmented({ options, value, onChange, height = 46, size = 14, label, minSeg = 0, bg = v('surface-2'), radius = 12 }) {
  return (
    <div role="radiogroup" aria-label={label} className="mw-seg" style={{ display: 'flex', gap: 3, height, padding: 3, borderRadius: radius, background: bg, border: `1px solid ${v('line-2')}`, minWidth: 0 }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button key={o.value} type="button" role="radio" aria-checked={on} onClick={() => onChange(o.value)}
            style={{ flex: minSeg ? 'none' : 1, minWidth: minSeg || 0, padding: minSeg ? '0 10px' : 0, borderRadius: radius - 3, background: on ? v('text-1') : 'transparent', color: on ? v('on-solid') : v('text-3'), display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: size, fontWeight: 900, letterSpacing: '0.02em', whiteSpace: 'nowrap' }}>
            {o.label}{o.count != null && <span style={{ fontSize: 11, fontWeight: 900, opacity: 0.8 }}>{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** Toggle track 46 × 28, knob 22 (§2.7). The row around it is the target; this is only drawn. */
export function Toggle({ on }) {
  return (
    <span aria-hidden="true" style={{ flex: 'none', width: 46, height: 28, borderRadius: 14, background: on ? v('accent') : v('surface-3'), border: `1px solid ${on ? v('accent') : v('line-3')}`, position: 'relative' }}>
      <span className="mw-knob" style={{ position: 'absolute', top: 2, left: on ? 20 : 2, width: 22, height: 22, borderRadius: 11, background: on ? v('on-accent') : v('text-3') }} />
    </span>
  );
}

/** A check chip in the five checks' own colours (IMP · NTM · WX · CAA · LIM). */
export function CheckChip({ k, h = 22, size = 10.5, muted = false }) {
  const t = k.toLowerCase();
  const plus = k.startsWith('+');
  return (
    <span style={{ height: h, padding: `0 ${h >= 22 ? 7 : 6}px`, borderRadius: 5, display: 'inline-flex', alignItems: 'center', flex: 'none', fontSize: size, fontWeight: 900, letterSpacing: '0.04em',
      background: plus || muted ? v('surface-4') : v(`chk-${t}-bg`), color: plus || muted ? v('text-2') : v(`chk-${t}-fg`), border: `1px solid ${plus || muted ? v('line-3') : v(`chk-${t}-line`)}` }}>{k}</span>
  );
}

/** The scroll container with the drawn thumb: 3 px, line-3, shows while scrolling, fades 800 ms after (§1.6). */
export function Scroll({ children, style, innerStyle, onScrollRef }) {
  const ref = useRef(null);
  const [thumb, setThumb] = useState({ on: false, top: 0, h: 0 });
  const timer = useRef(null);
  const onScroll = useCallback(() => {
    const el = ref.current; if (!el) return;
    const ratio = el.clientHeight / Math.max(el.scrollHeight, 1);
    if (ratio >= 1) return;
    const h = Math.max(40, el.clientHeight * ratio);
    const top = (el.scrollTop / Math.max(1, el.scrollHeight - el.clientHeight)) * (el.clientHeight - h);
    setThumb({ on: true, top, h });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setThumb((t) => ({ ...t, on: false })), 800);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => { if (onScrollRef) onScrollRef.current = ref.current; });
  return (
    <div style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', ...style }}>
      <div ref={ref} className="mw-scroll" onScroll={onScroll} style={{ flex: 1, minHeight: 0, ...innerStyle }}>{children}</div>
      <span className="mw-thumb" data-on={thumb.on ? '1' : '0'} style={{ top: thumb.top, height: thumb.h }} />
    </div>
  );
}

/** A bottom sheet: scrim, grabber, title and subtitle, a close button, body, optional footer (§2.7, §3). */
export function Sheet({ title, sub, onClose, height, maxHeight, children, foot, head, label }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <>
      <div className="mw-scrim" onClick={onClose} style={{ position: 'absolute', inset: 0, zIndex: 30, background: v('scrim') }} />
      <div role="dialog" aria-modal="true" aria-label={label || title} className="mw-sheet"
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 31, height, maxHeight: maxHeight || (height ? undefined : '80%'), background: v('bg-1'), borderTop: `1px solid ${v('line-3')}`, borderRadius: '22px 22px 0 0', display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 'none', padding: '8px 0 0', display: 'flex', justifyContent: 'center' }}><span style={{ width: 40, height: 4, borderRadius: 3, background: v('line-3') }} /></div>
        <div style={{ flex: 'none', padding: '4px 8px 10px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <span style={{ fontSize: 19, fontWeight: 900, lineHeight: 1.25, color: v('text-1') }}>{title}</span>
            {sub && <span style={{ fontSize: 13, fontWeight: 600, color: v('text-3') }}>{sub}</span>}
          </div>
          {head || <CloseButton onClick={onClose} />}
        </div>
        {children}
        {foot}
      </div>
    </>
  );
}

export function SheetFoot({ note, children }) {
  return (
    <div style={{ flex: 'none', borderTop: `1px solid ${v('line-1')}`, padding: '12px 16px max(20px, env(safe-area-inset-bottom))', background: v('bg-2'), display: 'flex', alignItems: 'center', gap: 12 }}>
      <span style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: 1.4, fontWeight: 700, color: v('text-3') }}>{note}</span>
      {children}
    </div>
  );
}

/** Primary / secondary 44–50 px buttons. */
export function Btn({ children, onClick, kind = 'secondary', h = 44, disabled, style, ...rest }) {
  const k = { primary: { background: v('accent'), color: v('on-accent'), border: 'none' }, secondary: { background: v('surface-3'), color: v('text-1'), border: `1px solid ${v('line-3')}` }, ok: { background: v('ok-soft'), color: v('ok'), border: `1px solid ${v('ok-line')}` } }[kind];
  return (
    <button type="button" onClick={onClick} disabled={disabled} style={{ height: h, padding: '0 16px', borderRadius: 12, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, fontSize: 14.5, fontWeight: 800, whiteSpace: 'nowrap', opacity: disabled ? 0.55 : 1, ...k, ...style }} {...rest}>
      {children}
    </button>
  );
}

/** The centred message of the four states (§1.8). */
export function Msg({ title, body, action, onAction, tone = 'plain', top = 64, kind = 'secondary' }) {
  const card = tone === 'bad';
  return (
    <div role={card ? 'alert' : undefined} style={{ position: 'relative', zIndex: 3, maxWidth: 300, margin: `${top}px auto 0`, padding: card ? 16 : '0 12px', borderRadius: card ? 14 : 0, background: card ? v('surface-2') : 'transparent', border: card ? `1px solid ${v('bad-line')}` : 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 8 }}>
      <div style={{ fontSize: 16, fontWeight: 800, lineHeight: 1.35, color: v('text-1'), textWrap: 'pretty' }}>{title}</div>
      {body && <div style={{ fontSize: 13.5, lineHeight: 1.5, color: v('text-3'), textWrap: 'pretty' }}>{body}</div>}
      {action && <Btn kind={card ? 'primary' : kind} onClick={onAction} style={{ marginTop: 6 }}>{action}</Btn>}
    </div>
  );
}

/** Section label: 10.5 / 900, 0.12em, uppercase, text-4. */
export const Label = ({ children, style }) => <div style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: '0.12em', color: v('text-4'), textTransform: 'uppercase', ...style }}>{children}</div>;
