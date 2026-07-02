import { useEffect, useState } from 'react';
import Header from './components/Header';
import Board from './components/Board';
import { fetchTimelineAircraft } from './services/timelineApi';

const POLL_MS = 60_000;

/**
 * The Display surface — a pure wall screen. No tabs, no CRUD controls, no
 * management UI; just the clock bar, the timeline board and the limitation
 * sidebar. All management lives in the Display Console (/console).
 */
export default function DisplayApp() {
  const [aircraft, setAircraft] = useState([]);
  const [windowStartUtc, setWindowStartUtc] = useState('');
  const [windowEndUtc, setWindowEndUtc] = useState('');
  const [error, setError] = useState('');
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [limitations, setLimitations] = useState([]);

  async function loadTimeline() {
    try {
      const result = await fetchTimelineAircraft();
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
    }
  }

  useEffect(() => {
    loadTimeline();
    const id = setInterval(loadTimeline, POLL_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={s.shell}>
      <Header />
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
