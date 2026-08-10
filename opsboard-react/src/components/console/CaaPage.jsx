import { useEffect, useMemo, useState } from 'react';
import {
  deleteCaa,
  fetchCaa,
  fetchCountries,
  searchAirports,
  setCaaActive,
  updateCaa,
  upsertCaa,
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
  LoadingState,
  PageHeader,
  SearchBox,
  StatusPill,
  t,
  TextArea,
  TextInput,
  Toggle,
  useToast,
  ConfirmDialog,
  Dropdown,
} from './ui';

// CAA details — Civil Aviation Authority contact records + permit processes
// (Claude Design brief: list-left / editor-right, teal accent). Imported
// from CAA_NEW.xlsx column-for-column; match flags attach an entry to
// flights by country and/or airport, narrowed by the commercial/private
// condition. Matching flights show the teal CAA pill marker and the
// authority's contact block in the flight overlay.

const FUNCTION_LABELS = {
  overflight_landing: 'Overflight + Landing',
  landing: 'Landing',
  overflight: 'Overflight',
  flight_plan: 'Flight plan',
  other: 'Other',
};

const CONDITIONS = [
  { value: 'any', label: 'Any flight', icon: 'plane' },
  { value: 'commercial', label: 'Commercial only', icon: 'users' },
  { value: 'private', label: 'Private only', icon: 'key-round' },
];

const CAA_LOADS = [
  { value: 'all', label: 'All loads', icon: 'plane' },
  { value: 'pax', label: 'PAX only', icon: 'users' },
  { value: 'ferry', label: 'Ferry only', icon: 'plane-takeoff' },
];
const LOAD_CHIP = {
  all: null, // default — no chip noise
  pax: { label: 'PAX', color: '#0369a1', bg: '#e0f2fe' },
  ferry: { label: 'FERRY', color: '#6d28d9', bg: '#ede9fe' },
};

const COND_CHIP = {
  any: { label: 'Any', color: '#475569', bg: '#eef1f5' },
  commercial: { label: 'Commercial', color: '#0369a1', bg: '#e0f2fe' },
  private: { label: 'Private', color: '#6d28d9', bg: '#ede9fe' },
};

function entryToForm(entry) {
  return {
    id: entry.id,
    country: entry.country || '',
    authorityName: entry.authorityName || '',
    validity: entry.validity || '',
    functionText: entry.functionText || '',
    functionKind: entry.functionKind || 'other',
    info: entry.info || '',
    contact: entry.contact || '',
    phones: Array.isArray(entry.phones) ? entry.phones : (entry.phones ? String(entry.phones).split(/[\r\n,]+/).map((v) => v.trim()).filter(Boolean) : []),
    mail: Array.isArray(entry.mail) ? entry.mail : (entry.mail ? String(entry.mail).split(/[\r\n,]+/).map((v) => v.trim()).filter(Boolean) : []),
    sita: entry.sita || '',
    aftn: entry.aftn || '',
    vfrAddresses: entry.vfrAddresses || '',
    countries: entry.match?.countries || [],
    airportIcaos: entry.match?.airportIcaos || [],
    appliesTo: entry.appliesTo || 'any',
    load: entry.load || 'all',
    reviewed: entry.reviewed !== false,
    isActive: entry.isActive !== false,
  };
}

const NEW_FORM = entryToForm({ match: {} });

function scopeText(entry) {
  const parts = [];
  if ((entry.match?.countries || []).length > 0) parts.push(entry.match.countries.join(', '));
  if ((entry.match?.airportIcaos || []).length > 0) parts.push(entry.match.airportIcaos.join(' '));
  return parts.join(' · ') || 'no match flags — surfaces nowhere';
}

function matchTypeHint(form) {
  const c = form.countries.length > 0;
  const a = form.airportIcaos.length > 0;
  if (c && a) return 'Mixed match: the flight must touch a listed country AND a listed airport.';
  if (c) return 'Country match: flags flights departing from or arriving into these countries.';
  if (a) return 'Airport match: flags flights touching these ICAOs.';
  return 'Add a country or airport — without flags this entry never surfaces.';
}

