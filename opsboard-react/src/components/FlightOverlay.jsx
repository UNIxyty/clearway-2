import { useEffect, useState } from 'react';
import { aipPdfUrl, fetchFlightInfo, fetchOverlay } from '../services/timelineApi';
import { subscribeWallStream } from '../services/wallStream';

// Remote-controlled flight-detail side overlay (Feature 5.2). A Console user
// opens/closes it for everyone; the backend holds the authoritative state and
// pushes display.command over SSE. On boot the current state is restored, so
// a wall refresh doesn't lose an open overlay.

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

function AirportNotams({ label, result }) {
  return (
    <div style={s.section}>
      <div style={s.sectionTitle}>NOTAM — {label}</div>
      {!result?.ok && <div style={s.unavailable}>Unavailable: {result?.error || 'no data'}</div>}
      {result?.ok && (result.data?.notams || []).length === 0 && (
        <div style={s.unavailable}>No NOTAMs on file.</div>
      )}
      {result?.ok &&
        (result.data?.notams || []).map((notam, index) => (
          <div key={`${notam.number}-${index}`} style={s.notamCard}>
            <div style={s.notamHead}>
              <b style={{ color: '#ffab73' }}>{notam.number || '—'}</b>
              <span style={s.notamClass}>class {notam.class || '—'}</span>
              <span style={s.notamDates}>{notam.startDateUtc || '—'} → {notam.endDateUtc || '—'}</span>
            </div>
            <div style={s.notamText}>{notam.condition || ''}</div>
          </div>
        ))}
    </div>
  );
}

function AirportWeather({ label, result }) {
  return (
    <div style={s.section}>
      <div style={s.sectionTitle}>Weather — {label}</div>
      {!result?.ok && <div style={s.unavailable}>Unavailable: {result?.error || 'no data'}</div>}
      {result?.ok && <pre style={s.wxText}>{result.data?.weather || 'No weather text on file.'}</pre>}
    </div>
  );
}

export default function FlightOverlay() {
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

  const flight = info?.flight;
  const dep = flight?.adep;
  const arr = flight?.ades;

  return (
    <div style={s.panel}>
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
          {/* 1+2: Departure / Arrival */}
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

          {/* 3: All flight timings */}
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

          {(flight.limitations || []).length > 0 && (
            <div style={s.section}>
              <div style={s.sectionTitle}>Active limitations</div>
              {flight.limitations.map((lim) => (
                <div key={lim.id} style={s.limRow}>
                  <span style={{ ...s.limType }}>{lim.type}</span>
                  <span style={{ color: '#c9d5f0' }}>{lim.title}</span>
                </div>
              ))}
            </div>
          )}

          {/* 6: AIP downloads */}
          <div style={s.section}>
            <div style={s.sectionTitle}>AIP (AD-2)</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {[
                { icao: dep?.icao, aip: info?.aip?.dep, label: 'Departure' },
                { icao: arr?.icao, aip: info?.aip?.arr, label: 'Arrival' },
              ].map(({ icao, aip, label }) => (
                <span key={label}>
                  {aip?.available ? (
                    <a style={s.aipBtn} href={aipPdfUrl(icao)} target="_blank" rel="noreferrer">
                      ⬇ {label} {icao} ({aip.source})
                    </a>
                  ) : (
                    <span style={{ ...s.aipBtn, opacity: 0.45, cursor: 'default' }}>
                      {label} {icao || '—'}: not available
                    </span>
                  )}
                </span>
              ))}
            </div>
          </div>

          {/* 4: NOTAMs, grouped by airport */}
          <AirportNotams label={dep?.icao || 'departure'} result={info?.notams?.dep} />
          <AirportNotams label={arr?.icao || 'arrival'} result={info?.notams?.arr} />

          {/* 5: Weather */}
          <AirportWeather label={dep?.icao || 'departure'} result={info?.weather?.dep} />
          <AirportWeather label={arr?.icao || 'arrival'} result={info?.weather?.arr} />
        </div>
      )}
    </div>
  );
}

