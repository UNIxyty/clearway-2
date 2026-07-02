import { useEffect, useMemo, useState } from 'react';
import {
  deleteImportant,
  fetchCountries,
  fetchImportant,
  fetchOperators,
  searchAirports,
  setImportantActive,
  upsertImportant,
} from '../../services/timelineApi';
import { subscribeWallStream } from '../../services/wallStream';
import { ui, Switch } from './ui';

// "Important" standing operational limitations (badge class IMP), imported
// from IMPORTANT.docx (scripts/import-important-docx.mjs) or added here.
// A flight is flagged when it matches ALL the criteria groups an entry
// specifies (within a group, any listed value matches).

const EMPTY_FORM = {
  id: '',
  title: '',
  body: '',
  isActive: true,
  reviewed: true,
  match: {
    countries: [],
    airportIcaos: [],
    operators: [],
    registrations: [],
    direction: 'any',
    validFrom: '',
    validTo: '',
  },
};

function toDateInput(value) {
  if (!value) return '';
  const dt = new Date(value);
  return Number.isFinite(dt.getTime()) ? dt.toISOString().slice(0, 10) : '';
}

function ChipEditor({ label, values, onChange, suggestions = [], placeholder }) {
  const [query, setQuery] = useState('');
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return suggestions.filter((sug) => sug.toLowerCase().includes(q) && !values.includes(sug)).slice(0, 15);
  }, [query, suggestions, values]);

  function add(value) {
    const v = String(value || '').trim();
    if (!v) return;
    onChange([...new Set([...values, v])]);
    setQuery('');
  }

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={cs.fieldLabel}>{label}</div>
      <input
        style={{ ...ui.input, width: '100%', boxSizing: 'border-box' }}
        placeholder={placeholder}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            add(query);
          }
        }}
      />
      {matches.length > 0 && (
        <div style={ui.resultList}>
          {matches.map((sug) => (
            <button key={sug} type="button" style={ui.resultItem} onClick={() => add(sug)}>
              {sug}
            </button>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
        {values.map((value) => (
          <button
            key={value}
            type="button"
            style={ui.chip}
            onClick={() => onChange(values.filter((v) => v !== value))}
          >
            {value} ×
          </button>
        ))}
      </div>
    </div>
  );
}

function AirportChipEditor({ values, onChange }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);

  useEffect(() => {
    const id = setTimeout(async () => {
      const q = query.trim();
      if (!q) {
        setResults([]);
        return;
      }
      try {
        const payload = await searchAirports(q, 15);
        setResults(payload.airports || []);
      } catch {
        setResults([]);
      }
    }, 180);
    return () => clearTimeout(id);
  }, [query]);

  function add(icao) {
    const v = String(icao || '').trim().toUpperCase();
    if (!v) return;
    onChange([...new Set([...values, v])]);
    setQuery('');
    setResults([]);
  }

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={cs.fieldLabel}>Airports (ICAO)</div>
      <input
        style={{ ...ui.input, width: '100%', boxSizing: 'border-box' }}
        placeholder="Search ICAO / airport name…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            add(query);
          }
        }}
      />
      {results.length > 0 && (
        <div style={ui.resultList}>
          {results.map((row) => (
            <button key={row.icao} type="button" style={ui.resultItem} onClick={() => add(row.icao)}>
              <b>{row.icao}</b> {row.name ? `· ${row.name}` : ''} {row.country ? `· ${row.country}` : ''}
            </button>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
        {values.map((icao) => (
          <button key={icao} type="button" style={ui.chip} onClick={() => onChange(values.filter((v) => v !== icao))}>
            {icao} ×
          </button>
        ))}
      </div>
    </div>
  );
}

export default function ImportantPage() {
  const [entries, setEntries] = useState([]);
  const [countries, setCountries] = useState([]);
  const [operatorSuggestions, setOperatorSuggestions] = useState([]);
  const [search, setSearch] = useState('');
  const [onlyUnreviewed, setOnlyUnreviewed] = useState(false);
  const [form, setForm] = useState(null); // null = editor closed
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const payload = await fetchImportant({ includeInactive: true, withMatches: true });
      setEntries(payload.entries || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    fetchCountries('', 300).then((p) => setCountries(p.countries || [])).catch(() => {});
    fetchOperators({ includeInactive: true })
      .then((p) => setOperatorSuggestions((p.operators || []).flatMap((o) => [o.name, o.oprId]).filter(Boolean)))
      .catch(() => {});
    return subscribeWallStream('important.changed', load, { surface: 'console' });
  }, []);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((entry) => {
      if (onlyUnreviewed && entry.reviewed) return false;
      if (!q) return true;
      const hay = `${entry.title} ${entry.body} ${(entry.match?.airportIcaos || []).join(' ')} ${(entry.match?.countries || []).join(' ')} ${(entry.match?.operators || []).join(' ')} ${(entry.match?.registrations || []).join(' ')}`.toLowerCase();
      return hay.includes(q);
    });
  }, [entries, search, onlyUnreviewed]);

  function openEditor(entry = null) {
    if (!entry) {
      setForm(structuredClone(EMPTY_FORM));
      return;
    }
    setForm({
      id: entry.id,
      title: entry.title,
      body: entry.body || '',
      isActive: entry.isActive !== false,
      reviewed: entry.reviewed === true,
      match: {
        countries: entry.match?.countries || [],
        airportIcaos: entry.match?.airportIcaos || [],
        operators: entry.match?.operators || [],
        registrations: entry.match?.registrations || [],
        direction: entry.match?.direction || 'any',
        validFrom: toDateInput(entry.match?.validFrom),
        validTo: toDateInput(entry.match?.validTo),
      },
    });
  }

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await upsertImportant({
        ...form,
        id: form.id || undefined,
        reviewed: true, // saving from the editor counts as human review
        match: {
          ...form.match,
          validFrom: form.match.validFrom || null,
          validTo: form.match.validTo ? `${form.match.validTo}T23:59:59Z` : null,
        },
      });
      setForm(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(entry, nextValue) {
    setBusyId(entry.id);
    setEntries((prev) => prev.map((row) => (row.id === entry.id ? { ...row, isActive: nextValue } : row)));
    try {
      await setImportantActive(entry.id, nextValue);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      await load();
    } finally {
      setBusyId('');
    }
  }

  async function remove(id) {
    setBusyId(id);
    try {
      await deleteImportant(id);
      setEntries((prev) => prev.filter((entry) => entry.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      await load();
    } finally {
      setBusyId('');
    }
  }

  const unreviewedCount = entries.filter((entry) => !entry.reviewed).length;

  return (
    <div style={ui.page}>
      <div style={ui.top}>
        <div>
          <div style={ui.title}>Important</div>
          <div style={ui.subtitle}>
            Standing operational notes from IMPORTANT.docx — flights matching an entry's criteria get an IMP badge.
            {unreviewedCount > 0 && ` ${unreviewedCount} auto-imported entr${unreviewedCount === 1 ? 'y' : 'ies'} awaiting review.`}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={ui.btnPrimary} onClick={() => openEditor()}>+ New entry</button>
          <button style={ui.btn} onClick={load} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && <div style={ui.error}>{error}</div>}

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
        <input
          style={{ ...ui.input, flex: 1 }}
          placeholder="Search title, text, ICAO, country, operator, registration…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <label style={{ fontSize: 11.5, color: '#8ea1cb', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={onlyUnreviewed}
            onChange={(e) => setOnlyUnreviewed(e.target.checked)}
          />
          Needs review only
        </label>
      </div>

      {form && (
        <form style={{ ...ui.card, marginBottom: 14 }} onSubmit={save}>
          <div style={ui.cardTitle}>{form.id ? `Edit ${form.id}` : 'New Important entry'}</div>
          <input
            style={{ ...ui.input, width: '100%', boxSizing: 'border-box', marginBottom: 8 }}
            placeholder="Title"
            value={form.title}
            onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
            required
          />
          <textarea
            style={{ ...ui.input, width: '100%', boxSizing: 'border-box', minHeight: 110, marginBottom: 10, fontFamily: 'inherit', resize: 'vertical' }}
            placeholder="Full text of the entry (kept verbatim — this is the operational/legal wording)"
            value={form.body}
            onChange={(e) => setForm((prev) => ({ ...prev, body: e.target.value }))}
          />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <AirportChipEditor
                values={form.match.airportIcaos}
                onChange={(airportIcaos) => setForm((prev) => ({ ...prev, match: { ...prev.match, airportIcaos } }))}
              />
              <ChipEditor
                label="Countries"
                placeholder="Search / add country…"
                values={form.match.countries}
                suggestions={countries}
                onChange={(list) => setForm((prev) => ({ ...prev, match: { ...prev.match, countries: list } }))}
              />
            </div>
            <div>
              <ChipEditor
                label="Operators (name or Leon prefix)"
                placeholder="e.g. Panaviatic — Enter to add"
                values={form.match.operators}
                suggestions={operatorSuggestions}
                onChange={(list) => setForm((prev) => ({ ...prev, match: { ...prev.match, operators: list } }))}
              />
              <ChipEditor
                label="Registrations"
                placeholder="e.g. T7-LASER — Enter to add"
                values={form.match.registrations}
                onChange={(list) => setForm((prev) => ({ ...prev, match: { ...prev.match, registrations: list } }))}
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginTop: 4, flexWrap: 'wrap' }}>
            <label style={cs.inline}>
              Direction
              <select
                style={ui.select}
                value={form.match.direction}
                onChange={(e) => setForm((prev) => ({ ...prev, match: { ...prev.match, direction: e.target.value } }))}
              >
                <option value="any">Departure or arrival</option>
                <option value="dep">Departure only</option>
                <option value="arr">Arrival only</option>
              </select>
            </label>
            <label style={cs.inline}>
              Valid from
              <input
                type="date"
                style={ui.input}
                value={form.match.validFrom}
                onChange={(e) => setForm((prev) => ({ ...prev, match: { ...prev.match, validFrom: e.target.value } }))}
              />
            </label>
            <label style={cs.inline}>
              Valid to
              <input
                type="date"
                style={ui.input}
                value={form.match.validTo}
                onChange={(e) => setForm((prev) => ({ ...prev, match: { ...prev.match, validTo: e.target.value } }))}
              />
            </label>
            <label style={{ ...cs.inline, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm((prev) => ({ ...prev, isActive: e.target.checked }))}
              />
              Active
            </label>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button style={ui.btnPrimary} type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save entry'}
            </button>
            <button style={ui.btn} type="button" onClick={() => setForm(null)}>Cancel</button>
          </div>
        </form>
      )}

      {!loading && visible.length === 0 && (
        <div style={ui.empty}>
          {entries.length === 0
            ? 'No Important entries yet. Import IMPORTANT.docx with scripts/import-important-docx.mjs or add entries manually.'
            : 'No entries match the current filter.'}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {visible.map((entry) => (
          <div key={entry.id} style={{ ...ui.card, opacity: entry.isActive === false ? 0.55 : 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
              <div style={ui.cardTitle}>
                <span style={{ ...ui.tag, color: '#ff8fc6', marginRight: 8 }}>IMP</span>
                {entry.title}
                {!entry.reviewed && (
                  <span style={{ ...ui.tag, color: '#f0c060', marginLeft: 8 }}>needs review</span>
                )}
              </div>
              <span style={{ fontSize: 10.5, color: '#6f7fa8', flexShrink: 0 }}>
                {typeof entry.matchedFlightCount === 'number' &&
                  (entry.matchedFlightCount > 0
                    ? `matches ${entry.matchedFlightCount} flight${entry.matchedFlightCount === 1 ? '' : 's'}`
                    : 'matches no current flights')}
              </span>
            </div>

            <div style={cs.body}>{entry.body || '—'}</div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
              {(entry.match?.airportIcaos || []).map((icao) => <span key={icao} style={ui.tag}>{icao}</span>)}
              {(entry.match?.countries || []).map((c) => <span key={c} style={ui.tag}>{c}</span>)}
              {(entry.match?.operators || []).map((o) => <span key={o} style={{ ...ui.tag, color: '#8ec4ff' }}>op: {o}</span>)}
              {(entry.match?.registrations || []).map((r) => <span key={r} style={{ ...ui.tag, color: '#8fdcae' }}>reg: {r}</span>)}
              {entry.match?.direction && entry.match.direction !== 'any' && (
                <span style={ui.tag}>{entry.match.direction === 'dep' ? 'departures only' : 'arrivals only'}</span>
              )}
              {(entry.match?.validFrom || entry.match?.validTo) && (
                <span style={ui.tag}>
                  {toDateInput(entry.match.validFrom) || '…'} → {toDateInput(entry.match.validTo) || '…'}
                </span>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
              <Switch
                on={entry.isActive !== false}
                disabled={busyId === entry.id}
                onToggle={() => toggleActive(entry, entry.isActive === false)}
                labels={['Active', 'Inactive']}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={ui.softBtn} onClick={() => openEditor(entry)}>Edit</button>
                <button style={ui.btnDanger} disabled={busyId === entry.id} onClick={() => remove(entry.id)}>
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const cs = {
  fieldLabel: { fontSize: 11, color: '#8ea1cb', marginBottom: 5 },
  inline: { fontSize: 11.5, color: '#8ea1cb', display: 'flex', alignItems: 'center', gap: 7 },
  body: {
    color: '#95a6cc',
    fontSize: 11.5,
    lineHeight: 1.55,
    marginTop: 6,
    whiteSpace: 'pre-wrap',
    maxHeight: 130,
    overflowY: 'auto',
  },
};
