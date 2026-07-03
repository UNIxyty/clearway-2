import { useEffect, useRef, useState } from 'react';
import Header, { FALLBACK_CLOCKS } from './components/Header';
import Board from './components/Board';
import FlightOverlay from './components/FlightOverlay';
import PresencePills from './components/PresencePills';
import {
  fetchAlertFindings,
  fetchDisplayClocks,
  fetchImportant,
  fetchNotamCheckToday,
  fetchTimelineAircraft,
} from './services/timelineApi';
import { subscribeWallStream } from './services/wallStream';

// Daily NOTAM-check wall sign (view-only: the display just renders the state
// the backend pushes; acknowledgments happen in the Console).
function NotamSign({ sign }) {
  if (sign !== 'CHECK' && sign !== 'CHECKED') return null;
  const isCheck = sign === 'CHECK';
  return (
    <>
      <style>{'@keyframes cwsignpulse{0%,100%{opacity:1}50%{opacity:.55}}'}</style>
      <div
        style={{
          fontFamily: "'IBM Plex Mono',monospace",
          fontSize: 13,
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

// Important entries render in the same sidebar as limitations, as IMP items.
function importantToSidebarItem(entry) {
  return {
    id: entry.id,
    title: entry.title,
    description: entry.body,
    type: 'IMP',
    airportIcaos: entry.match?.airportIcaos || [],
    countries: entry.match?.countries || [],
  };
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
  const [important, setImportant] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [clocks, setClocks] = useState(FALLBACK_CLOCKS);
  const [notamSign, setNotamSign] = useState('NONE');
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

  async function loadImportant() {
    try {
      const payload = await fetchImportant({ includeInactive: false });
      setImportant((payload.entries || []).map(importantToSidebarItem));
    } catch {
      /* keep current entries */
    }
  }

  async function loadAlerts() {
    try {
      const payload = await fetchAlertFindings();
      setAlerts(
        (payload.findings || []).map((finding) => ({
          id: finding.id,
          title: finding.title,
          description: finding.description,
          type: finding.type, // NTM | WX
          airportIcaos: [finding.icao].filter(Boolean),
          countries: [],
        }))
      );
    } catch {
      /* keep current alerts */
    }
  }

  useEffect(() => {
    loadTimeline();
    loadClocks();
    loadImportant();
    loadAlerts();
    fetchNotamCheckToday().then((p) => setNotamSign(p.sign || 'NONE')).catch(() => {});
    const id = setInterval(loadTimeline, POLL_MS);
    return () => clearInterval(id);
  }, []);

  // Live pushes from the Console: limitations edits repaint the sidebar and
  // flight chips within a second or two; clock config changes swap the bar.
  useEffect(() => {
    const unsubscribers = [
      subscribeWallStream('limitations.changed', () => loadTimeline({ refresh: false })),
      subscribeWallStream('important.changed', () => {
        loadImportant();
        loadTimeline({ refresh: false });
      }),
      subscribeWallStream('alerts.changed', () => {
        loadAlerts();
        loadTimeline({ refresh: false });
      }),
      subscribeWallStream('notam-check.changed', (event) => setNotamSign(event.sign || 'NONE')),
      subscribeWallStream('config.changed', (event) => {
        if (!event.section || event.section === 'clocks') loadClocks();
      }),
    ];
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, []);

  return (
    <div style={s.shell}>
      <Header
        clocks={clocks}
        rightSlot={
          <>
            <NotamSign sign={notamSign} />
            <PresencePills surface="display" compact />
          </>
        }
      />
      <FlightOverlay />
      <Board
        aircraft={aircraft}
        limitations={[...limitations, ...important, ...alerts]}
        windowStartUtc={windowStartUtc}
        windowEndUtc={windowEndUtc}
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