const s = {
  panel: {
    position: 'fixed',
    top: 76,
    right: 0,
    bottom: 0,
    width: 420,
    zIndex: 150,
    background: 'rgba(15,20,32,.98)',
    borderLeft: '1px solid #2a395c',
    boxShadow: '-12px 0 30px rgba(0,0,0,.45)',
    display: 'flex',
    flexDirection: 'column',
  },
  head: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    borderBottom: '1px solid #222840',
    flexShrink: 0,
  },
  fn: { fontFamily: "'IBM Plex Mono',monospace", fontSize: 18, fontWeight: 700, color: '#e8f2ff' },
  openedBy: { fontSize: 10, color: '#6f7fa8', marginTop: 2 },
  reg: { fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: '#8ea1cb' },
  scroll: { flex: 1, overflowY: 'auto', padding: '12px 16px' },
  routeRow: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 },
  airportBox: { flex: 1, minWidth: 0 },
  icao: { fontFamily: "'IBM Plex Mono',monospace", fontSize: 20, fontWeight: 700, color: '#6dc4ff' },
  airportName: { fontSize: 11, color: '#c9d5f0', marginTop: 2 },
  airportCity: { fontSize: 10, color: '#6f7fa8' },
  routeArrow: { fontSize: 18, color: '#404d6e', flexShrink: 0 },
  section: { marginBottom: 14 },
  sectionTitle: {
    fontSize: 9.5,
    fontWeight: 600,
    letterSpacing: '1.6px',
    color: '#404d6e',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  timingGrid: {
    display: 'grid',
    gridTemplateColumns: 'auto 1fr auto 1fr',
    gap: '4px 10px',
    background: '#111626',
    border: '1px solid #222840',
    borderRadius: 8,
    padding: 10,
  },
  tLabel: { fontSize: 10, color: '#6f7fa8' },
  tVal: { fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: '#d2ddf5' },
  limRow: { display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 11.5, padding: '3px 0' },
  limType: {
    fontFamily: "'IBM Plex Mono',monospace",
    fontSize: 9,
    fontWeight: 700,
    color: '#f0c060',
    border: '1px solid rgba(240,177,59,.35)',
    borderRadius: 999,
    padding: '1px 7px',
    flexShrink: 0,
  },
  notamCard: {
    background: '#111626',
    border: '1px solid #222840',
    borderRadius: 8,
    padding: 9,
    marginBottom: 6,
  },
  notamHead: { display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap', fontSize: 10.5 },
  notamClass: { color: '#8ea1cb' },
  notamDates: { color: '#6f7fa8', fontFamily: "'IBM Plex Mono',monospace", fontSize: 9.5 },
  notamText: {
    fontFamily: "'IBM Plex Mono',monospace",
    fontSize: 10,
    color: '#b9c8e7',
    whiteSpace: 'pre-wrap',
    marginTop: 5,
    maxHeight: 140,
    overflowY: 'auto',
    lineHeight: 1.45,
  },
  wxText: {
    fontFamily: "'IBM Plex Mono',monospace",
    fontSize: 10,
    color: '#b9c8e7',
    whiteSpace: 'pre-wrap',
    background: '#111626',
    border: '1px solid #222840',
    borderRadius: 8,
    padding: 9,
    margin: 0,
    maxHeight: 160,
    overflowY: 'auto',
    lineHeight: 1.45,
  },
  unavailable: { fontSize: 11, color: '#6f7fa8', padding: '6px 0' },
  aipBtn: {
    display: 'inline-block',
    fontSize: 11,
    color: '#b8d9ff',
    background: '#1a2740',
    border: '1px solid #2b3f68',
    borderRadius: 6,
    padding: '6px 10px',
    textDecoration: 'none',
    cursor: 'pointer',
  },
};
