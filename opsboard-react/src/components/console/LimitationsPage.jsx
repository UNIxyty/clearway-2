import { useEffect, useMemo, useState } from 'react';
import {
  deleteLimitation,
  fetchCountries,
  fetchLimitations,
  searchAirports,
  searchFlights,
  setLimitationActive,
  upsertLimitation,
} from '../../services/timelineApi';
import { subscribeWallStream } from '../../services/wallStream';
import {
  Button,
  Card,
  ChipInput,
  EmptyState,
  ErrorBanner,
  FieldLabel,
  IconButton,
  InfoBanner,
  LoadingState,
  PageHeader,
  StatusPill,
  t,
  TextArea,
  TextInput,
  Toggle,
  useToast,
} from './ui';

// Limitations — manual text limitations for the wall sidebar, reworked model
// (Item 9): NO type taxonomy. A limitation is its text + how it matches +
// its schedule:
//  - match types: Flight (picked from the real feed, matched by flightNid),
//    Country, Airport, or Mixed — OR semantics across every selected target.
//  - optional start/end date window (UTC days, end inclusive); permanent
//    entries ignore the window and cannot be deleted (deactivate instead).

const MATCH_TYPES = [
  { key: 'flight', label: 'Flight', hint: 'a specific flight from the feed' },
  { key: 'airport', label: 'Airport', hint: 'one or more ICAOs' },
  { key: 'country', label: 'Country', hint: 'one or more countries' },
  { key: 'mixed', label: 'Mixed', hint: 'any combination (OR)' },
];

const EMPTY_FORM = {
  title: '',
  description: '',
  isPermanent: false,
  startDate: '',
  endDate: '',
  flights: [], // [{nid, label}]
  airportIcaos: [],
  countries: [],
};

function scopeParts(item) {
  const match = item.match || item;
  return [
    ...(match.flights || []).map((f) => f.label || f.nid),
    ...(match.airportIcaos || []),
    ...(match.countries || []),
  ];
}

function windowText(item) {
  if (item.isPermanent) return 'permanent';
  const bits = [item.startDate ? `from ${item.startDate}` : null, item.endDate ? `until ${item.endDate}` : null].filter(Boolean);
  return bits.join(' ') || 'always';
}

