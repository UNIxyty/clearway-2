import { useEffect, useMemo, useState } from 'react';
import {
  deleteImportant,
  fetchCountries,
  fetchImportant,
  fetchOperators,
  searchAirports,
  setImportantActive,
  updateImportant,
  upsertImportant,
} from '../../services/timelineApi';
import { subscribeWallStream } from '../../services/wallStream';
import Icon from './icons';
import {
  Button,
  ChipInput,
  EmptyState,
  ErrorBanner,
  FieldLabel,
  IconButton,
  InfoBanner,
  LoadingState,
  PageHeader,
  SearchBox,
  StatusPill,
  t,
  TextArea,
  TextInput,
  Toggle,
  useToast,
} from './ui';

// Important — standing IMP limitations from the ops bulletin (approved
// design): list on the left, criteria editor on the right. A matching flight
// shows only the "!" icon on the wall; the full text is read here.

const CHIP_STYLES = {
  countries: { color: '#6d28d9', bg: '#ede9fe' },
  airports: { color: '#0369a1', bg: '#e0f2fe' },
  operators: { color: '#475569', bg: '#eef1f5' },
  registrations: { color: '#334155', bg: '#f1f5f9' },
};

const DIRECTIONS = [
  { value: 'any', label: 'Any' },
  { value: 'dep', label: 'Departure' },
  { value: 'arr', label: 'Arrival' },
];

function toDateInput(value) {
  if (!value) return '';
  const dt = new Date(value);
  return Number.isFinite(dt.getTime()) ? dt.toISOString().slice(0, 10) : '';
}

function isExpired(entry) {
  const to = entry.match?.validTo;
  return Boolean(to && new Date(to).getTime() < Date.now());
}

function entryToForm(entry) {
  return {
    id: entry.id,
    title: entry.title,
    body: entry.body || '',
    isActive: entry.isActive !== false,
    reviewed: entry.reviewed === true,
    countries: entry.match?.countries || [],
    airportIcaos: entry.match?.airportIcaos || [],
    operators: entry.match?.operators || [],
    registrations: entry.match?.registrations || [],
    direction: entry.match?.direction || 'any',
    validFrom: toDateInput(entry.match?.validFrom),
    validTo: toDateInput(entry.match?.validTo),
  };
}

const NEW_FORM = {
  id: '',
  title: '',
  body: '',
  isActive: true,
  reviewed: true,
  countries: [],
  airportIcaos: [],
  operators: [],
  registrations: [],
  direction: 'any',
  validFrom: '',
  validTo: '',
};

