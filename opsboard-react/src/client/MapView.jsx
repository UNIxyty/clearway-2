// The flight map (design "Phone Views" › The live map, 2026-11-10). Our own map: OpenStreetMap data styled by CARTO
// (light / dark), both airports, the planned route as a dashed great-circle line, and — when a live position exists —
// the aircraft with its track flown. The wall has NO live position feed today (docs/agent-flight-tracking-decision.md:
// a provider was never chosen), so an airborne flight shows the honest state "No live position" with the route; the
// strip then carries the schedule, not an invented altitude or speed. One flight only, never other traffic, for
// staff and clients alike. Coordinates come from the wall's /api/geo/coords (data/airport-coords.json).
import { useEffect, useMemo, useRef, useState } from 'react';
import { buildApiUrl } from '../services/timelineApi';
import { hmZ, spanText } from '../components/mobile/mobileUtil';

const TILE = 256;
const proj = (lat, lon, z) => { const n = TILE * 2 ** z; const r = (lat * Math.PI) / 180; return [((lon + 180) / 360) * n, ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n]; };
const unproj = (x, y, z) => { const n = TILE * 2 ** z; const lon = (x / n) * 360 - 180; const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI; return [lat, lon]; };

/** Points along the great circle between two airports. */
function greatCircle(a, b, steps = 48) {
  const toR = (d) => (d * Math.PI) / 180; const toD = (r) => (r * 180) / Math.PI;
  const [la1, lo1, la2, lo2] = [toR(a.lat), toR(a.lon), toR(b.lat), toR(b.lon)];
  const d = 2 * Math.asin(Math.sqrt(Math.sin((la2 - la1) / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin((lo2 - lo1) / 2) ** 2));
  if (!d) return [[a.lat, a.lon], [b.lat, b.lon]];
  const out = [];
  for (let i = 0; i <= steps; i++) {
    const f = i / steps; const A = Math.sin((1 - f) * d) / Math.sin(d); const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(la1) * Math.cos(lo1) + B * Math.cos(la2) * Math.cos(lo2);
    const y = A * Math.cos(la1) * Math.sin(lo1) + B * Math.cos(la2) * Math.sin(lo2);
    const zz = A * Math.sin(la1) + B * Math.sin(la2);
    out.push([toD(Math.atan2(zz, Math.sqrt(x * x + y * y))), toD(Math.atan2(y, x))]);
  }
  return out;
}

export function useCoords(icaos) {
  const [coords, setCoords] = useState({});
  const key = icaos.filter(Boolean).join(',');
  useEffect(() => {
    if (!key) return undefined;
    let stop = false;
    fetch(buildApiUrl(`/api/geo/coords?icao=${encodeURIComponent(key)}`), { credentials: 'same-origin' }).then((r) => r.json()).then((d) => { if (!stop && d?.ok) setCoords(d.coords || {}); }).catch(() => {});
    return () => { stop = true; };
  }, [key]);
  return coords;
}

/**
 * @param p        the flight record (timelineApi.mapFlight)
 * @param position { lat, lon, altitudeFt, groundSpeedKt, heading, at } or null when no feed
 * @param state    'loading' | 'live' | 'nopos' | 'notyet' | 'landed'
 */
export default function MapView({ p, coords, position = null, state, theme = 'light', full = false, onToggleFull, onBack, nowMs = Date.now() }) {
  const ref = useRef(null);
  const [size, setSize] = useState({ w: 390, h: 600 });
  const [off, setOff] = useState({ x: 0, y: 0 });
  const drag = useRef(null);
  useEffect(() => {
    const el = ref.current; if (!el) return undefined;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el); setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);
  const a = coords[p.dep]; const b = coords[p.arr];
  const ready = Boolean(a && b) && state !== 'loading';
  const geo = useMemo(() => {
    if (!a || !b) return null;
    const { w: W, h: H } = size;
    const pts = greatCircle(a, b);
    const focus = position ? [position.lat, position.lon] : pts[Math.floor(pts.length / 2)];
    let z = 9;
    for (; z >= 2; z--) {
      const c = proj(focus[0], focus[1], z);
      const fits = [a, b].every((ap) => { const q = proj(ap.lat, ap.lon, z); return Math.abs(q[0] - c[0]) <= W / 2 - 48 && Math.abs(q[1] - c[1]) <= H / 2 - 120; });
      if (fits) break;
    }
    const c = proj(focus[0], focus[1], z);
    const ox = c[0] - W / 2 - off.x; const oy = c[1] - H / 2 - 40 - off.y;
    const S = (lat, lon) => { const q = proj(lat, lon, z); return [q[0] - ox, q[1] - oy]; };
    const tiles = [];
    const n = 2 ** z;
    for (let tx = Math.floor(ox / TILE); tx <= Math.floor((ox + W) / TILE); tx++) for (let ty = Math.floor(oy / TILE); ty <= Math.floor((oy + H) / TILE); ty++) {
      if (ty < 0 || ty >= n) continue;
      const wx = ((tx % n) + n) % n;
      tiles.push({ key: `${tx}-${ty}`, src: `https://basemaps.cartocdn.com/${theme === 'dark' ? 'dark_all' : 'light_all'}/${z}/${wx}/${ty}@2x.png`, x: Math.round(tx * TILE - ox), y: Math.round(ty * TILE - oy) });
    }
    const path = pts.map((q) => S(q[0], q[1]));
    const d = (arr) => arr.map((q, i) => `${i ? 'L' : 'M'}${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join(' ');
    let flown = ''; let rest = d(path); let ac = null;
    if (position) {
      const P = S(position.lat, position.lon);
      ac = { x: P[0], y: P[1], hdg: Number.isFinite(position.heading) ? position.heading : 0 };
      // split the route at the nearest point to the aircraft
      let best = 0; let bd = Infinity;
      path.forEach((q, i) => { const dd = (q[0] - P[0]) ** 2 + (q[1] - P[1]) ** 2; if (dd < bd) { bd = dd; best = i; } });
      flown = d([...path.slice(0, best + 1), P]);
      rest = d([P, ...path.slice(best + 1)]);
    } else if (state === 'landed') { flown = d(path); rest = ''; }
    return { z, tiles, flown, rest, A: S(a.lat, a.lon), B: S(b.lat, b.lon), ac, unproj: (x, y) => unproj(x + ox, y + oy, z) };
  }, [a, b, size, off, position, state, theme]);

  const down = (e) => { drag.current = { x: e.clientX, y: e.clientY, o: off }; };
  const move = (e) => { const dgt = drag.current; if (!dgt) return; setOff({ x: dgt.o.x + e.clientX - dgt.x, y: dgt.o.y + e.clientY - dgt.y }); };
  const up = () => { drag.current = null; };
  const moved = off.x !== 0 || off.y !== 0;
  const dep = p.depHm; const end = p.endUtcMs;
  const msg = state === 'notyet' ? ['Not airborne yet', `Departs ${dep}Z${p.depKind !== 'STD' && p.etd !== p.depHm ? ` · was ${p.etd}Z` : ''}`]
    : state === 'landed' ? [`Landed in ${p.arr} at ${p.ataHm || p.arrHm}Z`, p.atdHm ? `Flight time ${spanText(end - p.delayedStartUtcMs)}` : '']
    : state === 'nopos' ? ['No live position', 'Live tracking is not connected. The route and the times are from Leon and are current.']
    : state === 'loading' ? ['Loading the map…', ''] : null;
  return (
    <div ref={ref} className="cwm" data-map-state={state} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={up}>
      {ready && geo && (
        <>
          {geo.tiles.map((t) => <img key={t.key} src={t.src} alt="" draggable={false} style={{ position: 'absolute', left: t.x, top: t.y, width: TILE, height: TILE, pointerEvents: 'none', userSelect: 'none' }} />)}
          <svg width={size.w} height={size.h} style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none', overflow: 'visible' }}>
            {geo.rest && <path d={geo.rest} fill="none" stroke="var(--cw-text-body)" strokeWidth="2.5" strokeDasharray="6 6" strokeLinecap="round" />}
            {geo.flown && <path d={geo.flown} fill="none" stroke="var(--tl-now)" strokeWidth="3.5" strokeLinecap="round" />}
            {[geo.A, geo.B].map((q, i) => <circle key={i} cx={q[0]} cy={q[1]} r="6" fill="var(--cw-bg-surface)" stroke="var(--cw-text)" strokeWidth="2.5" />)}
            {geo.ac && <g transform={`translate(${geo.ac.x} ${geo.ac.y}) rotate(${geo.ac.hdg})`}><circle r="22" fill="var(--tl-now-glow)" /><path d="M0 -14 L2.2 -4 L13 2 L13 5 L2.2 1.6 L1.6 9 L5 11.5 L5 13.5 L0 12 L-5 13.5 L-5 11.5 L-1.6 9 L-2.2 1.6 L-13 5 L-13 2 L-2.2 -4 Z" fill="var(--tl-now)" stroke="var(--cw-bg-surface)" strokeWidth="1.5" strokeLinejoin="round" /></g>}
          </svg>
          {[[p.dep, 'Dep', geo.A], [p.arr, 'Arr', geo.B]].map(([icao, role, q]) => <span key={icao} className="cwm-apt" style={{ left: q[0] + 10, top: q[1] - 30 }}>{icao}<small>{role}</small></span>)}
        </>
      )}
      {!ready && <div className="cwm-skel" />}
      <div className="cwm-strip" style={{ top: full ? 8 : 12 }}>
        {full && <button type="button" className="cwm-round" onClick={onBack} aria-label="Back">‹</button>}
        <div className="cwm-card">
          <span className="cwm-row"><b className="cwd-mono">{p.fn}</b><span className="cwd-mono cwd-muted">{p.__reg}</span><span style={{ flex: 1 }} /><span className="cwd-mono cwd-muted">{p.dep} → {p.arr}</span></span>
          {position && state === 'live' && <div className="cwm-stats"><span><small>ALTITUDE</small><b>{Number.isFinite(position.altitudeFt) ? `FL${Math.round(position.altitudeFt / 100)}` : '—'}</b></span><span><small>GROUND SPEED</small><b>{Number.isFinite(position.groundSpeedKt) ? `${Math.round(position.groundSpeedKt)} kt` : '—'}</b></span><span><small>LANDS IN</small><b className="is-now">{end > nowMs ? spanText(end - nowMs) : '—'}</b></span></div>}
          {msg && <><span className="cwm-msg">{msg[0]}</span>{msg[1] && <span className="cwd-muted cwm-sub">{msg[1]}</span>}</>}
        </div>
        {full && <button type="button" className="cwm-round" onClick={onToggleFull} aria-label="Exit full screen">⤡</button>}
      </div>
      {moved && <button type="button" className="cwm-recenter" onClick={() => setOff({ x: 0, y: 0 })}>Re-centre</button>}
      <span className="cwm-attr">© OpenStreetMap · © CARTO</span>
    </div>
  );
}

/** Which map state a flight is in, given a position (none today). */
export function mapStateOf(p, position, loaded) {
  if (!loaded) return 'loading';
  if (p.status === 'arrived') return 'landed';
  if (p.status === 'airborne') return position ? 'live' : 'nopos';
  return 'notyet';
}

export { hmZ };
