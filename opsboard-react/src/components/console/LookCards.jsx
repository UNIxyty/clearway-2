// The look cards of the wall's display settings (moved out of SettingsPage.jsx on 2026-11-11): display scale, hour
// spacing, vertical sizing, horizontal sizing, the chips on the pills, and the WindowRow slider they share. Two
// surfaces draw them: the ops console's Settings (SettingsPage.jsx, every profile) and the client's own view settings
// (../../client/ClientSettings.jsx, their account only). DeviceCtx names the ACCOUNT whose profile a card edits (null =
// the signed-in person's own); the client surface also passes `api` so the cards read and write through the client's
// own route (/api/client/view) instead of the ops one.
import { useContext, useEffect, useRef, useState } from 'react';
import { fetchDisplaySettings as fetchOpsDisplaySettings, saveDisplaySettings as saveOpsDisplaySettings } from '../../services/timelineApi';
import { errorText } from '../../services/errorText';
import useViewport from '../../hooks/useViewport';
import { Stepper } from './mobile';
import { Button, Card, ErrorBanner, t, Toggle, useToast } from './ui';

import { DeviceCtx } from './deviceCtx';
export { DeviceCtx };
/** The read and write a card uses: the client's own route when the context carries one, else the ops routes. */
function useSettingsApi() {
  const { api } = useContext(DeviceCtx);
  return api ?? { fetch: fetchOpsDisplaySettings, save: saveOpsDisplaySettings };
}

export function DisplayScaleCard() {
  const { deviceId } = useContext(DeviceCtx);
  const { fetch: fetchDisplaySettings, save: saveDisplaySettings } = useSettingsApi();
  const { width } = useViewport();
  const mobileUI = width < 1024;
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
      .catch((err) => setError(errorText(err)))
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
        setError(errorText(err));
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
      {mobileUI ? (
        <WindowRow
          label="Display scale"
          hint="global wall text/density scale"
          min={0.1}
          max={2}
          step={0.05}
          unit="×"
          value={Number(scale)}
          defaultValue={1.3}
          loaded={loaded}
          onChange={onChange}
        />
      ) : (
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
      )}
    </Card>
  );
}


// ── Hour spacing card (time-axis zoom) ───────────────────────────────────────
export function HourSpacingCard() {
  const { deviceId } = useContext(DeviceCtx);
  const { fetch: fetchDisplaySettings, save: saveDisplaySettings } = useSettingsApi();
  const { width } = useViewport();
  const mobileUI = width < 1024;
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
      .catch((err) => setError(errorText(err)))
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
        setError(errorText(err));
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
      {mobileUI ? (
        <WindowRow
          label="Hour spacing"
          hint="distance between hour gridlines"
          min={0.15}
          max={2.5}
          step={0.05}
          unit="×"
          value={Number(timeZoom)}
          defaultValue={1}
          loaded={loaded}
          onChange={onChange}
        />
      ) : (
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <span style={{ fontSize: 12, color: t.faint }}>0.5×</span>
        <input
          type="range"
          min="0.15"
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
      )}
    </Card>
  );
}

export function VerticalSizingCard() {
  const { deviceId, device } = useContext(DeviceCtx);
  const { fetch: fetchDisplaySettings, save: saveDisplaySettings } = useSettingsApi();
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
      .catch((err) => setError(errorText(err)))
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
        setError(errorText(err));
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', border: `1px solid ${t.borderInner}`, borderRadius: 11, marginBottom: 14, background: autoFit ? 'var(--cw-bg-selected)' : t.card }}>
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
            } catch (err) { setError(errorText(err)); }
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

