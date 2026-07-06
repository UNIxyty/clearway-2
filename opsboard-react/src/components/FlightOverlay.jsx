import { useEffect, useState } from 'react';
import { fetchFlightInfo, fetchOverlay } from '../services/timelineApi';
import { subscribeWallStream } from '../services/wallStream';

// Remote-controlled flight-detail side overlay (Feature 5.2). A Console user
// opens/closes it for everyone; the backend holds the authoritative state and
// pushes display.command over SSE. On boot the current state is restored, so
// a wall refresh doesn't lose an open overlay.
//
// Ops-room rules (fixes Item 3): the overlay scales with the same display
// scale setting as the board, and shows ONLY core flight info (route +
// timings), IMP entries and limitations. NOTAM and weather content never
// renders on the wall — the console NOTAM Check page owns that. Alert-scan
// markers (NTM/WX) are NOTAM/weather-derived, so they are excluded here too.
// Strictly view-only: no interactive controls.

function fmtDT(value) {
  if (!value) return '—';
  const dt = new Date(value);
  if (!Number.isFinite(dt.getTime())) return '—';
  return `${dt.toISOString().slice(5, 10)} ${dt.toISOString().slice(11, 16)}Z`;
}

function delayText(min) {
  if (min === null || min === undefined || Number.isNaN(Number(min))) return '—';
  const n = Number(min);
  if (n === 0) return 'on time';
  return n > 0 ? `+${n} min` : `${n} min`;
}

export default function FlightOverlay({ topOffset = 76, scale = 1 }) {
  const [overlay, setOverlay] = useState({ open: false });
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchOverlay()
      .then((payload) => setOverlay(payload.overlay || { open: false }))
      .catch(() => {});
    return subscribeWallStream('display.command', (event) => {
      if (event.command === 'overlay.open') setOverlay(event.overlay || { open: false });
      if (event.command === 'overlay.close') {
        setOverlay({ open: false });
        setInfo(null);
        setError('');
      }
    });
  }, []);

  useEffect(() => {
    if (!overlay.open || !overlay.flightNid) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    setInfo(null);
    fetchFlightInfo({ flightNid: overlay.flightNid, oprId: overlay.oprId })
      .then((payload) => !cancelled && setInfo(payload))
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : String(err)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [overlay.open, overlay.flightNid, overlay.oprId]);

  if (!overlay.open) return null;

  const s = makeStyles(scale);
  const flight = info?.flight;
  const dep = flight?.adep;
  const arr = flight?.ades;
  const entries = flight?.limitations || [];
  const impEntries = entries.filter((item) => item.source === 'important');
  const limitations = entries.filter((item) => item.source === 'custom');

  return (
    <div style={{ ...s.panel, top: topOffset }}>
      <div style={s.head}>
        <div>
          <div style={s.fn}>{flight?.flightNo || `Flight ${overlay.flightNid}`}</div>
          {overlay.by?.name && <div style={s.openedBy}>opened by {overlay.by.name}</div>}
        </div>
        <span style={s.reg}>{info?.aircraft?.registration || ''}</span>
      </div>

      {loading && <div style={s.unavailable}>Loading flight details…</div>}
      {error && <div style={{ ...s.unavailable, color: '#ef9a9a' }}>{error}</div>}

      {flight && (
        <div style={s.scroll}>
          {/* Departure / Arrival */}
          <div style={s.routeRow}>
            <div style={s.airportBox}>
              <div style={s.icao}>{dep?.icao || 'UNK'}</div>
              <div style={s.airportName}>{dep?.name || ''}</div>
              <div style={s.airportCity}>{dep?.city || ''}</div>
            </div>
            <div style={s.routeArrow}>→</div>
            <div style={{ ...s.airportBox, textAlign: 'right' }}>
              <div style={s.icao}>{arr?.icao || 'UNK'}</div>
              <div style={s.airportName}>{arr?.name || ''}</div>
              <div style={s.airportCity}>{arr?.city || ''}</div>
            </div>
          </div>

          {/* Timings */}
          <div style={s.section}>
            <div style={s.sectionTitle}>Timings (UTC)</div>
            <div style={s.timingGrid}>
              <span style={s.tLabel}>STD</span><span style={s.tVal}>{fmtDT(flight.startTimeUTC)}</span>
              <span style={s.tLabel}>STA</span><span style={s.tVal}>{fmtDT(flight.endTimeUTC)}</span>
              <span style={s.tLabel}>ETD</span><span style={s.tVal}>{fmtDT(flight.etd)}</span>
              <span style={s.tLabel}>ETA</span><span style={s.tVal}>{fmtDT(flight.eta)}</span>
              <span style={s.tLabel}>ATD</span><span style={s.tVal}>{fmtDT(flight.atd)}</span>
              <span style={s.tLabel}>ATA</span><span style={s.tVal}>{fmtDT(flight.ata)}</span>
              <span style={s.tLabel}>Dep delay</span><span style={s.tVal}>{delayText(flight.departureDelayMin)}</span>
              <span style={s.tLabel}>Arr delay</span><span style={s.tVal}>{delayText(flight.arrivalDelayMin)}</span>
              <span style={s.tLabel}>Delayed dep</span><span style={s.tVal}>{fmtDT(flight.delayedDepartureUTC)}</span>
              <span style={s.tLabel}>Delayed arr</span><span style={s.tVal}>{fmtDT(flight.delayedArrivalUTC)}</span>
            </div>
          </div>

          {/* IMP entries */}
          <div style={s.section}>
            <div style={s.sectionTitle}>Important (IMP)</div>
            {impEntries.length === 0 && <div style={s.unavailable}>No IMP entries match this flight.</div>}
            {impEntries.map((entry) => (
              <div key={entry.id} style={s.entryCard}>
                <div style={s.entryHead}>
                  <span style={{ ...s.badge, color: '#ff8f8f', borderColor: 'rgba(229,72,77,.45)' }}>IMP</span>
                  <span style={s.entryTitle}>{entry.title}</span>
                </div>
                {entry.description && <div style={s.entryBody}>{entry.description}</div>}
              </div>
            ))}
          </div>

          {/* Limitations */}
          <div style={s.section}>
            <div style={s.sectionTitle}>Active limitations</div>
            {limitations.length === 0 && <div style={s.unavailable}>No limitations match this flight.</div>}
            {limitations.map((lim) => (
              <div key={lim.id} style={s.entryCard}>
                <div style={s.entryHead}>
                  <span style={s.badge}>{lim.type}</span>
                  <span style={s.entryTitle}>{lim.title}</span>
                </div>
                {lim.description && <div style={s.entryBody}>{lim.description}</div>}
              </div>
            ))}
          </div>

          {/* NOTAMs, weather and AIP/GEN documents intentionally do NOT render
              on the wall: NOTAM review lives on the console NOTAM Check page,
              documents are emailed from the console, and the display stays
              view-only. */}
        </div>
      )}
    </div>
  );
}