export default function ImportantPage() {
  const [entries, setEntries] = useState([]);
  const [countries, setCountries] = useState([]);
  const [operatorSuggestions, setOperatorSuggestions] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [form, setForm] = useState(null);
  const [search, setSearch] = useState('');
  const [onlyUnreviewed, setOnlyUnreviewed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const flash = useToast();

  async function load() {
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

  const selected = entries.find((entry) => entry.id === selectedId) || null;

  useEffect(() => {
    if (selected) setForm(entryToForm(selected));
    else if (selectedId === '__new__') setForm(structuredClone(NEW_FORM));
    else setForm(null);
  }, [selectedId, selected]);

  async function save({ markReviewed = false } = {}) {
    if (!form) return;
    setSaving(true);
    setError('');
    try {
      const entryBody = {
        title: form.title,
        body: form.body,
        isActive: form.isActive,
        reviewed: markReviewed ? true : form.reviewed,
        match: {
          countries: form.countries,
          airportIcaos: form.airportIcaos,
          operators: form.operators,
          registrations: form.registrations,
          direction: form.direction,
          validFrom: form.validFrom || null,
          validTo: form.validTo ? `${form.validTo}T23:59:59Z` : null,
        },
      };
      // Existing entries save through PATCH /api/important/:id (full-field
      // partial update); only brand-new entries POST.
      const payload = form.id
        ? await updateImportant(form.id, entryBody)
        : await upsertImportant(entryBody);
      flash(markReviewed ? 'Marked reviewed' : 'Important entry saved');
      setSelectedId(payload.entry?.id || '');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(entry, nextValue) {
    setEntries((prev) => prev.map((row) => (row.id === entry.id ? { ...row, isActive: nextValue } : row)));
    try {
      await setImportantActive(entry.id, nextValue);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      await load();
    }
  }

  async function remove(entry) {
    try {
      await deleteImportant(entry.id);
      flash('Important entry deleted', '#f87171');
      if (selectedId === entry.id) setSelectedId('');
      setEntries((prev) => prev.filter((row) => row.id !== entry.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      await load();
    }
  }

  const unreviewedCount = entries.filter((entry) => !entry.reviewed).length;

  function chipEditor(field, label, suggest) {
    const styleFor = CHIP_STYLES[field === 'airportIcaos' ? 'airports' : field];
    return (
      <div>
        <FieldLabel>{label}</FieldLabel>
        <ChipInput
          values={form[field]}
          placeholder="Add…"
          chipColor={styleFor.color}
          chipBg={styleFor.bg}
          onAdd={(v) =>
            setForm((prev) => ({
              ...prev,
              [field]: [...new Set([...prev[field], field === 'airportIcaos' || field === 'registrations' ? v.toUpperCase() : v])],
            }))
          }
          onRemove={(v) => setForm((prev) => ({ ...prev, [field]: prev[field].filter((x) => x !== v) }))}
          suggest={suggest}
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Important"
        desc={
          <>
            Standing IMP limitations imported from the ops bulletin. A flight shows the “!” icon on the wall when it
            matches an entry's criteria.
            {unreviewedCount > 0 && ` ${unreviewedCount} auto-imported entr${unreviewedCount === 1 ? 'y' : 'ies'} awaiting review.`}
          </>
        }
        descMax={600}
        actions={
          <Button variant="primary" icon="plus" onClick={() => setSelectedId('__new__')}>
            New entry
          </Button>
        }
      />

      <InfoBanner>
        An entry matches a flight when the flight fits its criteria — country, airport, operator or registration —
        respecting the direction and date window. Auto-imported entries need a human review before they're trusted.
      </InfoBanner>

      <ErrorBanner>{error}</ErrorBanner>

      <div style={{ display: 'flex', gap: 22, alignItems: 'flex-start' }}>
        {/* list */}
        <div style={{ width: 360, flex: 'none' }}>
          <SearchBox
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search important limitations…"
            style={{ marginBottom: 10 }}
          />
          <label style={{ fontSize: 12.5, color: t.muted, display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', marginBottom: 12 }}>
            <input type="checkbox" checked={onlyUnreviewed} onChange={(e) => setOnlyUnreviewed(e.target.checked)} />
            Needs review only {unreviewedCount > 0 && `(${unreviewedCount})`}
          </label>
          {loading && <LoadingState>Loading entries…</LoadingState>}
          {!loading && visible.length === 0 && (
            <EmptyState icon="star" title="No entries match">
              {entries.length === 0 ? 'Import the ops bulletin or add an entry manually.' : 'Adjust the search or filter.'}
            </EmptyState>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {visible.map((entry) => {
              const isSel = entry.id === selectedId;
              const active = entry.isActive !== false;
              const expired = isExpired(entry);
              const criteria = [
                ...(entry.match?.countries || []),
                ...(entry.match?.airportIcaos || []),
                ...(entry.match?.operators || []),
                ...(entry.match?.registrations || []),
              ];
              return (
                <div
                  key={entry.id}
                  onClick={() => setSelectedId(entry.id)}
                  onKeyDown={(e) => e.key === 'Enter' && setSelectedId(entry.id)}
                  role="button"
                  tabIndex={0}
                  className={isSel ? '' : 'cw-hover-row'}
                  style={{
                    background: isSel ? '#f6faff' : '#fff',
                    border: `1px solid ${t.border}`,
                    borderLeft: `3px solid ${isSel ? t.blue : 'transparent'}`,
                    borderRadius: 12,
                    padding: '14px 16px',
                    cursor: 'pointer',
                    boxShadow: t.shadow,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: entry.reviewed ? t.greenDeep : t.amber, background: entry.reviewed ? t.greenTint : t.amberTint, padding: '3px 9px', borderRadius: 6 }}>
                      {entry.reviewed ? 'Reviewed' : 'Needs review'}
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: expired ? t.faint : active ? t.greenDeep : t.muted, background: expired ? '#f1f2f4' : active ? t.greenTint : '#eef1f5', padding: '3px 9px', borderRadius: 6 }}>
                      {expired ? 'Expired' : active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.3, marginBottom: 9 }}>{entry.title}</div>
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                    {criteria.slice(0, 6).map((c) => (
                      <span key={c} style={{ fontFamily: t.mono, fontSize: 11.5, fontWeight: 600, background: '#f1f5f9', color: '#475569', padding: '3px 8px', borderRadius: 6 }}>
                        {c}
                      </span>
                    ))}
                    {criteria.length > 6 && <span style={{ fontSize: 11, color: t.faint }}>+{criteria.length - 6}</span>}
                    {criteria.length === 0 && <span style={{ fontSize: 11.5, color: t.faint }}>no criteria — matches nothing</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* editor */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {!form && (
            <div style={{ border: `1.5px dashed ${t.borderInput}`, borderRadius: 16, padding: '40px 24px', textAlign: 'center', color: t.faint }}>
              <Icon name="mouse-pointer-click" size={26} color={t.ghost} />
              <div style={{ fontSize: 15, fontWeight: 600, color: t.muted, marginTop: 12 }}>Select an entry</div>
              <div style={{ fontSize: 13, marginTop: 5, lineHeight: 1.5 }}>The verbatim body and match criteria appear here.</div>
            </div>
          )}
          {form && (
            <div style={{ background: '#fff', border: `1px solid ${t.border}`, borderRadius: 16, boxShadow: t.shadow, overflow: 'hidden' }}>
              <div style={{ padding: '18px 22px', borderBottom: `1px solid ${t.borderInner}`, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <TextInput
                    placeholder="Entry title"
                    value={form.title}
                    onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                    style={{ marginBottom: 8, fontWeight: 700, fontSize: 16 }}
                  />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      title="Click to flip the reviewed state (saved with the entry)"
                      onClick={() => setForm((prev) => ({ ...prev, reviewed: !prev.reviewed }))}
                      style={{
                        fontFamily: 'inherit',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        fontSize: 12,
                        fontWeight: 700,
                        color: form.reviewed ? t.greenDeep : t.amber,
                        background: form.reviewed ? t.greenTint : t.amberTint,
                        border: 'none',
                        padding: '5px 11px',
                        borderRadius: 999,
                        cursor: 'pointer',
                      }}
                    >
                      <Icon name={form.reviewed ? 'user-check' : 'download-cloud'} size={14} />
                      {form.reviewed ? 'Human-reviewed' : 'Needs review'}
                    </button>
                    {selected && typeof selected.matchedFlightCount === 'number' && (
                      <span style={{ fontSize: 13, color: t.muted }}>
                        Affects <strong style={{ color: t.blueDeep }}>{selected.matchedFlightCount}</strong> of the board's flights
                      </span>
                    )}
                  </div>
                </div>
                {form.id && selected && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                    <Toggle
                      on={form.isActive}
                      onToggle={() => {
                        setForm((prev) => ({ ...prev, isActive: !prev.isActive }));
                        toggleActive(selected, !form.isActive);
                      }}
                    />
                    <IconButton icon="trash-2" title="Delete entry" onClick={() => remove(selected)} />
                  </div>
                )}
              </div>

              <div style={{ padding: '18px 22px', borderBottom: `1px solid ${t.borderInner}` }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: t.faint, marginBottom: 8 }}>
                  BODY TEXT (VERBATIM FROM BULLETIN)
                </div>
                <TextArea
                  placeholder="Full text of the entry (kept verbatim — this is the operational wording)"
                  value={form.body}
                  onChange={(e) => setForm((prev) => ({ ...prev, body: e.target.value }))}
                  style={{ minHeight: form.id ? 180 : 120 }}
                />
              </div>

              <div style={{ padding: '18px 22px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: t.faint, marginBottom: 14 }}>
                  MATCH CRITERIA
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                  {chipEditor('countries', 'Countries', async (q) =>
                    countries.filter((c) => c.toLowerCase().includes(q.toLowerCase())).slice(0, 10).map((c) => ({ value: c, label: c }))
                  )}
                  {chipEditor('airportIcaos', 'Airports (ICAO)', async (q) => {
                    const payload = await searchAirports(q, 10);
                    return (payload.airports || []).map((a) => ({ value: a.icao, label: `${a.icao}${a.name ? ` · ${a.name}` : ''}` }));
                  })}
                  {chipEditor('operators', 'Operators', async (q) =>
                    operatorSuggestions.filter((o) => o.toLowerCase().includes(q.toLowerCase())).slice(0, 10).map((o) => ({ value: o, label: o }))
                  )}
                  {chipEditor('registrations', 'Registrations')}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div>
                    <FieldLabel>Direction</FieldLabel>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {DIRECTIONS.map((direction) => {
                        const on = form.direction === direction.value;
                        return (
                          <button
                            key={direction.value}
                            type="button"
                            onClick={() => setForm((prev) => ({ ...prev, direction: direction.value }))}
                            style={{
                              fontFamily: 'inherit',
                              flex: 1,
                              fontSize: 13,
                              fontWeight: 600,
                              border: `1px solid ${on ? t.blue : t.borderInput}`,
                              background: on ? t.blueTint : '#fff',
                              color: on ? t.blueDeep : t.muted,
                              padding: 9,
                              borderRadius: 9,
                              cursor: 'pointer',
                            }}
                          >
                            {direction.label}
                          </button>
                        );
                      })}
                    </div>
                    {form.direction === 'overfly' && (
                      <div style={{ fontSize: 12, color: t.faint, marginTop: 7 }}>
                        Overfly-scoped — matches no flights until route data exists.
                      </div>
                    )}
                  </div>
                  <div>
                    <FieldLabel>Valid window</FieldLabel>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input
                        type="date"
                        value={form.validFrom}
                        onChange={(e) => setForm((prev) => ({ ...prev, validFrom: e.target.value }))}
                        style={{ flex: 1, border: `1px solid ${t.borderInput}`, borderRadius: 9, padding: '9px 11px', fontFamily: 'inherit', fontSize: 13, outline: 'none', color: t.body }}
                      />
                      <span style={{ color: t.faint }}>→</span>
                      <input
                        type="date"
                        value={form.validTo}
                        onChange={(e) => setForm((prev) => ({ ...prev, validTo: e.target.value }))}
                        style={{ flex: 1, border: `1px solid ${t.borderInput}`, borderRadius: 9, padding: '9px 11px', fontFamily: 'inherit', fontSize: 13, outline: 'none', color: t.body }}
                      />
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                  <Button variant="primary" size="lg" disabled={saving || !form.title.trim()} spin={saving} onClick={() => save()}>
                    Save changes
                  </Button>
                  {!form.reviewed && (
                    <Button variant="successSoft" size="lg" icon="check" disabled={saving} onClick={() => save({ markReviewed: true })}>
                      Mark reviewed
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
