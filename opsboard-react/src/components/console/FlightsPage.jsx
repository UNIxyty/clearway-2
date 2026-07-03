import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../AuthGate';
import {
  closeFlightOverlay,
  fetchAlertFindings,
  fetchOverlay,
  fetchTimelineRaw,
  openFlightOverlay,
} from '../../services/timelineApi';
import { subscribeWallStream } from '../../services/wallStream';
import Icon from './icons';
import {
  Button,
  Card,
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

// Keyword → design category colour (Closure red / Restriction orange /
// Availability blue / Info gray) for NOTAM highlighting.
const KEYWORD_CATEGORY = [
  { color: '#e5484d', test: /CLOSED|CLSD|U\/S|UNSERVICEABLE|WITHDRAWN/i },
  { color: '#ea8a4e', test: /RESTRICT|LIMITED|CTOT|SLOT|PROHIBIT|CURFEW/i },
  { color: '#2563eb', test: /NOT AVBL|UNAVAILABLE|WIP|WORK IN PROGRESS/i },
];
function keywordColor(keywords) {
  const joined = (keywords || []).join(' ');
  for (const cat of KEYWORD_CATEGORY) {
    if (cat.test.test(joined)) return cat.color;
  }
  return '#9aa0a8';
}

// ── NOTAM check panel ────────────────────────────────────────────────────────
function NotamCheckPanel({ flights }) {
  const [findings, setFindings] = useState([]);
  const [checks, setChecks] = useState({}); // TODO(backend): persist per-airport CHECKED + wall sign state once the NOTAM-check endpoints land; local-only until then.
  const [showAll, setShowAll] = useState({});

  useEffect(() => {
    fetchAlertFindings().then((p) => setFindings(p.findings || [])).catch(() => {});
    return subscribeWallStream('alerts.changed', () => {
      fetchAlertFindings().then((p) => setFindings(p.findings || [])).catch(() => {});
    }, { surface: 'console' });
  }, []);

  const airports = useMemo(() => {
    const map = new Map();
    for (const flight of flights) {
      if (!isToday(flight.startTimeUTC)) continue;
      for (const airport of [flight.adep, flight.ades]) {
        const icao = airport?.icao;
        if (!icao || icao === 'UNK' || map.has(icao)) continue;
        map.set(icao, { icao, name: airport?.name || '' });
      }
    }
    const byIcao = new Map();
    for (const finding of findings) {
      if (finding.type !== 'NTM') continue;
      if (!byIcao.has(finding.icao)) byIcao.set(finding.icao, []);
      byIcao.get(finding.icao).push(finding);
    }
    return [...map.values()].map((airport) => ({
      ...airport,
      flagged: (byIcao.get(airport.icao) || []).map((finding) => ({
        id: finding.recordTitle || finding.id,
        color: keywordColor(finding.matchedKeywords),
        text: (finding.description || '').split('\n').pop(),
      })),
    }));
  }, [flights, findings]);

  const done = airports.filter((a) => checks[a.icao]).length;
  const allDone = airports.length > 0 && done === airports.length;

  return (
    <Card className="cw-fade" style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h3 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>Today's NOTAM check</h3>
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: '0.04em',
              color: allDone ? t.greenDeep : t.red,
              background: allDone ? t.greenTint : t.redTint,
              padding: '6px 12px',
              borderRadius: 8,
            }}
          >
            {allDone ? 'NOTAM CHECKED' : '!!! CHECK NOTAM !!!'}
          </span>
        </div>
        <span style={{ fontSize: 13, color: t.faint }}>
          {done} of {airports.length} airports checked · wall mirrors this state
        </span>
      </div>
      <p style={{ fontSize: 13.5, color: t.muted, margin: '0 0 16px' }}>
        Airports across today's flights, deduplicated. Keyword-matched NOTAMs are highlighted. Press CHECKED once
        you've reviewed each.
      </p>
      {airports.length === 0 && <EmptyState icon="clipboard-check" title="No flights today">No airports to check right now.</EmptyState>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {airports.map((airport) => {
          const checked = Boolean(checks[airport.icao]);
          const expanded = Boolean(showAll[airport.icao]);
          return (
            <div
              key={airport.icao}
              style={{
                border: `1px solid ${checked ? t.greenBorder : t.amberBorder}`,
                borderRadius: 12,
                overflow: 'hidden',
                background: checked ? '#f4faf6' : t.amberWash,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 16px' }}>
                <span style={{ fontFamily: t.mono, fontSize: 16, fontWeight: 700 }}>{airport.icao}</span>
                <span style={{ fontSize: 13, color: t.muted }}>{airport.name}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: t.amber, background: t.amberTint, padding: '3px 9px', borderRadius: 999 }}>
                  {airport.flagged.length} flagged
                </span>
                <div style={{ flex: 1 }} />
                <button
                  type="button"
                  onClick={() => setShowAll((prev) => ({ ...prev, [airport.icao]: !expanded }))}
                  style={{ fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: t.blue, background: 'transparent', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  {expanded ? 'Show flagged only' : 'Show all NOTAMs'}
                  <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={14} />
                </button>
                <Button
                  variant={checked ? 'successSoft' : 'primary'}
                  size="sm"
                  icon={checked ? 'check-check' : 'check'}
                  style={{ fontWeight: 700 }}
                  onClick={() => setChecks((prev) => ({ ...prev, [airport.icao]: !checked }))}
                >
                  {checked ? 'CHECKED' : 'Mark checked'}
                </Button>
              </div>
              <div style={{ padding: '0 16px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {airport.flagged.length === 0 && (
                  <div style={{ fontSize: 12.5, color: t.faint }}>No keyword-flagged NOTAMs for this airport.</div>
                )}
                {airport.flagged.map((notam) => (
                  <div
                    key={notam.id}
                    style={{
                      fontFamily: t.mono,
                      fontSize: 12.5,
                      lineHeight: 1.5,
                      background: '#fff',
                      border: `1px solid ${t.borderInner}`,
                      borderLeft: `3px solid ${notam.color}`,
                      borderRadius: 8,
                      padding: '9px 12px',
                      color: t.body,
                    }}
                  >
                    <span style={{ fontWeight: 600, color: t.ink }}>{notam.id}</span> — {notam.text}
                  </div>
                ))}
                {expanded && (
                  <PendingNote>
                    {/* TODO(backend): full per-airport NOTAM list needs the NOTAM-check endpoint (in-flight fix, not merged). Flagged records above come from the live alert scanner. */}
                    Full NOTAM list is coming with the NOTAM-check backend — flagged records above are live from the
                    alert scanner.
                  </PendingNote>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {airports.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <PendingNote>
            CHECKED state is per-session for now — persistence and the wall sign flip land with the NOTAM-check
            backend.
          </PendingNote>
        </div>
      )}
    </Card>
  );
}

// ── AIP / GEN send section (detail panel) ────────────────────────────────────
function SendSection({ flight }) {
  const { user } = useAuth();
  const [dep, setDep] = useState(true);
  const [arr, setArr] = useState(false);
  const [doc, setDoc] = useState('AIP');
  // TODO(backend): send stages ('fetching' → 'preparing' → 'sent'/'error')
  // activate once the email-delivery endpoint lands; the affordance below
  // already renders each stage.
  const [stage] = useState('idle');

  const stageRows = {
    fetching: [{ spin: true, text: 'Fetching document (checking cache, then source)…', weight: 700, color: t.blueDeep }],
    preparing: [
      { icon: 'check', iconColor: t.green, text: 'Document ready', weight: 600, color: t.body },
      { spin: true, text: 'Preparing email…', weight: 700, color: t.blueDeep },
    ],
    sent: [
      { icon: 'check', iconColor: t.green, text: 'Document ready', weight: 600, color: t.body },
      { icon: 'mail-check', iconColor: t.green, text: `Sent to ${user?.email || 'your inbox'}`, weight: 700, color: t.greenDeep },
    ],
    error: [{ icon: 'alert-triangle', iconColor: t.red, text: 'Source timed out — no document produced', weight: 700, color: t.red }],
  }[stage];

  const boxTone = {
    fetching: [t.blueBorder, t.blueWash],
    preparing: [t.blueBorder, t.blueWash],
    sent: [t.greenBorder, '#f1faf4'],
    error: [t.redBorder, '#fdf0f0'],
  }[stage] || [t.borderInner, t.subtle];

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
            <div key={row.text} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {row.spin ? <Spinner /> : <Icon name={row.icon} size={16} color={row.iconColor} />}
              <span style={{ fontSize: 13, fontWeight: row.weight, color: row.color }}>{row.text}</span>
            </div>
          ))}
        </div>
      )}
      <Button variant="primary" icon="send" disabled style={{ width: '100%', fontWeight: 700, padding: 12, borderRadius: 11 }}>
        Send document
      </Button>
      <div style={{ marginTop: 9 }}>
        <PendingNote>Email delivery backend is in flight — this control activates when it merges.</PendingNote>
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

      {impEntries.length > 0 && (
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${t.borderInner}`, background: t.amberWash }}>
          {impEntries.map((imp, index) => (
            <div key={imp.id} style={{ marginBottom: index === impEntries.length - 1 ? 0 : 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 8 }}>
                <ImpMark size={20} />
                <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.04em', color: t.amber }}>
                  IMPORTANT — {imp.title}
                </span>
              </div>
              <p style={{ fontSize: 13.5, lineHeight: 1.55, color: t.body, margin: 0, whiteSpace: 'pre-wrap' }}>{imp.description}</p>
            </div>
          ))}
          <div style={{ fontSize: 12, color: t.faint, marginTop: 8 }}>
            The wall shows only the "!" icon — the full text is read here.
          </div>
        </div>
      )}

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
  const [notamOpen, setNotamOpen] = useState(false);
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
        rows.push({ ...flight, registration: group.registration, oprId: group.oprId, operatorName: group.operatorName });
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
        desc="Pick a flight to control what the wall shows, run the daily NOTAM check, and send AIP / GEN documents to your inbox."
        actions={
          <Button icon="clipboard-check" onClick={() => setNotamOpen((v) => !v)}>
            Today's NOTAM check
          </Button>
        }
      />

      <HelpBanner
        items={[
          { title: 'Show / Close on wall', body: 'sends the selected flight to the digital wall. Only one flight is live at a time; the banner shows who opened it.' },
          { title: 'NOTAM check', body: 'review today\'s airports and press CHECKED per airport. The wall sign flips from CHECK NOTAM to NOTAM CHECKED once all are done.' },
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

      {notamOpen && <NotamCheckPanel flights={allFlights} />}

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
          columns="1.05fr 1.35fr .95fr 1.15fr .8fr .95fr"
          header={[
            { label: 'CALLSIGN', sort: true, onSort: () => sortHeader('callsign') },
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
            const hasImp = (flight.limitations || []).some((lim) => lim.type === 'IMP');
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
                  gridTemplateColumns: '1.05fr 1.35fr .95fr 1.15fr .8fr .95fr',
                  padding: '15px 18px',
                  borderBottom: `1px solid ${t.rowLine}`,
                  borderLeft: `3px solid ${isSel ? t.blue : 'transparent'}`,
                  alignItems: 'center',
                  background: isSel ? '#f6faff' : '#fff',
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontSize: 14.5, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                  {flight.flightNo}
                  {hasImp && <ImpMark />}
                </div>
                <div style={{ fontSize: 14, color: t.body, whiteSpace: 'nowrap' }}>
                  {flight.adep?.icao ?? 'UNK'} → {flight.ades?.icao ?? 'UNK'}
                </div>
                <div style={{ fontFamily: t.mono, fontSize: 13, color: t.body }}>{flight.registration}</div>
                <div style={{ fontSize: 14, color: t.body }}>{flight.operatorName || flight.oprId || '—'}</div>
                <div style={{ fontFamily: t.mono, fontSize: 13, color: t.body }}>{hmZ(flight.etd || flight.startTimeUTC)}</div>
                <div>
                  <StatusPill color={st.c} bg={st.b}>{status}</StatusPill>
                </div>
              </div>
            );
          })}
        </TableShell>

        <div style={{ width: 400, flex: 'none' }}>
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
