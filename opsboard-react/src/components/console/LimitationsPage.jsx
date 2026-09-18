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
import useViewport from '../../hooks/useViewport';
import { FixedActionBar, PushedPage } from './mobile';
import Icon from './icons';
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
  ConfirmDialog,
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

function WallPreview({ title, desc, scope, permanent, window, mobile = false }) {
  return (
    <div style={mobile ? { width: '100%' } : { width: 'clamp(340px, 21vw, 440px)', flex: 'none', position: 'sticky', top: 0 }}>
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
  const [editingId, setEditingId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const flash = useToast();
  // <1024: C5 card list + C6 pushed edit page (E-table: console detail
  // pushes everywhere below the 1024 list+detail breakpoint).
  const { width } = useViewport();
  const isMobileView = width < 1024;
  const [mobileFormOpen, setMobileFormOpen] = useState(false);
  const [initialSnap, setInitialSnap] = useState('');

  // Reconstruct the match-type selector from a saved limitation's targets.
  function matchTypeOf(match) {
    const f = (match?.flights || []).length > 0;
    const a = (match?.airportIcaos || []).length > 0;
    const c = (match?.countries || []).length > 0;
    const kinds = [f && 'flight', a && 'airport', c && 'country'].filter(Boolean);
    if (kinds.length > 1) return 'mixed';
    return kinds[0] || 'airport';
  }

  function startEdit(item) {
    const match = item.match || {};
    const nextForm = {
      title: item.title || '',
      description: item.description || '',
      isPermanent: item.isPermanent === true,
      startDate: item.startDate || '',
      endDate: item.endDate || '',
      flights: (match.flights || []).map((flt) => ({ nid: String(flt.nid ?? flt), label: flt.label || String(flt.nid ?? flt) })),
      airportIcaos: [...(match.airportIcaos || [])],
      countries: [...(match.countries || [])],
    };
    setEditingId(item.id);
    setMatchType(matchTypeOf(match));
    setForm(nextForm);
    if (isMobileView) {
      // C6: the record opens as a pushed page instead of scrolling to a form.
      setInitialSnap(JSON.stringify(nextForm));
      setMobileFormOpen(true);
      return;
    }
    // Bring the form into view for the edit.
    if (typeof window !== 'undefined') window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  }

  function cancelEdit() {
    setEditingId('');
    setForm(EMPTY_FORM);
    setMatchType('airport');
  }

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
        // Passing an existing id updates that limitation in place; omitting it
        // creates a new one (backend upsertCustomLimitation keys on id).
        ...(editingId ? { id: editingId } : {}),
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
      setMatchType('airport');
      flash(editingId ? 'Limitation updated · wall sidebar refreshed' : 'Limitation saved · now on wall sidebar');
      setEditingId('');
      await load();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
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

  const [confirmDelete, setConfirmDelete] = useState(null);

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

  // ── <1024 (C5/C6): card list with the on-wall toggle kept on the row,
  //     editing as a pushed page with a fixed save bar ─────────────────────
  if (isMobileView) {
    const dirty = mobileFormOpen && JSON.stringify(form) !== initialSnap;
    const editingItem = editingId ? items.find((item) => item.id === editingId) : null;
    const onWallCount = items.filter((item) => item.isActive !== false).length;

    const openNew = () => {
      setEditingId('');
      setMatchType('airport');
      setForm(EMPTY_FORM);
      setInitialSnap(JSON.stringify(EMPTY_FORM));
      setMobileFormOpen(true);
    };
    const closeForm = () => {
      setMobileFormOpen(false);
      cancelEdit();
    };
    const mobileSave = async () => {
      const ok = await save({ preventDefault() {} });
      if (ok) setMobileFormOpen(false);
    };
    const label = (text, extra) => (
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: t.body }}>{text}</span>
        {extra}
      </div>
    );

    return (
      <div>
        <div style={{ fontSize: 12.5, color: t.faint, margin: '2px 0 10px' }}>
          {onWallCount} on the wall · {items.length} total
        </div>
        <ErrorBanner>{error}</ErrorBanner>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 9, paddingBottom: 92 }}>
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
            return (
              <div
                key={item.id}
                role="button"
                tabIndex={0}
                onClick={() => startEdit(item)}
                onKeyDown={(e) => e.key === 'Enter' && startEdit(item)}
                style={{
                  background: t.card,
                  border: `1px solid ${t.border}`,
                  borderRadius: 13,
                  padding: 13,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  cursor: 'pointer',
                  opacity: active ? 1 : 0.65,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  {item.isPermanent && (
                    <StatusPill color={t.amber} bg={t.amberTint} style={{ flex: 'none' }}>PERMANENT</StatusPill>
                  )}
                  <span style={{ fontSize: 14, fontWeight: 700, color: t.ink, flex: 1, lineHeight: 1.35, minWidth: 0 }}>
                    {item.title}
                  </span>
                  {/* The one edit that happens more than once a shift stays
                      on the row (C5). */}
                  <span onClick={(e) => e.stopPropagation()} style={{ flex: 'none', display: 'inline-flex' }}>
                    <Toggle size="sm" on={active} disabled={busyId === item.id} onToggle={() => toggleActive(item, !active)} />
                  </span>
                </div>
                <div style={{ fontSize: 13, lineHeight: 1.55, color: t.muted }}>{item.description || '—'}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontFamily: t.mono, fontSize: 11.5, color: t.faint, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {scopeParts(item).join(' · ') || 'matches nothing (no targets)'}
                  </span>
                  <span style={{ marginLeft: 'auto', fontSize: 12, color: t.faint, flex: 'none' }}>{windowText(item)}</span>
                </div>
              </div>
            );
          })}
        </div>

        <FixedActionBar>
          <Button variant="primary" onClick={openNew} style={{ flex: 1, height: 48, fontSize: 14.5, fontWeight: 700, borderRadius: 12 }}>
            Publish a limitation
          </Button>
        </FixedActionBar>

        {mobileFormOpen && (
          <PushedPage
            title={editingId ? 'Edit limitation' : 'New limitation'}
            subtitle={dirty ? 'Unsaved changes' : editingId ? `editing ${editingId}` : ''}
            subtitleColor={dirty ? t.amber : undefined}
            onBack={closeForm}
            headerRight={
              <button
                type="button"
                onClick={closeForm}
                style={{
                  fontFamily: 'inherit',
                  border: 'none',
                  background: 'transparent',
                  fontSize: 13.5,
                  fontWeight: 700,
                  color: t.muted,
                  cursor: 'pointer',
                  padding: '12px 14px',
                }}
              >
                Cancel
              </button>
            }
            bottomBar={
              <>
                <Button
                  variant="primary"
                  spin={saving}
                  disabled={saving || !form.title.trim()}
                  onClick={mobileSave}
                  style={{ flex: 1, height: 48, fontSize: 14.5, fontWeight: 700, borderRadius: 12 }}
                >
                  Save and publish
                </Button>
                {editingItem && !editingItem.isPermanent && (
                  <button
                    type="button"
                    title="Delete limitation"
                    disabled={busyId === editingItem.id}
                    onClick={() => setConfirmDelete(editingItem)}
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 12,
                      border: `1px solid ${t.redBorder}`,
                      background: t.card,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: t.red,
                      cursor: 'pointer',
                      flex: 'none',
                    }}
                  >
                    <Icon name="trash-2" size={17} />
                  </button>
                )}
              </>
            }
            contentStyle={{ gap: 14 }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {label('Match type')}
              <div style={{ display: 'flex', gap: 7 }}>
                {MATCH_TYPES.map((mt) => {
                  const on = matchType === mt.key;
                  return (
                    <button
                      key={mt.key}
                      type="button"
                      title={mt.hint}
                      onClick={() => setMatchType(mt.key)}
                      style={{
                        fontFamily: t.mono,
                        flex: 1,
                        height: 44,
                        borderRadius: 10,
                        border: on ? 'none' : `1px solid ${t.border}`,
                        background: on ? t.ink : t.card,
                        color: on ? '#fff' : t.muted,
                        fontSize: 12,
                        fontWeight: on ? 800 : 700,
                        cursor: 'pointer',
                      }}
                    >
                      {mt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {label('Title')}
              <TextInput
                placeholder="Short headline shown on the wall"
                required
                value={form.title}
                onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                style={{ height: 48, fontSize: 14.5, borderRadius: 11 }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {label(
                'Wall text',
                <span style={{ fontFamily: t.mono, fontSize: 11, color: t.faint }}>{form.description.length} chars</span>
              )}
              <TextArea
                placeholder="Full instruction text — this appears in full on the wall"
                value={form.description}
                onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                style={{ minHeight: 104, borderRadius: 11, fontSize: 14, lineHeight: 1.55 }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {label('Applies to')}
              <div style={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: 11, padding: '11px 12px', display: 'flex', flexDirection: 'column', gap: 9 }}>
                {showFlights && (
                  <div>
                    <div style={{ fontFamily: t.mono, fontSize: 10.5, fontWeight: 700, color: t.faint, marginBottom: 6 }}>FLIGHTS</div>
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
                      onRemove={(labelText) => setForm((prev) => ({ ...prev, flights: prev.flights.filter((f) => f.label !== labelText) }))}
                      suggest={async (q) => {
                        const flightRows = await searchFlights(q, 12);
                        return flightRows.map((r) => ({ value: r.nid, label: r.label }));
                      }}
                    />
                  </div>
                )}
                {showAirports && (
                  <div>
                    <div style={{ fontFamily: t.mono, fontSize: 10.5, fontWeight: 700, color: t.faint, marginBottom: 6 }}>AIRPORTS</div>
                    <ChipInput
                      values={form.airportIcaos}
                      placeholder="+ Add"
                      chipColor="#1d4ed8"
                      chipBg={t.blueChip}
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
                    <div style={{ fontFamily: t.mono, fontSize: 10.5, fontWeight: 700, color: t.faint, marginBottom: 6 }}>COUNTRIES</div>
                    <ChipInput
                      values={form.countries}
                      placeholder="+ Add"
                      chipColor="#1d4ed8"
                      chipBg={t.blueChip}
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
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}>
                {label('Start date (optional)')}
                <TextInput
                  type="date"
                  value={form.startDate}
                  disabled={form.isPermanent}
                  onChange={(e) => setForm((prev) => ({ ...prev, startDate: e.target.value }))}
                  style={{ marginTop: 7, height: 48 }}
                />
              </div>
              <div style={{ flex: 1 }}>
                {label('End date (optional)')}
                <TextInput
                  type="date"
                  value={form.endDate}
                  disabled={form.isPermanent}
                  onChange={(e) => setForm((prev) => ({ ...prev, endDate: e.target.value }))}
                  style={{ marginTop: 7, height: 48 }}
                />
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44 }}>
              <Toggle
                size="sm"
                on={form.isPermanent}
                onToggle={() => setForm((prev) => ({ ...prev, isPermanent: !prev.isPermanent }))}
              />
              <span style={{ fontSize: 13, fontWeight: 600, color: t.body }}>
                Permanent <span style={{ color: t.faint, fontWeight: 400 }}>(always active, cannot be deleted)</span>
              </span>
            </div>

            {/* The live wall preview stays — it is the only way to know the
                text fits (C6). */}
            <WallPreview
              mobile
              title={form.title}
              desc={form.description}
              scope={scopeText}
              permanent={form.isPermanent}
              window={windowText({ isPermanent: form.isPermanent, startDate: form.startDate, endDate: form.endDate })}
            />
          </PushedPage>
        )}

        <ConfirmDialog
          open={Boolean(confirmDelete)}
          title={`Delete limitation "${confirmDelete?.title ?? ''}"?`}
          body="It disappears from the wall sidebar immediately. This cannot be undone."
          onCancel={() => setConfirmDelete(null)}
          onConfirm={async () => {
            const target = confirmDelete;
            setConfirmDelete(null);
            setMobileFormOpen(false);
            cancelEdit();
            await remove(target);
          }}
        />
      </div>
    );
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
                    <IconButton
                      icon="pencil"
                      title="Edit limitation"
                      color={editingId === item.id ? t.blueDeep : t.muted}
                      onClick={() => startEdit(item)}
                    />
                    {/* Permanent limitations cannot be deleted (backend guards
                        too) — deactivate is the way to retire them. The
                        disabled trash with a tooltip says so instead of the
                        button silently missing. */}
                    {item.isPermanent ? (
                      <IconButton
                        icon="trash-2"
                        title="Permanent limitation — cannot be deleted. Turn it off with the toggle instead."
                        disabled
                      />
                    ) : (
                      <IconButton icon="trash-2" title="Delete limitation" disabled={busyId === item.id} onClick={() => setConfirmDelete(item)} />
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

          <Card style={{ padding: 20, ...(editingId ? { border: `1px solid ${t.blueBorder}` } : {}) }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '0 0 16px' }}>
              <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>
                {editingId ? 'Edit limitation' : 'New limitation'}
              </h3>
              {editingId && (
                <span style={{ fontSize: 12.5, fontFamily: t.mono, color: t.faint }}>editing {editingId}</span>
              )}
            </div>
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

              <div style={{ display: 'flex', gap: 10 }}>
                <Button variant="primary" size="lg" type="submit" disabled={saving} spin={saving}>
                  {editingId ? 'Save changes' : 'Save limitation'}
                </Button>
                {editingId && (
                  <Button variant="ghost" size="lg" type="button" onClick={cancelEdit} disabled={saving}>
                    Cancel
                  </Button>
                )}
              </div>
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
      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title={`Delete limitation "${confirmDelete?.title ?? ''}"?`}
        body="It disappears from the wall sidebar immediately. This cannot be undone."
        onCancel={() => setConfirmDelete(null)}
        onConfirm={async () => { const target = confirmDelete; setConfirmDelete(null); await remove(target); }}
      />
    </div>
  );
}
