import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchAlertRules,
  fetchDigestConfig,
  fetchDisplayClocks,
  fetchDisplayDevices,
  fetchDisplaySettings,
  renameDisplayDevice,
  refreshFlightWeather,
  reportDisplayEnv,
  resetProfile,
  saveAlertRules,
  saveDigestConfig,
  saveDisplayClocks,
  saveDisplaySettings,
  triggerAlertScan,
} from '../../services/timelineApi';
import { collectViewportEnv, getDeviceId } from '../../services/device';
import { fetchCurrentUser } from '../../services/timelineApi';

// Which ACCOUNT's profile the sizing cards edit. null = your own view;
// the string carries the target account (the main wall signs in as
// ops@clearway.aero). Field names kept from the device era so the sizing
// cards below stay unchanged — deviceId IS the account key now.
const MAIN_WALL_ACCOUNT = 'ops@clearway.aero';
const DeviceCtx = createContext({ deviceId: null, device: null });
import Icon from './icons';
import ColoursCard from './ColoursCard';
import {
  Button,
  Card,
  ChipInput,
  Dropdown,
  ErrorBanner,
  FieldLabel,
  IconButton,
  LoadingState,
  MonoChip,
  PageHeader,
  PendingNote,
  SearchBox,
  Segmented,
  t,
  TextInput,
  useToast,
} from './ui';

// Settings — wall clocks + the NOTAM / alert filter (approved design).

function timeZoneOptions() {
  try {
    // V8/Chrome's list holds only IANA region zones — plain "UTC" (and the
    // Etc/* aliases) are NOT in it, so searching "utc" found nothing.
    // Prepend it: it's a valid Intl timeZone and the wall's main use case.
    const zones = Intl.supportedValuesOf('timeZone');
    return zones.includes('UTC') ? zones : ['UTC', ...zones];
  } catch {
    return ['UTC', 'Europe/Riga', 'Europe/London', 'America/New_York'];
  }
}

function cityFromZone(zone) {
  return (String(zone).split('/').pop() || zone).replaceAll('_', ' ');
}

function zoneTime(timeZone) {
  try {
    return new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone });
  } catch {
    return '--:--';
  }
}

function zoneAbbr(timeZone) {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone, timeZoneName: 'short' }).formatToParts(new Date());
    return parts.find((p) => p.type === 'timeZoneName')?.value || '';
  } catch {
    return '';
  }
}

