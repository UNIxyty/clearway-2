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
import {
  Button,
  Card,
  ChipInput,
  EmptyState,
  ErrorBanner,
  FieldLabel,
  IconButton,
  InfoBanner,
  limChip,
  LoadingState,
  PageHeader,
  StatusPill,
  t,
  TextArea,
  TextInput,
  TypeChip,
  Toggle,
  useToast,
} from './ui';

// Limitations — manual text limitations for the wall sidebar (approved
// design). NOTAM/weather (NTM/WX) and IMP markers are generated automatically
// and managed elsewhere; this page intentionally lists only the hand-written
// ones.

const LIM_TYPES = ['OPS', 'AOG', 'WX', 'CTOT', 'PAX', 'CREW'];
const EMPTY_FORM = { title: '', description: '', type: 'OPS', airportIcaos: [], countries: [] };

function WallPreview({ type, title, desc, scope }) {
  const chip = limChip(type);
  return (
    <div style={{ width: 340, flex: 'none', position: 'sticky', top: 0 }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: t.faint, marginBottom: 10 }}>
        WALL SIDEBAR PREVIEW
      </div>
      <div style={{ background: t.dark, borderRadius: 16, padding: 18, boxShadow: t.shadowPop }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', color: '#6b7280', marginBottom: 14 }}>
          LIMITATIONS
        </div>
        <div style={{ background: t.darkCard, borderRadius: 12, padding: 18, borderLeft: `5px solid ${chip.c}` }}>
          <span style={{ fontSize: 14, fontWeight: 800, letterSpacing: '0.05em', color: chip.c }}>{type}</span>
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

  const scopeText = useMemo(() => {
    const parts = [...form.airportIcaos, ...form.countries];
    return parts.join(' · ');
  }, [form.airportIcaos, form.countries]);

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await upsertLimitation(form);
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
        desc="Write the manual text limitations shown on the wall sidebar. These are human-authored — NOTAM, weather and IMP markers are generated automatically and managed elsewhere."
        descMax={620}
      />

      <InfoBanner>
        Each active limitation renders as a large card on the wall sidebar with its full text visible — no clicking,
        readable from across the ops room. Use the live preview to see exactly how it will read.
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <TypeChip type={item.type || 'OPS'} />
                    <span style={{ fontSize: 15.5, fontWeight: 700 }}>{item.title}</span>
                    <div style={{ flex: 1 }} />
                    <StatusPill
                      color={matches > 0 ? t.blueDeep : t.faint}
                      bg={matches > 0 ? t.blueChip : '#f1f2f4'}
                    >
                      {matches > 0 ? `matches ${matches} flight${matches > 1 ? 's' : ''}` : 'no current matches'}
                    </StatusPill>
                    <Toggle size="sm" on={active} disabled={busyId === item.id} onToggle={() => toggleActive(item, !active)} />
                    <IconButton icon="trash-2" title="Delete limitation" onClick={() => remove(item)} />
                  </div>
                  <div style={{ fontSize: 13.5, lineHeight: 1.5, color: t.body, marginBottom: 6 }}>{item.description || '—'}</div>
                  <div style={{ fontSize: 12.5, color: t.faint, fontFamily: t.mono }}>
                    {[...(item.airportIcaos || []), ...(item.countries || [])].join(' · ') || 'global'}
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
                <FieldLabel>Type</FieldLabel>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {LIM_TYPES.map((type) => {
                    const chip = limChip(type);
                    const on = form.type === type;
                    return (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setForm((prev) => ({ ...prev, type }))}
                        style={{
                          fontFamily: 'inherit',
                          fontSize: 12.5,
                          fontWeight: 700,
                          letterSpacing: '0.04em',
                          border: `1px solid ${on ? chip.c : t.borderInput}`,
                          background: on ? chip.b : '#fff',
                          color: on ? chip.c : t.muted,
                          padding: '7px 13px',
                          borderRadius: 8,
                          cursor: 'pointer',
                        }}
                      >
                        {type}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
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
              </div>
              <Button variant="primary" size="lg" type="submit" disabled={saving} spin={saving}>
                Save limitation
              </Button>
            </form>
          </Card>
        </div>

        <WallPreview type={form.type} title={form.title} desc={form.description} scope={scopeText} />
      </div>
    </div>
  );
}