// ── Horizontal sizing (bug report 7 item 3) ─────────────────────────────────────────────────────────────────
// Mirrors Vertical sizing. The horizontal axis IS time, so nothing here may move a flight against the hour ruler:
// these knobs size what sits BESIDE a pill on its lane (callsign, route/time line, chips, the reserved minimum
// length, padding, the gap to the next flight). Fewer collisions → fewer extra lanes → more rows on screen.
export function HorizontalSizingCard() {
  const { deviceId } = useContext(DeviceCtx);
  const { fetch: fetchDisplaySettings, save: saveDisplaySettings } = useSettingsApi();
  const DEFAULTS = { callsignScale: 1, routeScale: 1, chipSpacing: 1, minPillMinutes: 45, pillPadding: 1, laneGap: 1 };
  const FLOOR_DEFAULTS = { floorTextPx: 10, floorGapPx: 3 };
  const [values, setValues] = useState(DEFAULTS);
  const [autoFit, setAutoFit] = useState(false);
  // Minimums (bug report 7 follow-up item 3): real panel pixels, provisional until checked at the wall.
  const [floors, setFloors] = useState(FLOOR_DEFAULTS);
  const [check, setCheck] = useState({ floorsDistanceM: null, floorsCheckedAt: null });
  const [distance, setDistance] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const timerRef = useRef(null);
  const flash = useToast();

  useEffect(() => {
    fetchDisplaySettings(deviceId)
      .then((payload) => {
        setValues((prev) => {
          const next = { ...prev };
          for (const key of Object.keys(DEFAULTS)) if (Number.isFinite(payload.settings?.[key])) next[key] = payload.settings[key];
          return next;
        });
        setAutoFit(payload.settings?.autoFitHorizontal === true);
        setFloors({
          floorTextPx: Number.isFinite(payload.settings?.floorTextPx) ? payload.settings.floorTextPx : FLOOR_DEFAULTS.floorTextPx,
          floorGapPx: Number.isFinite(payload.settings?.floorGapPx) ? payload.settings.floorGapPx : FLOOR_DEFAULTS.floorGapPx,
        });
        setCheck({ floorsDistanceM: payload.settings?.floorsDistanceM ?? null, floorsCheckedAt: payload.settings?.floorsCheckedAt ?? null });
        if (payload.settings?.floorsDistanceM) setDistance(String(payload.settings.floorsDistanceM));
      })
      .catch((err) => setError(errorText(err)))
      .finally(() => setLoaded(true));
    return () => clearTimeout(timerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onChange(key, label, next, unit) {
    setValues((prev) => ({ ...prev, [key]: next }));
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      try {
        await saveDisplaySettings({ [key]: next }, deviceId);
        flash(`${label} ${unit === 'min' ? `${next} min` : `${Number(next).toFixed(2)}×`} — wall updates in seconds`);
      } catch (err) { setError(errorText(err)); }
    }, 500);
  }

  const rows = [
    { key: 'callsignScale', label: 'Callsign size', hint: 'the flight number in front of the pill (stops at the text minimum)', min: 0.5, max: 1.5, step: 0.05, unit: '×' },
    { key: 'routeScale', label: 'Route & time size', hint: 'the route/times line under the pill (stops at the text minimum)', min: 0.5, max: 1.5, step: 0.05, unit: '×' },
    { key: 'chipSpacing', label: 'Chip spacing', hint: 'gap between chips, and from the pill (stops at the spacing minimum); chip size is Marker size', min: 0.25, max: 2, step: 0.05, unit: '×' },
    { key: 'minPillMinutes', label: 'Minimum pill length', hint: 'space a short flight reserves on its lane (never shorter than the pill is tall)', min: 5, max: 45, step: 5, unit: 'min' },
    { key: 'pillPadding', label: 'Pill padding', hint: 'space inside the pill around the airport codes (stops at the spacing minimum)', min: 0.2, max: 2, step: 0.05, unit: '×' },
    { key: 'laneGap', label: 'Gap to next flight', hint: 'from a pill’s end to the next callsign in its lane (stops at the spacing minimum)', min: 0.15, max: 2, step: 0.05, unit: '×' },
  ];

  function onFloor(key, label, next) {
    setFloors((prev) => ({ ...prev, [key]: next }));
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      try {
        await saveDisplaySettings({ [key]: next }, deviceId);
        flash(`${label} ${next} px — wall updates in seconds`);
      } catch (err) { setError(errorText(err)); }
    }, 500);
  }
  async function recordCheck() {
    const metres = Number(String(distance).replace(',', '.'));
    if (!Number.isFinite(metres) || metres < 0.5 || metres > 40) { setError('Enter the viewing distance in metres (0.5 – 40).'); return; }
    const at = new Date().toISOString();
    try {
      await saveDisplaySettings({ floorsDistanceM: metres, floorsCheckedAt: at, ...floors }, deviceId);
      setCheck({ floorsDistanceM: metres, floorsCheckedAt: at });
      setError('');
      flash(`Minimums recorded: text ${floors.floorTextPx} px, spacing ${floors.floorGapPx} px, read from ${metres} m`);
    } catch (err) { setError(errorText(err)); }
  }

  return (
    <Card style={{ marginBottom: 22 }}>
      <h3 style={{ fontSize: 17, fontWeight: 800, margin: '0 0 4px' }}>Horizontal sizing</h3>
      <p style={{ fontSize: 13.5, color: t.muted, margin: '0 0 16px' }}>
        The horizontal axis is time, so none of these moves a flight against the hour ruler: they shrink what sits
        beside each pill. On this wall labels never print over each other — a flight that would collide drops to a new
        lane, and extra lanes push rows off the screen; smaller labels and gaps mean fewer lanes and more rows. To cover
        more hours instead, use <b>Hour spacing</b> above (hours visible across the screen) and the upcoming /
        post-landing windows under Wall content (which flights are on the board at all).
      </p>
      <ErrorBanner>{error}</ErrorBanner>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', border: `1px solid ${t.borderInner}`, borderRadius: 11, marginBottom: 14, background: autoFit ? 'var(--cw-bg-selected)' : t.card }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Auto-fit horizontal sizes</div>
          <div style={{ fontSize: 12.5, color: t.faint, lineHeight: 1.5 }}>
            The wall shrinks the six knobs below together, just enough that labels stop forcing extra lanes in the
            busiest rows, and no further — recomputed live as flights come and go. Sliders become ceilings while on;
            the floors always win.
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
              await saveDisplaySettings({ autoFitHorizontal: next }, deviceId);
              flash(`Horizontal auto-fit ${next ? 'ON' : 'off'}`);
            } catch (err) { setError(errorText(err)); }
          }}
        >
          {autoFit ? 'Auto-fit ON' : 'Auto-fit off'}
        </Button>
      </div>
      {rows.map((row) => (
        <WindowRow
          key={row.key}
          label={row.label}
          hint={row.hint}
          min={row.min}
          max={row.max}
          step={row.step}
          unit={row.unit === 'min' ? ' min' : '×'}
          value={values[row.key]}
          defaultValue={DEFAULTS[row.key]}
          loaded={loaded}
          onChange={(next) => onChange(row.key, row.label, next, row.unit)}
        />
      ))}
      <div style={{ marginTop: 8, paddingTop: 14, borderTop: `1px solid ${t.borderInner}` }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>Minimums</div>
        <div style={{ fontSize: 12.5, color: t.faint, lineHeight: 1.5, margin: '2px 0 10px' }}>
          How small the sliders above (and Auto-fit) may make text and gaps, in real panel pixels — the same on a wall at
          90 % or 100 % browser zoom. They only stop shrinking; they never enlarge what the wall shows at 1×.
        </div>
        <div style={{ fontSize: 12.5, lineHeight: 1.5, marginBottom: 12, padding: '8px 12px', borderRadius: 9, background: check.floorsCheckedAt ? t.greenTint : t.amberTint, color: check.floorsCheckedAt ? t.greenDeep : t.amber }}>
          {check.floorsCheckedAt
            ? `Checked at the wall on ${String(check.floorsCheckedAt).slice(0, 10)}, read from ${check.floorsDistanceM} m.`
            : 'Provisional — not yet checked at the wall. To set them: stand where ops normally read the wall, drag every slider above to its left end, and read one callsign, one route and one time aloud. If any is hard to read, raise the minimum here until all three are easy. Then enter the distance and press Record.'}
        </div>
        <WindowRow label="Text minimum" hint="callsign and route / time text" min={6} max={24} step={0.5} unit=" px" value={floors.floorTextPx} defaultValue={FLOOR_DEFAULTS.floorTextPx} loaded={loaded} onChange={(next) => onFloor('floorTextPx', 'Text minimum', next)} />
        <WindowRow label="Spacing minimum" hint="chip gaps, pill padding, gap to the next flight" min={1} max={12} step={0.5} unit=" px" value={floors.floorGapPx} defaultValue={FLOOR_DEFAULTS.floorGapPx} loaded={loaded} onChange={(next) => onFloor('floorGapPx', 'Spacing minimum', next)} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <label style={{ fontSize: 13.5, fontWeight: 600 }} htmlFor="floors-distance">Viewing distance</label>
          <input id="floors-distance" type="text" inputMode="decimal" value={distance} disabled={!loaded} onChange={(e) => setDistance(e.target.value)} placeholder="e.g. 4.5" style={{ width: 80, height: 34, padding: '0 10px', borderRadius: 8, border: `1px solid ${t.border}`, fontSize: 14 }} />
          <span style={{ fontSize: 13, color: t.faint }}>m</span>
          <Button size="sm" variant="primary" disabled={!loaded || !distance} onClick={recordCheck}>Record wall check</Button>
        </div>
      </div>
    </Card>
  );
}

