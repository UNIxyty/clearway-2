// The phone app's drawn parts (design "Mobile Wall - Phone v3"): one size per part, taken from the design files.
// Colours only through c('…') — the phone tokens of tokens.css. No portal token, no wall-room colour.
// Every control is one normal tap, 44 px or more, and nothing here depends on hover or on press-and-hold.
import { useEffect } from 'react';
import { Icon } from './icons';
import ErrorBoundary from '../components/ErrorBoundary';

export const c = (name) => `var(--c-${name})`;
export const MONO = { fontFamily: 'var(--c-mono)' };
export const SAFE_TOP = 'env(safe-area-inset-top, 0px)';
export const SAFE_BOTTOM = 'env(safe-area-inset-bottom, 0px)';
const TONE = { warn: c('warn'), ok: c('ok'), bad: c('bad'), air: c('air'), muted: c('t3') };
export const tone = (t) => TONE[t] || c('t2');

/** 44 × 44 square control (the rail, the bottom bar, Close). `badge` draws a count in the corner. */
export function IconBtn({ icon, label, onClick, badge, size = 20, bordered = true, active = false, style, ...rest }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className="cw3-press" {...rest}
      style={{ position: 'relative', width: 44, height: 44, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 4,
        border: bordered ? `1px solid ${c('l2')}` : 0, background: active ? c('inv') : bordered ? c('bg2') : 'transparent', color: active ? c('on-inv') : c('t1'), ...style }}>
      <Icon name={icon} size={size} />
      {badge ? (
        <span data-badge="" style={{ position: 'absolute', top: -6, right: -6, minWidth: 18, height: 18, padding: '0 5px', borderRadius: 9, background: c('inv'), color: c('on-inv'), ...MONO, fontSize: 11, fontWeight: 700, lineHeight: '18px', textAlign: 'center' }}>{badge}</span>
      ) : null}
    </button>
  );
}

/** Close X, 44 × 44, no border. */
export const CloseBtn = ({ onClick, label = 'Close' }) => <IconBtn icon="x" label={label} onClick={onClick} bordered={false} style={{ color: c('t2') }} />;

