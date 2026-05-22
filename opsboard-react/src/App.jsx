import { useEffect, useMemo, useState } from 'react';
import Header from './components/Header';
import Board from './components/Board';
import { fetchTimelineAircraft } from './services/timelineApi';
import AircraftsPage from './components/AircraftsPage';
import LimitationsPage from './components/LimitationsPage';

export default function App() {
  const [view, setView] = useState('timeline');
  const [aircraft, setAircraft] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [source, setSource] = useState('');

  async function loadTimeline() {
    setLoading(true);
    setError('');
    try {
      const result = await fetchTimelineAircraft();
      setAircraft(result.aircraft);
      setSource(result.source);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setAircraft([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTimeline();
    const id = setInterval(loadTimeline, 60_000);
    return () => clearInterval(id);
  }, []);

  const statusText = useMemo(() => {
    if (loading) return 'Loading timeline from backend...';
    if (error) return `Backend error: ${error}`;
    return `Loaded ${aircraft.length} aircraft from ${source || 'backend'}.`;
  }, [loading, error, aircraft.length, source]);

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <Header />
      <div style={s.toolbar}>
        <div style={s.leftTools}>
          <button style={{ ...s.tab, ...(view === 'timeline' ? s.tabActive : {}) }} onClick={() => setView('timeline')}>Timeline</button>
          <button style={{ ...s.tab, ...(view === 'aircrafts' ? s.tabActive : {}) }} onClick={() => setView('aircrafts')}>Aircrafts</button>
          <button style={{ ...s.tab, ...(view === 'limitations' ? s.tabActive : {}) }} onClick={() => setView('limitations')}>Limitations</button>
        </div>
        <div style={s.rightTools}>
          <div style={{ ...s.status, color: error ? '#ef9a9a' : '#7d88a8' }}>
            {view === 'timeline' ? statusText : 'Connected to backend'}
          </div>
          <button style={s.btn} onClick={loadTimeline} disabled={loading}>
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>
      {view === 'timeline' && <Board aircraft={aircraft} />}
      {view === 'aircrafts' && <AircraftsPage />}
      {view === 'limitations' && <LimitationsPage />}
    </div>
  );
}

const s = {
  toolbar: {
    height: 36,
    flexShrink: 0,
    borderBottom: '1px solid #222840',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 12px',
    background: '#141926',
    gap: 10,
  },
  leftTools: { display: 'flex', alignItems: 'center', gap: 6 },
  rightTools: { display: 'flex', alignItems: 'center', gap: 10 },
  tab: {
    fontSize: 11,
    color: '#9bb0dd',
    background: '#1a2030',
    border: '1px solid #2a395c',
    borderRadius: 6,
    padding: '4px 10px',
    cursor: 'pointer',
  },
  tabActive: {
    color: '#e8f2ff',
    background: '#223251',
    borderColor: '#41639e',
  },
  status: {
    fontSize: 11,
    letterSpacing: '.2px',
  },
  btn: {
    fontSize: 11,
    color: '#d8e6ff',
    background: '#1f2a43',
    border: '1px solid #2a395c',
    borderRadius: 6,
    padding: '4px 10px',
    cursor: 'pointer',
  },
};