// ── Chips on the pills (bug report 7 item 5) ────────────────────────────────────────────────────────────────
export function ChipsCard() {
  const { deviceId } = useContext(DeviceCtx);
  const { fetch: fetchDisplaySettings, save: saveDisplaySettings } = useSettingsApi();
  const KEYS = [
    { key: 'chipImp', label: 'Important (!)', stops: 'the Important limitation mark on a flight' },
    { key: 'chipCaa', label: 'CAA', stops: 'the CAA authority-details mark' },
    { key: 'chipNtm', label: 'NOTAM (NTM)', stops: 'the unreviewed-NOTAM alert on a flight' },
    { key: 'chipWx', label: 'WX', stops: 'weather marking — on the wall that is the colour of the airport codes; chips on phone and tablet' },
  ];
  const [values, setValues] = useState({ chipImp: true, chipCaa: true, chipNtm: true, chipWx: true });
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const flash = useToast();
  useEffect(() => {
    fetchDisplaySettings(deviceId)
      .then((payload) => setValues(Object.fromEntries(KEYS.map((k) => [k.key, payload.settings?.[k.key] !== false]))))
      .catch((err) => setError(errorText(err)))
      .finally(() => setLoaded(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  async function toggle(k) {
    const next = !values[k.key];
    setValues((prev) => ({ ...prev, [k.key]: next }));
    try {
      await saveDisplaySettings({ [k.key]: next }, deviceId);
      flash(`${k.label} chip ${next ? 'shown' : 'hidden'} — wall updates in seconds`);
    } catch (err) { setValues((prev) => ({ ...prev, [k.key]: !next })); setError(errorText(err)); }
  }
  const hidden = KEYS.filter((k) => values[k.key] === false);
  return (
    <Card style={{ marginBottom: 22 }}>
      <h3 style={{ fontSize: 17, fontWeight: 800, margin: '0 0 4px' }}>Chips on the pills</h3>
      <p style={{ fontSize: 13.5, color: t.muted, margin: '0 0 6px' }}>
        Which warning chips the wall shows after each pill. A hidden chip leaves no gap; the row closes up.
      </p>
      <p style={{ fontSize: 13, color: t.redDeep, margin: '0 0 14px', fontWeight: 600 }}>
        Each chip is a real warning: switching one off means nobody looking at the wall sees it — the information is still
        in the Console and the flight overlay.
      </p>
      <ErrorBanner>{error}</ErrorBanner>
      {KEYS.map((k) => (
        <div key={k.key} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0', borderTop: `1px solid ${t.borderInner}` }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{k.label}</div>
            <div style={{ fontSize: 12.5, color: values[k.key] === false ? t.redDeep : t.faint }}>{values[k.key] === false ? `Hidden: the wall no longer shows ${k.stops}.` : `Shows ${k.stops}.`}</div>
          </div>
          <Toggle on={values[k.key] !== false} disabled={!loaded} onToggle={() => void toggle(k)} />
        </div>
      ))}
      {hidden.length > 0 && <div style={{ fontSize: 12.5, color: t.muted, marginTop: 8 }}>{hidden.length} chip type{hidden.length === 1 ? '' : 's'} hidden on this profile.</div>}
    </Card>
  );
}

// Upcoming Flight Table (bug report 3 item 10): per-account enable, side,
// text size and width of the wall's right/left flight table.
export function WindowRow({ label, hint, min, max, step, unit, value, defaultValue, loaded, onChange }) {
  const { width } = useViewport();
  if (width < 1024) {
    return (
      <div style={{ marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 11 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 13.5, fontWeight: 600, color: t.ink, flex: 1, minWidth: 0 }}>{label}</span>
          <Stepper
            value={value}
            min={min}
            max={max}
            step={step}
            disabled={!loaded}
            onChange={onChange}
            format={(v) => `${v}${unit}`}
          />
        </div>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={!loaded}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{ width: '100%', height: 28, accentColor: t.blue, margin: 0 }}
        />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <span style={{ fontFamily: t.mono, fontSize: 10.5, color: t.faint }}>{min}{unit}</span>
          <span style={{ fontSize: 11.5, color: t.faint, flex: 1, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {value === defaultValue ? hint : (
              <button
                type="button"
                onClick={() => onChange(defaultValue)}
                disabled={!loaded}
                style={{
                  fontFamily: 'inherit',
                  display: 'inline-flex',
                  alignItems: 'center',
                  height: 36,
                  padding: '0 12px',
                  borderRadius: 9,
                  border: `1px solid ${t.border}`,
                  background: t.card,
                  fontSize: 12.5,
                  fontWeight: 700,
                  color: t.body,
                  cursor: 'pointer',
                }}
              >
                Reset
              </button>
            )}
          </span>
          <span style={{ fontFamily: t.mono, fontSize: 10.5, color: t.faint }}>{max}{unit}</span>
        </div>
      </div>
    );
  }
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

