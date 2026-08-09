import { useEffect, useRef, useState } from 'react';
import Header, { FALLBACK_CLOCKS } from './components/Header';
import Board from './components/Board';
import FlightOverlay from './components/FlightOverlay';
import {
  fetchDisplayClocks,
  fetchDisplaySettings,
  fetchNotamCheckToday,
  fetchTimelineAircraft,
  reportDisplayEnv,
} from './services/timelineApi';
import { subscribeWallStream } from './services/wallStream';
import { collectViewportEnv, defaultDeviceLabel, getDeviceId } from './services/device';

// Item 1 diagnostic: append ?debug=viewport to the wall URL to see the
// screen's real rendering environment without devtools. The same values are
// reported to /api/display/env either way (visible on console Settings).
function ViewportDebug() {
  const [env, setEnv] = useState(() => collectViewportEnv());
  useEffect(() => {
    const onResize = () => setEnv(collectViewportEnv());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const rows = [
    ['viewport (CSS px)', `${env.innerWidth} × ${env.innerHeight}`],
    ['devicePixelRatio', String(env.devicePixelRatio)],
    ['screen', `${env.screenWidth} × ${env.screenHeight}`],
    ['visualViewport scale', String(env.visualViewportScale ?? '—')],
    ['outer/inner ratio', String(env.zoomOuterRatio ?? '—')],
    ['root font size', `${env.rootFontSize}px`],
    ['device id', getDeviceId()],
  ];
  return (
    <div style={{ position: 'fixed', top: 8, right: 8, zIndex: 9999, background: 'rgba(8,12,22,.92)', border: '1px solid rgba(120,150,220,.5)', borderRadius: 8, padding: '10px 14px', fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: '#cfe0ff', lineHeight: 1.7 }}>
      <div style={{ fontWeight: 700, marginBottom: 4, color: '#8fb3ff' }}>VIEWPORT DEBUG</div>
      {rows.map(([k, v]) => (
        <div key={k}><span style={{ color: '#7a8aab' }}>{k}: </span>{v}</div>
      ))}
    </div>
  );
}

// Daily NOTAM-check wall sign (view-only: the display just renders the state
// the backend pushes; acknowledgments happen in the Console).
function NotamSign({ sign, scale = 1 }) {
  if (sign !== 'CHECK' && sign !== 'CHECKED') return null;
  const isCheck = sign === 'CHECK';
  return (
    <>
      <style>{'@keyframes cwsignpulse{0%,100%{opacity:1}50%{opacity:.55}}'}</style>
      <div
        style={{
          fontFamily: "'IBM Plex Mono',monospace",
          fontSize: Math.round(14 * scale),
          fontWeight: 700,
          letterSpacing: '1px',
          color: '#fff',
          background: isCheck ? '#c62828' : '#1f7a3f',
          border: `1px solid ${isCheck ? '#ff8a80' : '#66bb6a'}`,
          borderRadius: 8,
          padding: '8px 14px',
          whiteSpace: 'nowrap',
          animation: isCheck ? 'cwsignpulse 1.6s ease-in-out infinite' : 'none',
          boxShadow: isCheck ? '0 0 18px rgba(198,40,40,.55)' : '0 0 12px rgba(31,122,63,.4)',
        }}
      >
        {isCheck ? '!!! CHECK NOTAM !!!' : 'NOTAM CHECKED'}
      </div>
    </>
  );
}


const POLL_MS = 60_000;

// Captured at module evaluation — the router normalizes the URL (dropping
// the query) before components mount, so read it before that happens.
const DEBUG_VIEWPORT = /[?&#]debug/.test(window.location.href);

/**
 * The Display surface — a pure wall screen. No tabs, no CRUD controls, no
 * management UI; just the clock bar, the timeline board and the limitation
 * sidebar. All management lives in the Display Console (/console).
 *
 * Updates arrive two ways: the 60s poll (fallback, forces a Leon sync) and
 * SSE events (limitations.changed / config.changed) that trigger an
 * immediate cheap refetch. Both paths replace whole state slices, so an
 * event racing a poll is idempotent.
 */
export default function DisplayApp() {
  const [aircraft, setAircraft] = useState([]);
  const [windowStartUtc, setWindowStartUtc] = useState('');
  const [windowEndUtc, setWindowEndUtc] = useState('');
  const [error, setError] = useState('');
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [limitations, setLimitations] = useState([]);
  const [clocks, setClocks] = useState(FALLBACK_CLOCKS);
  const [notamSign, setNotamSign] = useState('NONE');
  const [scale, setScale] = useState(1.3); // display scale (ops-room legibility)
  const [timeZoom, setTimeZoom] = useState(1); // hour-gridline spacing (time-axis zoom)
  const [rowZoom, setRowZoom] = useState(1); // vertical size (row spacing)
  const [pillHeight, setPillHeight] = useState(1); // pill body thickness (Item 3)
  const [markerScale, setMarkerScale] = useState(1); // marker chip row size (Item 3)
  const [labelScale, setLabelScale] = useState(1); // ID / route / times text (Item 3)
  const [overlayScale, setOverlayScale] = useState(1.3); // side overlay, independent of the board
  const [sidebarScale, setSidebarScale] = useState(1.3); // legend/limitations panel
  const [headerScale, setHeaderScale] = useState(1.3); // top clock bar (own control)
  const [acColScale, setAcColScale] = useState(1); // left aircraft column (own control)
  const [autoFitRows, setAutoFitRows] = useState(false); // Item 2: fit all rows to the viewport
  const loadingRef = useRef(false);
  const deviceIdRef = useRef(getDeviceId());
  const debugViewport = DEBUG_VIEWPORT;

  async function loadTimeline({ refresh = true } = {}) {
    if (loadingRef.current) return;
    loadingRef.current = true;
    try {
      const result = await fetchTimelineAircraft({ refresh });
      setAircraft(result.aircraft);
      setWindowStartUtc(result.windowStartUtc || '');
      setWindowEndUtc(result.windowEndUtc || '');
      setLimitations(result.limitations || []);
      setError('');
    } catch (err) {
      // Keep showing the last good board; surface the problem quietly.
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadedOnce(true);
      loadingRef.current = false;
    }
  }

  async function loadClocks() {
    try {
      const payload = await fetchDisplayClocks();
      if (Array.isArray(payload.clocks) && payload.clocks.length > 0) {
        setClocks(payload.clocks);
      }
    } catch {
      /* keep current clocks */
    }
  }

  async function loadSettings() {
    try {
      const payload = await fetchDisplaySettings(deviceIdRef.current);
      setAutoFitRows(payload.settings?.autoFitRows === true);
      if (Number.isFinite(payload.settings?.scale)) setScale(payload.settings.scale);
      if (Number.isFinite(payload.settings?.timeZoom)) setTimeZoom(payload.settings.timeZoom);
      if (Number.isFinite(payload.settings?.rowZoom)) setRowZoom(payload.settings.rowZoom);
      if (Number.isFinite(payload.settings?.pillHeight)) setPillHeight(payload.settings.pillHeight);
      if (Number.isFinite(payload.settings?.markerScale)) setMarkerScale(payload.settings.markerScale);
      if (Number.isFinite(payload.settings?.labelScale)) setLabelScale(payload.settings.labelScale);
      if (Number.isFinite(payload.settings?.overlayScale)) setOverlayScale(payload.settings.overlayScale);
      if (Number.isFinite(payload.settings?.sidebarScale)) setSidebarScale(payload.settings.sidebarScale);
      if (Number.isFinite(payload.settings?.headerScale)) setHeaderScale(payload.settings.headerScale);
      if (Number.isFinite(payload.settings?.acColScale)) setAcColScale(payload.settings.acColScale);
    } catch {
      /* keep current scale */
    }
  }

  useEffect(() => {
    // refresh=false everywhere: the BACKEND owns Leon polling on its own
    // (staggered, backed-off) timer; the wall just reads the cache. The old
    // refresh=true poll forced an extra full sync cycle every 60s on top of
    // the backend's own, which helped trip Leon's rate protection.
    loadTimeline({ refresh: false });
    loadClocks();
    loadSettings();
    fetchNotamCheckToday().then((p) => setNotamSign(p.sign || 'NONE')).catch(() => {});
    const id = setInterval(() => loadTimeline({ refresh: false }), POLL_MS);
    // Item 1: report this screen's real rendering environment (and again on
    // resize) so the console shows what the wall actually has to work with.
    reportDisplayEnv({ deviceId: deviceIdRef.current, surface: 'wall', label: undefined, env: collectViewportEnv() });
    let envTimer;
    const onResize = () => {
      clearTimeout(envTimer);
      envTimer = setTimeout(() => {
        reportDisplayEnv({ deviceId: deviceIdRef.current, surface: 'wall', env: collectViewportEnv() });
        loadSettings();
      }, 1500);
    };
    window.addEventListener('resize', onResize);
    return () => { clearInterval(id); clearTimeout(envTimer); window.removeEventListener('resize', onResize); };
  }, []);

  // Live pushes from the Console: limitations edits repaint the sidebar and
  // flight chips within a second or two; clock config changes swap the bar.
  useEffect(() => {
    const unsubscribers = [
      subscribeWallStream('limitations.changed', () => loadTimeline({ refresh: false })),
      // IMP entries and NTM/WX findings no longer render in the sidebar —
      // they only affect per-flight pill markers, so a cheap re-read of the
      // decorated flights is all these events need.
      subscribeWallStream('important.changed', () => loadTimeline({ refresh: false })),
      subscribeWallStream('alerts.changed', () => loadTimeline({ refresh: false })),
      // Operator activated/deactivated or aircraft shown/hidden: lanes
      // appear/disappear within ~1-2s (cache read; whole-slice replace keeps
      // it idempotent with the 60s poll).
      subscribeWallStream('roster.changed', () => loadTimeline({ refresh: false })),
      // Flight data changed server-side (webhook re-pull or a sync cycle
      // that updated/evicted flights): re-read the decorated cache so new
      // ETD/ETA/ATD/ATA, delays and movement states show within ~1-2s.
      subscribeWallStream('flight.changed', () => loadTimeline({ refresh: false })),
      // CheckWX categories refreshed (rides with the daily check) — re-read
      // so the per-airport WX dots update.
      subscribeWallStream('weather.changed', () => loadTimeline({ refresh: false })),
      // Sign update AND a cheap re-read: acking an airport on the console
      // clears that airport's NTM/WX pill markers within ~1-2s (server-side
      // decoration drops findings for CHECKED airports).
      subscribeWallStream('notam-check.changed', (event) => {
        setNotamSign(event.sign || 'NONE');
        loadTimeline({ refresh: false });
      }),
      subscribeWallStream('config.changed', (event) => {
        if (!event.section || event.section === 'clocks') loadClocks();
        if (!event.section || event.section === 'settings') {
          // Profile scoping (Item 3): an edit aimed at ANOTHER device's
          // profile must not resize this screen.
          if (event.deviceId && event.deviceId !== deviceIdRef.current) return;
          loadSettings();
          // Visibility-window settings (upcoming horizon / post-landing)
          // filter flights SERVER-side — re-read the timeline so a changed
          // threshold takes effect immediately, not at the next poll.
          loadTimeline({ refresh: false });
        }
      }),
    ];
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, []);

  return (
    <div style={s.shell}>
      {/* Clocks bar + wall sign scale with the SIDEBAR scale; the overlay
          with its own scale — the board scale moves neither (Item 2). */}
      <Header
        clocks={clocks}
        scale={headerScale}
        rightSlot={<NotamSign sign={notamSign} scale={sidebarScale} />}
      />
      <FlightOverlay topOffset={Math.round(92 * headerScale)} scale={overlayScale} />
      {/* Sidebar shows ONLY the manual text limitations from the Limitations
          page — NTM/WX/IMP markers live on the flight pills instead. */}
      <Board
        aircraft={aircraft}
        limitations={limitations}
        windowStartUtc={windowStartUtc}
        windowEndUtc={windowEndUtc}
        scale={scale}
        timeZoom={timeZoom}
        rowZoom={rowZoom}
        pillHeight={pillHeight}
        markerScale={markerScale}
        labelScale={labelScale}
        sidebarScale={sidebarScale}
        acColScale={acColScale}
        autoFitRows={autoFitRows}
        onAutoFitComputed={(computedFit) => {
          // Read-only readout for console Settings; debounced by the fact
          // that Board only calls this when the computed values CHANGE.
          reportDisplayEnv({ deviceId: deviceIdRef.current, surface: 'wall', env: collectViewportEnv(), computedFit });
        }}
      />
      {debugViewport && <ViewportDebug />}
      {!loadedOnce && <div style={s.notice}>Loading timeline…</div>}
      {error && <div style={{ ...s.notice, ...s.noticeError }}>Data unavailable: {error}</div>}
    </div>
  );
}

const s = {
  shell: { height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  notice: {
    position: 'fixed',
    bottom: 10,
    right: 12,
    zIndex: 200,
    fontSize: 11,
    color: '#8090b8',
    background: 'rgba(21,26,39,.92)',
    border: '1px solid #222840',
    borderRadius: 6,
    padding: '5px 10px',
    maxWidth: 420,
  },
  noticeError: { color: '#ef9a9a', borderColor: 'rgba(239,106,106,.35)' },
};
