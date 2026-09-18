import { useWallColors } from '../../theme/WallColorsContext';
import { chromeFor } from '../../theme/wallColors';
import { MOBILE_CHROME, MONO } from './mobileChrome';
import { hmsZ } from './mobileUtil';

/** LIVE / CONNECTING / RECONNECTING / STALE chip (design A1/A5/B1/B2). */
export function ConnChip({ status }) {
  const chrome = chromeFor(useWallColors());
  const v =
    status === 'live'
      ? { bg: MOBILE_CHROME.liveBg, border: MOBILE_CHROME.liveBorder, dot: MOBILE_CHROME.liveDot, text: MOBILE_CHROME.liveText, label: 'LIVE' }
      : status === 'stale'
        ? { bg: MOBILE_CHROME.staleBannerBg, border: MOBILE_CHROME.staleBannerBorder, dot: MOBILE_CHROME.staleDot, text: MOBILE_CHROME.staleTitle, label: 'STALE' }
        : {
            bg: chrome.insetBg,
            border: chrome.gridLine,
            dot: chrome.legendLabel,
            text: chrome.legendLabel,
            label: status === 'reconnecting' ? 'RECONNECTING' : 'CONNECTING',
          };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 20, padding: '0 7px', borderRadius: 5, background: v.bg, border: `1px solid ${v.border}`, flexShrink: 0 }}>
      <i style={{ width: 6, height: 6, borderRadius: '50%', background: v.dot, display: 'block' }} />
      <span style={{ fontFamily: MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.09em', color: v.text }}>{v.label}</span>
    </span>
  );
}

/**
 * Stale-feed banner (design A5 / B2) — outranks the header wherever it shows.
 * "STALE · N MIN OLD · Last update HH:MM:SSZ. Times below may have moved."
 */
export function StaleBanner({ ageMin, lastAliveMs, onRetry }) {
  return (
    <div style={{ flex: 'none', background: MOBILE_CHROME.staleBannerBg, borderBottom: `1px solid ${MOBILE_CHROME.staleBannerBorder}`, padding: '11px 18px', display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: MOBILE_CHROME.staleDot, flexShrink: 0 }} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <span style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: 700, letterSpacing: '0.1em', color: MOBILE_CHROME.staleTitle }}>
          STALE · {ageMin} MIN OLD
        </span>
        <span style={{ fontSize: 12.5, color: MOBILE_CHROME.staleBody }}>
          Last update {hmsZ(lastAliveMs)}Z. Times below may have moved.
        </span>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44, padding: '0 12px', borderRadius: 9, background: MOBILE_CHROME.retryBg, border: `1px solid ${MOBILE_CHROME.retryBorder}`, fontSize: 12.5, fontWeight: 700, color: MOBILE_CHROME.retryText, cursor: 'pointer', flexShrink: 0 }}
        >
          Retry
        </button>
      )}
    </div>
  );
}

/** State chip: token-tinted, hollow for estimated states (design A1). */
export function StateChip({ label, colorHex, hollow = false, withAlphaFn }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        height: 22,
        padding: '0 8px',
        borderRadius: 6,
        background: hollow ? 'transparent' : withAlphaFn(colorHex, 0.16),
        border: `1px ${hollow ? 'dashed' : 'solid'} ${withAlphaFn(colorHex, 0.45)}`,
        fontFamily: MONO,
        fontSize: 9.5,
        fontWeight: 700,
        letterSpacing: '0.08em',
        color: colorHex,
        flexShrink: 0,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  );
}