// ── Wall clocks card ─────────────────────────────────────────────────────────
function ClocksCard() {
  const [clocks, setClocks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState('');
  const [query, setQuery] = useState('');
  const [, setTick] = useState(0);
  const dragIndex = useRef(null);
  const flash = useToast();
  const allZones = useMemo(() => timeZoneOptions(), []);

  useEffect(() => {
    fetchDisplayClocks()
      .then((payload) => setClocks(payload.clocks || []))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
    const id = setInterval(() => setTick((v) => v + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase().replaceAll(' ', '_');
    if (!q) return [];
    return allZones.filter((zone) => zone.toLowerCase().includes(q)).slice(0, 20);
  }, [allZones, query]);

  async function persist(next) {
    setError('');
    try {
      const payload = await saveDisplayClocks(next);
      setClocks(payload.clocks);
      flash('Clocks saved · wall updates in seconds');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function addClock(zone) {
    persist([...clocks, { label: label.trim() || cityFromZone(zone), timeZone: zone, home: clocks.length === 0 }]);
    setLabel('');
    setQuery('');
    setAdding(false);
  }

  function onDrop(index) {
    const from = dragIndex.current;
    dragIndex.current = null;
    if (from === null || from === index) return;
    const next = [...clocks];
    const [moved] = next.splice(from, 1);
    next.splice(index, 0, moved);
    persist(next);
  }

  return (
    <Card style={{ marginBottom: 22 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 }}>
        <h3 style={{ fontSize: 17, fontWeight: 800, margin: 0 }}>Wall clocks</h3>
        <Button variant="primary" size="sm" icon="plus" onClick={() => setAdding((v) => !v)}>
          Add clock
        </Button>
      </div>
      <p style={{ fontSize: 13.5, color: t.muted, margin: '0 0 16px' }}>
        Drag to reorder. The home clock is highlighted on the wall.
      </p>
      <ErrorBanner>{error}</ErrorBanner>
      {loading && <LoadingState>Loading clocks…</LoadingState>}

      {adding && (
        <div className="cw-fade" style={{ border: `1px solid ${t.blueBorder}`, background: t.blueWash, borderRadius: 12, padding: 14, marginBottom: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 10 }}>
            <TextInput placeholder="Label (optional)" value={label} onChange={(e) => setLabel(e.target.value)} />
            <SearchBox value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search city / time zone…" style={{ height: 'auto', padding: '0 13px' }} />
          </div>
          {matches.length > 0 && (
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 180, overflowY: 'auto' }}>
              {matches.map((zone) => (
                <button
                  key={zone}
                  type="button"
                  className="cw-hover-surface"
                  onClick={() => addClock(zone)}
                  style={{ textAlign: 'left', border: 'none', background: '#fff', borderRadius: 8, padding: '8px 11px', fontSize: 13, cursor: 'pointer', color: t.body }}
                >
                  <strong>{cityFromZone(zone)}</strong> · {zone} · {zoneTime(zone)}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
        {clocks.map((clock, index) => (
          <div
            key={`${clock.timeZone}-${index}`}
            draggable
            onDragStart={() => {
              dragIndex.current = index;
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => onDrop(index)}
            style={{ display: 'flex', alignItems: 'center', gap: 14, border: `1px solid ${t.borderInner}`, borderRadius: 12, padding: '12px 14px', background: t.subtle }}
          >
            <Icon name="grip-vertical" size={18} color={t.ghost} style={{ cursor: 'grab' }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>{clock.label}</div>
              <div style={{ fontSize: 12.5, color: t.faint }}>
                {clock.timeZone}
                {zoneAbbr(clock.timeZone) ? ` · ${zoneAbbr(clock.timeZone)}` : ''}
              </div>
            </div>
            <span style={{ fontFamily: t.mono, fontSize: 19, fontWeight: 600 }}>{zoneTime(clock.timeZone)}</span>
            <button
              type="button"
              onClick={() => persist(clocks.map((c, i) => ({ ...c, home: i === index ? !c.home : false })))}
              style={{
                fontFamily: 'inherit',
                fontSize: 12,
                fontWeight: 600,
                color: clock.home ? t.greenDeep : t.faint,
                background: clock.home ? t.greenTint : '#f1f2f4',
                border: 'none',
                padding: '6px 12px',
                borderRadius: 8,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Icon name="home" size={13} />
              {clock.home ? 'Home' : 'Set home'}
            </button>
            <IconButton icon="trash-2" title="Remove clock" onClick={() => persist(clocks.filter((_, i) => i !== index))} />
          </div>
        ))}
        {!loading && clocks.length === 0 && (
          <div style={{ fontSize: 13, color: t.faint }}>No clocks configured — the wall shows its defaults.</div>
        )}
      </div>

      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: t.faint, marginBottom: 10 }}>
        WALL CLOCK BAR PREVIEW
      </div>
      <div style={{ background: t.dark, borderRadius: 14, padding: '16px 22px', display: 'flex', justifyContent: 'space-around' }}>
        {(clocks.length > 0 ? clocks : [{ label: 'UTC', timeZone: 'UTC', home: false }]).map((clock, index) => (
          <div key={`${clock.timeZone}-${index}`} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', color: clock.home ? '#7dd3a8' : '#8a929c', marginBottom: 5 }}>
              {clock.label.toUpperCase()}
            </div>
            <div style={{ fontFamily: t.mono, fontSize: 26, fontWeight: 600, color: '#fff' }}>{zoneTime(clock.timeZone)}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ── Display scale card (ops-room legibility) ─────────────────────────────────
function timeAgoShort(iso) {
  if (!iso) return 'never';
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const h = Math.round(mins / 60);
  return h < 48 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}

/**
 * Per-ACCOUNT view settings: every signed-in account has its own DigitalWall
 * view profile; the big ops-room screen is signed in as ops@clearway.aero,
 * so "Main wall" edits that account's profile. Changing "My view" never
 * moves the big screen. Any console user may edit the main wall — console
 * access is the privilege gate.
 */
function AccountProfileCard({ selected, onSelect, myEmail, wallDevice }) {
  const rowStyle = (active) => ({
    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
    border: `1.5px solid ${active ? t.blue : t.borderInner}`, borderRadius: 11,
    cursor: 'pointer', marginBottom: 8, background: active ? '#f0f6ff' : t.card,
  });
  const flash = useToast();
  const env = wallDevice?.env || null;
  return (
    <Card style={{ marginBottom: 22 }}>
      <h3 style={{ fontSize: 17, fontWeight: 800, margin: '0 0 4px' }}>Whose view are you tuning?</h3>
      <p style={{ fontSize: 13.5, color: t.muted, margin: '0 0 14px' }}>
        View settings are per account. <strong>My view</strong> only changes how the wall looks on
        your own screens; <strong>Main wall</strong> edits the big ops-room display
        (signed in as {MAIN_WALL_ACCOUNT}).
      </p>
      <div style={rowStyle(selected === null)} onClick={() => onSelect(null)}>
        <Icon name="users" size={17} color={selected === null ? t.blue : t.faint} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14.5, fontWeight: 700 }}>My view</div>
          <div style={{ fontSize: 12.5, color: t.faint, fontFamily: t.mono }}>{myEmail || 'this account'}</div>
        </div>
        {selected === null && <MonoChip color="#1d4ed8" bg="#e3edff">editing</MonoChip>}
      </div>
      <div style={rowStyle(selected === MAIN_WALL_ACCOUNT)} onClick={() => onSelect(MAIN_WALL_ACCOUNT)}>
        <Icon name="plane" size={17} color={selected === MAIN_WALL_ACCOUNT ? t.blue : t.faint} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14.5, fontWeight: 700 }}>Main wall (ops room)</div>
          <div style={{ fontSize: 12.5, color: t.faint, fontFamily: t.mono }}>
            {MAIN_WALL_ACCOUNT}
            {env ? ` · ${env.innerWidth}×${env.innerHeight} css px · DPR ${env.devicePixelRatio}` : ''}
          </div>
        </div>
        {selected === MAIN_WALL_ACCOUNT && <MonoChip color="#92500b" bg="#fdf3e2">editing the BIG SCREEN</MonoChip>}
      </div>
      {selected === MAIN_WALL_ACCOUNT && (
        <Button
          size="sm"
          variant="soft"
          onClick={async () => {
            try {
              await resetProfile(MAIN_WALL_ACCOUNT);
              flash('Main wall reset to defaults');
            } catch (err) { flash(String(err.message || err), '#f87171'); }
          }}
        >
          Reset main wall to defaults
        </Button>
      )}
    </Card>
  );
}

function DisplayScaleCard() {
  const { deviceId } = useContext(DeviceCtx);
  const [scale, setScale] = useState(1.3);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const timerRef = useRef(null);
  const flash = useToast();

  useEffect(() => {
    fetchDisplaySettings(deviceId)
      .then((payload) => {
        if (Number.isFinite(payload.settings?.scale)) setScale(payload.settings.scale);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoaded(true));
    return () => clearTimeout(timerRef.current);
  }, []);

  function onChange(value) {
    const next = Number(value);
    setScale(next);
    // Debounced persist — the wall re-renders live via config.changed.
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      try {
        await saveDisplaySettings({ scale: next }, deviceId);
        flash(`Display scale ${next.toFixed(2)}× — wall updates in seconds`);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    }, 500);
  }

  return (
    <Card style={{ marginBottom: 22 }}>
      <h3 style={{ fontSize: 17, fontWeight: 800, margin: '0 0 4px' }}>Display scale</h3>
      <p style={{ fontSize: 13.5, color: t.muted, margin: '0 0 16px' }}>
        Global text/density scale for the wall — dial it up until timings are readable from across the ops room.
        Larger scale also shows fewer hours per screen so labels keep fitting.
      </p>
      <ErrorBanner>{error}</ErrorBanner>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <span style={{ fontSize: 12, color: t.faint }}>0.1×</span>
        <input
          type="range"
          min="0.1"
          max="2"
          step="0.05"
          value={scale}
          disabled={!loaded}
          onChange={(e) => onChange(e.target.value)}
          style={{ flex: 1, accentColor: t.blue }}
        />
        <span style={{ fontSize: 12, color: t.faint }}>2.0×</span>
        <span style={{ fontFamily: t.mono, fontSize: 16, fontWeight: 700, width: 64, textAlign: 'right' }}>
          {Number(scale).toFixed(2)}×
        </span>
      </div>
    </Card>
  );
}


// ── Hour spacing card (time-axis zoom) ───────────────────────────────────────
function HourSpacingCard() {
  const { deviceId } = useContext(DeviceCtx);
  const [timeZoom, setTimeZoom] = useState(1);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const timerRef = useRef(null);
  const flash = useToast();

  useEffect(() => {
    fetchDisplaySettings(deviceId)
      .then((payload) => {
        if (Number.isFinite(payload.settings?.timeZoom)) setTimeZoom(payload.settings.timeZoom);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoaded(true));
    return () => clearTimeout(timerRef.current);
  }, []);

  function onChange(value) {
    const next = Number(value);
    setTimeZoom(next);
    // Debounced persist — the wall re-renders live via config.changed. The
    // backend merges partial PUTs, so this never clobbers the scale.
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      try {
        await saveDisplaySettings({ timeZoom: next }, deviceId);
        flash(`Hour spacing ${next.toFixed(2)}× — wall updates in seconds`);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    }, 500);
  }

  return (
    <Card style={{ marginBottom: 22 }}>
      <h3 style={{ fontSize: 17, fontWeight: 800, margin: '0 0 4px' }}>Hour spacing</h3>
      <p style={{ fontSize: 13.5, color: t.muted, margin: '0 0 16px' }}>
        Horizontal distance between hour gridlines on the timeline. Lower fits more hours on screen;
        higher spreads them out so tight schedules stay readable.
      </p>
      <ErrorBanner>{error}</ErrorBanner>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <span style={{ fontSize: 12, color: t.faint }}>0.5×</span>
        <input
          type="range"
          min="0.5"
          max="2.5"
          step="0.05"
          value={timeZoom}
          disabled={!loaded}
          onChange={(e) => onChange(e.target.value)}
          style={{ flex: 1, accentColor: t.blue }}
        />
        <span style={{ fontSize: 12, color: t.faint }}>2.5×</span>
        <span style={{ fontFamily: t.mono, fontSize: 16, fontWeight: 700, width: 64, textAlign: 'right' }}>
          {Number(timeZoom).toFixed(2)}×
        </span>
        <Button size="sm" variant="soft" disabled={!loaded || Number(timeZoom) === 1} onClick={() => onChange(1)}>
          Reset
        </Button>
      </div>
    </Card>
  );
}

function VerticalSizingCard() {
  const { deviceId, device } = useContext(DeviceCtx);
  const DEFAULTS = { rowZoom: 1, pillHeight: 1, markerScale: 1, labelScale: 1 };
  const [values, setValues] = useState(DEFAULTS);
  const [autoFit, setAutoFit] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const timerRef = useRef(null);
  const flash = useToast();

  useEffect(() => {
    fetchDisplaySettings(deviceId)
      .then((payload) => {
        setValues((prev) => {
          const next = { ...prev };
          for (const key of Object.keys(DEFAULTS)) {
            if (Number.isFinite(payload.settings?.[key])) next[key] = payload.settings[key];
          }
          return next;
        });
        setAutoFit(payload.settings?.autoFitRows === true);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoaded(true));
    return () => clearTimeout(timerRef.current);
  }, []);

  function onChange(key, label, next) {
    setValues((prev) => ({ ...prev, [key]: next }));
    // Debounced persist; merge-safe PUT — each slider patches ONLY its key,
    // so none of the vertical knobs (or scale/timeZoom/…) clobber each other.
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      try {
        await saveDisplaySettings({ [key]: next }, deviceId);
        flash(`${label} ${next.toFixed(2)}× — wall updates in seconds`);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    }, 500);
  }

  const rows = [
    { key: 'rowZoom', label: 'Row spacing', hint: 'vertical space per aircraft row and gap between lanes', min: 0.02, max: 1.4 },
    { key: 'pillHeight', label: 'Pill height', hint: "the pill body's own thickness", min: 0.4, max: 1.4 },
    { key: 'markerScale', label: 'Marker size', hint: 'the IMP/CAA/WX/NTM chip row above the pill', min: 0.5, max: 1.3 },
    { key: 'labelScale', label: 'Label size', hint: 'flight ID and the route/times text', min: 0.5, max: 1.3 },
  ];

  return (
    <Card style={{ marginBottom: 22 }}>
      <h3 style={{ fontSize: 17, fontWeight: 800, margin: '0 0 4px' }}>Vertical sizing</h3>
      <p style={{ fontSize: 13.5, color: t.muted, margin: '0 0 16px' }}>
        Independent controls for how much vertical space each flight takes — row spacing, pill
        thickness, marker chips and labels each scale on their own. Horizontal/time-axis sizing
        is untouched. Hard floors keep everything legible at the minimums.
      </p>
      <ErrorBanner>{error}</ErrorBanner>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', border: `1px solid ${t.borderInner}`, borderRadius: 11, marginBottom: 14, background: autoFit ? '#f0f6ff' : t.card }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Auto-fit rows to the screen</div>
          <div style={{ fontSize: 12.5, color: t.faint, lineHeight: 1.5 }}>
            The wall measures its own viewport and computes the four knobs below so EVERY aircraft
            row fits — recomputed live as rows come and go. Sliders become ceilings while on; the
            legibility floors (fonts ≥7px, chips ≥10px) always win, and if rows still can't fit
            they render at the floor and the board scrolls.
          </div>
        </div>
        <Button
          size="sm"
          variant={autoFit ? 'primary' : 'soft'}
          disabled={!loaded}
          onClick={async () => {
            const next = !autoFit;
            setAutoFit(next);
            try {
              await saveDisplaySettings({ autoFitRows: next }, deviceId);
              flash(`Auto-fit ${next ? 'ON' : 'off'}${deviceId ? ' for this screen' : ' (defaults)'}`);
            } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
          }}
        >
          {autoFit ? 'Auto-fit ON' : 'Auto-fit off'}
        </Button>
      </div>
      {autoFit && device?.computedFit && (
        <div style={{ fontFamily: t.mono, fontSize: 12.5, color: t.muted, border: `1px dashed ${t.borderInner}`, borderRadius: 9, padding: '8px 12px', marginBottom: 14 }}>
          computed on this screen: ×{device.computedFit.factor} → row {device.computedFit.rowZoom?.toFixed(2)} ·
          pill {device.computedFit.pillHeight?.toFixed(2)} · marker {device.computedFit.markerScale?.toFixed(2)} ·
          label {device.computedFit.labelScale?.toFixed(2)} · {device.computedFit.fits ? 'all rows fit' : 'AT FLOOR — board scrolls'}
          {device.computedFit.availPx ? ` (${device.computedFit.requiredPx}px into ${device.computedFit.availPx}px)` : ''}
        </div>
      )}
      {rows.map((row) => (
        <WindowRow
          key={row.key}
          label={row.label}
          hint={row.hint}
          min={row.min}
          max={row.max}
          step={0.05}
          unit="×"
          value={values[row.key]}
          defaultValue={DEFAULTS[row.key]}
          loaded={loaded && !autoFit}
          onChange={(next) => onChange(row.key, row.label, next)}
        />
      ))}
    </Card>
  );
}

// Upcoming Flight Table (bug report 3 item 10): per-account enable, side,
// text size and width of the wall's right/left flight table.
function UpcomingTableCard() {
  const { deviceId } = useContext(DeviceCtx);
  const [enabled, setEnabled] = useState(false);
  const [side, setSide] = useState('right');
  const [tblScale, setTblScale] = useState(1);
  const [widthPct, setWidthPct] = useState(30);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const timerRef = useRef(null);
  const flash = useToast();

  useEffect(() => {
    fetchDisplaySettings(deviceId)
      .then((payload) => {
        setEnabled(payload.settings?.upcomingTableEnabled === true);
        setSide(payload.settings?.upcomingTableSide === 'left' ? 'left' : 'right');
        if (Number.isFinite(payload.settings?.upcomingTableScale)) setTblScale(payload.settings.upcomingTableScale);
        if (Number.isFinite(payload.settings?.upcomingTableWidthPct)) setWidthPct(payload.settings.upcomingTableWidthPct);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoaded(true));
    return () => clearTimeout(timerRef.current);
  }, []);

  function persist(patch, message) {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      try {
        await saveDisplaySettings(patch, deviceId);
        flash(message);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    }, 500);
  }

  return (
    <Card style={{ marginBottom: 22 }}>
      <h3 style={{ fontSize: 17, fontWeight: 800, margin: '0 0 4px' }}>Upcoming Flight Table</h3>
      <p style={{ fontSize: 13.5, color: t.muted, margin: '0 0 16px' }}>
        A side table on the wall listing every flight from 00:01 UTC today onward — FLIGHT
        coloured by the OPS checklist, ADEP/ADES by the SLOT &amp; HANDLING services, WX as
        coloured dots. Independent of the timeline's visibility window.
      </p>
      <ErrorBanner>{error}</ErrorBanner>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', border: `1px solid ${t.borderInner}`, borderRadius: 11, marginBottom: 14, background: enabled ? '#f0f6ff' : t.card }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Show the table on the wall</div>
          <div style={{ fontSize: 12.5, color: t.faint, lineHeight: 1.5 }}>
            The timeline shrinks to make room; pick the side it docks to.
          </div>
        </div>
        <Dropdown
          value={side}
          disabled={!loaded}
          options={[{ value: 'right', label: 'Right side' }, { value: 'left', label: 'Left side' }]}
          onChange={(next) => {
            setSide(next);
            persist({ upcomingTableSide: next }, `Table docked ${next} — wall updates in seconds`);
          }}
        />
        <Button
          size="sm"
          variant={enabled ? 'primary' : 'soft'}
          disabled={!loaded}
          onClick={() => {
            const next = !enabled;
            setEnabled(next);
            persist({ upcomingTableEnabled: next }, `Upcoming table ${next ? 'ON' : 'off'}`);
          }}
        >
          {enabled ? 'Table ON' : 'Table off'}
        </Button>
      </div>
      <WindowRow
        label="Table text size"
        hint="fonts and paddings inside the table"
        min={0.5}
        max={2}
        step={0.05}
        unit="×"
        value={tblScale}
        defaultValue={1}
        loaded={loaded}
        onChange={(next) => {
          setTblScale(next);
          persist({ upcomingTableScale: next }, `Table text ${next.toFixed(2)}× — wall updates in seconds`);
        }}
      />
      <WindowRow
        label="Table width"
        hint="share of the screen the table takes; the timeline gets the rest"
        min={15}
        max={60}
        step={1}
        unit="%"
        value={widthPct}
        defaultValue={30}
        loaded={loaded}
        onChange={(next) => {
          setWidthPct(next);
          persist({ upcomingTableWidthPct: next }, `Table width ${next}% — wall updates in seconds`);
        }}
      />
    </Card>
  );
}

// One row of the visibility-window card: label + slider + value + reset.
function WindowRow({ label, hint, min, max, step, unit, value, defaultValue, loaded, onChange }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 6 }}>
        <span style={{ fontSize: 13.5, fontWeight: 700 }}>{label}</span>
        <span style={{ fontSize: 12.5, color: t.faint }}>{hint}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <span style={{ fontSize: 12, color: t.faint }}>{min}{unit}</span>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={!loaded}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{ flex: 1, accentColor: t.blue }}
        />
        <span style={{ fontSize: 12, color: t.faint }}>{max}{unit}</span>
        <span style={{ fontFamily: t.mono, fontSize: 16, fontWeight: 700, width: 64, textAlign: 'right' }}>
          {value}{unit}
        </span>
        <Button size="sm" variant="soft" disabled={!loaded || value === defaultValue} onClick={() => onChange(defaultValue)}>
          Reset
        </Button>
      </div>
    </div>
  );
}

function PanelScalesCard() {
  const { deviceId } = useContext(DeviceCtx);
  const [overlayScale, setOverlayScale] = useState(1.3);
  const [sidebarScale, setSidebarScale] = useState(1.3);
  const [headerScale, setHeaderScale] = useState(1.3);
  const [acColScale, setAcColScale] = useState(1);
  const [mvtThresholdMin, setMvtThresholdMin] = useState(15);
  const [mvtFlashSeconds, setMvtFlashSeconds] = useState(1);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const timerRef = useRef(null);
  const flash = useToast();

  useEffect(() => {
    fetchDisplaySettings(deviceId)
      .then((payload) => {
        if (Number.isFinite(payload.settings?.overlayScale)) setOverlayScale(payload.settings.overlayScale);
        if (Number.isFinite(payload.settings?.sidebarScale)) setSidebarScale(payload.settings.sidebarScale);
        if (Number.isFinite(payload.settings?.headerScale)) setHeaderScale(payload.settings.headerScale);
        if (Number.isFinite(payload.settings?.acColScale)) setAcColScale(payload.settings.acColScale);
        if (Number.isFinite(payload.settings?.mvtThresholdMin)) setMvtThresholdMin(payload.settings.mvtThresholdMin);
        if (Number.isFinite(payload.settings?.mvtFlashSeconds)) setMvtFlashSeconds(payload.settings.mvtFlashSeconds);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoaded(true));
    return () => clearTimeout(timerRef.current);
  }, []);

  function persist(patch, message) {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      try {
        await saveDisplaySettings(patch, deviceId);
        flash(message);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    }, 500);
  }

  return (
    <Card style={{ marginBottom: 22 }}>
      <h3 style={{ fontSize: 17, fontWeight: 800, margin: '0 0 4px' }}>Overlay & sidebar size</h3>
      <p style={{ fontSize: 13.5, color: t.muted, margin: '0 0 16px' }}>
        Independent of the display scale: the flight overlay and the sidebars (clocks bar,
        status legend, limitations panel) each size on their own — changing the board scale
        no longer moves them.
      </p>
      <ErrorBanner>{error}</ErrorBanner>
      <WindowRow
        label="Overlay size"
        hint="the side overlay's text and layout"
        min={1}
        max={2}
        step={0.05}
        unit="×"
        value={overlayScale}
        defaultValue={1.3}
        loaded={loaded}
        onChange={(next) => {
          setOverlayScale(next);
          persist({ overlayScale: next }, `Overlay size ${next.toFixed(2)}× — wall updates in seconds`);
        }}
      />
      <WindowRow
        label="Sidebar size"
        hint="status legend and the limitations panel"
        min={0.3}
        max={2}
        step={0.05}
        unit="×"
        value={sidebarScale}
        defaultValue={1.3}
        loaded={loaded}
        onChange={(next) => {
          setSidebarScale(next);
          persist({ sidebarScale: next }, `Sidebar size ${next.toFixed(2)}× — wall updates in seconds`);
        }}
      />
      <WindowRow
        label="Top clock bar"
        hint="the time-zone clocks strip — shrink it to give rows more height"
        min={0.3}
        max={2}
        step={0.05}
        unit="×"
        value={headerScale}
        defaultValue={1.3}
        loaded={loaded}
        onChange={(next) => {
          setHeaderScale(next);
          persist({ headerScale: next }, `Top bar ${next.toFixed(2)}× — wall updates in seconds`);
        }}
      />
      <WindowRow
        label="MVT flash threshold"
        hint="minutes past expected departure (CTOT/ETD if set, else STD) before a flight with no T/O starts flashing"
        min={5}
        max={60}
        step={1}
        unit="m"
        value={mvtThresholdMin}
        defaultValue={15}
        loaded={loaded}
        onChange={(next) => {
          setMvtThresholdMin(next);
          persist({ mvtThresholdMin: next }, `MVT threshold ${next}m — wall updates in seconds`);
        }}
      />
      <WindowRow
        label="MVT flash period"
        hint="blink rate of the missing-movement contour"
        min={0.4}
        max={4}
        step={0.1}
        unit="s"
        value={mvtFlashSeconds}
        defaultValue={1}
        loaded={loaded}
        onChange={(next) => {
          setMvtFlashSeconds(next);
          persist({ mvtFlashSeconds: next }, `MVT flash ${next}s — wall updates in seconds`);
        }}
      />
      <WindowRow
        label="Aircraft column"
        hint="the left registration column — shrink it to give the timeline more width"
        min={0.2}
        max={1.5}
        step={0.05}
        unit="×"
        value={acColScale}
        defaultValue={1}
        loaded={loaded}
        onChange={(next) => {
          setAcColScale(next);
          persist({ acColScale: next }, `Aircraft column ${next.toFixed(2)}× — wall updates in seconds`);
        }}
      />
    </Card>
  );
}

function VisibilityWindowCard() {
  const [horizon, setHorizon] = useState(17);
  const [postLanding, setPostLanding] = useState(2);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const timerRef = useRef(null);
  const flash = useToast();

  useEffect(() => {
    fetchDisplaySettings()
      .then((payload) => {
        if (Number.isFinite(payload.settings?.upcomingHorizonHours)) setHorizon(payload.settings.upcomingHorizonHours);
        if (Number.isFinite(payload.settings?.postLandingHours)) setPostLanding(payload.settings.postLandingHours);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoaded(true));
    return () => clearTimeout(timerRef.current);
  }, []);

  function persist(patch, message) {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      try {
        await saveDisplaySettings(patch);
        flash(message);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    }, 500);
  }

  return (
    <Card style={{ marginBottom: 22 }}>
      <h3 style={{ fontSize: 17, fontWeight: 800, margin: '0 0 4px' }}>Flight visibility window</h3>
      <p style={{ fontSize: 13.5, color: t.muted, margin: '0 0 16px' }}>
        Which flights show, purely by timestamp: the visible window is [now − behind, now + ahead].
        A flight appears once its departure (ATD → ETD → STD) is inside the ahead window and drops
        off once its arrival (ATA → ETA → STA) is older than the behind window — no “has it landed”
        detection. Applies to the wall, console flight lists and the daily NOTAM/WX airport
        collection.
      </p>
      <ErrorBanner>{error}</ErrorBanner>
      <WindowRow
        label="Show ahead of now"
        hint="a flight appears once its departure time is within this many hours"
        min={1}
        max={72}
        step={1}
        unit="h"
        value={horizon}
        defaultValue={17}
        loaded={loaded}
        onChange={(next) => {
          setHorizon(next);
          persist({ upcomingHorizonHours: next }, `Ahead window ${next}h — wall updates in seconds`);
        }}
      />
      <WindowRow
        label="Show behind now"
        hint="a flight drops off once its arrival time is more than this many hours ago"
        min={0}
        max={24}
        step={0.5}
        unit="h"
        value={postLanding}
        defaultValue={2}
        loaded={loaded}
        onChange={(next) => {
          setPostLanding(next);
          persist({ postLandingHours: next }, `Behind window ${next}h — wall updates in seconds`);
        }}
      />
    </Card>
  );
}

// ── NOTAM / alert filter card ────────────────────────────────────────────────
// NOTAM rules are colored keyword groups (OPS filter): {group, color,
// terms[], patterns[]} — terms and wildcard patterns are editable per group.
// Weather keeps its flat keywords/regexes shape.
function tint(color) {
  return `${color}1a`;
}

function KeywordChipRow({ words, color, bg, mono = true, onRemove, onAdd, addKey, adding, setAdding, newWord, setNewWord }) {
  return (
    <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
      {words.map((word) => (
        <MonoChip key={word} color={color} bg={bg} onRemove={() => onRemove(word)}>
          {word}
        </MonoChip>
      ))}
      {adding === addKey ? (
        <input
          autoFocus
          value={newWord}
          onChange={(e) => setNewWord(e.target.value)}
          onBlur={() => {
            if (newWord.trim()) onAdd(newWord.trim());
            setAdding(null);
            setNewWord('');
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') {
              setNewWord('');
              setAdding(null);
            }
          }}
          style={{ fontFamily: mono ? t.mono : 'inherit', fontSize: 12.5, border: `1px solid ${color}`, borderRadius: 7, padding: '5px 10px', outline: 'none', width: 160 }}
        />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(addKey)}
          style={{ fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: t.faint, background: t.surface, border: `1px dashed ${t.borderInput}`, padding: '5px 11px', borderRadius: 7, cursor: 'pointer' }}
        >
          + Add
        </button>
      )}
    </div>
  );
}

function AlertFilterCard() {
  const [rules, setRules] = useState(null);
  const [rawMode, setRawMode] = useState(false);
  const [rawText, setRawText] = useState('');
  const [dirty, setDirty] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(null); // group key being added to
  const [newWord, setNewWord] = useState('');
  const flash = useToast();

  useEffect(() => {
    fetchAlertRules()
      .then((payload) => {
        setRules(payload.rules);
        setRawText(JSON.stringify(payload.rules, null, 2));
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  function mutate(path, next) {
    setRules((prev) => {
      const copy = structuredClone(prev);
      copy[path[0]][path[1]] = next;
      setRawText(JSON.stringify(copy, null, 2));
      return copy;
    });
    setDirty(true);
  }

  function mutateGroup(index, field, next) {
    setRules((prev) => {
      const copy = structuredClone(prev);
      copy.notamGroups[index][field] = next;
      setRawText(JSON.stringify(copy, null, 2));
      return copy;
    });
    setDirty(true);
  }

  async function save() {
    setSaving(true);
    setError('');
    try {
      const body = rawMode ? JSON.parse(rawText) : rules;
      const payload = await saveAlertRules(body);
      setRules(payload.rules);
      setRawText(JSON.stringify(payload.rules, null, 2));
      setDirty(false);
      flash('Alert rules saved · applies from the next scan');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function runScan() {
    if (scanning) return;
    setScanning(true);
    setError('');
    try {
      const payload = await triggerAlertScan();
      const scan = payload.lastScan;
      if (scan?.ok === false) setError(scan.error || 'Scan failed.');
      else
        flash(
          `Scan complete · ${scan?.flightsScanned ?? 0} flights, ${scan?.newFindings ?? 0} new finding${(scan?.newFindings ?? 0) === 1 ? '' : 's'}`
        );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setScanning(false);
    }
  }

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 }}>
        <h3 style={{ fontSize: 17, fontWeight: 800, margin: 0 }}>NOTAM / alert filter</h3>
        <div style={{ display: 'flex', gap: 10 }}>
          {dirty && (
            <Button variant="primary" size="sm" disabled={saving} spin={saving} onClick={save}>
              Save rules
            </Button>
          )}
          <Button variant="soft" size="sm" icon="code" onClick={() => setRawMode((v) => !v)}>
            {rawMode ? 'Friendly editor' : 'Advanced (raw JSON)'}
          </Button>
          <Button variant="primary" size="sm" icon="radar" spin={scanning} onClick={runScan}>
            {scanning ? 'Scanning…' : 'Run scan now'}
          </Button>
        </div>
      </div>
      <p style={{ fontSize: 13.5, color: t.muted, margin: '0 0 18px' }}>
        Keywords drive both the daily NOTAM check filtering and the NTM / WX flight badges — matched once per day
        alongside the 10:00 check.
      </p>
      <ErrorBanner>{error}</ErrorBanner>
      {!rules && !error && <LoadingState>Loading rules…</LoadingState>}

      {rules && rawMode && (
        <textarea
          value={rawText}
          spellCheck={false}
          onChange={(e) => {
            setRawText(e.target.value);
            setDirty(true);
          }}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            background: t.dark,
            color: '#c9ced6',
            border: 'none',
            borderRadius: 12,
            padding: 16,
            fontFamily: t.mono,
            fontSize: 12.5,
            lineHeight: 1.6,
            minHeight: 260,
            outline: 'none',
            resize: 'vertical',
            marginBottom: 18,
          }}
        />
      )}

      {rules && !rawMode && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 20 }}>
          {(rules.notamGroups || []).map((group, index) => (
            <div key={group.group} style={{ border: `1px solid ${t.borderInner}`, borderRadius: 12, padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 11 }}>
                <span style={{ width: 12, height: 12, borderRadius: 3, background: group.color }} />
                <span style={{ fontSize: 14, fontWeight: 700 }}>{group.group}</span>
                <span style={{ fontSize: 11.5, color: t.faint }}>NOTAM · keywords</span>
              </div>
              <KeywordChipRow
                words={group.terms || []}
                color={group.color}
                bg={tint(group.color)}
                onRemove={(word) => mutateGroup(index, 'terms', (group.terms || []).filter((w) => w !== word))}
                onAdd={(word) => mutateGroup(index, 'terms', [...new Set([...(group.terms || []), word.toUpperCase()])])}
                addKey={`g${index}-terms`}
                adding={adding}
                setAdding={setAdding}
                newWord={newWord}
                setNewWord={setNewWord}
              />
              {(group.patterns || []).length > 0 || adding === `g${index}-patterns` ? (
                <>
                  <div style={{ fontSize: 11.5, color: t.faint, margin: '10px 0 7px' }}>Wildcard patterns (regex — e.g. RWY…CLSD)</div>
                  <KeywordChipRow
                    words={group.patterns || []}
                    color={t.muted}
                    bg={t.wash}
                    onRemove={(word) => mutateGroup(index, 'patterns', (group.patterns || []).filter((w) => w !== word))}
                    onAdd={(word) => mutateGroup(index, 'patterns', [...new Set([...(group.patterns || []), word])])}
                    addKey={`g${index}-patterns`}
                    adding={adding}
                    setAdding={setAdding}
                    newWord={newWord}
                    setNewWord={setNewWord}
                  />
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setAdding(`g${index}-patterns`)}
                  style={{ fontFamily: 'inherit', fontSize: 11.5, fontWeight: 600, color: t.faint, background: 'transparent', border: 'none', padding: '8px 0 0', cursor: 'pointer' }}
                >
                  + Add wildcard pattern
                </button>
              )}
            </div>
          ))}
          <PendingNote>
            Group names and colors are editable in the raw JSON view; terms and patterns edit inline here.
          </PendingNote>
        </div>
      )}

      {rules && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 14 }}>
          <div style={{ border: `1px solid ${t.borderInner}`, borderRadius: 11, padding: '13px 15px' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: t.muted, marginBottom: 8 }}>Scan cadence</div>
            <div style={{ fontSize: 13, color: t.body, lineHeight: 1.45 }}>
              Once daily with the 10:00 NOTAM check (24 h look-ahead) — plus “Run scan now”. Weather is separate: CheckWX flight categories refresh with the same run (no keywords to tune).
            </div>
          </div>
          <div style={{ border: `1px solid ${t.borderInner}`, borderRadius: 11, padding: '13px 15px' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: t.muted, marginBottom: 8 }}>Notification recipient</div>
            <div style={{ fontSize: 13, color: t.body, lineHeight: 1.45 }}>
              Daily notification (no NOTAM content) via <span style={{ fontFamily: t.mono, fontSize: 12 }}>NOTAM_DIGEST_TO</span>.
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

// ── NOTAM digest card (console-editable; falls back to the env) ─────────────
function NotamDigestCard() {
  const [config, setConfig] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const flash = useToast();

  useEffect(() => {
    fetchDigestConfig()
      .then((payload) => setConfig(payload.config))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  async function persist(patch, message) {
    setSaving(true);
    setError('');
    try {
      const payload = await saveDigestConfig(patch);
      setConfig(payload.config);
      flash(message);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
    setSaving(false);
  }

  const recipients = config?.recipients ?? [];
  const usingEnv = recipients.length === 0;
  const effective = config?.effective ?? {};

  return (
    <Card style={{ marginBottom: 22 }}>
      <h3 style={{ fontSize: 17, fontWeight: 800, margin: '0 0 4px' }}>NOTAM digest</h3>
      <p style={{ fontSize: 13.5, color: t.muted, margin: '0 0 16px' }}>
        Who receives the daily NOTAM digest email, when the daily check runs, and how often the
        pending-airports reminder repeats. Cleared fields fall back to the server defaults.
      </p>
      <ErrorBanner>{error}</ErrorBanner>
      {!config && !error && <LoadingState>Loading digest config…</LoadingState>}
      {config && (
        <>
          <FieldLabel extra={usingEnv && effective.envRecipients?.length > 0 ? `using server default: ${effective.envRecipients.join(', ')}` : null}>
            Digest recipients
          </FieldLabel>
          <ChipInput
            values={recipients}
            placeholder="Add e-mail and press Enter…"
            chipColor="#1d4ed8"
            chipBg="#e8effe"
            onAdd={(value) => persist({ recipients: [...recipients, value] }, `Recipient added — digest goes to ${recipients.length + 1} address(es)`)}
            onRemove={(value) => persist({ recipients: recipients.filter((v) => v !== value) }, recipients.length - 1 === 0 ? 'Recipients cleared — using the server default' : 'Recipient removed')}
          />
          <div style={{ display: 'flex', gap: 26, flexWrap: 'wrap', marginTop: 16 }}>
            <div>
              <FieldLabel>Daily check hour ({effective.timeZone || 'Europe/Riga'})</FieldLabel>
              <Dropdown
                value={config.checkHour ?? 'default'}
                options={[{ value: 'default', label: `Default (${String(effective.checkHour).padStart(2, '0')}:00)` },
                  ...Array.from({ length: 24 }, (_, h) => ({ value: h, label: `${String(h).padStart(2, '0')}:00` }))]}
                onChange={(next) => persist(
                  { checkHour: next === 'default' ? null : next },
                  next === 'default' ? 'Check hour reset to default' : `Daily check moves to ${String(next).padStart(2, '0')}:00`
                )}
              />
            </div>
            <div>
              <FieldLabel>Reminder every</FieldLabel>
              <Dropdown
                value={config.reminderIntervalMin ?? 'default'}
                options={[{ value: 'default', label: `Default (${effective.reminderIntervalMin} min)` },
                  ...[30, 60, 90, 120, 180, 240, 360].map((m) => ({ value: m, label: `${m} min` }))]}
                onChange={(next) => persist(
                  { reminderIntervalMin: next === 'default' ? null : next },
                  next === 'default' ? 'Reminder cadence reset to default' : `Reminder every ${next} min while airports are unchecked`
                )}
              />
            </div>
          </div>
          <p style={{ fontSize: 12.5, color: t.faint, margin: '14px 0 0' }}>
            Effective now: digest → {effective.recipients?.length ? effective.recipients.join(', ') : '— nobody (set recipients!)'} ·
            check at {String(effective.checkHour).padStart(2, '0')}:00 · reminder every {effective.reminderIntervalMin} min.
            {saving ? ' Saving…' : ''}
          </p>
        </>
      )}
    </Card>
  );
}

// ── Weather card: manual trigger of the daily flight-weather pull ───────────
function WeatherCard() {
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState(null);
  const [error, setError] = useState('');
  const flash = useToast();

  return (
    <Card style={{ marginBottom: 22 }}>
      <h3 style={{ fontSize: 17, fontWeight: 800, margin: '0 0 4px' }}>Weather</h3>
      <p style={{ fontSize: 13.5, color: t.muted, margin: '0 0 14px' }}>
        Decoded METARs refresh automatically at 00:01 UTC for every airport with a flight from
        today through the end of tomorrow. Use the button after adding flights mid-day or if
        categories look stale — same pull, on demand.
      </p>
      <ErrorBanner>{error}</ErrorBanner>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <Button
          variant="primary"
          icon="cloud-download"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError('');
            try {
              const payload = await refreshFlightWeather();
              setLast(payload);
              flash(`Weather refreshed for ${payload.refreshed} airport(s) — wall updates in seconds`);
            } catch (err) {
              setError(err instanceof Error ? err.message : String(err));
            }
            setBusy(false);
          }}
        >
          {busy ? 'Fetching weather…' : 'Fetch weather now'}
        </Button>
        {last && !busy && (
          <span style={{ fontSize: 12.5, color: t.faint }}>
            last manual run: {last.refreshed} airport(s){last.lastRun?.at ? ` · ${String(last.lastRun.at).slice(11, 16)} UTC` : ''}
          </span>
        )}
      </div>
    </Card>
  );
}

export default function SettingsPage() {
  const [selectedAccount, setSelectedAccount] = useState(null); // null = my view
  const [devices, setDevices] = useState([]);
  const [myEmail, setMyEmail] = useState('');

  useEffect(() => {
    // Diagnostics registry (viewport readouts + auto-fit values).
    reportDisplayEnv({ deviceId: getDeviceId(), surface: 'console', env: collectViewportEnv() });
    fetchDisplayDevices().then((payload) => setDevices(payload.devices || [])).catch(() => {});
    fetchCurrentUser().then((r) => setMyEmail(r.user?.email || '')).catch(() => {});
  }, []);

  // The wall's newest device report supplies the auto-fit readout when
  // editing the main wall profile.
  const wallDevice = devices.find((d) => d.surface === 'wall') || null;

  // Sections: the page had grown into one endless scroll of cards — a
  // segmented switch groups them by what ops are actually trying to do.
  const [section, setSection] = useState('display');

  return (
    <div>
      <PageHeader
        title="Settings"
        desc="Wall display profiles, timeline content, clocks, and the NOTAM / alert / weather machinery."
        descMax={600}
      />
      <div style={{ margin: '0 0 18px', display: 'inline-block' }}>
        <Segmented
          value={section}
          onChange={setSection}
          options={[
            { value: 'display', label: 'Display & sizing' },
            { value: 'colours', label: 'Colours' },
            { value: 'wall', label: 'Wall content' },
            { value: 'checks', label: 'NOTAM, alerts & WX' },
          ]}
        />
      </div>
      {section === 'display' && (
        <>
          <AccountProfileCard selected={selectedAccount} onSelect={setSelectedAccount} myEmail={myEmail} wallDevice={wallDevice} />
          <DeviceCtx.Provider value={{ deviceId: selectedAccount, device: selectedAccount === MAIN_WALL_ACCOUNT ? wallDevice : null }}>
            {/* key remounts the cards so they re-fetch the selected profile */}
            <div key={selectedAccount ?? 'own'}>
              <DisplayScaleCard />
              <HourSpacingCard />
              <VerticalSizingCard />
              <PanelScalesCard />
              <UpcomingTableCard />
            </div>
          </DeviceCtx.Provider>
        </>
      )}
      {section === 'colours' && (
        <>
          {/* Same per-account model as the sizing cards: My view / Main wall
              selector + the amber BIG SCREEN warning live in this card. */}
          <AccountProfileCard selected={selectedAccount} onSelect={setSelectedAccount} myEmail={myEmail} wallDevice={wallDevice} />
          <DeviceCtx.Provider value={{ deviceId: selectedAccount, device: selectedAccount === MAIN_WALL_ACCOUNT ? wallDevice : null }}>
            <div key={selectedAccount ?? 'own'}>
              <ColoursCard deviceId={selectedAccount} />
            </div>
          </DeviceCtx.Provider>
        </>
      )}
      {section === 'wall' && (
        <>
          <VisibilityWindowCard />
          <ClocksCard />
        </>
      )}
      {section === 'checks' && (
        <>
          <NotamDigestCard />
          <WeatherCard />
          <AlertFilterCard />
        </>
      )}
    </div>
  );
}
