import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../AuthGate';
import {
  closeFlightOverlay,
  fetchImportant,
  fetchOverlay,
  fetchTimelineRaw,
  openFlightOverlay,
  sendFlightDocs,
} from '../../services/timelineApi';
import { FlightMarkers } from '../FlightPill';
import { subscribeWallStream } from '../../services/wallStream';
import Icon from './icons';
import {
  Button,
  Dropdown,
  EmptyState,
  ErrorBanner,
  HelpBanner,
  ImpMark,
  LoadingState,
  PageHeader,
  PendingNote,
  SearchBox,
  Segmented,
  Spinner,
  StatusPill,
  t,
  TableShell,
  timeAgo,
  hm,
  hmZ,
  useToast,
} from './ui';

// Flights — the Console's control page for the wall (approved design):
// wall banner + show/close-on-wall, today's NOTAM check workflow, and the
// AIP/GEN send controls in the flight detail panel.

const STATUS_STYLE = {
  'On wall': { c: '#15803d', b: '#e7f6ec' },
  Airborne: { c: '#1d4ed8', b: '#e8effe' },
  Boarding: { c: '#1d4ed8', b: '#e8effe' },
  Delayed: { c: '#b45309', b: '#fef3e2' },
  Arrived: { c: '#475569', b: '#eef1f5' },
  Scheduled: { c: '#475569', b: '#eef1f5' },
  Cancelled: { c: '#e5484d', b: '#fdecec' },
};

function deriveStatus(flight) {
  if (flight.isCnl) return 'Cancelled';
  if (flight.ata) return 'Arrived';
  if (flight.atd) return 'Airborne';
  if ((Number(flight.departureDelayMin) || 0) > 0) return 'Delayed';
  return 'Scheduled';
}

function flightKey(flight) {
  return `${flight.oprId ?? ''}:${flight.flightNid}`;
}

function isToday(iso) {
  if (!iso) return false;
  return String(iso).slice(0, 10) === new Date().toISOString().slice(0, 10);
}

