import { useEffect, useMemo, useState } from 'react';
import {
  deleteLimitation,
  fetchCountries,
  fetchLimitations,
  searchAirports,
  setLimitationActive,
  upsertLimitation,
} from '../../services/timelineApi';
import { subscribeWallStream } from '../../services/wallStream';
import { ui, Switch } from './ui';

// Keep the existing taxonomy; NTM / WX-alert / IMP badges are produced by the
// alert scanner and Important entries, not created by hand here.
const LIMITATION_TYPES = ['OPS', 'AOG', 'WX', 'CTOT', 'PAX', 'CREW'];

const TYPE_COLOR = {
  AOG: '#ef8080', WX: '#7ec8ff', CREW: '#f0c060', PAX: '#60c898',
  CTOT: '#c8a8ff', OPS: '#9db3dd', NTM: '#ffab73', IMP: '#ff8fc6',
};

const EMPTY_FORM = { title: '', description: '', type: 'OPS', airportIcaos: [], countries: [] };

export default function LimitationsPage() {
  const [items, setItems] = useState([]);
  const [countries, setCountries] = useState([]);
  const [airportQuery, setAirportQuery] = useState('');
  const [airportResults, setAirportResults] = useState([]);
  const [countryQuery, setCountryQuery] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const payload = await fetchLimitations({ withMatches: true });
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

  useEffect(() => {
    load();
    // Reconcile with edits made elsewhere (other console users).
    return subscribeWallStream('limitations.changed', load, { surface: 'console' });
  }, []);

  useEffect(() => {
    const id = setTimeout(async () => {
      const q = airportQuery.trim();
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
    }, 180);
    return () => clearTimeout(id);
  }, [airportQuery]);

  const unselectedCountries = useMemo(
    () =>
      countries.filter(
        (country) =>
          !form.countries.includes(country) &&
          (!countryQuery || country.toLowerCase().includes(countryQuery.toLowerCase()))
      ),
    [countries, form.countries, countryQuery]
  );

  function addAirport(icao) {
    const normalized = String(icao || '').trim().toUpperCase();
    if (!normalized) return;
    setForm((prev) => ({ ...prev, airportIcaos: [...new Set([...prev.airportIcaos, normalized])] }));
    setAirportQuery('');
    setAirportResults([]);
  }

  async function createLimitation(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await upsertLimitation(form);
      setForm(EMPTY_FORM);
      setCountryQuery('');
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
    setItems((prev) => prev.map((row) => (row.id === item.id ? { ...row, isActive: nextValue } : row)));
    try {
      await setLimitationActive(item.id, nextValue);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      await load();
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
      await load();
    } finally {
      setBusyId('');
    }
  }

  return (
    <div style={ui.page}>
      <div style={ui.top}>
        <div>
          <div style={ui.title}>Limitations</div>
          <div style={ui.subtitle}>
            Custom operational warnings; the wall sidebar and matching flight chips update within seconds.
          </div>
        </div>
        <button style={ui.btn} onClick={load} disabled={loading}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>
      {error && <div style={ui.error}>{error}</div>}

      <form style={s.form} onSubmit={createLimitation}>
        <input
          style={ui.input}
          placeholder="Title (e.g. UK handling strike)"
          value={form.title}
          onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
          required
        />
        <input
          style={ui.input}
          placeholder="Description shown on the wall"
          value={form.description}
          onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
        />
        <select
          style={ui.select}
          value={form.type}
          onChange={(event) => setForm((prev) => ({ ...prev, type: event.target.value }))}
        >
          {LIMITATION_TYPES.map((type) => (
            <option key={type} value={type}>{type}</option>
          ))}
        </select>
        <button style={ui.btnPrimary} disabled={saving || loading} type="submit">
          {saving ? 'Saving…' : 'Add limitation'}
        </button>
      </form>

      <div style={s.selectorGrid}>
        <div style={ui.card}>
          <div style={ui.cardTitle}>Airports</div>
          <input
            style={{ ...ui.input, width: '100%', boxSizing: 'border-box' }}
            placeholder="Search by ICAO / name / country"
            value={airportQuery}
            onChange={(event) => setAirportQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                addAirport(airportQuery);
              }
            }}
          />
          {airportResults.length > 0 && (
            <div style={ui.resultList}>
              {airportResults.map((row) => (
                <button type="button" key={row.icao} style={ui.resultItem} onClick={() => addAirport(row.icao)}>
                  <b>{row.icao}</b> {row.name ? `· ${row.name}` : ''} {row.country ? `· ${row.country}` : ''}
                </button>
              ))}
            </div>
          )}
          <div style={s.chipList}>
            {form.airportIcaos.map((icao) => (
              <button
                type="button"
                key={icao}
                style={ui.chip}
                onClick={() => setForm((prev) => ({ ...prev, airportIcaos: prev.airportIcaos.filter((i) => i !== icao) }))}
              >
                {icao} ×
              </button>
            ))}
          </div>
        </div>

        <div style={ui.card}>
          <div style={ui.cardTitle}>Countries</div>
          <input
            style={{ ...ui.input, width: '100%', boxSizing: 'border-box' }}
            placeholder="Search and add country"
            value={countryQuery}
            onChange={(event) => setCountryQuery(event.target.value)}
          />
          {countryQuery && unselectedCountries.length > 0 && (
            <div style={ui.resultList}>
              {unselectedCountries.slice(0, 30).map((country) => (
                <button
                  type="button"
                  key={country}
                  style={ui.resultItem}
                  onClick={() => {
                    setForm((prev) => ({ ...prev, countries: [...new Set([...prev.countries, country])] }));
                    setCountryQuery('');
                  }}
                >
                  {country}
                </button>
              ))}
            </div>
          )}
          <div style={s.chipList}>
            {form.countries.map((country) => (
              <button
                type="button"
                key={country}
                style={ui.chip}
                onClick={() => setForm((prev) => ({ ...prev, countries: prev.countries.filter((c) => c !== country) }))}
              >
                {country} ×
              </button>
            ))}
          </div>
        </div>
      </div>

      {!loading && items.length === 0 && <div style={ui.empty}>No limitations yet.</div>}
      <div style={ui.grid}>
        {items.map((item) => (
          <div key={item.id} style={{ ...ui.card, opacity: item.isActive === false ? 0.55 : 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
              <div style={ui.cardTitle}>{item.title || 'Limitation'}</div>
              <span style={{ ...ui.tag, color: TYPE_COLOR[item.type] || '#9db3dd', flexShrink: 0 }}>
                {item.type || 'OPS'}
              </span>
            </div>
            <div style={s.cardDesc}>{item.description || '—'}</div>
            <div style={s.tagRow}>
              {(item.airportIcaos || []).slice(0, 6).map((icao) => (
                <span key={icao} style={ui.tag}>{icao}</span>
              ))}
              {(item.countries || []).slice(0, 3).map((country) => (
                <span key={country} style={ui.tag}>{country}</span>
              ))}
            </div>
            <div style={s.matchLine}>
              {typeof item.matchedFlightCount === 'number'
                ? item.matchedFlightCount > 0
                  ? `Currently matches ${item.matchedFlightCount} flight${item.matchedFlightCount === 1 ? '' : 's'} on the board`
                  : 'Matches no flights in the current window'
                : ''}
            </div>
            <div style={s.cardMeta}>
              <Switch
                on={item.isActive !== false}
                disabled={busyId === item.id}
                onToggle={() => toggleActive(item, item.isActive === false)}
                labels={['Active', 'Inactive']}
              />
              <button
                type="button"
                style={ui.btnDanger}
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
  form: { display: 'grid', gridTemplateColumns: '1.2fr 1.6fr 110px auto', gap: 8, marginBottom: 12 },
  selectorGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 },
  chipList: { display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  cardDesc: { color: '#95a6cc', fontSize: 11, lineHeight: 1.4, minHeight: 30, marginTop: 4 },
  tagRow: { display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 },
  matchLine: { fontSize: 10.5, color: '#6f7fa8', marginTop: 8, minHeight: 13 },
  cardMeta: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, gap: 6 },
};
