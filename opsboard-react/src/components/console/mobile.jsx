import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import Icon from './icons';
import { t } from './ui';

// Console mobile kit — the shared pieces of the phone/tablet layouts from
// the "mobile-tablet" design (sections C + D): pushed pages, bottom sheets,
// fixed action bars and slider steppers. Everything composes from the `t`
// token kit; the few literals the design introduces that have no token live
// in MOBILE below, each with the design reference that mandates it.

export const MOBILE = {
  // C2: the drawer / sheet scrim — rgba(23,24,28,.42) per the design.
  scrim: 'rgba(23,24,28,.42)',
  // C4: the amber "UNCHECKED" state chip trio (#f6dcc4 / #9a4d10 / #dda06a)
  // — the console kit has no matching amber-chip token set.
  amberChipBg: '#f6dcc4',
  amberChipText: '#9a4d10',
  amberChipBorder: '#dda06a',
};

/** Lock body scroll while a fixed overlay (pushed page / sheet) is up. */
function useBodyScrollLock(active = true) {
  useEffect(() => {
    if (!active) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [active]);
}

/**
 * C3/C6 pushed page: full-screen overlay with a 56px top bar (44px back
 * button), scrollable content and an optional fixed bottom action bar
 * (48px controls, 12/14/22 padding per the design).
 */
export function PushedPage({ title, titleMono = false, subtitle, subtitleColor, onBack, actions, headerRight, bottomBar, children, contentStyle = {} }) {
  useBodyScrollLock();
  return createPortal(
    <div
      className="cw-console"
      style={{ position: 'fixed', inset: 0, zIndex: 120, background: t.subtle, display: 'flex', flexDirection: 'column' }}
    >
      <div
        style={{
          flex: 'none',
          height: 56,
          background: t.card,
          borderBottom: `1px solid ${t.border}`,
          display: 'flex',
          alignItems: 'center',
          padding: '0 8px 0 6px',
          gap: 4,
        }}
      >
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          style={{
            fontFamily: 'inherit',
            width: 44,
            height: 44,
            borderRadius: 11,
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: t.ink,
            flex: 'none',
          }}
        >
          <Icon name="arrow-left" size={19} />
        </button>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, flex: 1, minWidth: 0 }}>
          <span
            style={{
              fontFamily: titleMono ? t.mono : 'inherit',
              fontSize: 16,
              fontWeight: 700,
              color: t.ink,
              letterSpacing: titleMono ? 0 : '-0.01em',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {title}
          </span>
          {subtitle && (
            <span style={{ fontSize: 11.5, color: subtitleColor || t.faint, fontWeight: subtitleColor ? 600 : 400 }}>{subtitle}</span>
          )}
        </div>
        {actions}
        {headerRight}
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 12, ...contentStyle }}>
        {children}
      </div>
      {bottomBar && (
        <div
          style={{
            flex: 'none',
            borderTop: `1px solid ${t.border}`,
            background: t.card,
            padding: '12px 14px 22px',
            display: 'flex',
            gap: 10,
          }}
        >
          {bottomBar}
        </div>
      )}
    </div>,
    document.body
  );
}

/** C9: bottom sheet over a scrim (grab handle + 22px bottom padding). */
export function BottomSheet({ open, onClose, children }) {
  useBodyScrollLock(open);
  if (!open) return null;
  return createPortal(
    <div className="cw-console" style={{ position: 'fixed', inset: 0, zIndex: 160 }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: MOBILE.scrim }} />
      <div
        className="cw-fade"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          background: t.card,
          borderRadius: '22px 22px 0 0',
          borderTop: `1px solid ${t.border}`,
          padding: '12px 16px 22px',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          maxHeight: '86vh',
          overflowY: 'auto',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <span style={{ width: 40, height: 4, borderRadius: 3, background: t.border }} />
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}

/** C5: fixed bottom action bar under a scrolling list (48px primary). */
export function FixedActionBar({ children }) {
  return createPortal(
    <div
      className="cw-console"
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 90,
        borderTop: `1px solid ${t.border}`,
        background: t.card,
        padding: '12px 14px 22px',
        display: 'flex',
        gap: 10,
      }}
    >
      {children}
    </div>,
    document.body
  );
}

/**
 * C7: −/+ stepper pair beside every slider — 34px buttons, mono value
 * between, stepping by the slider's own step. Dragging is for feel; the
 * buttons are for the exact number.
 */
export function Stepper({ value, min, max, step, onChange, format, disabled = false }) {
  const decimals = String(step).includes('.') ? String(step).split('.')[1].length : 0;
  function nudge(dir) {
    const next = Math.min(max, Math.max(min, Number((Number(value) + dir * step).toFixed(decimals + 2))));
    if (next !== Number(value)) onChange(next);
  }
  const btn = (label, dir, isDisabled) => (
    <button
      type="button"
      aria-label={dir > 0 ? 'Increase' : 'Decrease'}
      disabled={isDisabled}
      onClick={() => nudge(dir)}
      style={{
        fontFamily: 'inherit',
        width: 34,
        height: 34,
        borderRadius: 7,
        border: 'none',
        background: t.card,
        color: t.body,
        fontSize: 16,
        fontWeight: 600,
        cursor: isDisabled ? 'default' : 'pointer',
        opacity: isDisabled ? 0.45 : 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flex: 'none',
      }}
    >
      {label}
    </button>
  );
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 2,
        background: t.surface,
        border: `1px solid ${t.border}`,
        borderRadius: 9,
        padding: 2,
        flex: 'none',
      }}
    >
      {btn('−', -1, disabled || Number(value) <= min)}
      <span style={{ minWidth: 56, textAlign: 'center', fontFamily: t.mono, fontSize: 13, fontWeight: 700, color: t.ink }}>
        {format ? format(value) : value}
      </span>
      {btn('+', 1, disabled || Number(value) >= max)}
    </span>
  );
}

/** C1/C10: skeleton flight card that keeps the real card geometry. */
export function SkeletonCard() {
  return (
    <div
      style={{
        background: t.card,
        border: `1px solid ${t.rowLine}`,
        borderRadius: 13,
        padding: '12px 13px',
        display: 'flex',
        flexDirection: 'column',
        gap: 9,
        flex: 'none',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <div className="cw-skel" style={{ width: 92, height: 14, borderRadius: 4 }} />
        <div className="cw-skel" style={{ width: 52, height: 14, borderRadius: 4 }} />
      </div>
      <div className="cw-skel" style={{ width: 170, height: 11, borderRadius: 4 }} />
    </div>
  );
}

/** Horizontally scrolling filter-chip row (C1: "Filters scroll horizontally"). */
export function ChipRow({ children, style = {} }) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 7,
        overflowX: 'auto',
        WebkitOverflowScrolling: 'touch',
        scrollbarWidth: 'none',
        paddingBottom: 2,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** 34px filter chip (design C1 filter row). */
export function FilterChip({ on, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        fontFamily: 'inherit',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        height: 34,
        padding: '0 13px',
        borderRadius: 9,
        border: on ? 'none' : `1px solid ${t.border}`,
        background: on ? t.ink : t.surface,
        fontSize: 13,
        fontWeight: on ? 600 : 500,
        color: on ? '#fff' : t.body,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        flex: 'none',
      }}
    >
      {children}
    </button>
  );
}