export default function CaaPage() {
  const [entries, setEntries] = useState([]);
  const [countries, setCountries] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [form, setForm] = useState(null);
  const [search, setSearch] = useState('');
  const [countryFilter, setCountryFilter] = useState('');
  const [funcFilter, setFuncFilter] = useState('');
  const [condFilter, setCondFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const flash = useToast();

  async function load() {
    setError('');
    try {
      const payload = await fetchCaa({ withMatches: true });
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
    return subscribeWallStream('caa.changed', load, { surface: 'console' });
  }, []);

  const selected = entries.find((entry) => entry.id === selectedId) || null;

  useEffect(() => {
    if (selected) setForm(entryToForm(selected));
    else if (selectedId === '__new__') setForm(structuredClone(NEW_FORM));
    else setForm(null);
  }, [selectedId, selected]);

  const countryOptions = useMemo(
    () => [...new Set(entries.map((entry) => entry.country).filter(Boolean))].sort(),
    [entries]
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((entry) => {
      if (countryFilter && entry.country !== countryFilter) return false;
      if (funcFilter && entry.functionKind !== funcFilter) return false;
      if (condFilter && (entry.appliesTo || 'any') !== condFilter) return false;
      if (!q) return true;
      const hay = `${entry.country} ${entry.authorityName} ${entry.functionText} ${(entry.match?.countries || []).join(' ')} ${(entry.match?.airportIcaos || []).join(' ')}`.toLowerCase();
      return hay.includes(q);
    });
  }, [entries, search, countryFilter, funcFilter, condFilter]);

  const filterActive = Boolean(search.trim() || countryFilter || funcFilter || condFilter);

  async function save() {
    if (!form) return;
    setSaving(true);
    setError('');
    try {
      const body = {
        country: form.country,
        authorityName: form.authorityName,
        validity: form.validity,
        functionText: form.functionText,
        functionKind: form.functionKind,
        info: form.info,
        contact: form.contact,
        phones: form.phones,
        mail: form.mail,
        sita: form.sita,
        aftn: form.aftn,
        vfrAddresses: form.vfrAddresses,
        match: { countries: form.countries, airportIcaos: form.airportIcaos },
        appliesTo: form.appliesTo,
        load: form.load,
        reviewed: form.reviewed,
        isActive: form.isActive,
      };
      const payload = form.id ? await updateCaa(form.id, body) : await upsertCaa(body);
      flash('CAA entry saved · wall updates in seconds');
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
      await setCaaActive(entry.id, nextValue);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      await load();
    }
  }

  const [confirmDelete, setConfirmDelete] = useState(null);

  async function remove(entry) {
    try {
      await deleteCaa(entry.id);
      flash('CAA entry deleted', '#f87171');
      if (selectedId === entry.id) setSelectedId('');
      setEntries((prev) => prev.filter((row) => row.id !== entry.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      await load();
    }
  }

  function chipField(field, label, chipStyle, suggest, upper = false) {
    return (
      <div>
        <FieldLabel>{label}</FieldLabel>
        <ChipInput
          values={form[field]}
          placeholder="Add…"
          chipColor={chipStyle.color}
          chipBg={chipStyle.bg}
          onAdd={(v) => setForm((prev) => ({ ...prev, [field]: [...new Set([...prev[field], upper ? v.toUpperCase() : v])] }))}
          onRemove={(v) => setForm((prev) => ({ ...prev, [field]: prev[field].filter((x) => x !== v) }))}
          suggest={suggest}
        />
      </div>
    );
  }

  function textField(field, label, hint, props = {}) {
    return (
      <div style={props.span ? { gridColumn: '1 / -1' } : undefined}>
        <FieldLabel>
          {label}
          {hint && <span style={{ fontWeight: 500, color: t.faint }}> — {hint}</span>}
        </FieldLabel>
        {props.area ? (
          <TextArea
            value={form[field]}
            placeholder={props.placeholder}
            onChange={(e) => setForm((prev) => ({ ...prev, [field]: e.target.value }))}
            style={{ minHeight: props.minHeight || 62, ...(props.mono ? { fontFamily: t.mono, fontSize: 13 } : {}) }}
          />
        ) : (
          <TextInput
            mono={props.mono}
            value={form[field]}
            placeholder={props.placeholder}
            onChange={(e) => setForm((prev) => ({ ...prev, [field]: e.target.value }))}
          />
        )}
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="CAA details"
        desc="Civil Aviation Authority contact details and permit processes. Matching flights show a CAA marker on the wall and the authority's details in the flight overlay."
        descMax={620}
        actions={
          <Button variant="primary" icon="plus" onClick={() => setSelectedId('__new__')}>
            Add CAA
          </Button>
        }
      />

      <ErrorBanner>{error}</ErrorBanner>

      <div style={{ display: 'flex', gap: 22, alignItems: 'flex-start' }}>
        {/* ── list ── */}
        <div style={{ width: 'clamp(360px, 22vw, 470px)', flex: 'none' }}>
          <SearchBox
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search authority, country, ICAO…"
            style={{ marginBottom: 10 }}
          />
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <Dropdown
              label="All countries"
              value={countryFilter}
              options={[{ value: '', label: 'All countries' }, ...countryOptions.map((c) => ({ value: c, label: c }))]}
              onChange={setCountryFilter}
              style={{ flex: 1, minWidth: 0 }}
            />
            <Dropdown
              label="All functions"
              value={funcFilter}
              options={[{ value: '', label: 'All functions' }, ...Object.entries(FUNCTION_LABELS).map(([value, label]) => ({ value, label }))]}
              onChange={setFuncFilter}
              style={{ flex: 1, minWidth: 0 }}
            />
          </div>
          <div style={{ display: 'flex', background: '#eef0f2', borderRadius: 9, padding: 3, marginBottom: 12 }}>
            {[{ value: '', label: 'All' }, { value: 'any', label: 'Any' }, { value: 'commercial', label: 'Comm.' }, { value: 'private', label: 'Private' }].map((f) => {
              const on = condFilter === f.value;
              return (
                <button
                  key={f.value || 'all'}
                  type="button"
                  onClick={() => setCondFilter(f.value)}
                  style={{ fontFamily: 'inherit', flex: 1, fontSize: 12.5, fontWeight: 600, color: on ? t.blueDeep : t.muted, background: on ? '#fff' : 'transparent', border: 'none', height: 32, borderRadius: 7, cursor: 'pointer', boxShadow: on ? '0 1px 2px rgba(16,18,22,.1)' : 'none' }}
                >
                  {f.label}
                </button>
              );
            })}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 2px 9px' }}>
            <span style={{ fontSize: 12, color: t.faint, fontWeight: 600 }}>
              {visible.length} of {entries.length} authorities
            </span>
            {filterActive && (
              <button
                type="button"
                onClick={() => { setSearch(''); setCountryFilter(''); setFuncFilter(''); setCondFilter(''); }}
                style={{ fontFamily: 'inherit', border: 'none', background: 'transparent', color: t.blue, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', padding: 0 }}
              >
                Clear filters
              </button>
            )}
          </div>

          {loading && <LoadingState>Loading authorities…</LoadingState>}
          {!loading && entries.length === 0 && (
            <EmptyState icon="landmark" title="No CAA details yet">
              Run the importer (scripts/import-caa-xlsx.mjs) or add an authority manually.
            </EmptyState>
          )}
          {!loading && entries.length > 0 && visible.length === 0 && (
            <EmptyState icon="search" title="No authorities match">
              Try a different search or clear the filters.
            </EmptyState>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {visible.map((entry) => {
              const isSel = entry.id === selectedId;
              const active = entry.isActive !== false;
              const cond = COND_CHIP[entry.appliesTo || 'any'];
              const loadChip = LOAD_CHIP[entry.load || 'all'];
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
                    borderLeft: `3px solid ${isSel ? '#2f9e8f' : 'transparent'}`,
                    borderRadius: 12,
                    padding: '13px 15px',
                    cursor: 'pointer',
                    boxShadow: t.shadow,
                    opacity: active ? 1 : 0.6,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
                    <span style={{ fontFamily: t.mono, fontSize: 11, fontWeight: 700, color: '#0f766e', background: '#ccfbf1', padding: '3px 7px', borderRadius: 6 }}>
                      {FUNCTION_LABELS[entry.functionKind] || 'Other'}
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: cond.color, background: cond.bg, padding: '3px 8px', borderRadius: 6 }}>
                      {cond.label}
                    </span>
                    {loadChip && (
                      <span style={{ fontSize: 11, fontWeight: 600, color: loadChip.color, background: loadChip.bg, padding: '3px 8px', borderRadius: 6 }}>
                        {loadChip.label}
                      </span>
                    )}
                    <div style={{ flex: 1 }} />
                    <span title={active ? 'Active on wall' : 'Inactive'} style={{ width: 8, height: 8, borderRadius: '50%', background: active ? t.green : '#c3c7cd' }} />
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.3, marginBottom: 3 }}>
                    {entry.country || entry.authorityName}
                  </div>
                  <div style={{ fontSize: 12.5, color: t.faint, marginBottom: 9, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {entry.authorityName && entry.country ? entry.authorityName : entry.validity || '—'}
                  </div>
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                    {(entry.match?.countries || []).slice(0, 3).map((c) => (
                      <span key={c} style={{ fontFamily: t.mono, fontSize: 11, fontWeight: 600, background: '#ede9fe', color: '#6d28d9', padding: '3px 8px', borderRadius: 6 }}>{c}</span>
                    ))}
                    {(entry.match?.airportIcaos || []).slice(0, 3).map((a) => (
                      <span key={a} style={{ fontFamily: t.mono, fontSize: 11, fontWeight: 600, background: '#e0f2fe', color: '#0369a1', padding: '3px 8px', borderRadius: 6 }}>{a}</span>
                    ))}
                    {typeof entry.matchedFlightCount === 'number' && entry.matchedFlightCount > 0 && (
                      <span style={{ fontSize: 11, fontWeight: 600, color: t.blueDeep, background: t.blueChip, padding: '3px 8px', borderRadius: 6 }}>
                        {entry.matchedFlightCount} flight{entry.matchedFlightCount > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── editor ── */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {!form && (
            <div style={{ border: `1.5px dashed ${t.borderInput}`, borderRadius: 16, padding: '44px 24px', textAlign: 'center', color: t.faint }}>
              <Icon name="landmark" size={26} color={t.ghost} />
              <div style={{ fontSize: 15, fontWeight: 600, color: t.muted, marginTop: 12 }}>Select an authority</div>
              <div style={{ fontSize: 13, marginTop: 5, lineHeight: 1.5 }}>Contact details and match flags appear here.</div>
            </div>
          )}
          {form && (
            <div style={{ background: '#fff', border: `1px solid ${t.border}`, borderRadius: 16, boxShadow: t.shadow, overflow: 'hidden' }}>
              {/* header */}
              <div style={{ padding: '18px 22px', borderBottom: `1px solid ${t.borderInner}`, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
                    <h3 style={{ fontSize: 19, fontWeight: 800, margin: 0, lineHeight: 1.25 }}>
                      {form.authorityName || form.country || 'New authority'}
                    </h3>
                    <StatusPill color={COND_CHIP[form.appliesTo].color} bg={COND_CHIP[form.appliesTo].bg}>
                      {COND_CHIP[form.appliesTo].label}
                    </StatusPill>
                    {LOAD_CHIP[form.load || 'all'] && (
                      <StatusPill color={LOAD_CHIP[form.load || 'all'].color} bg={LOAD_CHIP[form.load || 'all'].bg}>
                        {LOAD_CHIP[form.load || 'all'].label}
                      </StatusPill>
                    )}
                  </div>
                  {selected && (
                    <div style={{ fontSize: 13, color: t.muted, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        <Icon name="map-pin" size={13} color={t.faint} />
                        {scopeText(selected)}
                      </span>
                      {typeof selected.matchedFlightCount === 'number' && (
                        <>
                          <span style={{ color: t.border }}>·</span>
                          <span>
                            Affects <strong style={{ color: t.blueDeep }}>{selected.matchedFlightCount}</strong> of the board's flights
                          </span>
                        </>
                      )}
                    </div>
                  )}
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
                    <IconButton icon="trash-2" title="Delete entry" onClick={() => setConfirmDelete(selected)} />
                  </div>
                )}
              </div>

              {/* contact details — mirrors CAA_NEW.xlsx column-for-column */}
              <div style={{ padding: '18px 22px', borderBottom: `1px solid ${t.borderInner}` }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: t.faint, marginBottom: 4 }}>CONTACT DETAILS</div>
                <div style={{ fontSize: 12, color: t.faint, marginBottom: 14 }}>
                  Mirrors the OPS permissions sheet (<span style={{ fontFamily: t.mono, fontSize: 11.5 }}>CAA_NEW.xlsx</span>) column-for-column — values stay verbatim.
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 16px' }}>
                  {textField('authorityName', 'Authority name', null, { span: true })}
                  {textField('country', 'Country', 'display label from the sheet')}
                  {textField('validity', 'Validity', 'permit lead time', { placeholder: 'e.g. 72HRS · OVERFLIGHT +/-72HRS' })}
                  <div style={{ gridColumn: '1 / -1' }}>
                    <FieldLabel>
                      Function <span style={{ fontWeight: 500, color: t.faint }}>— what this authority covers</span>
                    </FieldLabel>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                      {Object.entries(FUNCTION_LABELS).map(([value, label]) => {
                        const on = form.functionKind === value;
                        return (
                          <button
                            key={value}
                            type="button"
                            onClick={() => setForm((prev) => ({ ...prev, functionKind: value }))}
                            style={{ fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, border: `1px solid ${on ? '#2f9e8f' : t.borderInput}`, background: on ? '#ccfbf1' : '#fff', color: on ? '#0f766e' : t.muted, padding: '8px 13px', borderRadius: 8, cursor: 'pointer' }}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                    <TextInput
                      value={form.functionText}
                      placeholder="Verbatim function text from the sheet (optional)"
                      onChange={(e) => setForm((prev) => ({ ...prev, functionText: e.target.value }))}
                    />
                  </div>
                  {textField('info', 'INFO', 'working hours & conditions', { span: true, area: true, minHeight: 74, placeholder: 'Working hours, conditions and handling notes — verbatim from the sheet' })}
                  {textField('contact', 'Contact', 'routing instruction', { span: true, placeholder: 'e.g. USE CAA FOR REQ · DIRECT · USE WEB PAGE FOR REQ' })}
                  {chipField('phones', 'Phone number(s)', { color: '#475569', bg: '#eef1f5' })}
                  {chipField('mail', 'Mail', { color: '#475569', bg: '#eef1f5' })}
                  {textField('aftn', 'AFTN', null, { mono: true, placeholder: 'e.g. EGGGYAYX' })}
                  {textField('sita', 'SITA', null, { mono: true, placeholder: 'e.g. LONCAXH' })}
                  {textField('vfrAddresses', 'VFR flight plan addresses', null, { span: true, mono: true, placeholder: 'Addressees for VFR flight plans' })}
                </div>
              </div>

              {/* match flags */}
              <div style={{ padding: '18px 22px', borderBottom: `1px solid ${t.borderInner}` }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: t.faint, marginBottom: 14 }}>MATCH FLAGS</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 6 }}>
                  {chipField('countries', 'Countries', { color: '#6d28d9', bg: '#ede9fe' }, async (q) =>
                    countries.filter((c) => c.toLowerCase().includes(q.toLowerCase())).slice(0, 10).map((c) => ({ value: c, label: c }))
                  )}
                  {chipField('airportIcaos', 'Airports (ICAO)', { color: '#0369a1', bg: '#e0f2fe' }, async (q) => {
                    const payload = await searchAirports(q, 10);
                    return (payload.airports || []).map((a) => ({ value: a.icao, label: `${a.icao}${a.name ? ` · ${a.name}` : ''}` }));
                  }, true)}
                </div>
                <div style={{ fontSize: 11.5, color: t.faint, marginBottom: 16, lineHeight: 1.4 }}>{matchTypeHint(form)}</div>
                <FieldLabel>Applies to</FieldLabel>
                <div style={{ display: 'flex', gap: 8 }}>
                  {CONDITIONS.map((option) => {
                    const on = form.appliesTo === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setForm((prev) => ({ ...prev, appliesTo: option.value }))}
                        style={{ fontFamily: 'inherit', flex: 1, fontSize: 13, fontWeight: 600, border: `1px solid ${on ? '#2f9e8f' : t.borderInput}`, background: on ? '#ccfbf1' : '#fff', color: on ? '#0f766e' : t.muted, padding: 10, borderRadius: 10, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}
                      >
                        <Icon name={option.icon} size={15} />
                        {option.label}
                      </button>
                    );
                  })}
                </div>
                <div style={{ fontSize: 11.5, color: t.faint, marginTop: 8, lineHeight: 1.4 }}>
                  Commercial vs private comes from Leon's <span style={{ fontFamily: t.mono }}>isCommercial</span> flight flag; flights with an unknown kind only match “Any flight”.
                </div>
                <div style={{ marginTop: 14 }}>
                  <FieldLabel>Load</FieldLabel>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {CAA_LOADS.map((option) => {
                      const on = form.load === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setForm((prev) => ({ ...prev, load: option.value }))}
                          style={{ fontFamily: 'inherit', flex: 1, fontSize: 13, fontWeight: 600, border: `1px solid ${on ? '#2f9e8f' : t.borderInput}`, background: on ? '#ccfbf1' : '#fff', color: on ? '#0f766e' : t.muted, padding: 10, borderRadius: 10, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}
                        >
                          <Icon name={option.icon} size={15} />
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                  <div style={{ fontSize: 11.5, color: t.faint, marginTop: 8, lineHeight: 1.4 }}>
                    PAX vs ferry comes from Leon's <span style={{ fontFamily: t.mono }}>isFerry</span> flight flag; flights with an unknown load only match “All loads”.
                  </div>
                </div>
              </div>

              {/* actions */}
              <div style={{ padding: '16px 22px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <Button variant="primary" size="lg" disabled={saving || (!form.country.trim() && !form.authorityName.trim())} spin={saving} onClick={save}>
                  Save changes
                </Button>
                <Button variant="ghost" size="lg" disabled={saving} onClick={() => setSelectedId(form.id || '')}>
                  Cancel
                </Button>
                <Button
                  variant={form.reviewed ? 'soft' : 'successSoft'}
                  size="lg"
                  icon={form.reviewed ? undefined : 'check'}
                  disabled={saving}
                  onClick={() => setForm((prev) => ({ ...prev, reviewed: !prev.reviewed }))}
                >
                  {form.reviewed ? 'Reviewed ✓ (click to un-review)' : 'Mark reviewed'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title={`Delete the CAA entry for "${confirmDelete?.authorityName || confirmDelete?.country || ''}"?`}
        body="This cannot be undone."
        onCancel={() => setConfirmDelete(null)}
        onConfirm={async () => { const target = confirmDelete; setConfirmDelete(null); await remove(target); }}
      />
    </div>
  );
}
