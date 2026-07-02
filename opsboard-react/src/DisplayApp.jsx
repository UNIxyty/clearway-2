import { useEffect, useRef, useState } from 'react';
import Header, { FALLBACK_CLOCKS } from './components/Header';
import Board from './components/Board';
import { fetchDisplayClocks, fetchTimelineAircraft } from './services/timelineApi';
import { subscribeWallStream } from './services/wallStream';

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

  useEffect(() => {
    loadTimeline();
    loadClocks();
    const id = setInterval(loadTimeline, POLL_MS);
    return () => clearInterval(id);
  }, []);

  // Live pushes from the Console: limitations edits repaint the sidebar and
  // flight chips within a second or two; clock config changes swap the bar.
  useEffect(() => {
    const unsubscribers = [
      subscribeWallStream('limitations.changed', () => loadTimeline({ refresh: false })),
      subscribeWallStream('config.changed', (event) => {
        if (!event.section || event.section === 'clocks') loadClocks();
      }),
    ];
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, []);

  return (
    <div style={s.shell}>
      <Header clocks={clocks} />
      <Board
        aircraft={aircraft}
        limitations={limitations}
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
