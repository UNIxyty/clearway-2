import { useEffect, useMemo, useState } from 'react';
import Board, { makeLegend, makeWxLegend } from '../Board';
import { fetchCurrentUser } from '../../services/timelineApi';
import { useWallColors } from '../../theme/WallColorsContext';
import { chromeFor, legendSwatchesFor, withAlpha, wxLegendSwatchesFor } from '../../theme/wallColors';
import { MOBILE_CHROME, MONO } from './mobileChrome';
import { consoleHref, hmsZ } from './mobileUtil';
import { ConnChip, StaleBanner } from './WallChrome';

// The Digital Wall on a tablet, 768–1919px (design B1/B2): a REAL reduced
// timeline — the same Board/FlightPill code as the ops-room wall with a
// 3-hour window, ~4 full-anatomy rows, marker row capped at 3 + "+N" and a
// 64px rail. The sidebar collapses into the rail + a "Legend & limits"
// drawer so the unread-limitation signal survives without costing 240px.

const ZOOMS = [
  { label: '3H', hours: 3 },
  { label: '6H', hours: 6 },
  { label: 'DAY', hours: 24 },
];

function dateLine(nowMs) {
  return new Date(nowMs)
    .toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })
    .toUpperCase();
}

export default function TabletWall({
  aircraft = [],
  limitations = [],
  flights = [],
  windowStartUtc,
  windowEndUtc,
  clocks = [],
  conn,
  nowMs,
  mvtThresholdMin = 15,
  mvtFlashSeconds = 1,
  onOpenFlight,
  onRetry,
}) {
  const c = useWallColors();
  const chrome = chromeFor(c);
  const LEGEND = makeLegend(legendSwatchesFor(c));
  const WX_LEGEND = makeWxLegend(wxLegendSwatchesFor(c));
  const [zoomHours, setZoomHours] = useState(3);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [user, setUser] = useState(null);
  const stale = conn.stale;

  useEffect(() => {
    let alive = true;
    fetchCurrentUser().then((r) => { if (alive && r.status === 'ok') setUser(r.user); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const initials = useMemo(() => {
    const source = String(user?.name || user?.email || '').trim();
    if (!source) return '·';
    const parts = source.split(/[\s._@-]+/).filter(Boolean);
    return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || source[0].toUpperCase();
  }, [user]);

  // Unread-limitation signal (the one thing the rail must not lose): any
  // visible flight carrying limitation circles that nobody has checked yet.
  const unreadLimitations = useMemo(
    () => flights.some((f) => (f.limitationIds || []).length > 0 && !f.checks?.lim),
    [flights]
  );

  const homeClock = clocks.find((k) => k.home) || clocks[0] || null;

  const railBtn = (active) => ({
    width: 44,
    height: 44,
    borderRadius: 11,
    border: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 16,
    color: active ? chrome.accent : chrome.sidebarMuted,
    background: active ? withAlpha(chrome.accent, 0.16) : 'transparent',
    cursor: 'pointer',
    position: 'relative',
    textDecoration: 'none',
  });

  const legendSwatchStyle = (l) => ({
    width: 8,
    height: 8,
    borderRadius: 2,
    flexShrink: 0,
    background: l.hatch
      ? `repeating-linear-gradient(-45deg,${l.color} 0,${l.color} 2px,${l.stripe} 2px,${l.stripe} 5px)`
      : l.hollow
        ? l.fill
        : l.color,
    border: l.hatch ? l.border : l.hollow ? `1.5px solid ${l.color}` : 'none',
  });

  return (
    <div style={{ height: '100dvh', minHeight: '100vh', display: 'flex', background: chrome.boardBg, color: chrome.headerTime, overflow: 'hidden' }}>
      {/* ── 64px rail ── */}
      <div style={{ width: 64, flexShrink: 0, background: chrome.headerBg, borderRight: `1px solid ${chrome.gridLine}`, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '14px 0', gap: 8 }}>
        <button type="button" title="Timeline" style={railBtn(true)}>✈</button>
        <button type="button" title="Legend & limits" onClick={() => setDrawerOpen(true)} style={railBtn(false)}>
          ⚠
          {unreadLimitations && (
            <span style={{ position: 'absolute', top: 7, right: 7, width: 7, height: 7, borderRadius: '50%', background: MOBILE_CHROME.attnOrange, border: `1.5px solid ${chrome.headerBg}` }} />
          )}
        </button>
        <span title="UTC clock" style={{ ...railBtn(false), cursor: 'default' }}>◷</span>
        <a href={consoleHref('settings')} title="Settings" style={railBtn(false)}>⚙</a>
        <span style={{ marginTop: 'auto', width: 36, height: 36, borderRadius: '50%', background: chrome.insetBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: MONO, fontSize: 12, fontWeight: 700, color: chrome.sidebarText }}>
          {initials}
        </span>
      </div>

      {/* ── Main column ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {stale && <StaleBanner ageMin={conn.ageMin} lastAliveMs={conn.lastAliveMs} onRetry={onRetry} />}
        <div style={{ flex: 'none', height: 56, background: chrome.headerBg, borderBottom: `1px solid ${chrome.gridLine}`, display: 'flex', alignItems: 'center', padding: '0 20px', gap: 16 }}>
          {homeClock && (
            <span style={{ fontFamily: MONO, fontSize: 19, fontWeight: 700, color: chrome.headerTime, letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>
              {homeClock.label}
            </span>
          )}
          <span style={{ width: 1, height: 22, background: chrome.gridLine, flexShrink: 0 }} />
          <span style={{ fontFamily: MONO, fontSize: 13, color: chrome.legendLabel, letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>{dateLine(nowMs)}</span>
          <span style={{ fontFamily: MONO, fontSize: 19, fontWeight: 700, color: chrome.headerTime, whiteSpace: 'nowrap' }}>
            {stale ? `frozen at ${hmsZ(conn.lastAliveMs)}Z` : `${hmsZ(nowMs)}Z`}
          </span>
          <ConnChip status={conn.status} />
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ display: 'flex', gap: 3, background: chrome.panelBg, border: `1px solid ${chrome.gridLine}`, borderRadius: 10, padding: 3 }}>
              {ZOOMS.map((z) => (
                <button
                  key={z.label}
                  type="button"
                  onClick={() => setZoomHours(z.hours)}
                  style={{ display: 'inline-flex', alignItems: 'center', height: 38, minWidth: 44, justifyContent: 'center', padding: '0 13px', borderRadius: 7, border: 'none', background: zoomHours === z.hours ? chrome.headerTime : 'transparent', fontFamily: MONO, fontSize: 11.5, fontWeight: zoomHours === z.hours ? 700 : 600, color: zoomHours === z.hours ? chrome.boardBg : chrome.legendLabel, cursor: 'pointer' }}
                >
                  {z.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              style={{ display: 'inline-flex', alignItems: 'center', height: 44, padding: '0 14px', borderRadius: 10, border: `1px solid ${chrome.gridLine}`, background: chrome.panelBg, fontSize: 13, fontWeight: 600, color: chrome.sidebarText, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              Legend &amp; limits
            </button>
          </div>
        </div>

        {/* Reduced timeline — the SAME Board as the ops-room wall */}
        <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
          <Board
            aircraft={aircraft}
            limitations={limitations}
            windowStartUtc={windowStartUtc}
            windowEndUtc={windowEndUtc}
            scale={1}
            rowZoom={1}
            pillHeight={46 / 30}
            markerScale={1.5}
            labelScale={1.3}
            sidebarScale={1}
            acColScale={1}
            mvtThresholdMin={mvtThresholdMin}
            mvtFlashSeconds={mvtFlashSeconds}
            hideSidebar
            rowHeightPx={152}
            viewportHoursOverride={zoomHours}
            maxMarkers={3}
            forceMarkerMode="full"
            bodyContent="callsign"
            bodyRight="duration"
            belowText="combined"
            touchHitMinPx={44}
            onPillTap={onOpenFlight}
            staleMode={stale}
          />
        </div>

        {/* Bottom strip: state legend (legendSwatchesFor via makeLegend) */}
        <div style={{ flex: 'none', height: 34, background: chrome.headerBg, borderTop: `1px solid ${chrome.gridLine}`, display: 'flex', alignItems: 'center', padding: '0 20px', gap: 14, overflow: 'hidden' }}>
          <span style={{ fontSize: 12, color: chrome.sidebarMuted, whiteSpace: 'nowrap' }}>{aircraft.length} aircraft</span>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 13, overflow: 'hidden' }}>
            {LEGEND.map((l) => (
              <div key={l.status} style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                <span style={legendSwatchStyle(l)} />
                <span style={{ fontFamily: MONO, fontSize: 10, color: chrome.legendLabel, whiteSpace: 'nowrap' }}>{l.label.toUpperCase()}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Legend & limits drawer (over a scrim, tap the scrim to dismiss) ── */}
      {drawerOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 250, display: 'flex', justifyContent: 'flex-end' }}>
          <div onClick={() => setDrawerOpen(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.55)' }} />
          <div style={{ position: 'relative', width: 380, maxWidth: '85vw', height: '100%', background: chrome.panelBg, borderLeft: `1px solid ${chrome.gridLine}`, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: `1px solid ${chrome.gridLine}` }}>
              <span style={{ fontSize: 15, fontWeight: 800, color: chrome.headerTime }}>Legend &amp; limits</span>
              <button type="button" onClick={() => setDrawerOpen(false)} aria-label="Close" style={{ width: 44, height: 44, borderRadius: 9, background: chrome.insetBg, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, color: chrome.legendLabel, cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div>
                <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: chrome.sidebarMuted, marginBottom: 8 }}>WX AGENDA</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 10px' }}>
                  {WX_LEGEND.map((w) => (
                    <div key={w.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 24, height: 11, borderRadius: 3, flexShrink: 0, background: w.color, border: w.border || 'none' }} />
                      <span style={{ fontSize: 12.5, color: chrome.legendLabel, whiteSpace: 'nowrap' }}>{w.label}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: chrome.sidebarMuted, marginBottom: 8 }}>TIMELINE AGENDA</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 10px' }}>
                  {LEGEND.map((l) => (
                    <div key={l.status} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ ...legendSwatchStyle(l), width: 24, height: 11, borderRadius: 3 }} />
                      <span style={{ fontSize: 12.5, color: chrome.legendLabel, whiteSpace: 'nowrap' }}>{l.label}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: chrome.sidebarMuted, marginBottom: 8 }}>PERMANENT:</div>
                {limitations.length === 0 && <div style={{ fontSize: 13, color: chrome.sidebarMuted }}>None active</div>}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {limitations.map((l, i) => (
                    <div key={l.id} style={{ background: chrome.insetBg, border: `1px solid ${chrome.gridLine}`, borderRadius: 11, padding: '11px 12px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <span style={{ width: 22, height: 22, borderRadius: '50%', flexShrink: 0, border: `1px solid ${chrome.limNumBorder}`, color: chrome.limNum, background: chrome.ghost, fontSize: 12, fontWeight: 700, fontFamily: MONO, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</span>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                        <span style={{ fontSize: 14, fontWeight: 800, color: chrome.limTitle, lineHeight: 1.25 }}>{l.title}</span>
                        {(l.description || l.body) && (
                          <span style={{ fontSize: 12.5, lineHeight: 1.5, color: chrome.sidebarText, whiteSpace: 'pre-wrap' }}>{l.description || l.body}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
