import { useEffect, useMemo, useState } from 'react';
import {
  fetchAlertRules,
  fetchDisplayClocks,
  saveAlertRules,
  saveDisplayClocks,
  triggerAlertScan,
} from '../../services/timelineApi';
import { ui } from './ui';

// Settings — configurable city clocks for the wall display (Feature 1).
// Timezone choices come from the browser's own IANA database
// (Intl.supportedValuesOf), so no city list needs shipping or maintaining.

function timeZoneOptions() {
  try {
    return Intl.supportedValuesOf('timeZone');
  } catch {
    return ['UTC', 'Europe/Riga', 'Europe/Paris', 'Europe/London', 'America/New_York'];
  }
}

function cityFromZone(zone) {
  const tail = String(zone).split('/').pop() || zone;
  return tail.replaceAll('_', ' ');
}

function previewTime(timeZone) {
  try {
    return new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone });
  } catch {
    return '--:--';
  }
}

export default function SettingsPage() {
  const [clocks, setClocks] = useState([]);
  const [query, setQuery] = useState('');
  const [label, setLabel] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedAt, setSavedAt] = useState(0);
  const allZones = useMemo(timeZoneOptions, []);

  useEffect(() => {
    (async () => {
      try {
        const payload = await fetchDisplayClocks();
        setClocks(payload.clocks || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase().replaceAll(' ', '_');
    if (!q) return [];
    return allZones.filter((zone) => zone.toLowerCase().includes(q)).slice(0, 25);
  }, [allZones, query]);

  async function persist(next) {
    setSaving(true);
    setError('');
    try {
      const payload = await saveDisplayClocks(next);
      setClocks(payload.clocks);
      setSavedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  function addClock(zone) {
    const next = [
      ...clocks,
      { label: label.trim() || cityFromZone(zone), timeZone: zone, home: false },
    ];
    setQuery('');
    setLabel('');
    persist(next);
  }

  function removeClock(index) {
    persist(clocks.filter((_, i) => i !== index));
  }

  function moveClock(index, delta) {
    const target = index + delta;
    if (target < 0 || target >= clocks.length) return;
    const next = [...clocks];
    [next[index], next[target]] = [next[target], next[index]];
    persist(next);
  }

  function setHome(index) {
    persist(clocks.map((clock, i) => ({ ...clock, home: i === index ? !clock.home : false })));
  }

  function renameClock(index, value) {
    setClocks((prev) => prev.map((clock, i) => (i === index ? { ...clock, label: value } : clock)));
  }

  return (
    <div style={ui.page}>
      <div style={ui.top}>
        <div>
          <div style={ui.title}>Settings — Display clocks</div>
          <div style={ui.subtitle}>
            The wall updates within seconds of saving; changes survive reloads and redeploys.
          </div>
        </div>
        {saving && <span style={{ fontSize: 11, color: '#6f7fa8' }}>Saving…</span>}
        {!saving && savedAt > 0 && <span style={{ fontSize: 11, color: '#8fdcae' }}>Saved ✓</span>}
      </div>

      {error && <div style={ui.error}>{error}</div>}
      {loading && <div style={ui.loading}>Loading clock configuration…</div>}

      {!loading && (
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 14, alignItems: 'start' }}>
          <div style={ui.card}>
            <div style={ui.cardTitle}>Configured clocks (shown left to right)</div>
            {clocks.length === 0 && <div style={ui.empty}>No clocks configured — the wall shows defaults.</div>}
            {clocks.map((clock, index) => (
              <div key={`${clock.timeZone}-${index}`} style={s.clockRow}>
                <span style={s.preview}>{previewTime(clock.timeZone)}</span>
                <input
                  style={{ ...ui.input, width: 130 }}
                  value={clock.label}
                  onChange={(e) => renameClock(index, e.target.value)}
                  onBlur={() => persist(clocks)}
                  title="Clock label"
                />
                <span style={s.zone}>{clock.timeZone}</span>
                <div style={{ display: 'flex', gap: 4, marginLeft: 'auto', alignItems: 'center' }}>
                  <button
                    style={{ ...ui.softBtn, ...(clock.home ? { borderColor: '#41639e', color: '#8ec4ff' } : {}) }}
                    onClick={() => setHome(index)}
                    title="Highlight as home base"
                  >
                    {clock.home ? '★ Home' : '☆ Home'}
                  </button>
                  <button style={ui.softBtn} disabled={index === 0} onClick={() => moveClock(index, -1)}>↑</button>
                  <button style={ui.softBtn} disabled={index === clocks.length - 1} onClick={() => moveClock(index, 1)}>↓</button>
                  <button style={ui.btnDanger} onClick={() => removeClock(index)}>Remove</button>
                </div>
              </div>
            ))}
          </div>

          <div style={ui.card}>
            <div style={ui.cardTitle}>Add a clock</div>
            <input
              style={{ ...ui.input, width: '100%', marginBottom: 8, boxSizing: 'border-box' }}
              placeholder="Custom label (optional — defaults to the city name)"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
            <input
              style={{ ...ui.input, width: '100%', boxSizing: 'border-box' }}
              placeholder="Search city / time zone (e.g. Dubai, New York, Tokyo)"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {matches.length > 0 && (
              <div style={ui.resultList}>
                {matches.map((zone) => (
                  <button key={zone} type="button" style={ui.resultItem} onClick={() => addClock(zone)}>
                    <b>{cityFromZone(zone)}</b> · {zone} · {previewTime(zone)}
                  </button>
                ))}
              </div>
            )}
            {query && matches.length === 0 && (
              <div style={{ ...ui.empty, padding: '10px 0 0' }}>No matching time zone.</div>
            )}
          </div>
        </div>
      )}

      <AlertRulesEditor />
    </div>
  );
}

// Alert scanner rule editor (Feature 6): the keyword/regex sets and the
// 7/3/1-day windows are stored server-side and editable here as JSON.
export function AlertRulesEditor() {
  const [text, setText] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [scanInfo, setScanInfo] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchAlertRules()
      .then((payload) => setText(JSON.stringify(payload.rules, null, 2)))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  async function save() {
    setBusy(true);
    setError('');
    setStatus('');
    try {
      const parsed = JSON.parse(text);
      const payload = await saveAlertRules(parsed);
      setText(JSON.stringify(payload.rules, null, 2));
      setStatus('Rules saved. They apply from the next scan.');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function scanNow() {
    setBusy(true);
    setError('');
    setStatus('');
    try {
      const payload = await triggerAlertScan();
      setScanInfo(payload.lastScan || null);
      if (payload.lastScan?.ok === false) setError(payload.lastScan.error || 'Scan failed.');
      else setStatus('Scan complete.');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ ...ui.card, marginTop: 14 }}>
      <div style={ui.cardTitle}>NOTAM / Weather alert rules</div>
      <div style={{ fontSize: 11, color: '#6f7fa8', marginBottom: 8 }}>
        Look-ahead windows (days) plus keyword and regex sets for NOTAM and weather records.
        Flights matching a rule get an NTM or WX badge and trigger one email per record.
      </div>
      {error && <div style={ui.error}>{error}</div>}
      {status && <div style={ui.success}>{status}</div>}
      <textarea
        style={{
          ...ui.input,
          width: '100%',
          boxSizing: 'border-box',
          minHeight: 220,
          fontFamily: "'IBM Plex Mono',monospace",
          fontSize: 11,
          resize: 'vertical',
        }}
        value={text}
        onChange={(e) => setText(e.target.value)}
        spellCheck={false}
      />
      <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
        <button style={ui.btnPrimary} onClick={save} disabled={busy}>Save rules</button>
        <button style={ui.btn} onClick={scanNow} disabled={busy}>Run scan now</button>
        {scanInfo && scanInfo.ok && (
          <span style={{ fontSize: 11, color: '#8ea1cb' }}>
            Scanned {scanInfo.flightsScanned} flights / {scanInfo.airportsQueried} airports —
            {' '}{scanInfo.newFindings} new, {scanInfo.changedFindings} changed, {scanInfo.emailed} emailed.
          </span>
        )}
      </div>
    </div>
  );
}

const s = {
  clockRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '8px 0',
    borderBottom: '1px solid #1f2539',
  },
  preview: {
    fontFamily: "'IBM Plex Mono',monospace",
    fontSize: 16,
    color: '#6dc4ff',
    width: 56,
    flexShrink: 0,
  },
  zone: { fontSize: 11, color: '#6f7fa8', fontFamily: "'IBM Plex Mono',monospace" },
};
