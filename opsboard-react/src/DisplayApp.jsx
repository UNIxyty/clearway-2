import { useEffect, useRef, useState } from 'react';
import Header, { FALLBACK_CLOCKS } from './components/Header';
import Board from './components/Board';
import FlightOverlay from './components/FlightOverlay';
import PresencePills from './components/PresencePills';
import {
  fetchDisplayClocks,
  fetchDisplaySettings,
  fetchNotamCheckToday,
  fetchTimelineAircraft,
} from './services/timelineApi';
import { subscribeWallStream } from './services/wallStream';

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
  const [rowZoom, setRowZoom] = useState(1); // vertical size (lane/pill height)
  const [overlayScale, setOverlayScale] = useState(1.3); // side overlay, independent of the board
  const [sidebarScale, setSidebarScale] = useState(1.3); // clocks bar + legend/limitations panel
  const loadingRef = useRef(false);

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
      const payload = await fetchDisplaySettings();
      if (Number.isFinite(payload.settings?.scale)) setScale(payload.settings.scale);
      if (Number.isFinite(payload.settings?.timeZoom)) setTimeZoom(payload.settings.timeZoom);
      if (Number.isFinite(payload.settings?.rowZoom)) setRowZoom(payload.settings.rowZoom);
      if (Number.isFinite(payload.settings?.overlayScale)) setOverlayScale(payload.settings.overlayScale);
      if (Number.isFinite(payload.settings?.sidebarScale)) setSidebarScale(payload.settings.sidebarScale);
    } catch {
      /* keep current scale */
    }
  }

  useEffect(() => {
    loadTimeline();
    loadClocks();
    loadSettings();
    fetchNotamCheckToday().then((p) => setNotamSign(p.sign || 'NONE')).catch(() => {});
    const id = setInterval(loadTimeline, POLL_MS);
    return () => clearInterval(id);
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
        scale={sidebarScale}
        rightSlot={
          <>
            <NotamSign sign={notamSign} scale={sidebarScale} />
            <PresencePills surface="display" compact />
          </>
        }
      />
      <FlightOverlay topOffset={Math.round(92 * sidebarScale)} scale={overlayScale} />
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
        sidebarScale={sidebarScale}
      />
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
