import { useMemo, useState } from 'react';
import Board from '../Board';
import { FlightMarkers, mvtOverdueOf } from '../FlightPill';
import { useWallColors } from '../../theme/WallColorsContext';
import { chromeFor, markerChipsFor, withAlpha, wxCategoryColorsFor } from '../../theme/wallColors';
import { MOBILE_CHROME, MONO } from './mobileChrome';
import { STATE_LABEL, STATE_TOKEN, consoleHref, hmZ, hmsZ, spanText } from './mobileUtil';
import { ConnChip, StaleBanner, StateChip } from './WallChrome';

// The Digital Wall on a phone, portrait (design A1–A5): a time-ordered
// vertical list (Now), the queues that block someone (Attention), and the
// timeline demoted to a third tab — a horizontally scrolling miniature
// rendered by the SAME Board/FlightPill code as the ops-room wall.

const ZOOMS = [
  { label: '2H', hours: 2 },
  { label: '6H', hours: 6 },
  { label: 'DAY', hours: 24 },
];

export default function PhoneWall({
  aircraft = [],
  limitations = [],
  flights = [],
  windowStartUtc,
  windowEndUtc,
  conn,
  nowMs,
  notamState,
  mvtThresholdMin = 15,
  showUnconfirmedRing = true,
  mvtFlashSeconds = 1,
  loadedOnce = false,
  onOpenFlight,
  onRetry,
}) {
  const c = useWallColors();
  const chrome = chromeFor(c);
  const chips = markerChipsFor(c);
  const wxColors = wxCategoryColorsFor(c);
  const [tab, setTab] = useState('now'); // 'now' | 'attention' | 'timeline'
  const [zoomHours, setZoomHours] = useState(2);
  const stale = conn.stale;

  // ── Derivations (all from mapFlight fields — never recomputed) ────────────
  const airborne = useMemo(
    () => flights.filter((f) => f.status === 'airborne').sort((a, b) => a.endUtcMs - b.endUtcMs),
    [flights]
  );
  const nextOut = useMemo(
    () =>
      flights
        .filter((f) => ['scheduled', 'boarding', 'delayed', 'ctot', 'slot', 'cancelled'].includes(f.status))
        .sort((a, b) => a.delayedStartUtcMs - b.delayedStartUtcMs),
    [flights]
  );
  const overdue = useMemo(
    () => flights.filter((f) => f.status !== 'cancelled' && mvtOverdueOf(f, nowMs, mvtThresholdMin)),
    [flights, nowMs, mvtThresholdMin]
  );
  const unconfirmed = useMemo(
    () => flights.filter((f) => f.isConfirmed === false && f.status !== 'cancelled' && f.status !== 'arrived'),
    [flights]
  );
  const notamAirports = useMemo(() => {
    const airports = notamState?.airports || [];
    return airports
      .filter((a) => !a.checked && !a.error && (a.filtered?.length ?? 0) > 0)
      .map((a) => ({
        ...a,
        affects: flights.filter((f) => f.dep === a.icao || f.arr === a.icao).map((f) => f.fn),
      }));
  }, [notamState, flights]);
  const attentionCount = notamAirports.length + overdue.length;
  const departingSoon = nextOut.filter(
    (f) => f.status !== 'cancelled' && f.delayedStartUtcMs > nowMs && f.delayedStartUtcMs - nowMs <= 3600_000
  ).length;

  const openTimeline = (hours) => {
    if (hours) setZoomHours(hours);
    setTab('timeline');
  };

  // ── Shared styles ─────────────────────────────────────────────────────────
  const s = {
    shell: { height: '100dvh', minHeight: '100vh', display: 'flex', flexDirection: 'column', background: chrome.boardBg, color: chrome.headerTime, overflow: 'hidden' },
    header: { flex: 'none', padding: '10px 18px 12px', display: 'flex', flexDirection: 'column', gap: 12, borderBottom: `1px solid ${chrome.gridLine}` },
    title: { fontSize: 15, fontWeight: 800, color: chrome.headerTime, letterSpacing: '-0.01em' },
    clock: { fontFamily: MONO, fontSize: 12, fontWeight: 600, color: chrome.legendLabel },
    summary: { fontSize: 13, color: chrome.legendLabel, lineHeight: 1.5 },
    tabs: { display: 'flex', gap: 4, background: chrome.panelBg, border: `1px solid ${chrome.gridLine}`, borderRadius: 11, padding: 4 },
    tab: (active) => ({
      flex: 1,
      height: 36,
      borderRadius: 8,
      border: 'none',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 5,
      fontSize: 13,
      fontWeight: active ? 700 : 600,
      background: active ? chrome.headerTime : 'transparent',
      color: active ? chrome.boardBg : chrome.legendLabel,
      cursor: 'pointer',
      fontFamily: 'inherit',
    }),
    body: { flex: 1, minHeight: 0, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 9 },
    secTitle: { fontFamily: MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.12em', color: chrome.sidebarMuted, paddingLeft: 2 },
    card: { background: chrome.panelBg, border: `1px ${stale ? 'dashed' : 'solid'} ${chrome.gridLine}`, borderRadius: 14, padding: '13px 14px', display: 'flex', flexDirection: 'column', gap: 9, cursor: 'pointer', ...(stale ? { opacity: 0.68 } : {}) },
    rowCard: { background: chrome.headerBg, border: `1px ${stale ? 'dashed' : 'solid'} ${chrome.gridLine}`, borderRadius: 14, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, minHeight: 56, cursor: 'pointer', ...(stale ? { opacity: 0.68 } : {}) },
    footer: { flex: 'none', borderTop: `1px solid ${chrome.gridLine}`, padding: '12px 16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: chrome.headerBg },
  };

  const Delta = ({ min }) =>
    min ? (
      <span style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: 700, color: min > 0 ? c.textDeltaLate : c.textDeltaEarly, flexShrink: 0 }}>
        {min > 0 ? '+' : '−'}{Math.abs(min)}
      </span>
    ) : null;

  function chipFor(f) {
    const isOverdue = f.status !== 'cancelled' && mvtOverdueOf(f, nowMs, mvtThresholdMin);
    const hollow = f.estimated === true && (f.status === 'airborne' || f.status === 'arrived');
    if (stale) return <StateChip label="UNVERIFIED" colorHex={chrome.legendLabel} withAlphaFn={(hex, a) => withAlpha(c.textOperator, a)} />;
    if (isOverdue) return <StateChip label="MVT OVERDUE" colorHex={c.mvtRing} withAlphaFn={withAlpha} />;
    return <StateChip label={STATE_LABEL[f.status] || String(f.status || '').toUpperCase()} colorHex={c[STATE_TOKEN[f.status] ?? 'stateScheduled']} hollow={hollow} withAlphaFn={withAlpha} />;
  }

  // ── Airborne card (design A1) ─────────────────────────────────────────────
  function AirborneCard({ f }) {
    const isOverdue = f.status !== 'cancelled' && mvtOverdueOf(f, nowMs, mvtThresholdMin);
    const overdueMin = isOverdue ? Math.round((nowMs - (Number(f.delayedStartUtcMs) || Number(f.startUtcMs))) / 60_000) : 0;
    const depMs = Number(f.delayedStartUtcMs) || Number(f.startUtcMs);
    const endMs = Number(f.endUtcMs) || depMs;
    const pct = endMs > depMs ? Math.max(0, Math.min(1, (nowMs - depMs) / (endMs - depMs))) : 0;
    const hint = stale
      ? `as of ${hmZ(conn.lastAliveMs)}`
      : isOverdue
        ? 'no MVT message'
        : f.estimated === true
          ? 'estimated'
          : endMs > nowMs
            ? `lands in ${spanText(endMs - nowMs)}`
            : 'landing due';
    return (
      <div style={s.card} onClick={() => onOpenFlight(f)}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
            <span style={{ fontFamily: MONO, fontSize: 17, fontWeight: 700, color: chrome.headerTime, letterSpacing: '-0.01em', fontStyle: f.isConfirmed === false ? 'italic' : 'normal' }}>{f.fn}</span>
            <span style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: 500, color: chrome.sidebarMuted }}>{f.__reg}</span>
          </div>
          {chipFor(f)}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 600, color: chrome.sidebarText }}>{f.dep}</span>
          <div style={{ flex: 1, height: 14, position: 'relative', display: 'flex', alignItems: 'center' }}>
            <span style={{ position: 'absolute', left: 0, right: 0, height: 2, borderRadius: 2, background: chrome.gridLine }} />
            <span style={{ position: 'absolute', left: 0, width: `${(pct * 100).toFixed(1)}%`, height: 2, borderRadius: 2, background: stale ? chrome.sidebarMuted : c.stateAirborne }} />
            {!stale && (
              <span style={{ position: 'absolute', left: `${(pct * 100).toFixed(1)}%`, width: 9, height: 9, borderRadius: '50%', background: chrome.headerTime, border: `2px solid ${chrome.boardBg}`, marginLeft: -4 }} />
            )}
          </div>
          <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 600, color: chrome.sidebarText }}>{f.arr}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontFamily: MONO, fontSize: 11.5, color: chrome.legendLabel }}>
            {f.depKind} {f.depHm}Z · {f.arrKind} {f.arrHm}Z{stale ? ` as of ${hmZ(conn.lastAliveMs)}` : ''}
          </span>
          {isOverdue && !stale ? (
            <span style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: 700, color: c.mvtRing, flexShrink: 0 }}>+{overdueMin} min</span>
          ) : (
            <Delta min={f.arrDeltaMin || f.depDeltaMin} />
          )}
        </div>
        <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap' }}>
          <FlightMarkers flight={f} sz={(v) => Math.round(v * 1.3)} mode="full" max={3} />
          <span style={{ marginLeft: 'auto', fontSize: 12, color: chrome.sidebarMuted }}>{hint}</span>
        </div>
      </div>
    );
  }

  // ── Next-out row (design A1) ──────────────────────────────────────────────
  function NextOutRow({ f }) {
    const relMs = f.delayedStartUtcMs - nowMs;
    const isOverdue = f.status !== 'cancelled' && mvtOverdueOf(f, nowMs, mvtThresholdMin);
    const overdueMin = isOverdue ? Math.round((nowMs - (Number(f.delayedStartUtcMs) || Number(f.startUtcMs))) / 60_000) : 0;
    return (
      <div style={{ ...s.rowCard, ...(isOverdue && !stale ? { borderColor: MOBILE_CHROME.overdueCardBorder, background: MOBILE_CHROME.overdueCardBg } : {}) }} onClick={() => onOpenFlight(f)}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
            <span style={{ fontFamily: MONO, fontSize: 15, fontWeight: 700, color: chrome.sidebarText, fontStyle: f.isConfirmed === false ? 'italic' : 'normal' }}>{f.fn}</span>
            <span style={{ fontFamily: MONO, fontSize: 11.5, color: chrome.legendLabel }}>{f.dep} → {f.arr}</span>
          </div>
          <div style={{ display: 'flex', gap: 5, alignItems: 'center', minHeight: 19 }}>
            {isOverdue && !stale && <StateChip label="MVT OVERDUE" colorHex={c.mvtRing} withAlphaFn={withAlpha} />}
            <FlightMarkers flight={f} sz={(v) => Math.round(v * 1.15)} mode="full" max={3} />
            {f.status === 'cancelled' && <StateChip label="CANCELLED" colorHex={c.stateCancelled} withAlphaFn={withAlpha} />}
            {f.estimated === true && <span style={{ fontSize: 11.5, color: chrome.sidebarMuted }}>estimated</span>}
          </div>
        </div>
        <div style={{ textAlign: 'right', flex: 'none' }}>
          <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 700, color: chrome.headerTime }}>
            {f.depKind !== 'STD' ? `${f.depKind} ` : ''}{f.depHm}Z
          </div>
          <div style={{ fontSize: 11.5, color: isOverdue && !stale ? c.mvtRing : chrome.sidebarMuted, fontWeight: isOverdue && !stale ? 700 : 400 }}>
            {stale
              ? `as of ${hmZ(conn.lastAliveMs)}`
              : f.status === 'cancelled'
                ? 'cancelled'
                : isOverdue
                  ? `+${overdueMin} min`
                  : relMs > 0
                    ? `in ${spanText(relMs)}`
                    : 'due now'}
          </div>
        </div>
      </div>
    );
  }

  // ── Tab contents ──────────────────────────────────────────────────────────
  function NowTab() {
    if (!loadedOnce) {
      return (
        <div style={s.body}>
          <div style={{ width: 74, height: 9, borderRadius: 3, background: chrome.insetBg, margin: '2px 0 3px 2px' }} />
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ background: chrome.panelBg, border: `1px solid ${chrome.gridLine}`, borderRadius: 14, padding: '13px 14px', display: 'flex', flexDirection: 'column', gap: 11 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ width: 96, height: 15, borderRadius: 4, background: chrome.insetBg }} />
                <div style={{ width: 62, height: 18, borderRadius: 5, background: chrome.insetBg }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 44, height: 12, borderRadius: 3, background: chrome.insetBg }} />
                <div style={{ flex: 1, height: 2, borderRadius: 2, background: chrome.insetBg }} />
                <div style={{ width: 44, height: 12, borderRadius: 3, background: chrome.insetBg }} />
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <div style={{ width: 38, height: 18, borderRadius: 5, background: chrome.insetBg }} />
                <div style={{ width: 38, height: 18, borderRadius: 5, background: chrome.insetBg }} />
              </div>
            </div>
          ))}
          <div style={{ fontSize: 12.5, color: chrome.sidebarMuted, textAlign: 'center', marginTop: 6 }}>Fetching movements…</div>
        </div>
      );
    }
    if (airborne.length === 0 && nextOut.length === 0) {
      const nextScheduled = flights
        .filter((f) => f.status !== 'arrived' && f.status !== 'cancelled' && f.delayedStartUtcMs > nowMs)
        .sort((a, b) => a.delayedStartUtcMs - b.delayedStartUtcMs)[0];
      return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '0 42px', textAlign: 'center' }}>
          <div style={{ width: 52, height: 52, borderRadius: 15, border: `1px solid ${chrome.gridLine}`, background: chrome.panelBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, color: chrome.sidebarMuted }}>✈</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: chrome.sidebarText }}>Nothing in the air</div>
          <div style={{ fontSize: 13.5, lineHeight: 1.55, color: chrome.sidebarMuted }}>
            {nextScheduled
              ? `No flights airborne and none scheduled before ${hmZ(nextScheduled.delayedStartUtcMs)}Z. The feed is live — this is a quiet night, not a fault.`
              : 'No flights airborne and none scheduled in the visibility window. The feed is live — this is a quiet night, not a fault.'}
          </div>
          <button
            type="button"
            onClick={() => openTimeline(24)}
            style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44, padding: '0 16px', borderRadius: 10, border: `1px solid ${chrome.gridLine}`, background: chrome.panelBg, fontSize: 13.5, fontWeight: 600, color: chrome.sidebarText, marginTop: 4, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            See the whole day
          </button>
        </div>
      );
    }
    return (
      <div style={s.body}>
        {airborne.length > 0 && <div style={s.secTitle}>{stale ? 'AIRBORNE · LAST KNOWN' : 'AIRBORNE'}</div>}
        {airborne.map((f) => <AirborneCard key={f.id} f={f} />)}
        {stale && (
          <div style={{ background: chrome.headerBg, border: `1px solid ${chrome.gridLine}`, borderRadius: 14, padding: '13px 14px', display: 'flex', flexDirection: 'column', gap: 7 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: chrome.sidebarText }}>Actions are off while the feed is stale</span>
            <span style={{ fontSize: 12.5, lineHeight: 1.5, color: chrome.sidebarMuted }}>
              Mark checked and Show on wall are disabled so nothing is confirmed against data that may already be wrong.
            </span>
          </div>
        )}
        {nextOut.length > 0 && <div style={{ ...s.secTitle, marginTop: 4 }}>NEXT OUT</div>}
        {nextOut.map((f) => <NextOutRow key={f.id} f={f} />)}
      </div>
    );
  }

  function AttentionTab() {
    const empty = notamAirports.length === 0 && overdue.length === 0 && unconfirmed.length === 0 && limitations.length === 0;
    return (
      <div style={{ ...s.body, padding: 14, gap: 16 }}>
        {notamAirports.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ ...s.secTitle, color: chips.NTM.text }}>UNREVIEWED NOTAMS · {notamAirports.length} AIRPORT{notamAirports.length === 1 ? '' : 'S'}</span>
            {notamAirports.map((a) => (
              <div key={a.icao} style={{ background: chrome.panelBg, border: `1px solid ${chips.NTM.border}`, borderRadius: 14, padding: '13px 14px', display: 'flex', alignItems: 'center', gap: 12, minHeight: 60 }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                  <span style={{ fontFamily: MONO, fontSize: 16, fontWeight: 700, color: chrome.headerTime }}>{a.icao}</span>
                  <span style={{ fontSize: 12.5, color: chrome.legendLabel }}>
                    {a.filtered?.length ?? 0} flagged{a.affects.length > 0 ? ` · affects ${a.affects.join(', ')}` : ''}
                  </span>
                </div>
                <a
                  href={stale ? undefined : consoleHref('notam-check')}
                  aria-disabled={stale}
                  style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44, padding: '0 14px', borderRadius: 9, background: chips.NTM.bg, color: chips.NTM.text, border: `1px solid ${chips.NTM.border}`, fontFamily: MONO, fontSize: 11, fontWeight: 800, letterSpacing: '0.05em', textDecoration: 'none', flexShrink: 0, opacity: stale ? 0.45 : 1, pointerEvents: stale ? 'none' : 'auto' }}
                >
                  CHECK
                </a>
              </div>
            ))}
          </div>
        )}
        {overdue.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ ...s.secTitle, color: c.mvtRing }}>MVT OVERDUE · {overdue.length}</span>
            {overdue.map((f) => {
              const overdueMin = Math.round((nowMs - (Number(f.delayedStartUtcMs) || Number(f.startUtcMs))) / 60_000);
              return (
                <div key={f.id} style={{ background: MOBILE_CHROME.overdueCardBg, border: `1px solid ${MOBILE_CHROME.overdueCardBorder}`, borderRadius: 14, padding: '13px 14px', display: 'flex', flexDirection: 'column', gap: 7, cursor: 'pointer', minHeight: 44 }} onClick={() => onOpenFlight(f)}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
                      <span style={{ fontFamily: MONO, fontSize: 16, fontWeight: 700, color: chrome.headerTime, fontStyle: f.isConfirmed === false ? 'italic' : 'normal' }}>{f.fn}</span>
                      <span style={{ fontFamily: MONO, fontSize: 11.5, color: chrome.legendLabel }}>{f.dep} → {f.arr}</span>
                    </div>
                    <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: c.mvtRing, flexShrink: 0 }}>+{overdueMin} min</span>
                  </div>
                  <div style={{ fontSize: 12.5, lineHeight: 1.5, color: MOBILE_CHROME.overdueBody }}>
                    No MVT message since {f.depKind} {f.depHm}Z. Expected arrival movement at {f.arrHm}Z.
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {unconfirmed.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={s.secTitle}>UNCONFIRMED · {unconfirmed.length}</span>
            {unconfirmed.map((f) => (
              <div key={f.id} style={{ background: chrome.panelBg, border: `1px solid ${chrome.gridLine}`, borderRadius: 14, padding: '13px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 56, cursor: 'pointer', gap: 8 }} onClick={() => onOpenFlight(f)}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                  <span style={{ fontFamily: MONO, fontSize: 15, fontWeight: 700, color: chrome.sidebarText, fontStyle: 'italic' }}>{f.fn}</span>
                  <span style={{ fontSize: 12.5, color: chrome.legendLabel }}>
                    {f.depKind !== 'STD' ? `${f.depKind} ` : 'ETD '}{f.depHm}Z · no operator confirmation
                  </span>
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, color: MOBILE_CHROME.linkBlue, flexShrink: 0 }}>Open →</span>
              </div>
            ))}
          </div>
        )}
        {limitations.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={s.secTitle}>ACTIVE LIMITATIONS · {limitations.length}</span>
            <div style={{ background: chrome.panelBg, border: `1px solid ${chrome.gridLine}`, borderRadius: 14, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 9 }}>
              {limitations.map((l) => (
                <div key={l.id} style={{ display: 'flex', gap: 9, alignItems: 'baseline' }}>
                  <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: chrome.boardBg, background: l.kind === 'AOG' ? c.stateAog : l.kind === 'WX' ? chips.CAA.text : l.kind === 'CTOT' ? chrome.amber : chrome.legendLabel, borderRadius: 4, padding: '2px 5px', flexShrink: 0 }}>
                    {l.kind || 'OPS'}
                  </span>
                  <span style={{ fontSize: 12.5, color: chrome.sidebarText, lineHeight: 1.45 }}>{l.title}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {empty && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: chrome.sidebarMuted, fontSize: 13.5, textAlign: 'center', padding: '0 40px' }}>
            Nothing needs attention right now.
          </div>
        )}
      </div>
    );
  }

  function TimelineTab() {
    return (
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 'none', padding: '10px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${chrome.gridLine}` }}>
          <span style={{ fontSize: 12.5, color: chrome.sidebarMuted }}>
            {zoomHours === 24 ? '24 h' : `${zoomHours} h`} in view · scroll sideways
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            {ZOOMS.map((z) => (
              <button
                key={z.label}
                type="button"
                onClick={() => setZoomHours(z.hours)}
                style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44, minWidth: 44, justifyContent: 'center', padding: '0 10px', borderRadius: 7, border: 'none', background: zoomHours === z.hours ? chrome.insetBg : 'transparent', fontFamily: MONO, fontSize: 11.5, fontWeight: zoomHours === z.hours ? 700 : 600, color: zoomHours === z.hours ? chrome.sidebarText : chrome.sidebarMuted, cursor: 'pointer' }}
              >
                {z.label}
              </button>
            ))}
          </div>
        </div>
        <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
          <Board
            aircraft={aircraft}
            limitations={limitations}
            windowStartUtc={windowStartUtc}
            windowEndUtc={windowEndUtc}
            scale={1}
            rowZoom={0.75}
            pillHeight={1}
            markerScale={1}
            labelScale={1.1}
            sidebarScale={1}
            acColScale={0.78}
            mvtThresholdMin={mvtThresholdMin}
            showUnconfirmedRing={showUnconfirmedRing}
            mvtFlashSeconds={mvtFlashSeconds}
            hideSidebar
            rowHeightPx={60}
            viewportHoursOverride={zoomHours}
            forceMarkerMode="dots"
            markersInside
            bodyContent="callsign-route"
            belowText="none"
            maxMarkers={3}
            touchHitMinPx={44}
            onPillTap={onOpenFlight}
            staleMode={stale}
          />
        </div>
        <div style={{ flex: 'none', borderTop: `1px solid ${chrome.gridLine}`, padding: '11px 16px 20px', display: 'flex', alignItems: 'center', gap: 14, background: chrome.headerBg }}>
          {/* Four marker swatches — same token bridges as the pill dots. WX is
              category-coloured on pills; the legend shows the MVFR mid tone. */}
          {[
            ['IMP', chips.IMP.text],
            ['NTM', chips.NTM.text],
            ['CAA', chips.CAA.text],
            ['WX', wxColors.MVFR],
          ].map(([labelText, color]) => (
            <div key={labelText} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 7, height: 7, borderRadius: 2, background: color }} />
              <span style={{ fontFamily: MONO, fontSize: 9.5, color: chrome.legendLabel }}>{labelText}</span>
            </div>
          ))}
          <span style={{ marginLeft: 'auto', fontSize: 12, color: chrome.sidebarMuted }}>Tap a pill</span>
        </div>
      </div>
    );
  }

  return (
    <div style={s.shell}>
      {stale && <StaleBanner ageMin={conn.ageMin} lastAliveMs={conn.lastAliveMs} onRetry={onRetry} />}
      <div style={s.header}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
            <span style={s.title}>Digital Wall</span>
            {!stale && tab === 'now' && <ConnChip status={conn.status} />}
          </div>
          <span style={s.clock}>{stale ? `frozen at ${hmsZ(conn.lastAliveMs)}Z` : `${hmsZ(nowMs)}Z`}</span>
        </div>
        {tab === 'now' && loadedOnce && (airborne.length > 0 || nextOut.length > 0) && (
          <div style={s.summary}>
            {airborne.length} airborne · {departingSoon} depart within the hour ·{' '}
            <span style={{ color: attentionCount > 0 ? MOBILE_CHROME.attnOrange : chrome.legendLabel, fontWeight: attentionCount > 0 ? 700 : 400 }}>
              {attentionCount} need attention
            </span>
          </div>
        )}
        <div style={s.tabs}>
          <button type="button" style={s.tab(tab === 'now')} onClick={() => setTab('now')}>Now</button>
          <button type="button" style={s.tab(tab === 'attention')} onClick={() => setTab('attention')}>
            Attention
            {attentionCount > 0 && (
              <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, color: tab === 'attention' ? MOBILE_CHROME.onAccent : chrome.boardBg, background: tab === 'attention' ? MOBILE_CHROME.attnBadgeBg : MOBILE_CHROME.attnOrange, borderRadius: 9, padding: '1px 5px' }}>
                {attentionCount}
              </span>
            )}
          </button>
          <button type="button" style={s.tab(tab === 'timeline')} onClick={() => setTab('timeline')}>Timeline</button>
        </div>
      </div>
      {tab === 'now' && <NowTab />}
      {tab === 'attention' && <AttentionTab />}
      {tab === 'timeline' && <TimelineTab />}
      {tab === 'now' && loadedOnce && (airborne.length > 0 || nextOut.length > 0) && (
        <div style={s.footer}>
          <span style={{ fontSize: 12.5, color: chrome.sidebarMuted }}>Rotate for the full timeline</span>
          <button type="button" onClick={() => openTimeline()} style={{ border: 'none', background: 'transparent', fontSize: 13, fontWeight: 700, color: MOBILE_CHROME.linkBlue, cursor: 'pointer', minHeight: 44, padding: '0 6px', fontFamily: 'inherit' }}>
            Open timeline →
          </button>
        </div>
      )}
    </div>
  );
}
