import { Fragment, useEffect, useState } from 'react';
import { fetchFlightInfo, fetchOverlay, importantAttachmentUrl } from '../services/timelineApi';
import { subscribeWallStream } from '../services/wallStream';
import { WX_CATEGORY_COLORS } from './FlightPill';

// Remote-controlled flight-detail side overlay (Feature 5.2). A Console user
// opens/closes it for everyone; the backend holds the authoritative state and
// pushes display.command over SSE. On boot the current state is restored, so
// a wall refresh doesn't lose an open overlay.
//
// Ops-room rules: the overlay scales with the same display scale setting as
// the board, and shows core flight info (route + timings), IMP entries and
// limitations. NOTAM and weather CONTENT never renders on the wall — the
// console NOTAM Check page owns that. NTM/WX markers appear as badges ONLY
// while the airport that raised them has not been CHECKED today (the server
// drops findings for acked airports, same rule as the pills); they clear
// live via notam-check.changed. Strictly view-only: no interactive controls.

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

function fmtObserved(value) {
  if (!value) return '—';
  const dt = new Date(value);
  if (!Number.isFinite(dt.getTime())) return '—';
  return `${String(dt.getUTCHours()).padStart(2, '0')}:${String(dt.getUTCMinutes()).padStart(2, '0')}Z`;
}

