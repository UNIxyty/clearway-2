import { useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchAlertRules,
  fetchDisplayClocks,
  fetchDisplaySettings,
  saveAlertRules,
  saveDisplayClocks,
  saveDisplaySettings,
  triggerAlertScan,
} from '../../services/timelineApi';
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
function DisplayScaleCard() {
  const [scale, setScale] = useState(1.3);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const timerRef = useRef(null);
  const flash = useToast();

  useEffect(() => {
    fetchDisplaySettings()
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
        await saveDisplaySettings({ scale: next });
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
  const [timeZoom, setTimeZoom] = useState(1);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const timerRef = useRef(null);
  const flash = useToast();

  useEffect(() => {
    fetchDisplaySettings()
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
        await saveDisplaySettings({ timeZoom: next });
        flash(`Hour spacing ${next.toFixed(2)}\u00d7 \u2014 wall updates in seconds`);
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
        <span style={{ fontSize: 12, color: t.faint }}>0.5\u00d7</span>
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
        <span style={{ fontSize: 12, color: t.faint }}>2.5\u00d7</span>
        <span style={{ fontFamily: t.mono, fontSize: 16, fontWeight: 700, width: 64, textAlign: 'right' }}>
          {Number(timeZoom).toFixed(2)}\u00d7
        </span>
        <Button size="sm" variant="soft" disabled={!loaded || Number(timeZoom) === 1} onClick={() => onChange(1)}>
          Reset
        </Button>
      </div>
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
  return (
    <div>
      <PageHeader
        title="Settings"
        desc="Configure the wall clocks and the NOTAM / alert filter that drives automatic flagging."
        descMax={600}
      />
      <DisplayScaleCard />
      <HourSpacingCard />
      <ClocksCard />
      <AlertFilterCard />
    </div>
  );
}