/** Switch 40 × 24 inside a 44 px target. */
export function Switch({ on, onChange, label, disabled = false, ...rest }) {
  return (
    <button type="button" role="switch" aria-checked={Boolean(on)} aria-label={label} disabled={disabled} onClick={() => onChange?.(!on)} {...rest}
      style={{ width: 48, height: 44, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', opacity: disabled ? 0.5 : 1 }}>
      <span style={{ width: 40, height: 24, borderRadius: 12, background: on ? c('inv') : c('s2'), border: `1px solid ${on ? c('inv') : c('l2')}`, position: 'relative', display: 'block' }}>
        <span style={{ position: 'absolute', top: 3, left: on ? 19 : 3, width: 16, height: 16, borderRadius: 8, background: on ? c('on-inv') : c('t3'), transition: 'left 120ms' }} />
      </span>
    </button>
  );
}

/** Segmented control, 44 px segments inside a 1 px line (46 px box), radius 8; the chosen segment on the blue. options: [{ value, label }] */
export function Segmented({ options, value, onChange, label, style, ...rest }) {
  return (
    <div role="radiogroup" aria-label={label} {...rest} style={{ display: 'flex', boxSizing: 'border-box', height: 46, borderRadius: 8, border: `1px solid ${c('l2')}`, background: c('bg2'), overflow: 'hidden', minWidth: 0, ...style }}>
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <button key={o.value} type="button" role="radio" aria-checked={on} data-seg={o.value} onClick={() => onChange?.(o.value)}
            style={{ flex: 1, minWidth: 44, padding: '0 10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: on ? c('inv') : 'transparent', color: on ? c('on-inv') : c('t2'),
              borderLeft: i ? `1px solid ${on ? c('inv') : c('l2')}` : 0, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Button. kind: primary (blue, 48), line (bordered), quiet (text). */
export function Btn({ kind = 'primary', onClick, children, height = 48, disabled = false, block = true, href, style, ...rest }) {
  const st = { height, minWidth: 44, width: block ? '100%' : undefined, padding: '0 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 8, fontSize: 16, fontWeight: 600, whiteSpace: 'nowrap', opacity: disabled ? 0.5 : 1,
    background: kind === 'primary' ? c('inv') : 'transparent', color: kind === 'primary' ? c('on-inv') : kind === 'ok' ? c('ok') : c('t1'), border: kind === 'primary' ? 0 : kind === 'quiet' ? 0 : `1px solid ${c('l2')}`, ...style };
  if (href) return <a href={href} className="cw3-press" style={st} {...rest}>{children}</a>;
  return <button type="button" className="cw3-press" disabled={disabled} onClick={onClick} style={st} {...rest}>{children}</button>;
}

/** Left-aligned message block: title 16/600, body 13, one 44 px action. */
export function Msg({ title, body, action, onAction, primary = false, children, ...rest }) {
  return (
    <div {...rest} style={{ padding: '24px 16px', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8, minWidth: 0 }}>
      <div style={{ fontSize: 16, fontWeight: 600, color: c('t1'), overflowWrap: 'anywhere' }}>{title}</div>
      {body ? <div style={{ fontSize: 13, color: c('t3'), lineHeight: 1.45, overflowWrap: 'anywhere' }}>{body}</div> : null}
      {children}
      {action ? <Btn kind={primary ? 'primary' : 'line'} height={44} block={false} onClick={onAction} style={{ marginTop: 8, fontSize: 13 }}>{action}</Btn> : null}
    </div>
  );
}

/** Skeleton rows while a page loads. */
export function Skel({ rows = 6, h = 64 }) {
  return (
    <div aria-busy="true" aria-label="Loading" data-skeleton="" style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {Array.from({ length: rows }, (_, i) => <div key={i} style={{ height: h, background: c('skel'), animation: 'cw3-pulse 1.4s ease-in-out infinite', animationDelay: `${i * 80}ms` }} />)}
    </div>
  );
}

/** Group header bar, 32 px: label caps 11/600, count right. */
export function Group({ label, count, children, ...rest }) {
  return (
    <section {...rest}>
      <div style={{ minHeight: 32, padding: '0 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: c('bg2'), borderTop: `1px solid ${c('l1')}`, borderBottom: `1px solid ${c('l1')}` }}>
        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: c('t3'), minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        {count != null ? <span style={{ ...MONO, fontSize: 11, color: c('t4'), flex: 'none' }}>{count}</span> : null}
      </div>
      {children}
    </section>
  );
}

/**
 * List row, 52 px or more: [icon 20] [tag 56 mono] label 16 + sub 13 … value · chevron / arrow-up-right / your `right`.
 * With onClick it is a button, with href a link (external → new context is the caller's choice), otherwise plain.
 */
export function Row({ icon, tag, label, sub, value, valueTone, chevron = false, external = false, right, onClick, href, minHeight = 52, indent = 0, mono = false, children, ...rest }) {
  const body = (
    <>
      {icon ? <Icon name={icon} size={20} color={c('t3')} /> : null}
      {tag ? <span style={{ ...MONO, width: 56, flex: 'none', fontSize: 13, fontWeight: 700, color: c('t1'), overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tag}</span> : null}
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 16, color: c('t1'), overflowWrap: 'anywhere', ...(mono ? MONO : null) }}>{label}</span>
        {sub ? <span style={{ fontSize: 13, color: c('t3'), overflowWrap: 'anywhere' }}>{sub}</span> : null}
        {children}
      </span>
      {value != null && value !== '' ? <span style={{ flex: 'none', maxWidth: '45%', fontSize: 13, color: tone(valueTone), textAlign: 'right', overflowWrap: 'anywhere' }}>{value}</span> : null}
      {right}
      {external ? <Icon name="arrow-up-right" size={16} color={c('t4')} /> : chevron ? <Icon name="chevron-right" size={16} color={c('t4')} /> : null}
    </>
  );
  const st = { width: '100%', minHeight, padding: `8px 16px 8px ${16 + indent}px`, display: 'flex', alignItems: 'center', gap: 12, borderBottom: `1px solid ${c('l1')}`, textAlign: 'left', minWidth: 0 };
  if (href) return <a href={href} className="cw3-press" style={st} {...rest}>{body}</a>;
  if (onClick) return <button type="button" className="cw3-press" onClick={onClick} style={st} {...rest}>{body}</button>;
  return <div style={st} {...rest}>{body}</div>;
}

/**
 * Bottom sheet over the page: scrim, 14 px top corners, grabber, title 16/600 + sub 13, Close, scrolling body, optional
 * foot. Closes by Close, by a tap on the scrim, by Escape. `height` like '62%' fixes it; otherwise it grows to 80%.
 */
export function Sheet({ title, sub, action, onAction, onClose, children, foot, height, titleMono = false, z = 10, name, ...rest }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div data-sheet={name || ''} style={{ position: 'absolute', inset: 0, zIndex: z, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }} {...rest}>
      <button type="button" aria-label="Close" tabIndex={-1} data-scrim="" onClick={onClose} style={{ position: 'absolute', inset: 0, background: c('scrim'), width: '100%', height: '100%', borderRadius: 0 }} />
      <div role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : name}
        style={{ position: 'relative', zIndex: 1, height, maxHeight: height ? undefined : '80%', display: 'flex', flexDirection: 'column', background: c('bg'), borderTop: `1px solid ${c('l2')}`, borderRadius: '14px 14px 0 0', animation: 'cw3-up 140ms ease-out', minHeight: 0 }}>
        <div aria-hidden="true" style={{ flex: 'none', display: 'flex', justifyContent: 'center', paddingTop: 8 }}><span style={{ width: 32, height: 2, borderRadius: 1, background: c('l2') }} /></div>
        <div style={{ flex: 'none', display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 4px 8px 16px', borderBottom: `1px solid ${c('l1')}` }}>
          <div style={{ flex: 1, minWidth: 0, padding: '6px 0' }}>
            <div style={{ fontSize: titleMono ? 22 : 16, fontWeight: titleMono ? 700 : 600, color: c('t1'), overflowWrap: 'anywhere', ...(titleMono ? MONO : null) }}>{title}</div>
            {sub ? <div style={{ fontSize: 13, color: c('t3'), marginTop: 2, overflowWrap: 'anywhere' }}>{sub}</div> : null}
          </div>
          {action ? <button type="button" onClick={onAction} data-sheet-action="" style={{ minHeight: 44, padding: '0 10px', fontSize: 13, fontWeight: 600, color: c('t1'), textDecoration: 'underline', textUnderlineOffset: 3, flex: 'none' }}>{action}</button> : null}
          <CloseBtn onClick={onClose} />
        </div>
        <div className="cw3-scroll" style={{ flex: 1 }}><ErrorBoundary where={`phone/sheet/${name || 'sheet'}`}>{children}</ErrorBoundary></div>
        {foot ? <div style={{ flex: 'none', padding: `8px 16px calc(16px + ${SAFE_BOTTOM})`, background: c('bg2'), borderTop: `1px solid ${c('l1')}` }}>{foot}</div> : null}
      </div>
    </div>
  );
}

/**
 * Full page over the app: 52 px top bar (‹ back label, title right), optional notice line, scrolling body, optional
 * foot bar. The app's root is a fixed-height column, so the body is the only thing that scrolls.
 */
export function Page({ title, back = 'Back', onBack, notice, noticeTone = 'warn', children, foot, z = 25, name, ...rest }) {
  return (
    <div role="dialog" aria-label={title} data-page={name || ''} style={{ position: 'absolute', inset: 0, zIndex: z, display: 'flex', flexDirection: 'column', background: c('bg'), paddingTop: SAFE_TOP, minHeight: 0 }} {...rest}>
      <div style={{ flex: 'none', height: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '0 16px 0 4px', borderBottom: `1px solid ${c('l1')}` }}>
        <button type="button" data-back="" onClick={onBack} className="cw3-press" style={{ minHeight: 44, minWidth: 44, padding: '0 10px 0 6px', display: 'flex', alignItems: 'center', gap: 2, fontSize: 16, color: c('t2') }}>
          <Icon name="chevron-left" size={20} />{back}
        </button>
        <div style={{ fontSize: 16, fontWeight: 600, color: c('t1'), minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
      </div>
      {notice ? <div data-notice="" style={{ flex: 'none', padding: '10px 16px', fontSize: 13, lineHeight: 1.45, color: tone(noticeTone), borderBottom: `1px solid ${c('l1')}`, background: c('bg2') }}>{notice}</div> : null}
      <div className="cw3-scroll" style={{ flex: 1 }}><ErrorBoundary where={`phone/page/${name || 'page'}`}>{children}</ErrorBoundary></div>
      {foot ? <div style={{ flex: 'none', padding: `12px 16px calc(16px + ${SAFE_BOTTOM})`, background: c('bg2'), borderTop: `1px solid ${c('l1')}`, display: 'flex', flexDirection: 'column', gap: 8 }}>{foot}</div> : null}
    </div>
  );
}

/** Brand foot (More, Account): the logo for the theme and one 11 px line. */
export function BrandFoot({ line }) {
  return (
    <div style={{ padding: '24px 16px 32px', display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
      <Logo height={16} />
      {line ? <div style={{ fontSize: 11, color: c('t4'), overflowWrap: 'anywhere' }}>{line}</div> : null}
    </div>
  );
}

/** The Clearway logo: white on dark, dark on light — it follows the text colour of the phone theme. */
export function Logo({ height = 16 }) {
  return (
    <svg height={height} viewBox="0 0 148 34" role="img" aria-label="Clearway" data-logo="" style={{ display: 'block', color: c('t1'), flex: 'none' }}>
      <g fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
        <circle cx="17" cy="17" r="14.5" />
        <path d="M5 21c8-9 16-9 24-4M7 26c7-7 13-7 19-4M10 12c5-3 10-3 15 0" />
      </g>
      <text x="40" y="24" fill="currentColor" fontFamily="var(--c-font)" fontSize="21" fontWeight="700" letterSpacing="-.2">clearway</text>
    </svg>
  );
}
