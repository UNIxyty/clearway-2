import { useEffect, useState } from 'react';
import { fetchLimitations } from '../services/timelineApi';

export default function LimitationsPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const payload = await fetchLimitations();
      setItems(payload.limitations || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setItems([]);
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
        <h2 style={s.title}>Limitations</h2>
        <button style={s.btn} onClick={load} disabled={loading}>
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>
      {error && <div style={s.error}>{error}</div>}
      {!loading && items.length === 0 && <div style={s.empty}>No active limitations.</div>}
      <div style={s.grid}>
        {items.map((item) => (
          <div key={item.id || `${item.title}-${item.startDate || ''}`} style={s.card}>
            <div style={s.cardTitle}>{item.title || 'Limitation'}</div>
            <div style={s.cardType}>{item.type || 'N/A'}</div>
            <div style={s.cardDesc}>{item.description || '-'}</div>
            <div style={s.cardMeta}>
              <span>{item.startDate || '-'}</span>
              <span>{item.endDate || '-'}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const s = {
  page: { height: '100%', overflow: 'auto', padding: 14, background: '#151a27' },
  top: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  title: { fontSize: 14, color: '#e8ebf5' },
  btn: { fontSize: 11, color: '#d8e6ff', background: '#1f2a43', border: '1px solid #2a395c', borderRadius: 6, padding: '4px 10px' },
  error: { color: '#ef9a9a', marginBottom: 8, fontSize: 11 },
  empty: { color: '#6f7fa8', fontSize: 12 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))', gap: 10 },
  card: { border: '1px solid #222840', borderRadius: 8, padding: 10, background: '#111626' },
  cardTitle: { color: '#dfe7fc', fontSize: 12, marginBottom: 6, fontWeight: 600 },
  cardType: { color: '#8ab7ff', fontSize: 10, marginBottom: 6 },
  cardDesc: { color: '#95a6cc', fontSize: 11, lineHeight: 1.4, minHeight: 34 },
  cardMeta: { color: '#62729a', fontSize: 10, display: 'flex', justifyContent: 'space-between', marginTop: 8 },
};