// ── AIP / GEN send section (detail panel) ────────────────────────────────────
// Real progress: the backend broadcasts aip-send.progress per job over SSE
// (fetching → ready → emailing → sent/error); the UI renders those states.
function SendSection({ flight }) {
  const { user } = useAuth();
  const [dep, setDep] = useState(true);
  const [arr, setArr] = useState(false);
  const [doc, setDoc] = useState('AIP');
  const [job, setJob] = useState(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState('');
  const jobIdRef = useRef('');

  useEffect(() => {
    return subscribeWallStream(
      'aip-send.progress',
      (event) => {
        if (event.jobId === jobIdRef.current) setJob(event);
      },
      { surface: 'console' }
    );
  }, []);

  // Selecting a different flight resets the flow.
  useEffect(() => {
    jobIdRef.current = '';
    setJob(null);
    setStartError('');
  }, [flight.flightNid]);

  async function send() {
    if (starting) return;
    setStarting(true);
    setStartError('');
    try {
      const airports = [...(dep ? ['dep'] : []), ...(arr ? ['arr'] : [])];
      const docs = doc === 'Both' ? ['aip', 'gen'] : [doc.toLowerCase()];
      const payload = await sendFlightDocs({ flightNid: flight.flightNid, oprId: flight.oprId, airports, docs });
      jobIdRef.current = payload.jobId;
      setJob(payload.job);
    } catch (err) {
      setStartError(err instanceof Error ? err.message : String(err));
    } finally {
      setStarting(false);
    }
  }

  const stage = job?.stage || 'idle';
  const working = stage === 'fetching' || stage === 'ready' || stage === 'emailing';
  const docRows = (job?.docs || []).map((d) => ({
    key: d.label,
    spin: d.status === 'fetching',
    icon: d.status === 'ready' ? 'check' : d.status === 'unavailable' ? 'alert-triangle' : null,
    iconColor: d.status === 'ready' ? t.green : t.red,
    text: d.status === 'unavailable' ? `${d.label} — unavailable: ${d.error}` : `${d.label}${d.source ? ` (${d.source})` : ''}`,
    weight: 600,
    color: d.status === 'unavailable' ? t.red : t.body,
  }));
  const stageRows = {
    fetching: [...docRows, { key: 'st', spin: true, text: 'Fetching documents (checking shared cache, then source)…', weight: 700, color: t.blueDeep }],
    ready: [...docRows, { key: 'st', icon: 'check', iconColor: t.green, text: 'Documents ready — preparing email…', weight: 700, color: t.blueDeep }],
    emailing: [...docRows, { key: 'st', spin: true, text: 'Sending email…', weight: 700, color: t.blueDeep }],
    sent: [...docRows, { key: 'st', icon: 'mail-check', iconColor: t.green, text: `Sent to ${job?.to || user?.email || 'your inbox'}`, weight: 700, color: t.greenDeep }],
    error: [...docRows, { key: 'st', icon: 'alert-triangle', iconColor: t.red, text: job?.error || 'Send failed', weight: 700, color: t.red }],
  }[stage];

  const boxTone = {
    fetching: [t.blueBorder, t.blueWash],
    ready: [t.blueBorder, t.blueWash],
    emailing: [t.blueBorder, t.blueWash],
    sent: [t.greenBorder, '#f1faf4'],
    error: [t.redBorder, '#fdf0f0'],
  }[stage] || [t.borderInner, t.subtle];

  const buttonByStage = {
    idle: { label: 'Send document', icon: 'send', variant: 'primary' },
    fetching: { label: 'Working…', icon: null, variant: 'primary' },
    ready: { label: 'Working…', icon: null, variant: 'primary' },
    emailing: { label: 'Working…', icon: null, variant: 'primary' },
    sent: { label: 'Send again', icon: 'rotate-cw', variant: 'secondary' },
    error: { label: 'Retry send', icon: 'rotate-cw', variant: 'danger' },
  }[stage];

  const nothingPicked = !dep && !arr;

  const pick = (on) => ({
    fontFamily: 'inherit',
    flex: 1,
    fontSize: 13,
    fontWeight: 600,
    border: `1px solid ${on ? t.blue : t.borderInput}`,
    background: on ? t.blueTint : '#fff',
    color: on ? t.blueDeep : t.body,
    padding: 9,
    borderRadius: 9,
    cursor: 'pointer',
  });

  return (
    <div style={{ padding: '16px 20px' }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: t.faint, marginBottom: 12 }}>
        SEND AIP / GEN
      </div>
      <div style={{ fontSize: 12.5, color: t.muted, marginBottom: 12, lineHeight: 1.5 }}>
        Emailed to <strong style={{ color: t.ink }}>{user?.email || 'your account email'}</strong> — never shown on the
        wall.
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <button type="button" style={pick(dep)} onClick={() => setDep((v) => !v)}>
          Departure · {flight.adep?.icao ?? 'UNK'}
        </button>
        <button type="button" style={pick(arr)} onClick={() => setArr((v) => !v)}>
          Arrival · {flight.ades?.icao ?? 'UNK'}
        </button>
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {['AIP', 'GEN', 'Both'].map((option) => (
          <button key={option} type="button" style={pick(doc === option)} onClick={() => setDoc(option)}>
            {option}
          </button>
        ))}
      </div>
      {startError && <ErrorBanner>{startError}</ErrorBanner>}
      {stageRows && (
        <div
          style={{
            border: `1px solid ${boxTone[0]}`,
            background: boxTone[1],
            borderRadius: 11,
            padding: '13px 14px',
            marginBottom: 12,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          {stageRows.map((row) => (
            <div key={row.key || row.text} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {row.spin ? <Spinner /> : row.icon ? <Icon name={row.icon} size={16} color={row.iconColor} /> : <span style={{ width: 16 }} />}
              <span style={{ fontSize: 13, fontWeight: row.weight, color: row.color, lineHeight: 1.4 }}>{row.text}</span>
            </div>
          ))}
        </div>
      )}
      <Button
        variant={buttonByStage.variant}
        icon={buttonByStage.icon}
        spin={working || starting}
        disabled={working || starting || nothingPicked}
        onClick={send}
        style={{ width: '100%', fontWeight: 700, padding: 12, borderRadius: 11 }}
      >
        {buttonByStage.label}
      </Button>
      {nothingPicked && (
        <div style={{ marginTop: 9 }}>
          <PendingNote>Pick departure and/or arrival first.</PendingNote>
        </div>
      )}
    </div>
  );
}

// ── IMP details (console-side reading of what the wall only marks with "!") ──
function ImpDetails({ flight, impEntries }) {
  const [criteriaById, setCriteriaById] = useState({});

  useEffect(() => {
    let cancelled = false;
    fetchImportant({ includeInactive: false })
      .then((payload) => {
        if (cancelled) return;
        const map = {};
        for (const entry of payload.entries || []) map[entry.id] = entry.match || {};
        setCriteriaById(map);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const depIcao = flight.adep?.icao;
  const arrIcao = flight.ades?.icao;
  const operatorNames = [flight.oprId, flight.operatorName].filter(Boolean).map((v) => v.toLowerCase());
  const registration = String(flight.registration || '').toUpperCase();

  function criteriaChips(entryId) {
    const match = criteriaById[entryId];
    if (!match) return null;
    const chips = [];
    for (const icao of match.airportIcaos || []) {
      chips.push({ label: icao, hit: icao === depIcao || icao === arrIcao });
    }
    for (const country of match.countries || []) chips.push({ label: country, hit: null });
    for (const operator of match.operators || []) {
      const low = operator.toLowerCase();
      chips.push({ label: `op: ${operator}`, hit: operatorNames.some((n) => n.includes(low) || low.includes(n)) });
    }
    for (const reg of match.registrations || []) chips.push({ label: `reg: ${reg}`, hit: reg.toUpperCase() === registration });
    if (match.direction && match.direction !== 'any') chips.push({ label: match.direction === 'dep' ? 'departures' : 'arrivals', hit: null });
    return chips;
  }

  return (
    <div style={{ padding: '16px 20px', borderBottom: `1px solid ${t.borderInner}`, background: t.amberWash }}>
      {impEntries.map((imp, index) => {
        const chips = criteriaChips(imp.id);
        return (
          <div key={imp.id} style={{ marginBottom: index === impEntries.length - 1 ? 0 : 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 8 }}>
              <ImpMark size={20} />
              <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.04em', color: t.amber }}>
                IMPORTANT — {imp.title}
              </span>
            </div>
            <p style={{ fontSize: 13.5, lineHeight: 1.55, color: t.body, margin: 0, whiteSpace: 'pre-wrap' }}>{imp.description}</p>
            {chips && chips.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 9, alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: t.faint }}>criteria:</span>
                {chips.map((chip) => (
                  <span
                    key={chip.label}
                    title={chip.hit ? 'Matched this flight' : undefined}
                    style={{
                      fontFamily: t.mono,
                      fontSize: 11,
                      fontWeight: 600,
                      padding: '2px 8px',
                      borderRadius: 6,
                      background: chip.hit ? t.amberTint : '#fff',
                      color: chip.hit ? t.amber : t.muted,
                      border: `1px solid ${chip.hit ? 'rgba(180,83,9,.45)' : t.borderInner}`,
                    }}
                  >
                    {chip.label}
                    {chip.hit && ' ✓'}
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })}
      <div style={{ fontSize: 12, color: t.faint, marginTop: 10 }}>
        The wall shows only the "!" icon — the full text is read here.
      </div>
    </div>
  );
}

// ── Detail panel ─────────────────────────────────────────────────────────────
function TimingBox({ label, rows }) {
  return (
    <div style={{ border: `1px solid ${t.borderInner}`, borderRadius: 10, padding: '11px 13px' }}>
      <div style={{ fontSize: 12, color: t.faint, marginBottom: 8 }}>{label}</div>
      {rows.map(([name, value, dim]) => (
        <div key={name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: name === rows[rows.length - 1][0] ? 0 : 5 }}>
          <span style={{ color: t.muted }}>{name}</span>
          <span style={{ fontFamily: t.mono, color: dim ? t.faint : t.ink }}>{value}</span>
        </div>
      ))}
    </div>
  );
}

function DetailPanel({ flight, status, onWall, busy, onToggleWall, onClose }) {
  const st = STATUS_STYLE[status] || STATUS_STYLE.Scheduled;
  const impEntries = (flight.limitations || []).filter((lim) => lim.type === 'IMP');
  const depDelay = Number(flight.departureDelayMin) || 0;
  const hasAnyMarker =
    (flight.limitations || []).some((lim) => lim.type === 'IMP' || lim.type === 'CAA' || lim.source === 'alert') ||
    flight.wxDep || flight.wxArr || flight.icaoType;

  return (
    <div
      className="cw-fade"
      style={{ background: '#fff', border: `1px solid ${t.border}`, borderRadius: 16, boxShadow: t.shadowPanel, overflow: 'hidden' }}
    >
      <div style={{ padding: '18px 20px', borderBottom: `1px solid ${t.borderInner}`, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <span style={{ fontSize: 20, fontWeight: 800 }}>{flight.flightNo}</span>
            <StatusPill color={st.c} bg={st.b}>{status}</StatusPill>
          </div>
          <div style={{ fontSize: 14, color: t.muted, marginTop: 3 }}>
            {flight.adep?.icao ?? 'UNK'} → {flight.ades?.icao ?? 'UNK'} · {flight.operatorName || flight.oprId}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{ fontFamily: 'inherit', border: 'none', background: t.wash, width: 28, height: 28, borderRadius: 8, cursor: 'pointer', color: t.muted }}
        >
          ✕
        </button>
      </div>

      <div style={{ padding: '14px 20px', borderBottom: `1px solid ${t.borderInner}` }}>
        <Button
          variant={onWall ? 'dangerSoft' : 'primary'}
          icon={onWall ? 'monitor-x' : 'monitor-up'}
          spin={busy}
          onClick={onToggleWall}
          style={{ width: '100%', fontSize: 14.5, fontWeight: 700, padding: 12, borderRadius: 11 }}
        >
          {onWall ? 'Close on wall' : 'Show on wall'}
        </Button>
      </div>

      {hasAnyMarker && (
        <div style={{ padding: '14px 20px', borderBottom: `1px solid ${t.borderInner}` }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: t.faint, marginBottom: 10 }}>
            TIMELINE MARKERS
          </div>
          {/* same chips as the wall pill, rendered larger in the light
              console variant — no dark backing needed */}
          <div style={{ display: 'inline-flex' }}>
            <FlightMarkers flight={flight} sz={(v) => Math.round(v * 1.35)} wrap variant="light" icaoType={flight.icaoType || null} />
          </div>
          <div style={{ fontSize: 11.5, color: t.faint, marginTop: 8, lineHeight: 1.5 }}>
            ! important · CAA authority details · WX departure/arrival category · NTM unreviewed NOTAM · grey letter ICAO flight type (S/N/G/M/X)
          </div>
        </div>
      )}

      <div style={{ padding: '16px 20px', borderBottom: `1px solid ${t.borderInner}` }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: t.faint, marginBottom: 12 }}>
          TIMINGS (UTC)
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <TimingBox
            label={`Departure · ${flight.adep?.icao ?? 'UNK'}`}
            rows={[
              ['STD', hm(flight.startTimeUTC)],
              ['ETD', hm(flight.etd || flight.startTimeUTC)],
              ['ATD', hm(flight.atd), !flight.atd],
            ]}
          />
          <TimingBox
            label={`Arrival · ${flight.ades?.icao ?? 'UNK'}`}
            rows={[
              ['STA', hm(flight.endTimeUTC)],
              ['ETA', hm(flight.eta || flight.endTimeUTC)],
              ['ATA', hm(flight.ata), !flight.ata],
            ]}
          />
        </div>
        {depDelay > 0 && (
          <div style={{ marginTop: 12, fontSize: 13, fontWeight: 600, color: t.amber, background: t.amberTint, padding: '9px 12px', borderRadius: 9, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="clock" size={15} />
            ETD +{depDelay} min
          </div>
        )}
      </div>

      {impEntries.length > 0 && <ImpDetails flight={flight} impEntries={impEntries} />}

      <SendSection flight={flight} />
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function FlightsPage() {
  const [aircraft, setAircraft] = useState([]);
  const [overlay, setOverlay] = useState({ open: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyNid, setBusyNid] = useState('');
  const [search, setSearch] = useState('');
  const [operatorFilter, setOperatorFilter] = useState('');
  const [airportFilter, setAirportFilter] = useState('');
  const [range, setRange] = useState('today');
  const [selectedKey, setSelectedKey] = useState('');
  const [sort, setSort] = useState({ key: 'etd', dir: 1 });
  const flash = useToast();
  const loadedRef = useRef(false);

  async function load() {
    try {
      const payload = await fetchTimelineRaw({ refresh: false });
      setAircraft(payload.aircraft || []);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      if (!loadedRef.current) setAircraft([]);
    } finally {
      loadedRef.current = true;
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 60_000);
    fetchOverlay().then((p) => setOverlay(p.overlay || { open: false })).catch(() => {});
    const unsub = subscribeWallStream('display.command', (event) => setOverlay(event.overlay || { open: false }), {
      surface: 'console',
    });
    return () => {
      clearInterval(id);
      unsub();
    };
  }, []);

  const allFlights = useMemo(() => {
    const rows = [];
    for (const group of aircraft) {
      for (const flight of group.flights || []) {
        rows.push({ ...flight, registration: group.registration, oprId: group.oprId, operatorName: group.operatorName, acftTypeIcao: group.acftTypeIcao || null, icaoType: flight.icaoType || group.defaultIcaoType || null });
      }
    }
    return rows;
  }, [aircraft]);

  const operatorOptions = useMemo(
    () => [
      { value: '', label: 'All operators' },
      ...[...new Set(allFlights.map((f) => f.operatorName || f.oprId).filter(Boolean))].sort().map((name) => ({ value: name, label: name })),
    ],
    [allFlights]
  );
  const airportOptions = useMemo(
    () => [
      { value: '', label: 'All airports' },
      ...[...new Set(allFlights.flatMap((f) => [f.adep?.icao, f.ades?.icao]).filter((i) => i && i !== 'UNK'))].sort().map((icao) => ({ value: icao, label: icao })),
    ],
    [allFlights]
  );

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const nowMs = Date.now();
    const list = allFlights.filter((flight) => {
      if (range === 'today') {
        const endMs = new Date(flight.endTimeUTC || flight.startTimeUTC || 0).getTime();
        if (!isToday(flight.startTimeUTC) || (Number.isFinite(endMs) && endMs < nowMs - 3 * 3600_000)) return false;
      }
      if (operatorFilter && (flight.operatorName || flight.oprId) !== operatorFilter) return false;
      if (airportFilter && flight.adep?.icao !== airportFilter && flight.ades?.icao !== airportFilter) return false;
      if (q) {
        const hay = `${flight.flightNo} ${flight.adep?.icao || ''} ${flight.ades?.icao || ''} ${flight.registration} ${flight.operatorName || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const sorters = {
      callsign: (a, b) => String(a.flightNo).localeCompare(String(b.flightNo)),
      operator: (a, b) => String(a.operatorName || a.oprId).localeCompare(String(b.operatorName || b.oprId)),
      etd: (a, b) => new Date(a.startTimeUTC || 0) - new Date(b.startTimeUTC || 0),
    };
    list.sort((a, b) => sort.dir * sorters[sort.key](a, b));
    return list;
  }, [allFlights, search, operatorFilter, airportFilter, range, sort]);

  const overlayNid = overlay.open ? String(overlay.flightNid) : '';
  const wallFlight = overlayNid ? allFlights.find((f) => String(f.flightNid) === overlayNid) : null;
  const selected = rows.find((f) => flightKey(f) === selectedKey) || allFlights.find((f) => flightKey(f) === selectedKey) || null;

  async function toggleWall(flight) {
    const onWall = String(flight.flightNid) === overlayNid;
    setBusyNid(String(flight.flightNid));
    try {
      if (onWall) {
        await closeFlightOverlay();
        flash('Closed on wall', '#f87171');
      } else {
        await openFlightOverlay({ flightNid: flight.flightNid, oprId: flight.oprId });
        flash(`${flight.flightNo} is now on the wall`);
      }
    } catch (err) {
      flash(err instanceof Error ? err.message : String(err), '#f87171');
    } finally {
      setBusyNid('');
    }
  }

  function sortHeader(key) {
    setSort((prev) => (prev.key === key ? { key, dir: -prev.dir } : { key, dir: 1 }));
  }

  return (
    <div>
      <PageHeader
        title="Flights"
        desc="Pick a flight to control what the wall shows and send AIP / GEN documents to your inbox. The daily NOTAM check lives on its own page."
      />

      <HelpBanner
        items={[
          { title: 'Show / Close on wall', body: 'sends the selected flight to the digital wall. Only one flight is live at a time; the banner shows who opened it.' },
          { title: 'NOTAM check', body: 'lives on the NOTAM Check page (left nav) — review today\'s airports there; the wall sign flips once all are checked.' },
          { title: 'Send AIP / GEN', body: 'pick departure and/or arrival + document type; it\'s emailed to you, never downloaded to the wall.' },
        ]}
      />

      {overlay.open && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            background: '#fff',
            border: `1px solid ${t.border}`,
            borderLeft: `4px solid ${t.green}`,
            borderRadius: 12,
            padding: '14px 18px',
            marginBottom: 20,
            boxShadow: t.shadow,
          }}
        >
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: t.green, boxShadow: '0 0 0 5px rgba(22,163,74,.14)', flex: 'none' }} />
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: 15, fontWeight: 700 }}>{wallFlight?.flightNo || `Flight ${overlay.flightNid}`}</span>
            <span style={{ fontSize: 15, color: t.muted }}>
              {wallFlight ? ` · ${wallFlight.adep?.icao} → ${wallFlight.ades?.icao}` : ''} is currently on the wall
            </span>
            {overlay.by?.name && (
              <span style={{ fontSize: 13, color: t.faint }}>
                {' '}— opened by {overlay.by.name}
                {overlay.openedAt ? `, ${timeAgo(overlay.openedAt)}` : ''}
              </span>
            )}
          </div>
          <Button variant="dangerSoft" size="sm" onClick={() => wallFlight ? toggleWall(wallFlight) : closeFlightOverlay().catch(() => {})}>
            Close on wall
          </Button>
        </div>
      )}

      <ErrorBanner>{error}</ErrorBanner>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
        <SearchBox
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search callsign, route, registration…"
          style={{ flex: 1, minWidth: 240 }}
        />
        <Dropdown icon="sliders-horizontal" label="Operator" value={operatorFilter} options={operatorOptions} onChange={setOperatorFilter} />
        <Dropdown icon="map-pin" label="Airport" value={airportFilter} options={airportOptions} onChange={setAirportFilter} />
        <Segmented
          options={[{ value: 'today', label: 'Today' }, { value: 'all', label: 'All' }]}
          value={range}
          onChange={setRange}
        />
      </div>

      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
        <TableShell
          style={{ flex: 1, minWidth: 0 }}
          columns=".85fr 1.1fr 1.2fr .8fr 1fr .7fr .9fr"
          header={[
            { label: 'CALLSIGN', sort: true, onSort: () => sortHeader('callsign') },
            { label: 'MARKERS' },
            { label: 'ROUTE' },
            { label: 'REG' },
            { label: 'OPERATOR', sort: true, onSort: () => sortHeader('operator') },
            { label: 'ETD', sort: true, onSort: () => sortHeader('etd') },
            { label: 'STATUS' },
          ]}
        >
          {loading && <LoadingState>Loading flights…</LoadingState>}
          {!loading && rows.length === 0 && (
            <EmptyState icon="plane" title="No flights match">
              Adjust the filters or switch to “All”.
            </EmptyState>
          )}
          {rows.map((flight) => {
            const key = flightKey(flight);
            const isSel = key === selectedKey;
            const onWall = String(flight.flightNid) === overlayNid;
            const status = onWall ? 'On wall' : deriveStatus(flight);
            const st = STATUS_STYLE[status] || STATUS_STYLE.Scheduled;
            return (
              <div
                key={key}
                className={isSel ? '' : 'cw-hover-row'}
                onClick={() => setSelectedKey(isSel ? '' : key)}
                onKeyDown={(e) => e.key === 'Enter' && setSelectedKey(isSel ? '' : key)}
                role="button"
                tabIndex={0}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '.85fr 1.1fr 1.2fr .8fr 1fr .7fr .9fr',
                  padding: '15px 18px',
                  borderBottom: `1px solid ${t.rowLine}`,
                  borderLeft: `3px solid ${isSel ? t.blue : 'transparent'}`,
                  alignItems: 'center',
                  background: isSel ? '#f6faff' : '#fff',
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontSize: 14.5, fontWeight: 700 }}>{flight.flightNo}</div>
                {/* the SAME marker row as the wall pill (IMP/CAA/WX/NTM) via
                    the shared component, in its light-theme variant so the
                    chips sit directly on the console row background */}
                <div style={{ minWidth: 0 }}>
                  {((flight.limitations || []).length > 0 || flight.wxDep || flight.wxArr || flight.icaoType) ? (
                    <FlightMarkers flight={flight} sz={(v) => Math.round(v * 1.05)} wrap variant="light" icaoType={flight.icaoType || null} />
                  ) : (
                    <span style={{ fontSize: 12, color: t.ghost }}>—</span>
                  )}
                </div>
                <div style={{ fontSize: 14, color: t.body, whiteSpace: 'nowrap' }}>
                  {flight.adep?.icao ?? 'UNK'} → {flight.ades?.icao ?? 'UNK'}
                </div>
                <div style={{ fontFamily: t.mono, fontSize: 13, color: t.body }}>{flight.registration}{flight.acftTypeIcao ? <span style={{ color: t.faint }}> · {flight.acftTypeIcao}</span> : null}</div>
                <div style={{ fontSize: 14, color: t.body }}>{flight.operatorName || flight.oprId || '—'}</div>
                <div style={{ fontFamily: t.mono, fontSize: 13, color: t.body }}>{hmZ(flight.etd || flight.startTimeUTC)}</div>
                <div>
                  <StatusPill color={st.c} bg={st.b}>{status}</StatusPill>
                </div>
              </div>
            );
          })}
        </TableShell>

        <div style={{ width: 'clamp(400px, 26vw, 560px)', flex: 'none' }}>
          {selected ? (
            <DetailPanel
              flight={selected}
              status={String(selected.flightNid) === overlayNid ? 'On wall' : deriveStatus(selected)}
              onWall={String(selected.flightNid) === overlayNid}
              busy={busyNid === String(selected.flightNid)}
              onToggleWall={() => toggleWall(selected)}
              onClose={() => setSelectedKey('')}
            />
          ) : (
            <div style={{ border: `1.5px dashed ${t.borderInput}`, borderRadius: 16, padding: '40px 24px', textAlign: 'center', color: t.faint }}>
              <Icon name="mouse-pointer-click" size={26} color={t.ghost} />
              <div style={{ fontSize: 15, fontWeight: 600, color: t.muted, marginTop: 12 }}>Select a flight</div>
              <div style={{ fontSize: 13, marginTop: 5, lineHeight: 1.5 }}>
                Timings, IMP details and the AIP / GEN send controls appear here.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
