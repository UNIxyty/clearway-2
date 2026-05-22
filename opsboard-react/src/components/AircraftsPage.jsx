import { useEffect, useState } from 'react';
import { fetchAircraftSchedule } from '../services/timelineApi';

export default function AircraftsPage() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const payload = await fetchAircraftSchedule();
      setData(payload.aircraft || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setData([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div style={s.page}>
      <div style={s.top}>
        <h2 style={s.title}>Aircrafts (next 7 days)</h2>
        <button style={s.btn} onClick={load} disabled={loading}>
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>
      {error && <div style={s.error}>{error}</div>}
      <div style={s.tableWrap}>
        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.th}>Registration</th>
              <th style={s.th}>Operator</th>
              <th style={s.th}>Flights</th>
              <th style={s.th}>Visible</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={`${row.oprId}:${row.registration}`}>
                <td style={s.td}>{row.registration}</td>
                <td style={s.td}>{row.operatorName || row.oprId || '-'}</td>
                <td style={s.td}>{row.flightCount ?? 0}</td>
                <td style={s.td}>{row.isHidden ? 'Hidden' : 'Visible'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const s = {
  page: { height: '100%', overflow: 'auto', padding: 14, background: '#151a27' },
  top: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  title: { fontSize: 14, color: '#e8ebf5' },
  btn: {
    fontSize: 11, color: '#d8e6ff', background: '#1f2a43', border: '1px solid #2a395c', borderRadius: 6, padding: '4px 10px',
  },
  error: { color: '#ef9a9a', marginBottom: 8, fontSize: 11 },
  tableWrap: { border: '1px solid #222840', borderRadius: 8, overflow: 'hidden' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 12 },
  th: { textAlign: 'left', padding: '8px 10px', color: '#6f7fa8', background: '#121726', borderBottom: '1px solid #222840' },
  td: { padding: '8px 10px', color: '#c9d5f0', borderBottom: '1px solid #1f2539' },
};

