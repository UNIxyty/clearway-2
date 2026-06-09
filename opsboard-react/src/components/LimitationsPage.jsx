import { useEffect, useMemo, useState } from 'react';
import {
  deleteLimitation,
  fetchCountries,
  fetchLimitations,
  searchAirports,
  setLimitationActive,
  upsertLimitation,
} from '../services/timelineApi';

export default function LimitationsPage() {
  const [items, setItems] = useState([]);
  const [countries, setCountries] = useState([]);
  const [airportQuery, setAirportQuery] = useState('');
  const [airportResults, setAirportResults] = useState([]);
  const [form, setForm] = useState({
    title: '',
    description: '',
    type: 'OPS',
    airportIcaos: [],
    countries: [],
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const payload = await fetchLimitations();
      setItems(payload.limitations || []);
      const countryPayload = await fetchCountries('', 300);
      setCountries(countryPayload.countries || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadAirportOptions(query) {
    const q = String(query || '').trim();
    if (!q) {
      setAirportResults([]);
      return;
    }
    try {
      const payload = await searchAirports(q, 20);
      setAirportResults(payload.airports || []);
    } catch {
      setAirportResults([]);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const id = setTimeout(() => {
      loadAirportOptions(airportQuery);
    }, 180);
    return () => clearTimeout(id);
  }, [airportQuery]);

  const unselectedCountries = useMemo(
    () => countries.filter((country) => !form.countries.includes(country)),
    [countries, form.countries]
  );

  function addAirport(icao) {
    const normalized = String(icao || '').trim().toUpperCase();
    if (!normalized) return;
    setForm((prev) => ({
      ...prev,
      airportIcaos: [...new Set([...prev.airportIcaos, normalized])],
    }));
    setAirportQuery('');
    setAirportResults([]);
  }

  function removeAirport(icao) {
    setForm((prev) => ({
      ...prev,
      airportIcaos: prev.airportIcaos.filter((item) => item !== icao),
    }));
  }

  function addCountry(country) {
    const value = String(country || '').trim();
    if (!value) return;
    setForm((prev) => ({
      ...prev,
      countries: [...new Set([...prev.countries, value])],
    }));
  }

  function removeCountry(country) {
    setForm((prev) => ({
      ...prev,
      countries: prev.countries.filter((item) => item !== country),
    }));
  }

  async function createLimitation(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await upsertLimitation(form);
      setForm({
        title: '',
        description: '',
        type: 'OPS',
        airportIcaos: [],
        countries: [],
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(item, nextValue) {
    setBusyId(item.id);
    setError('');
    try {
      await setLimitationActive(item.id, nextValue);
      setItems((prev) =>
        prev.map((row) => (row.id === item.id ? { ...row, isActive: nextValue } : row))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId('');
    }
  }

  async function removeLimitation(id) {
    setBusyId(id);
    setError('');
    try {
      await deleteLimitation(id);
      setItems((prev) => prev.filter((item) => item.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId('');
    }
  }

  return (
    <div style={s.page}>
      <div style={s.top}>
        <h2 style={s.title}>Limitations</h2>
        <button style={s.btn} onClick={load} disabled={loading}>
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>
      {error && <div style={s.error}>{error}</div>}
      <form style={s.form} onSubmit={createLimitation}>
        <input
          style={s.input}
          placeholder="Limitation title (e.g. UK handling strike)"
          value={form.title}
          onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
          required
        />
        <input
          style={s.input}
          placeholder="Description shown in timeline"
          value={form.description}
          onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
        />
        <select
          style={s.input}
          value={form.type}
          onChange={(event) => setForm((prev) => ({ ...prev, type: event.target.value }))}
        >
          <option value="OPS">OPS</option>
          <option value="AOG">AOG</option>
          <option value="WX">WX</option>
          <option value="CTOT">CTOT</option>
          <option value="PAX">PAX</option>
          <option value="CREW">CREW</option>
        </select>
        <button style={s.btn} disabled={saving || loading} type="submit">
          {saving ? 'Saving...' : 'Add Limitation'}
        </button>
      </form>

      <div style={s.selectorGrid}>
        <div style={s.selectorCard}>
          <div style={s.selectorTitle}>Airports</div>
          <input
            style={s.input}
            placeholder="Search by ICAO / name / country"
            value={airportQuery}
            onChange={(event) => setAirportQuery(event.target.value)}
          />
          {airportResults.length > 0 && (
            <div style={s.resultList}>
              {airportResults.map((row) => (
                <button
                  type="button"
                  key={row.icao}
                  style={s.resultItem}
                  onClick={() => addAirport(row.icao)}
                >
                  <b>{row.icao}</b> {row.name ? `· ${row.name}` : ''} {row.country ? `· ${row.country}` : ''}
                </button>
              ))}
            </div>
          )}
          <div style={s.chipList}>
            {form.airportIcaos.map((icao) => (
              <button type="button" key={icao} style={s.chip} onClick={() => removeAirport(icao)}>
                {icao} ×
              </button>
            ))}
          </div>
        </div>

        <div style={s.selectorCard}>
          <div style={s.selectorTitle}>Countries</div>
          <select
            style={s.input}
            onChange={(event) => addCountry(event.target.value)}
            value=""
          >
            <option value="">Add country...</option>
            {unselectedCountries.map((country) => (
              <option key={country} value={country}>{country}</option>
            ))}
          </select>
          <div style={s.chipList}>
            {form.countries.map((country) => (
              <button type="button" key={country} style={s.chip} onClick={() => removeCountry(country)}>
                {country} ×
              </button>
            ))}
          </div>
        </div>
      </div>

      {!loading && items.length === 0 && <div style={s.empty}>No active limitations.</div>}
      <div style={s.grid}>
        {items.map((item) => (
          <div key={item.id || `${item.title}-${item.startDate || ''}`} style={s.card}>
            <div style={s.cardTitle}>{item.title || 'Limitation'}</div>
            <div style={s.cardType}>{item.type || 'N/A'}</div>
            <div style={s.cardDesc}>{item.description || '-'}</div>
            <div style={s.tagRow}>
              {(item.airportIcaos || []).slice(0, 6).map((icao) => (
                <span key={icao} style={s.tag}>{icao}</span>
              ))}
              {(item.countries || []).slice(0, 3).map((country) => (
                <span key={country} style={s.tag}>{country}</span>
              ))}
            </div>
            <div style={s.cardMeta}>
              <button
                type="button"
                style={s.softBtn}
                disabled={busyId === item.id}
                onClick={() => toggleActive(item, !item.isActive)}
              >
                {item.isActive === false ? 'Enable' : 'Disable'}
              </button>
              <button
                type="button"
                style={{ ...s.softBtn, borderColor: 'rgba(239,106,106,.3)', color: '#ef9a9a' }}
                disabled={busyId === item.id}
                onClick={() => removeLimitation(item.id)}
              >
                Delete
              </button>
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
  form: {
    display: 'grid',
    gridTemplateColumns: '1.2fr 1.6fr 120px auto',
    gap: 8,
    marginBottom: 10,
  },
  input: {
    border: '1px solid #2a395c',
    borderRadius: 6,
    padding: '7px 9px',
    fontSize: 12,
    color: '#e8ebf5',
    background: '#111626',
  },
  selectorGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 10,
    marginBottom: 10,
  },
  selectorCard: { border: '1px solid #222840', borderRadius: 8, padding: 10, background: '#111626' },
  selectorTitle: { color: '#8ea1cb', fontSize: 11, marginBottom: 6 },
  resultList: { marginTop: 6, border: '1px solid #243257', borderRadius: 6, overflow: 'hidden', maxHeight: 160, overflowY: 'auto' },
  resultItem: {
    width: '100%',
    textAlign: 'left',
    border: 'none',
    borderBottom: '1px solid #1c2438',
    background: '#0f1524',
    color: '#d2ddf5',
    padding: '7px 8px',
    cursor: 'pointer',
    fontSize: 11,
  },
  chipList: { display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  chip: {
    border: '1px solid #2c3f66',
    borderRadius: 999,
    padding: '2px 8px',
    background: '#172037',
    color: '#b5c8eb',
    fontSize: 11,
    cursor: 'pointer',
  },
  error: { color: '#ef9a9a', marginBottom: 8, fontSize: 11 },
  empty: { color: '#6f7fa8', fontSize: 12 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))', gap: 10 },
  card: { border: '1px solid #222840', borderRadius: 8, padding: 10, background: '#111626' },
  cardTitle: { color: '#dfe7fc', fontSize: 12, marginBottom: 6, fontWeight: 600 },
  cardType: { color: '#8ab7ff', fontSize: 10, marginBottom: 6 },
  cardDesc: { color: '#95a6cc', fontSize: 11, lineHeight: 1.4, minHeight: 34 },
  tagRow: { display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 },
  tag: { fontSize: 10, color: '#9db3dd', background: '#1a2236', border: '1px solid #263654', borderRadius: 999, padding: '1px 6px' },
  cardMeta: { color: '#62729a', fontSize: 10, display: 'flex', justifyContent: 'space-between', marginTop: 10, gap: 6 },
  softBtn: {
    fontSize: 11,
    color: '#cfe0ff',
    background: '#1a243b',
    border: '1px solid #2f446e',
    borderRadius: 6,
    padding: '4px 8px',
    cursor: 'pointer',
  },
};