function WallPreview({ title, desc, scope, permanent, window }) {
  return (
    <div style={{ width: 340, flex: 'none', position: 'sticky', top: 0 }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: t.faint, marginBottom: 10 }}>
        WALL SIDEBAR PREVIEW
      </div>
      <div style={{ background: t.dark, borderRadius: 16, padding: 18, boxShadow: t.shadowPop }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', color: '#6b7280', marginBottom: 14 }}>
          LIMITATIONS
        </div>
        <div style={{ background: t.darkCard, borderRadius: 12, padding: 18, borderLeft: '5px solid #f0c060' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {permanent && (
              <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', color: '#f0c060' }}>PERMANENT</span>
            )}
            {!permanent && window !== 'always' && (
              <span style={{ fontSize: 12, fontFamily: t.mono, color: '#8f99ab' }}>{window}</span>
            )}
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#fff', margin: '8px 0 10px', lineHeight: 1.15 }}>
            {title || 'EGLL slot enforcement'}
          </div>
          <div style={{ fontSize: 16, lineHeight: 1.5, color: '#c9ced6' }}>
            {desc || 'Heathrow CTOT strictly enforced — confirm slot with delivery before pushback. No tolerance beyond -5/+10.'}
          </div>
          <div style={{ fontSize: 14, fontFamily: t.mono, color: '#7a828d', marginTop: 12 }}>{scope || 'EGLL · GB'}</div>
        </div>
        <div style={{ fontSize: 11, color: '#4b5560', marginTop: 12, textAlign: 'center' }}>
          Rendered at wall scale · fully legible at distance
        </div>
      </div>
    </div>
  );
}

export default function LimitationsPage() {
  const [items, setItems] = useState([]);
  const [countries, setCountries] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [matchType, setMatchType] = useState('airport');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const flash = useToast();

  async function load() {
    setError('');
    try {
      const payload = await fetchLimitations({ withMatches: true });
      // This page manages the manual limitations only.
      setItems((payload.limitations || []).filter((item) => item.source === 'custom' || !item.source));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    fetchCountries('', 300).then((p) => setCountries(p.countries || [])).catch(() => {});
    return subscribeWallStream('limitations.changed', load, { surface: 'console' });
  }, []);

  const showFlights = matchType === 'flight' || matchType === 'mixed';
  const showAirports = matchType === 'airport' || matchType === 'mixed';
  const showCountries = matchType === 'country' || matchType === 'mixed';

  const scopeText = useMemo(
    () => scopeParts({ match: { flights: form.flights, airportIcaos: form.airportIcaos, countries: form.countries } }).join(' · '),
    [form.flights, form.airportIcaos, form.countries]
  );

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await upsertLimitation({
        title: form.title,
        description: form.description,
        isPermanent: form.isPermanent,
        startDate: form.startDate || null,
        endDate: form.endDate || null,
        match: {
          flights: showFlights ? form.flights : [],
          airportIcaos: showAirports ? form.airportIcaos : [],
          countries: showCountries ? form.countries : [],
        },
      });
      setForm(EMPTY_FORM);
      flash('Limitation saved · now on wall sidebar');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(item, nextValue) {
    setBusyId(item.id);
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

  async function remove(item) {
    setBusyId(item.id);
    try {
      await deleteLimitation(item.id);
      setItems((prev) => prev.filter((row) => row.id !== item.id));
      flash('Limitation deleted', '#f87171');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      await load();
    } finally {
      setBusyId('');
    }
  }

  return (
    <div>
      <PageHeader
        title="Limitations"
        desc="Write the manual text limitations shown on the wall sidebar. A limitation is its text, how it matches (flight, airport, country or any mix — OR semantics) and its schedule. NOTAM, weather and IMP markers are generated automatically and managed elsewhere."
        descMax={680}
      />

      <InfoBanner>
        Each active limitation renders as a large card on the wall sidebar within its date window (permanent ones
        always). Matching is OR across every selected target — “flight X or airport Y” flags both.
      </InfoBanner>

      <ErrorBanner>{error}</ErrorBanner>

      <div style={{ display: 'flex', gap: 22, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {loading && <Card style={{ padding: 0 }}><LoadingState>Loading limitations…</LoadingState></Card>}
            {!loading && items.length === 0 && (
              <Card style={{ padding: 0 }}>
                <EmptyState icon="alert-triangle" title="No limitations yet">
                  Write the first one below — it appears on the wall the moment it's saved.
                </EmptyState>
              </Card>
            )}
            {items.map((item) => {
              const active = item.isActive !== false;
              const matches = item.matchedFlightCount ?? 0;
              return (
                <div
                  key={item.id}
                  style={{
                    background: '#fff',
                    border: `1px solid ${t.border}`,
                    borderRadius: 13,
                    padding: '16px 18px',
                    boxShadow: t.shadow,
                    opacity: active ? 1 : 0.65,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 15.5, fontWeight: 700 }}>{item.title}</span>
                    {item.isPermanent && (
                      <StatusPill color={t.amber} bg={t.amberTint}>PERMANENT</StatusPill>
                    )}
                    <span style={{ fontSize: 12, fontFamily: t.mono, color: t.faint }}>{windowText(item)}</span>
                    <div style={{ flex: 1 }} />
                    <StatusPill
                      color={matches > 0 ? t.blueDeep : t.faint}
                      bg={matches > 0 ? t.blueChip : '#f1f2f4'}
                    >
                      {matches > 0 ? `matches ${matches} flight${matches > 1 ? 's' : ''}` : 'no current matches'}
                    </StatusPill>
                    <Toggle size="sm" on={active} disabled={busyId === item.id} onToggle={() => toggleActive(item, !active)} />
                    {/* Permanent limitations cannot be deleted (backend guards
                        too) — deactivate is the way to retire them. */}
                    {!item.isPermanent && (
                      <IconButton icon="trash-2" title="Delete limitation" onClick={() => remove(item)} />
                    )}
                  </div>
                  <div style={{ fontSize: 13.5, lineHeight: 1.5, color: t.body, marginBottom: 6 }}>{item.description || '—'}</div>
                  <div style={{ fontSize: 12.5, color: t.faint, fontFamily: t.mono }}>
                    {scopeParts(item).join(' · ') || 'matches nothing (no targets)'}
                  </div>
                </div>
              );
            })}
          </div>

          <Card style={{ padding: 20 }}>
            <h3 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 16px' }}>New limitation</h3>
            <form onSubmit={save}>
              <div style={{ marginBottom: 14 }}>
                <FieldLabel>Title</FieldLabel>
                <TextInput
                  placeholder="Short headline shown on the wall"
                  required
                  value={form.title}
                  onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                />
              </div>
              <div style={{ marginBottom: 14 }}>
                <FieldLabel>Description</FieldLabel>
                <TextArea
                  placeholder="Full instruction text — this appears in full on the wall"
                  value={form.description}
                  onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                />
              </div>

              <div style={{ marginBottom: 14 }}>
                <FieldLabel>Match type</FieldLabel>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {MATCH_TYPES.map((mt) => {
                    const on = matchType === mt.key;
                    return (
                      <button
                        key={mt.key}
                        type="button"
                        onClick={() => setMatchType(mt.key)}
                        title={mt.hint}
                        style={{
                          fontFamily: 'inherit',
                          fontSize: 12.5,
                          fontWeight: 700,
                          letterSpacing: '0.04em',
                          border: `1px solid ${on ? t.blue : t.borderInput}`,
                          background: on ? t.blueTint : '#fff',
                          color: on ? t.blueDeep : t.muted,
                          padding: '7px 13px',
                          borderRadius: 8,
                          cursor: 'pointer',
                        }}
                      >
                        {mt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {showFlights && (
                <div style={{ marginBottom: 14 }}>
                  <FieldLabel>Flights</FieldLabel>
                  <ChipInput
                    values={form.flights.map((f) => f.label)}
                    placeholder="Search callsign / registration / ICAO…"
                    onAdd={() => {}}
                    onSelect={(option) =>
                      setForm((prev) => ({
                        ...prev,
                        flights: prev.flights.some((f) => f.nid === option.value)
                          ? prev.flights
                          : [...prev.flights, { nid: option.value, label: option.label }],
                      }))
                    }
                    onRemove={(label) => setForm((prev) => ({ ...prev, flights: prev.flights.filter((f) => f.label !== label) }))}
                    suggest={async (q) => {
                      const rows = await searchFlights(q, 12);
                      return rows.map((r) => ({ value: r.nid, label: r.label }));
                    }}
                  />
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                {showAirports && (
                  <div>
                    <FieldLabel>Airports (ICAO)</FieldLabel>
                    <ChipInput
                      values={form.airportIcaos}
                      placeholder="Add ICAO…"
                      onAdd={(v) => setForm((prev) => ({ ...prev, airportIcaos: [...new Set([...prev.airportIcaos, v.toUpperCase()])] }))}
                      onRemove={(v) => setForm((prev) => ({ ...prev, airportIcaos: prev.airportIcaos.filter((x) => x !== v) }))}
                      suggest={async (q) => {
                        const payload = await searchAirports(q, 12);
                        return (payload.airports || []).map((a) => ({
                          value: a.icao,
                          label: `${a.icao}${a.name ? ` · ${a.name}` : ''}${a.country ? ` · ${a.country}` : ''}`,
                        }));
                      }}
                    />
                  </div>
                )}
                {showCountries && (
                  <div>
                    <FieldLabel>Countries</FieldLabel>
                    <ChipInput
                      values={form.countries}
                      placeholder="Add country…"
                      onAdd={(v) => setForm((prev) => ({ ...prev, countries: [...new Set([...prev.countries, v])] }))}
                      onRemove={(v) => setForm((prev) => ({ ...prev, countries: prev.countries.filter((x) => x !== v) }))}
                      suggest={async (q) =>
                        countries
                          .filter((c) => c.toLowerCase().includes(q.toLowerCase()))
                          .slice(0, 12)
                          .map((c) => ({ value: c, label: c }))
                      }
                    />
                  </div>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 16, alignItems: 'end' }}>
                <div>
                  <FieldLabel>Start date (optional)</FieldLabel>
                  <TextInput
                    type="date"
                    value={form.startDate}
                    disabled={form.isPermanent}
                    onChange={(e) => setForm((prev) => ({ ...prev, startDate: e.target.value }))}
                  />
                </div>
                <div>
                  <FieldLabel>End date (optional)</FieldLabel>
                  <TextInput
                    type="date"
                    value={form.endDate}
                    disabled={form.isPermanent}
                    onChange={(e) => setForm((prev) => ({ ...prev, endDate: e.target.value }))}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 8 }}>
                  <Toggle
                    size="sm"
                    on={form.isPermanent}
                    onToggle={() => setForm((prev) => ({ ...prev, isPermanent: !prev.isPermanent }))}
                  />
                  <span style={{ fontSize: 13, fontWeight: 600, color: t.body }}>
                    Permanent <span style={{ color: t.faint, fontWeight: 400 }}>(always active, cannot be deleted)</span>
                  </span>
                </div>
              </div>

              <Button variant="primary" size="lg" type="submit" disabled={saving} spin={saving}>
                Save limitation
              </Button>
            </form>
          </Card>
        </div>

        <WallPreview
          title={form.title}
          desc={form.description}
          scope={scopeText}
          permanent={form.isPermanent}
          window={windowText({ isPermanent: form.isPermanent, startDate: form.startDate, endDate: form.endDate })}
        />
      </div>
    </div>
  );
}
