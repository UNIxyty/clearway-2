import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchAlertRules,
  fetchDisplayClocks,
  fetchDisplayDevices,
  fetchDisplaySettings,
  renameDisplayDevice,
  reportDisplayEnv,
  resetDeviceProfile,
  saveAlertRules,
  saveDisplayClocks,
  saveDisplaySettings,
  triggerAlertScan,
} from '../../services/timelineApi';
import { collectViewportEnv, getDeviceId } from '../../services/device';

// Item 3 (wall sizing): which screen's profile the sizing cards edit.
// null = the shared defaults (screens without their own profile).
const DeviceCtx = createContext({ deviceId: null, device: null });
import Icon from './icons';
import {
  Button,
  Card,
  ErrorBanner,
  IconButton,
  LoadingState,
  MonoChip,
  PageHeader,
  PendingNote,
  SearchBox,
  t,
  TextInput,
  useToast,
} from './ui';

// Settings — wall clocks + the NOTAM / alert filter (approved design).

function timeZoneOptions() {
  try {
    return Intl.supportedValuesOf('timeZone');
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
 * Item 3 (wall sizing): pick WHICH screen the sizing cards below edit.
 * Each browser/device has a stable id; the wall keeps its own profile so
 * desktop tuning can't resize it. "Defaults" edits every screen that has
 * no profile of its own. The list doubles as the Item-1 diagnostic: each
 * device shows the viewport it actually reported.
 */
function DeviceProfileCard({ selected, onSelect, devices, onReload }) {
  const myId = getDeviceId();
  const flash = useToast();
  const [renaming, setRenaming] = useState('');
  const [newLabel, setNewLabel] = useState('');

  const rowStyle = (active) => ({
    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
    border: `1.5px solid ${active ? t.blue : t.borderInner}`, borderRadius: 11,
    cursor: 'pointer', marginBottom: 8, background: active ? '#f0f6ff' : t.card,
  });

  return (
    <Card style={{ marginBottom: 22 }}>
      <h3 style={{ fontSize: 17, fontWeight: 800, margin: '0 0 4px' }}>Which screen are you tuning?</h3>
      <p style={{ fontSize: 13.5, color: t.muted, margin: '0 0 14px' }}>
        Sizing settings are per screen. The cards below edit the selected profile only —
        changing this device's sliders never resizes the ops wall, and vice versa.
        Screens appear here after loading the wall or this page once.
      </p>
      <div style={rowStyle(selected === null)} onClick={() => onSelect(null)}>
        <Icon name="users" size={17} color={selected === null ? t.blue : t.faint} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14.5, fontWeight: 700 }}>Defaults</div>
          <div style={{ fontSize: 12.5, color: t.faint }}>every screen without its own profile</div>
        </div>
        {selected === null && <MonoChip color="#1d4ed8" bg="#e3edff">editing</MonoChip>}
      </div>
      {devices.map((device) => {
        const env = device.env || {};
        const active = selected === device.deviceId;
        const isMe = device.deviceId === myId;
        return (
          <div key={device.deviceId} style={rowStyle(active)} onClick={() => onSelect(device.deviceId)}>
            <Icon name={device.surface === 'wall' ? 'plane' : 'settings'} size={17} color={active ? t.blue : t.faint} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14.5, fontWeight: 700, display: 'flex', gap: 8, alignItems: 'center' }}>
                {renaming === device.deviceId ? (
                  <input
                    autoFocus
                    value={newLabel}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setNewLabel(e.target.value)}
                    onKeyDown={async (e) => {
                      if (e.key === 'Enter') {
                        try {
                          await renameDisplayDevice(device.deviceId, newLabel);
                          setRenaming('');
                          onReload();
                          flash('Screen renamed');
                        } catch (err) { flash(String(err.message || err), '#f87171'); }
                      }
                      if (e.key === 'Escape') setRenaming('');
                    }}
                    style={{ fontSize: 14, padding: '2px 6px', border: `1px solid ${t.borderInput}`, borderRadius: 6 }}
                  />
                ) : (
                  <>{device.label || `${device.surface === 'wall' ? 'Wall display' : 'Console browser'}`}</>
                )}
                {isMe && <MonoChip color="#0f766e" bg="#e6f6f3">this device</MonoChip>}
                {device.hasProfile ? (
                  <MonoChip color="#92500b" bg="#fdf3e2">own profile</MonoChip>
                ) : (
                  <MonoChip color="#6c7079" bg="#eef1f5">uses defaults</MonoChip>
                )}
              </div>
              <div style={{ fontSize: 12.5, color: t.faint, fontFamily: t.mono, marginTop: 2 }}>
                {env.innerWidth ? `${env.innerWidth}×${env.innerHeight} css px · DPR ${env.devicePixelRatio} · screen ${env.screenWidth}×${env.screenHeight}` : 'no viewport report yet'}
                {' · seen '}{timeAgoShort(device.lastSeenAt)}
              </div>
            </div>
            <IconButton
              icon="pencil"
              title="Rename screen"
              onClick={(e) => { e.stopPropagation(); setRenaming(device.deviceId); setNewLabel(device.label || ''); }}
            />
            {device.hasProfile && (
              <Button
                size="sm"
                variant="soft"
                onClick={async (e) => {
                  e.stopPropagation();
                  try {
                    await resetDeviceProfile(device.deviceId);
                    onReload();
                    flash('Profile removed — screen follows Defaults again');
                  } catch (err) { flash(String(err.message || err), '#f87171'); }
                }}
              >
                Use defaults
              </Button>
            )}
            {active && <MonoChip color="#1d4ed8" bg="#e3edff">editing</MonoChip>}
          </div>
        );
      })}
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
        <span style={{ fontSize: 12, color: t.faint }}>1.0×</span>
        <input
          type="range"
          min="1"
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
    { key: 'rowZoom', label: 'Row spacing', hint: 'vertical space per aircraft row and gap between lanes', min: 0.4, max: 1.4 },
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
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const timerRef = useRef(null);
  const flash = useToast();

  useEffect(() => {
    fetchDisplaySettings(deviceId)
      .then((payload) => {
        if (Number.isFinite(payload.settings?.overlayScale)) setOverlayScale(payload.settings.overlayScale);
        if (Number.isFinite(payload.settings?.sidebarScale)) setSidebarScale(payload.settings.sidebarScale);
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
        hint="clocks bar, status legend and the limitations panel"
        min={1}
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

export default function SettingsPage() {
  const [selectedDevice, setSelectedDevice] = useState(null); // null = Defaults
  const [devices, setDevices] = useState([]);

  async function loadDevices() {
    try {
      const payload = await fetchDisplayDevices();
      setDevices(payload.devices || []);
    } catch { /* list is best-effort */ }
  }

  useEffect(() => {
    // Register THIS browser so it appears as a selectable profile target
    // (also the Item-1 diagnostic readout for desktops).
    reportDisplayEnv({ deviceId: getDeviceId(), surface: 'console', env: collectViewportEnv() });
    loadDevices();
  }, []);

  const selectedInfo = devices.find((d) => d.deviceId === selectedDevice) || null;

  return (
    <div>
      <PageHeader
        title="Settings"
        desc="Configure the wall clocks and the NOTAM / alert filter that drives automatic flagging."
        descMax={600}
      />
      <DeviceProfileCard selected={selectedDevice} onSelect={setSelectedDevice} devices={devices} onReload={loadDevices} />
      <DeviceCtx.Provider value={{ deviceId: selectedDevice, device: selectedInfo }}>
        {/* key remounts the cards so they re-fetch the selected profile */}
        <div key={selectedDevice ?? 'default'}>
          <DisplayScaleCard />
          <HourSpacingCard />
          <VerticalSizingCard />
          <PanelScalesCard />
        </div>
      </DeviceCtx.Provider>
      <VisibilityWindowCard />
      <ClocksCard />
      <AlertFilterCard />
    </div>
  );
}
