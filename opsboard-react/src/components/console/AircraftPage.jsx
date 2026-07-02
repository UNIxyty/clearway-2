import { useEffect, useMemo, useState } from 'react';
import { fetchAircraftSchedule, setAircraftVisibility } from '../../services/timelineApi';
import { ui, Switch } from './ui';

export default function AircraftPage() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savingKey, setSavingKey] = useState('');
  const [search, setSearch] = useState('');
  const [operatorFilter, setOperatorFilter] = useState('');

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

  const operators = useMemo(
    () => [...new Set(data.map((row) => row.operatorName || row.oprId).filter(Boolean))].sort(),
    [data]
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.filter((row) => {
      if (operatorFilter && (row.operatorName || row.oprId) !== operatorFilter) return false;
      if (q && !`${row.registration} ${row.operatorName || ''} ${row.oprId || ''}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [data, search, operatorFilter]);

  async function toggleEnabled(row, enabled) {
    const key = `${row.oprId}:${row.registration}`;
    setSavingKey(key);
    setError('');
    // Optimistic; reload reconciles on failure.
    setData((prev) =>
      prev.map((item) =>
        item.oprId === row.oprId && item.registration === row.registration
          ? { ...item, isHidden: !enabled }
          : item
      )
    );
    try {
      await setAircraftVisibility({ oprId: row.oprId, registration: row.registration, enabled });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      await load();
    } finally {
      setSavingKey('');
    }
  }

  return (
    <div style={ui.page}>
      <div style={ui.top}>
        <div>
          <div style={ui.title}>Aircraft</div>
          <div style={ui.subtitle}>Flight counts for the next 7 days; toggle which tails render on the wall.</div>
        </div>
        <button style={ui.btn} onClick={load} disabled={loading}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input
          style={{ ...ui.input, flex: 1 }}
          placeholder="Search by registration or operator…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select style={ui.select} value={operatorFilter} onChange={(e) => setOperatorFilter(e.target.value)}>
          <option value="">All operators</option>
          {operators.map((name) => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
      </div>

      {error && <div style={ui.error}>{error}</div>}

      <div style={ui.tableWrap}>
        <table style={ui.table}>
          <thead>
            <tr>
              <th style={ui.th}>Registration</th>
              <th style={ui.th}>Operator</th>
              <th style={ui.th}>Flights (7d)</th>
              <th style={ui.th}>Next flight</th>
              <th style={ui.th}>Visible on wall</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={`${row.oprId}:${row.registration}`}>
                <td style={{ ...ui.td, fontFamily: "'IBM Plex Mono',monospace" }}>{row.registration}</td>
                <td style={ui.td}>{row.operatorName || row.oprId || '—'}</td>
                <td style={ui.td}>{row.flightCount ?? 0}</td>
                <td style={ui.td}>
                  {row.nextFlightStart
                    ? new Date(row.nextFlightStart).toISOString().replace('T', ' ').slice(0, 16) + 'Z'
                    : '—'}
                </td>
                <td style={ui.td}>
                  <Switch
                    on={!row.isHidden}
                    disabled={savingKey === `${row.oprId}:${row.registration}` || loading}
                    onToggle={() => toggleEnabled(row, row.isHidden)}
                    labels={['Visible', 'Hidden']}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && visible.length === 0 && <div style={ui.empty}>No aircraft match the current filter.</div>}
        {loading && <div style={ui.loading}>Loading aircraft…</div>}
      </div>
    </div>
  );
}