/** Compact decoded-METAR block (CheckWX) for one airport. */
function WeatherBlock({ icao, wx, s }) {
  if (!wx || (wx.noData && !wx.error)) {
    return (
      <div style={s.wxCard}>
        <div style={s.wxHead}><span style={s.wxIcao}>{icao || '—'}</span><span style={s.unavailable}>No METAR available.</span></div>
      </div>
    );
  }
  if (wx.error) {
    return (
      <div style={s.wxCard}>
        <div style={s.wxHead}><span style={s.wxIcao}>{icao || '—'}</span><span style={{ ...s.unavailable, color: '#ef9a9a' }}>Weather unavailable</span></div>
      </div>
    );
  }
  const catColor = WX_CATEGORY_COLORS[wx.category] || '#8494bd';
  const wind = wx.windSpeedKts !== null && wx.windSpeedKts !== undefined
    ? `${wx.windDegrees !== null && wx.windDegrees !== undefined ? `${String(wx.windDegrees).padStart(3, '0')}°` : 'VRB'} ${wx.windSpeedKts}kt${wx.windGustKts ? ` G${wx.windGustKts}` : ''}`
    : '—';
  const vis = wx.visibilityMeters !== null && wx.visibilityMeters !== undefined
    ? (Number(wx.visibilityMeters) >= 9999 ? '10 km+' : `${Math.round(Number(wx.visibilityMeters) / 100) / 10} km`)
    : '—';
  const rows = [
    ['Wind', wind],
    ['Visibility', vis],
    ['Ceiling', wx.ceilingFeet !== null && wx.ceilingFeet !== undefined ? `${wx.ceilingFeet} ft` : '—'],
    ['Temp / Dew', wx.temperatureC !== null && wx.temperatureC !== undefined ? `${wx.temperatureC}° / ${wx.dewpointC ?? '—'}°C` : '—'],
    ['QNH', wx.qnhHpa !== null && wx.qnhHpa !== undefined ? `${wx.qnhHpa} hPa` : '—'],
  ];
  return (
    <div style={s.wxCard}>
      <div style={s.wxHead}>
        <span style={s.wxIcao}>{icao || '—'}</span>
        {wx.category && (
          <span style={{ ...s.wxCategory, color: '#0c101c', background: catColor }}>{wx.category}</span>
        )}
        <span style={s.wxObserved}>obs {fmtObserved(wx.observed)}</span>
      </div>
      <div style={s.wxGrid}>
        {rows.map(([label, value]) => (
          <div key={label} style={{ display: 'contents' }}>
            <span style={s.tLabel}>{label}</span>
            <span style={s.tVal}>{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
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
    const load = ({ silent = false } = {}) => {
      if (!silent) setLoading(true);
      fetchFlightInfo({ flightNid: overlay.flightNid, oprId: overlay.oprId })
        .then((payload) => !cancelled && setInfo(payload))
        .catch((err) => !cancelled && !silent && setError(err instanceof Error ? err.message : String(err)))
        .finally(() => !cancelled && setLoading(false));
    };
    load();
    // Console acks clear this flight's NTM markers while the overlay is
    // open, and WX refreshes ride with the daily check — silent refetch so
    // the panel doesn't flash.
    const unsubs = [
      subscribeWallStream('notam-check.changed', () => load({ silent: true })),
      subscribeWallStream('weather.changed', () => load({ silent: true })),
    ];
    return () => {
      cancelled = true;
      unsubs.forEach((unsub) => unsub());
    };
  }, [overlay.open, overlay.flightNid, overlay.oprId]);

  if (!overlay.open) return null;

  const s = makeStyles(scale);
  const flight = info?.flight;
  const dep = flight?.adep;
  const arr = flight?.ades;
  const entries = flight?.limitations || [];
  const impEntries = entries.filter((item) => item.source === 'important');
  const caaEntries = entries.filter((item) => item.source === 'caa');
  const limitations = entries.filter((item) => item.source === 'custom');
  // Unreviewed NTM/WX markers (already gated server-side by today's
  // per-airport CHECKED acks) — badges only, never the NOTAM/weather text.
  const alertMarkers = [
    ...new Map(
      entries
        .filter((item) => item.source === 'alert' && (item.type === 'NTM' || item.type === 'WX'))
        .map((item) => [`${item.type}:${item.icao || ''}`, { type: item.type, icao: item.icao || null }])
    ).values(),
  ];

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

          {/* Unreviewed NTM/WX markers — clear as airports get CHECKED */}
          {alertMarkers.length > 0 && (
            <div style={s.section}>
              <div style={s.sectionTitle}>Unreviewed alerts</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {alertMarkers.map((marker) => (
                  <span
                    key={`${marker.type}-${marker.icao}`}
                    title={`${marker.type === 'NTM' ? 'NOTAM' : 'Weather'} item awaiting the daily check — review in the Console`}
                    style={{
                      ...s.badge,
                      color: marker.type === 'NTM' ? '#ffab73' : '#7ec8ff',
                      borderColor: marker.type === 'NTM' ? 'rgba(255,145,80,.5)' : 'rgba(95,181,255,.5)',
                      background: marker.type === 'NTM' ? 'rgba(255,145,80,.14)' : 'rgba(95,181,255,.12)',
                    }}
                  >
                    {marker.type}
                    {marker.icao ? ` · ${marker.icao}` : ''}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Weather — decoded CheckWX summary for both ends (deliberately a
              concise category+key-fields block, not the old raw METAR dump) */}
          <div style={s.section}>
            <div style={s.sectionTitle}>Weather (CheckWX)</div>
            <WeatherBlock icao={dep?.icao} wx={info?.weather?.dep} s={s} />
            <WeatherBlock icao={arr?.icao} wx={info?.weather?.arr} s={s} />
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
                {(entry.attachments || []).length > 0 && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                    {entry.attachments.map((att) => (
                      <a
                        key={att.id}
                        href={importantAttachmentUrl(entry.id, att.id)}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          fontSize: 12,
                          fontFamily: "'IBM Plex Mono',monospace",
                          color: '#8fb8ff',
                          border: '1px solid rgba(90,140,255,.4)',
                          borderRadius: 7,
                          padding: '3px 9px',
                          textDecoration: 'none',
                        }}
                      >
                        {att.filename}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* CAA authority details (Item 4) — the matched authority's
              contact block, teal accent per the design. */}
          {caaEntries.length > 0 && (
            <div style={s.section}>
              <div style={s.sectionTitle}>CAA details</div>
              {caaEntries.map((entry) => {
                const caa = entry.caa || {};
                // phones/mail are arrays now — render one value per line.
                const multi = (v) => (Array.isArray(v) ? v.join('\n') : v);
                const rows = [
                  ['Validity', caa.validity],
                  ['Function', caa.functionText],
                  ['Info', caa.info],
                  ['Contact', caa.contact],
                  ['Phone', multi(caa.phones)],
                  ['Mail', multi(caa.mail), true],
                  ['AFTN', caa.aftn, true],
                  ['SITA', caa.sita, true],
                  ['VFR FPL', caa.vfrAddresses, true],
                ].filter(([, v]) => String(v || '').trim());
                return (
                  <div key={entry.id} style={{ ...s.entryCard, borderLeft: '4px solid #2f9e8f' }}>
                    <div style={s.entryHead}>
                      <span style={{ ...s.badge, color: '#5eead4', borderColor: 'rgba(47,158,143,.55)' }}>CAA</span>
                      <span style={s.entryTitle}>{caa.authorityName || caa.country}</span>
                      {caa.country && caa.authorityName && (
                        <span style={{ fontSize: 12, fontFamily: "'IBM Plex Mono',monospace", color: '#8b95a3' }}>
                          {caa.country}
                        </span>
                      )}
                      {caa.appliesTo && caa.appliesTo !== 'any' && (
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#5eead4', border: '1px solid rgba(47,158,143,.4)', borderRadius: 6, padding: '1px 7px' }}>
                          {caa.appliesTo === 'commercial' ? 'COMMERCIAL' : 'PRIVATE'}
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 14px', marginTop: 8 }}>
                      {rows.map(([k, v, mono]) => (
                        <Fragment key={k}>
                          <span style={{ fontSize: 12, color: '#7a828d', fontFamily: "'IBM Plex Mono',monospace" }}>{k}</span>
                          <span style={{ fontSize: 12.5, color: '#dfe3e9', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', ...(mono ? { fontFamily: "'IBM Plex Mono',monospace" } : {}) }}>{v}</span>
                        </Fragment>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

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

          {/* NOTAM/weather CONTENT and AIP/GEN documents intentionally do NOT
              render on the wall: review lives on the console NOTAM Check
              page, documents are emailed from the console, and the display
              stays view-only. Only the unreviewed NTM/WX badges above appear,
              and they clear as airports are acked. */}
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
    wxCard: {
      background: '#111626',
      border: '1px solid #222840',
      borderRadius: sz(8),
      padding: `${sz(9)}px ${sz(11)}px`,
      marginBottom: sz(7),
    },
    wxHead: { display: 'flex', alignItems: 'center', gap: sz(9), marginBottom: sz(7) },
    wxIcao: { fontFamily: mono, fontSize: sz(14), fontWeight: 700, color: '#7ecbff' },
    wxCategory: {
      fontFamily: mono,
      fontSize: sz(11),
      fontWeight: 800,
      letterSpacing: '.5px',
      borderRadius: 5,
      padding: `1px ${sz(7)}px`,
    },
    wxObserved: { fontFamily: mono, fontSize: sz(10.5), color: '#8494bd', marginLeft: 'auto' },
    wxGrid: {
      display: 'grid',
      gridTemplateColumns: 'auto 1fr auto 1fr',
      gap: `${sz(4)}px ${sz(10)}px`,
    },
  };
}
