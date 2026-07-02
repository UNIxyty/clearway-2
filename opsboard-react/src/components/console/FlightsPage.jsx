import { useEffect, useMemo, useState } from 'react';
import {
  closeFlightOverlay,
  fetchOverlay,
  fetchTimelineRaw,
  openFlightOverlay,
} from '../../services/timelineApi';
import { subscribeWallStream } from '../../services/wallStream';
import { ui } from './ui';

// Flights list — the Console side of the shared-appliance control channel
// (Feature 5.2): pick a flight, open its detail overlay on the wall, close it
// again. The backend holds the authoritative overlay state; display.command
// SSE events keep every console and wall in sync.

function fmtDT(value) {
  if (!value) return '—';
  const dt = new Date(value);
  if (!Number.isFinite(dt.getTime())) return '—';
  return `${dt.toISOString().slice(5, 10)} ${dt.toISOString().slice(11, 16)}Z`;
}

export default function FlightsPage() {
  const [aircraft, setAircraft] = useState([]);
  const [overlay, setOverlay] = useState({ open: false });
  const [loading, setLoading] = useState(true);
  const [busyNid, setBusyNid] = useState('');
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [upcomingOnly, setUpcomingOnly] = useState(true);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const payload = await fetchTimelineRaw({ refresh: false });
      setAircraft(payload.aircraft || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setAircraft([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    fetchOverlay().then((p) => setOverlay(p.overlay || { open: false })).catch(() => {});
    const unsubscribe = subscribeWallStream(
      'display.command',
      (event) => setOverlay(event.overlay || { open: false }),
      { surface: 'console' }
    );
    return unsubscribe;
  }, []);

  const flights = useMemo(() => {
    const nowMs = Date.now();
    const q = search.trim().toLowerCase();
    const rows = [];
    for (const group of aircraft) {
      for (const flight of group.flights || []) {
        const endMs = new Date(flight.endTimeUTC || flight.startTimeUTC || 0).getTime();
        if (upcomingOnly && Number.isFinite(endMs) && endMs < nowMs) continue;
        const hay = `${flight.flightNo} ${flight.adep?.icao || ''} ${flight.ades?.icao || ''} ${group.registration} ${group.operatorName || group.oprId || ''}`.toLowerCase();
        if (q && !hay.includes(q)) continue;
        rows.push({ ...flight, registration: group.registration, oprId: group.oprId, operatorName: group.operatorName });
      }
    }
    rows.sort((a, b) => new Date(a.startTimeUTC || 0) - new Date(b.startTimeUTC || 0));
    return rows;
  }, [aircraft, search, upcomingOnly]);

  async function showOnWall(flight) {
    setBusyNid(String(flight.flightNid));
    setError('');
    try {
      await openFlightOverlay({ flightNid: flight.flightNid, oprId: flight.oprId });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyNid('');
    }
  }

  async function closeOverlay() {
    setError('');
    try {
      await closeFlightOverlay();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const overlayNid = overlay.open ? String(overlay.flightNid) : '';

  return (
    <div style={ui.page}>
      <div style={ui.top}>
        <div>
          <div style={ui.title}>Flights</div>
          <div style={ui.subtitle}>Click a flight to open its full detail overlay on the wall display.</div>
        </div>
        <button style={ui.btn} onClick={load} disabled={loading}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {overlay.open && (
        <div style={s.overlayBanner}>
          <span>
            Overlay open on the wall: <b>flight {overlay.flightNid}</b>
            {overlay.by?.name ? ` (opened by ${overlay.by.name})` : ''}
          </span>
          <button style={ui.btnDanger} onClick={closeOverlay}>Close on wall</button>
        </div>
      )}

      {error && <div style={ui.error}>{error}</div>}

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
        <input
          style={{ ...ui.input, flex: 1 }}
          placeholder="Search flight no / ICAO / registration / operator…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <label style={{ fontSize: 11.5, color: '#8ea1cb', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input type="checkbox" checked={upcomingOnly} onChange={(e) => setUpcomingOnly(e.target.checked)} />
          Upcoming only
        </label>
      </div>

      <div style={ui.tableWrap}>
        <table style={ui.table}>
          <thead>
            <tr>
              <th style={ui.th}>Flight</th>
              <th style={ui.th}>Route</th>
              <th style={ui.th}>STD</th>
              <th style={ui.th}>STA</th>
              <th style={ui.th}>Aircraft</th>
              <th style={ui.th}>Operator</th>
              <th style={ui.th}>Badges</th>
              <th style={ui.th}></th>
            </tr>
          </thead>
          <tbody>
            {flights.map((flight) => {
              const isOnWall = overlayNid === String(flight.flightNid);
              return (
                <tr key={`${flight.oprId}:${flight.flightNid}`} style={isOnWall ? { background: 'rgba(42,74,134,.18)' } : undefined}>
                  <td style={{ ...ui.td, fontFamily: "'IBM Plex Mono',monospace" }}>{flight.flightNo}</td>
                  <td style={{ ...ui.td, fontFamily: "'IBM Plex Mono',monospace" }}>
                    {flight.adep?.icao || 'UNK'} → {flight.ades?.icao || 'UNK'}
                  </td>
                  <td style={ui.td}>{fmtDT(flight.startTimeUTC)}</td>
                  <td style={ui.td}>{fmtDT(flight.endTimeUTC)}</td>
                  <td style={{ ...ui.td, fontFamily: "'IBM Plex Mono',monospace" }}>{flight.registration}</td>
                  <td style={ui.td}>{flight.operatorName || flight.oprId || '—'}</td>
                  <td style={ui.td}>
                    {(flight.limitations || []).map((lim) => (
                      <span key={lim.id} style={{ ...ui.tag, marginRight: 3 }}>{lim.type}</span>
                    ))}
                  </td>
                  <td style={{ ...ui.td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {isOnWall ? (
                      <button style={ui.btnDanger} onClick={closeOverlay}>Close on wall</button>
                    ) : (
                      <button
                        style={ui.softBtn}
                        disabled={busyNid === String(flight.flightNid)}
                        onClick={() => showOnWall(flight)}
                      >
                        {busyNid === String(flight.flightNid) ? 'Opening…' : 'Show on wall'}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!loading && flights.length === 0 && <div style={ui.empty}>No flights match the current filter.</div>}
        {loading && <div style={ui.loading}>Loading flights…</div>}
      </div>
    </div>
  );
}

const s = {
  overlayBanner: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
    background: 'rgba(42,74,134,.16)',
    border: '1px solid #41639e',
    borderRadius: 8,
    padding: '9px 12px',
    marginBottom: 12,
    fontSize: 12,
    color: '#c9d5f0',
  },
};