// All metrics derive from the display scale setting (same as Board), so the
// overlay is readable from several metres at scale ≥ 1.3.
function makeStyles(scale) {
  const sz = (v) => Math.round(v * scale);
  const mono = "'IBM Plex Mono',monospace";
  return {
    panel: {
      position: 'fixed',
      right: 0,
      bottom: 0,
      width: sz(430),
      zIndex: 150,
      background: 'rgba(13,17,28,.98)',
      borderLeft: '1px solid #2a395c',
      boxShadow: '-12px 0 30px rgba(0,0,0,.45)',
      display: 'flex',
      flexDirection: 'column',
    },
    head: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: `${sz(12)}px ${sz(16)}px`,
      borderBottom: '1px solid #222840',
      flexShrink: 0,
    },
    fn: { fontFamily: mono, fontSize: sz(20), fontWeight: 700, color: '#f2f7ff' },
    openedBy: { fontSize: sz(10), color: '#8494bd', marginTop: 2 },
    reg: { fontFamily: mono, fontSize: sz(13), color: '#a8bade' },
    scroll: { flex: 1, overflowY: 'auto', padding: `${sz(12)}px ${sz(16)}px` },
    routeRow: { display: 'flex', alignItems: 'center', gap: sz(10), marginBottom: sz(14) },
    airportBox: { flex: 1, minWidth: 0 },
    icao: { fontFamily: mono, fontSize: sz(24), fontWeight: 700, color: '#7ecbff' },
    airportName: { fontSize: sz(12), color: '#dbe4f8', marginTop: 2 },
    airportCity: { fontSize: sz(11), color: '#8494bd' },
    routeArrow: { fontSize: sz(20), color: '#55648c', flexShrink: 0 },
    section: { marginBottom: sz(16) },
    sectionTitle: {
      fontSize: sz(10.5),
      fontWeight: 700,
      letterSpacing: '1.6px',
      color: '#7484ad',
      marginBottom: sz(6),
      textTransform: 'uppercase',
    },
    timingGrid: {
      display: 'grid',
      gridTemplateColumns: 'auto 1fr auto 1fr',
      gap: `${sz(5)}px ${sz(10)}px`,
      background: '#111626',
      border: '1px solid #222840',
      borderRadius: sz(8),
      padding: sz(11),
    },
    tLabel: { fontSize: sz(11), color: '#8494bd' },
    tVal: { fontFamily: mono, fontSize: sz(12.5), fontWeight: 600, color: '#e6edfb' },
    entryCard: {
      background: '#111626',
      border: '1px solid #222840',
      borderRadius: sz(8),
      padding: `${sz(9)}px ${sz(11)}px`,
      marginBottom: sz(7),
    },
    entryHead: { display: 'flex', gap: sz(9), alignItems: 'baseline' },
    badge: {
      fontFamily: mono,
      fontSize: sz(10),
      fontWeight: 700,
      color: '#f5c76a',
      border: '1px solid rgba(240,177,59,.4)',
      borderRadius: 999,
      padding: `1px ${sz(8)}px`,
      flexShrink: 0,
    },
    entryTitle: { fontSize: sz(13.5), fontWeight: 600, color: '#eef3fd', lineHeight: 1.35 },
    entryBody: { fontSize: sz(12), color: '#c2cfec', lineHeight: 1.5, marginTop: sz(5) },
    unavailable: { fontSize: sz(12), color: '#8494bd', padding: `${sz(6)}px 0` },
  };
}
