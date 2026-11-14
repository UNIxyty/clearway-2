// The open flight (design "Mobile Open Flight v3"), carried over from the old phone wall's flight view
// (components/mobile/phone/OpenFlight.jsx): a sheet over the still-mounted timeline with 56 px of the list showing
// above it; it closes by X or by a tap on that strip; no history entry is made. One normal tap for everything.
// This file is what BOTH roles download. The staff-only parts (service status, the five checks, marking, the
// passenger viewer with documents) live in a separate file that only a staff session ever asks for: it is handed in
// here as the `Staff` component and draws into the places this file leaves for it.
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchFlightInfo, resyncNotamCheckAirport } from '../../services/timelineApi';
import { useCanAction } from '../../AuthGate';
import { fetchPassengers } from '../../client/clientApi';
import MapView, { mapStateOf, useCoords } from '../../client/MapView';
import { prepareNotams, validityText } from '../../../../shared/notam-parse.mjs';
import ErrorBoundary from '../../components/ErrorBoundary';
import { Icon } from '../icons';
import { Btn, CloseBtn, MONO, Msg, SAFE_TOP, Segmented, Sheet, c } from '../kit';
import { flightStatus, limListOf } from './model';
import { MIN, agoText, hm, msOf, p2, spanText } from './util';

const LAB = { fontSize: 11, fontWeight: 600, letterSpacing: '.08em', color: c('t4'), whiteSpace: 'nowrap' };
const CAT = { VFR: 'ok', MVFR: 'air', IFR: 'bad', LIFR: 'bad' };
const OLD_AFTER_MS = 6 * 3_600_000;
const bad = (text) => <span style={{ color: c('bad') }}>{text}</span>;

// ───────────────────────────────────────────────────────────────────────────────────────────── the frame
function Frame({ id, state, label, onClose, layerRef, overlay, children }) {
  return (
    <div role="dialog" aria-modal="true" aria-label={label} data-open-flight={id ?? ''} data-flight-state={state}
      style={{ position: 'absolute', inset: 0, zIndex: 20, display: 'flex', flexDirection: 'column', background: c('scrim') }}>
      <button type="button" aria-label="Close flight" data-flight-strip="" onClick={onClose} style={{ flex: 'none', width: '100%', height: `calc(56px + ${SAFE_TOP})`, borderRadius: 0 }} />
      <div ref={layerRef} data-flight-sheet="" style={{ flex: 1, minHeight: 0, position: 'relative', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: c('bg'), color: c('t1'), borderTop: `1px solid ${c('l2')}`, borderRadius: '14px 14px 0 0', animation: 'cw3-up 140ms ease-out' }}>
        <div aria-hidden="true" style={{ flex: 'none', display: 'flex', justifyContent: 'center', paddingTop: 8 }}><span style={{ width: 32, height: 2, borderRadius: 1, background: c('l2') }} /></div>
        {children}
      </div>
      {overlay}
    </div>
  );
}

const PlainHead = ({ onClose }) => (
  <div style={{ flex: 'none', minHeight: 52, padding: '4px 8px 4px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, borderBottom: `1px solid ${c('l1')}` }}>
    <span style={{ fontSize: 16, fontWeight: 600, color: c('t1') }}>Flight</span>
    <CloseBtn onClick={onClose} label="Close flight" />
  </div>
);

const block = (w, h, mt = 0) => <div style={{ width: w, height: h, marginTop: mt, background: c('skel'), borderRadius: 4, animation: 'cw3-pulse 1.4s ease-in-out infinite' }} />;

/**
 * p: the flight as the phone reads it (model.js phoneFlight) or null. feedState: 'loading' | 'failed' | 'ok'.
 * gone: { cs, at } when the flight was open and then left the feed; null for an id the feed never had.
 * Staff: the staff-only part (a lazy component), or null for a client.
 */
export default function FlightView(props) {
  const { p, id, feedState, gone, onClose, reload } = props;
  if (p) return <OpenFlight {...props} />;
  if (feedState === 'loading') {
    return (
      <Frame id={id} state="loading" label="Flight" onClose={onClose}>
        <PlainHead onClose={onClose} />
        <div aria-busy="true" aria-label="Loading" data-skeleton="" style={{ padding: '16px 16px 0' }}>
          {block(144, 24)}{block(200, 12, 12)}{block('100%', 48, 24)}{block('100%', 48, 8)}{block('100%', 132, 16)}{block('100%', 48, 16)}
        </div>
      </Frame>
    );
  }
  if (feedState === 'failed') {
    return (
      <Frame id={id} state="failed" label="Flight" onClose={onClose}>
        <PlainHead onClose={onClose} />
        <Msg data-flight-failed="" title={bad('Couldn’t load this flight')} body="The flight system didn’t answer. Nothing is shown rather than old details." action="Try again" onAction={reload} primary />
      </Frame>
    );
  }
  // one message for a flight that left and for an id that was never this person's: nothing says which it was
  return (
    <Frame id={id} state="gone" label="Flight" onClose={onClose}>
      <PlainHead onClose={onClose} />
      <Msg data-flight-gone="" title={gone?.cs ? `${gone.cs} is no longer on the schedule` : 'This flight is no longer on the schedule'}
        body={gone?.at ? `It left the schedule at ${hm(gone.at)}Z. Nothing here was changed by you.` : 'It may have been moved or taken off. The list shows what is on the schedule now.'}
        action="Back to flights" onAction={onClose} />
    </Frame>
  );
}

// ───────────────────────────────────────────────────────────────────────────────────────────── the flight
function OpenFlight({ p, role, me, user, nowMs, stale, limitations, notamState, setNotamState, reload, dataUpdatedAt, theme, onClose, Staff }) {
  const staff = role === 'staff';
  const f = p.raw;
  const can = useCanAction();
  const [info, setInfo] = useState({ state: 'loading', data: null, at: 0 });
  const [sheet, setSheet] = useState(null); // pax | lim | notes | checks | services | ap:dep | ap:arr
  const [mapOpen, setMapOpen] = useState(false);
  const [again, setAgain] = useState({ busy: false, said: '', at: 0 });
  const [layer, setLayer] = useState(null);
  const [footSlot, setFootSlot] = useState(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const closeSheet = useCallback(() => setSheet(null), []);

  const loadInfo = useCallback(() => {
    if (!f?.flightNid) return;
    setInfo((x) => ({ ...x, state: 'loading' }));
    fetchFlightInfo({ flightNid: f.flightNid, oprId: f.oprId })
      .then((d) => { if (alive.current) setInfo({ state: 'ok', data: d, at: Date.now() }); })
      .catch(() => { if (alive.current) setInfo({ state: 'failed', data: null, at: Date.now() }); });
  }, [f?.flightNid, f?.oprId]);
  useEffect(() => { loadInfo(); }, [loadInfo]);

  // what this person may see here: staff everything; a client only what their account's switches turn on
  const sw = Array.isArray(me?.switches) ? me.switches : [];
  const canc = p.status === 'cancelled';
  const wxOn = staff || (!canc && sw.includes('weather'));
  const ntmOn = staff || (!canc && sw.includes('notams'));
  const mapOn = staff || sw.includes('radar');
  const paxOn = staff || (Boolean(me?.passengerLevel) && me.passengerLevel !== 'off' && !canc);
  const coords = useCoords(mapOn ? [p.adep, p.ades] : []);

  const minute = Math.floor(nowMs / MIN);
  const notams = useMemo(() => {
    const one = (side) => {
      // the wall answers { ok, data: { notams, updatedAt, stale } } (an older answer had the list beside ok)
      const raw = info.data?.notams?.[side];
      if (!raw) return null;
      const n = raw.data && typeof raw.data === 'object' ? { ...raw.data, ok: raw.ok } : raw;
      const at = msOf(n.updatedAt);
      return { ok: n.ok !== false && Array.isArray(n.notams), items: n.ok !== false ? prepareNotams(n.notams, minute * MIN).items : [], at, old: n.stale === true || (Number.isFinite(at) && minute * MIN - at > OLD_AFTER_MS) };
    };
    return { dep: one('dep'), arr: one('arr') };
  }, [info.data, minute]);

  const fetchAgain = useCallback(async (code) => {
    setAgain({ busy: true, said: '', at: 0 });
    try {
      if (staff && can('wall.notam.resync')) { const s = await resyncNotamCheckAirport(code); if (s?.airports) setNotamState?.(s); }
      const d = await fetchFlightInfo({ flightNid: f.flightNid, oprId: f.oprId });
      if (!alive.current) return;
      setInfo({ state: 'ok', data: d, at: Date.now() });
      setAgain({ busy: false, said: '', at: Date.now() });
    } catch {
      if (alive.current) setAgain({ busy: false, said: 'Couldn’t fetch them again. The list below is still the old one.', at: 0 });
    }
  }, [staff, can, f?.flightNid, f?.oprId, setNotamState]);

  // staff: the limitations of this flight (the count on the button; the sheet itself is in the staff file)
  const limList = useMemo(() => (staff ? limListOf(f, limitations) : []), [staff, f, limitations]);
  // client: the notes ops chose to share, by switch (the server already cut them; the switches are asked again here)
  const notes = useMemo(() => {
    if (staff || canc) return [];
    const all = Array.isArray(info.data?.flight?.limitations) ? info.data.flight.limitations : [];
    const key = { IMP: 'important', LIM: 'limitations', CAA: 'caa' };
    return all.filter((n) => key[n?.type] && sw.includes(key[n.type]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staff, canc, info.data, sw.join(',')]);

  const st = flightStatus(p);
  const durMs = p.arrMs - p.depMs;
  const paxCount = f.passengerCount != null && Number.isFinite(Number(f.passengerCount)) ? Number(f.passengerCount) : null;
  const headBtn = (label, count, icon, onClick, rest) => (
    <button type="button" onClick={onClick} {...rest} style={{ height: 44, display: 'flex', alignItems: 'center', flex: 'none' }}>
      <span className="cw3-press" style={{ height: 36, padding: '0 10px', borderRadius: 8, border: `1px solid ${c('l2')}`, display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: c('t1'), whiteSpace: 'nowrap' }}>
        {icon ? <Icon name={icon} size={16} /> : null}{label}{count != null ? <span style={{ ...MONO, color: c('t3') }}>{count}</span> : null}
      </span>
    </button>
  );

  const airport = (side) => {
    const code = side === 'dep' ? p.adep : p.ades;
    const right = side === 'arr';
    const cat = wxOn ? ((side === 'dep' ? f.wxDep : f.wxArr) || info.data?.weather?.[side]?.category || '') : '';
    const n = ntmOn && notams[side]?.ok ? notams[side].items.length : null;
    const parts = [wxOn ? 'Weather' : '', ntmOn ? `NOTAM${n == null ? '' : ` ${n}`}` : ''].filter(Boolean);
    const inner = (
      <>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexDirection: right ? 'row-reverse' : 'row', minWidth: 0 }}>
          <span style={{ ...MONO, fontSize: 22, fontWeight: 700, lineHeight: 1, color: c('t1') }}>{code || '····'}</span>
          {cat && CAT[cat] ? <span data-wx-cat={cat} style={{ ...MONO, display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: c(CAT[cat]) }}><i style={{ width: 6, height: 6, borderRadius: 3, background: c(CAT[cat]), display: 'block' }} />{cat}</span> : null}
        </span>
        {parts.length ? <span style={{ fontSize: 13, color: c('t2'), whiteSpace: 'nowrap' }}>{parts.join(' · ')} ›</span> : null}
      </>
    );
    const style = { minWidth: 0, minHeight: 44, padding: '16px 0 12px', display: 'flex', flexDirection: 'column', alignItems: right ? 'flex-end' : 'flex-start', gap: 8, textAlign: right ? 'right' : 'left' };
    if (!parts.length || !code) return <div data-airport={code} data-side={side} style={style}>{inner}</div>;
    return <button type="button" className="cw3-press" data-airport={code} data-side={side} onClick={() => setSheet(`ap:${side}`)} aria-label={`${code}: ${parts.join(' and ')}`} style={style}>{inner}</button>;
  };

  const times = (label, sched, kind, time, delta, right) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: right ? 'flex-end' : 'flex-start', minWidth: 0 }}>
      <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}><span style={LAB}>{label}</span><span data-time={label} style={{ ...MONO, fontSize: 13, color: c('t2') }}>{sched || '--:--'}Z</span></span>
      {kind && kind !== label ? (
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={LAB}>{kind}</span>
          <span data-time={kind} style={{ ...MONO, fontSize: 16, fontWeight: 700, color: c('t1') }}>{time || '--:--'}Z</span>
          {delta ? <span style={{ ...MONO, fontSize: 13, fontWeight: 700, color: delta > 0 ? c('warn') : c('ok') }}>{delta > 0 ? '+' : '−'}{Math.abs(delta)}</span> : null}
        </span>
      ) : null}
    </div>
  );

  const mapWords = canc ? 'Cancelled'
    : p.status === 'arrived' ? (p.estimated ? `Should have landed ${p.arrT}Z` : `Landed ${f.ataHm || p.arrT}Z`)
      : p.status === 'airborne' ? (p.estimated ? `No live position · planned off ${p.depT}Z` : `No live position · departed ${f.atdHm || p.depT}Z`)
        : `Not airborne yet · departs ${p.depT}Z`;

  const apSide = sheet === 'ap:dep' ? 'dep' : sheet === 'ap:arr' ? 'arr' : null;
  const staffProps = { p, user, nowMs, stale, limList, notamState, setNotamState, reload, dataUpdatedAt, sheet, setSheet, footSlot, layer };

  return (
    <Frame id={p.id} state="ok" label={`Flight ${p.cs}`} onClose={onClose} layerRef={setLayer}
      overlay={mapOpen ? <MapOverlay p={p} coords={coords} theme={theme} nowMs={nowMs} onClose={() => setMapOpen(false)} /> : null}>
      <div style={{ flex: 'none', padding: '4px 8px 4px 16px', borderBottom: `1px solid ${c('l1')}` }}>
        <div style={{ minHeight: 44, display: 'flex', alignItems: 'center', gap: 12 }}>
          <h2 data-flight-callsign="" style={{ ...MONO, margin: 0, fontSize: 22, fontWeight: 700, lineHeight: 1.2, color: c('t1'), minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.cs}</h2>
          <span data-flight-status={p.status} style={{ ...MONO, flex: 'none', display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, letterSpacing: '.06em', color: st.fg, whiteSpace: 'nowrap' }}>
            <i style={{ width: 6, height: 6, borderRadius: 3, background: st.fg, display: 'block' }} />{st.t}
          </span>
          <span style={{ flex: 1 }} />
          <CloseBtn onClick={onClose} label="Close flight" />
        </div>
        <div style={{ minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ ...MONO, fontSize: 13, color: c('t3'), minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{[p.reg, p.operator].filter(Boolean).join(' · ')}</span>
          <div style={{ display: 'flex', gap: 8, flex: 'none' }}>
            {paxOn ? headBtn('PAX', paxCount, 'users', () => setSheet('pax'), { 'data-open-pax': '', 'aria-label': paxCount != null ? `Passengers, ${paxCount}` : 'Passengers' }) : null}
            {staff && limList.length > 0 ? headBtn('Limits', limList.length, null, () => setSheet('lim'), { 'data-open-limits': '', 'aria-label': `Limitations, ${limList.length}` }) : null}
            {!staff && notes.length > 0 ? headBtn('Notes', notes.length, null, () => setSheet('notes'), { 'data-open-notes': '', 'aria-label': `Notes from ops, ${notes.length}` }) : null}
          </div>
        </div>
      </div>

      <div className="cw3-scroll" data-flight-body="" style={{ flex: 1, minHeight: 0 }}>
        <div style={{ padding: '0 16px 16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 56px minmax(0,1fr)', borderBottom: `1px solid ${c('l1')}` }}>
            {airport('dep')}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
              <Icon name="arrow-right" size={16} color={c('t3')} />
              <span style={{ ...MONO, fontSize: 11, color: c('t4'), whiteSpace: 'nowrap' }}>{durMs > 0 ? spanText(durMs) : ''}</span>
            </div>
            {airport('arr')}
          </div>
          <div data-flight-times="" style={{ padding: '12px 0', display: 'flex', justifyContent: 'space-between', gap: 12, borderBottom: `1px solid ${c('l1')}` }}>
            {times('STD', f.etd, p.depKind, p.depT, Number(f.depDeltaMin) || 0, false)}
            {times('STA', f.eta, p.arrKind, p.arrT, Number(f.arrDeltaMin) || 0, true)}
          </div>

          {mapOn ? <MapStrip p={p} coords={coords} theme={theme} words={mapWords} onOpen={canc ? null : () => setMapOpen(true)} /> : null}

          {staff && Staff ? (
            <ErrorBoundary where="phone/flight/staff" resetKey={p.id} fallback={(retry) => <Msg data-staff-failed="" title={bad('Couldn’t load the checks for this flight')} body="This part of the page didn’t load. The flight above is still live." action="Try again" onAction={retry} />}>
              <Suspense fallback={<div aria-busy="true" aria-label="Loading" style={{ marginTop: 16 }}>{block('100%', 48)}{block('100%', 72, 8)}</div>}>
                <Staff {...staffProps} />
              </Suspense>
            </ErrorBoundary>
          ) : <div style={{ height: 24 }} />}
        </div>
      </div>
      {staff ? <div ref={setFootSlot} data-flight-foot="" style={{ flex: 'none' }} /> : null}

      {apSide ? (
        <AirportSheet key={apSide} side={apSide} code={apSide === 'dep' ? p.adep : p.ades} info={info} list={notams[apSide]} wxOn={wxOn} ntmOn={ntmOn} staff={staff}
          review={staff ? (notamState?.airports || []).find((a) => a.icao === (apSide === 'dep' ? p.adep : p.ades)) : null}
          nowMs={nowMs} again={again} onAgain={fetchAgain} onRetry={loadInfo} onClose={closeSheet} />
      ) : null}
      {!staff && sheet === 'pax' && paxOn ? <ClientPax p={p} count={paxCount} onClose={closeSheet} /> : null}
      {!staff && sheet === 'notes' ? <NotesSheet notes={notes} cs={p.cs} onClose={closeSheet} /> : null}
    </Frame>
  );
}

// ───────────────────────────────────────────────────────────────────────────────────────────── the map
const TILE = 256;
const proj = (lat, lon, z) => { const n = TILE * 2 ** z; const r = (lat * Math.PI) / 180; return [((lon + 180) / 360) * n, ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n]; };
function greatCircle(a, b, steps = 32) {
  const toR = (d) => (d * Math.PI) / 180; const toD = (r) => (r * 180) / Math.PI;
  const [la1, lo1, la2, lo2] = [toR(a.lat), toR(a.lon), toR(b.lat), toR(b.lon)];
  const d = 2 * Math.asin(Math.sqrt(Math.sin((la2 - la1) / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin((lo2 - lo1) / 2) ** 2));
  if (!d) return [[a.lat, a.lon], [b.lat, b.lon]];
  const out = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps; const A = Math.sin((1 - t) * d) / Math.sin(d); const B = Math.sin(t * d) / Math.sin(d);
    const x = A * Math.cos(la1) * Math.cos(lo1) + B * Math.cos(la2) * Math.cos(lo2);
    const y = A * Math.cos(la1) * Math.sin(lo1) + B * Math.cos(la2) * Math.sin(lo2);
    const zz = A * Math.sin(la1) + B * Math.sin(la2);
    out.push([toD(Math.atan2(zz, Math.sqrt(x * x + y * y))), toD(Math.atan2(y, x))]);
  }
  return out;
}

const STRIP_H = 100;
/** The small map on the flight: both airports and the route between them. No aircraft is drawn: no live position is connected. */
function MapStrip({ p, coords, theme, words, onOpen }) {
  const ref = useRef(null);
  const [w, setW] = useState(358);
  useEffect(() => {
    const el = ref.current; if (!el) return undefined;
    const read = () => { if (el.clientWidth > 0) setW(el.clientWidth); };
    read();
    if (typeof ResizeObserver !== 'function') return undefined;
    const ro = new ResizeObserver(read); ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const a = coords?.[p.adep]; const b = coords?.[p.ades];
  const geo = useMemo(() => {
    if (!a || !b || ![a.lat, a.lon, b.lat, b.lon].every(Number.isFinite)) return null;
    const pts = greatCircle(a, b);
    const mid = pts[Math.floor(pts.length / 2)];
    let z = 8;
    for (; z > 0; z--) {
      const m = proj(mid[0], mid[1], z);
      if ([a, b].every((ap) => { const q = proj(ap.lat, ap.lon, z); return Math.abs(q[0] - m[0]) <= w / 2 - 48 && Math.abs(q[1] - m[1]) <= STRIP_H / 2 - 20; })) break;
    }
    const m = proj(mid[0], mid[1], z);
    const ox = m[0] - w / 2; const oy = m[1] - STRIP_H / 2;
    const S = (lat, lon) => { const q = proj(lat, lon, z); return [q[0] - ox, q[1] - oy]; };
    const n = 2 ** z; const tiles = [];
    for (let tx = Math.floor(ox / TILE); tx <= Math.floor((ox + w) / TILE); tx++) for (let ty = Math.floor(oy / TILE); ty <= Math.floor((oy + STRIP_H) / TILE); ty++) {
      if (ty < 0 || ty >= n) continue;
      tiles.push({ key: `${tx}-${ty}`, src: `https://basemaps.cartocdn.com/${theme === 'light' ? 'light_all' : 'dark_all'}/${z}/${((tx % n) + n) % n}/${ty}@2x.png`, x: Math.round(tx * TILE - ox), y: Math.round(ty * TILE - oy) });
    }
    const path = pts.map((q) => S(q[0], q[1])).map((q, i) => `${i ? 'L' : 'M'}${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join(' ');
    return { tiles, path, A: S(a.lat, a.lon), B: S(b.lat, b.lon) };
  }, [a, b, w, theme]);
  const mark = (q, code, other) => {
    const left = q[0] <= other[0];
    return (
      <g key={code}>
        <rect x={q[0] - 3.5} y={q[1] - 3.5} width="7" height="7" style={{ fill: c('bg'), stroke: c('t1'), strokeWidth: 1.5 }} />
        <text x={q[0] + (left ? -8 : 8)} y={q[1] + 4} textAnchor={left ? 'end' : 'start'} style={{ ...MONO, fontSize: 11, fontWeight: 700, fill: c('t1'), stroke: c('bg'), strokeWidth: 3, paintOrder: 'stroke' }}>{code}</text>
      </g>
    );
  };
  const inner = (
    <>
      <div ref={ref} style={{ position: 'relative', height: STRIP_H, overflow: 'hidden', background: c('s1') }}>
        {geo ? (
          <>
            {geo.tiles.map((t) => <img key={t.key} src={t.src} alt="" draggable={false} style={{ position: 'absolute', left: t.x, top: t.y, width: TILE, height: TILE, pointerEvents: 'none', userSelect: 'none' }} />)}
            <svg width={w} height={STRIP_H} aria-hidden="true" style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none' }}>
              <path d={geo.path} fill="none" strokeLinecap="round" strokeDasharray={p.status === 'arrived' ? undefined : '5 5'} style={{ stroke: c('t3'), strokeWidth: 1.5 }} />
              {mark(geo.A, p.adep, geo.B)}{mark(geo.B, p.ades, geo.A)}
            </svg>
          </>
        ) : <span style={{ ...MONO, position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: c('t4') }}>{p.adep} → {p.ades}</span>}
      </div>
      <div style={{ height: 32, padding: '0 12px', display: 'flex', alignItems: 'center', gap: 12, background: c('bg'), borderTop: `1px solid ${c('l1')}` }}>
        <span data-map-words="" style={{ flex: 1, minWidth: 0, fontSize: 13, color: c('t2'), textAlign: 'left', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{words}</span>
        {onOpen ? <span style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: c('t1') }}>Map<Icon name="maximize-2" size={16} /></span> : null}
      </div>
    </>
  );
  const style = { display: 'block', width: '100%', marginTop: 16, border: `1px solid ${c('l2')}`, borderRadius: 8, overflow: 'hidden', background: c('s1') };
  if (!onOpen) return <div data-map-strip="" style={style}>{inner}</div>;
  return <button type="button" data-map-strip="" data-open-map="" aria-label={`Open the map. ${words}`} onClick={onOpen} style={style}>{inner}</button>;
}

/** The full map: the client desk's own map component, as it is, in the phone's colours. Back or Escape closes it. */
function MapOverlay({ p, coords, theme, nowMs, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const f = useMemo(() => ({ ...p.raw, fn: p.cs, dep: p.adep, arr: p.ades, __reg: p.reg, depHm: p.depT, arrHm: p.arrT, depKind: p.depKind, endUtcMs: p.arrMs, delayedStartUtcMs: p.depMs, status: p.status }), [p]);
  const vars = {
    '--cwm-bg': c('bg'), '--cwm-surface': c('bg2'), '--cwm-border': c('l2'), '--cwm-text': c('t1'), '--cwm-muted': c('t3'), '--cwm-body': c('t2'), '--cwm-link': c('t1'),
    '--cwm-now': c('air'), '--cwm-now-glow': 'transparent', '--cwm-now-text': c('air'), '--cwm-shadow': `0 8px 24px ${c('scrim')}`, '--cwm-skeleton': c('skel'), '--cwm-mono': 'var(--c-mono)', '--cwm-sans': 'var(--c-font)',
  };
  return (
    <div role="dialog" aria-modal="true" aria-label={`Map of ${p.cs}`} data-flight-map="" style={{ position: 'absolute', inset: 0, zIndex: 15, display: 'flex', flexDirection: 'column', background: c('bg'), color: c('t1'), paddingTop: SAFE_TOP }}>
      <div style={{ flex: 'none', height: 52, display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px 0 4px', borderBottom: `1px solid ${c('l1')}` }}>
        <button type="button" data-map-back="" onClick={onClose} className="cw3-press" style={{ minHeight: 44, minWidth: 44, padding: '0 10px 0 6px', display: 'flex', alignItems: 'center', gap: 2, fontSize: 16, color: c('t2') }}><Icon name="chevron-left" size={20} />Flight</button>
        <span style={{ flex: 1 }} />
        <span style={{ ...MONO, fontSize: 13, fontWeight: 700, color: c('t1'), whiteSpace: 'nowrap' }}>{p.cs}</span>
        <span style={{ ...MONO, fontSize: 13, color: c('t3'), whiteSpace: 'nowrap' }}>{p.adep} → {p.ades}</span>
      </div>
      <div style={{ ...vars, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <ErrorBoundary where="phone/flight/map" fallback={<Msg title={bad('Couldn’t draw the map')} body="Go back to the flight. The times there are still live." action="Back to the flight" onAction={onClose} />}>
          <MapView p={f} coords={coords} position={null} state={mapStateOf(f, null, true)} theme={theme === 'light' ? 'light' : 'dark'} nowMs={nowMs} />
        </ErrorBoundary>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────────────────────── airport sheet
const wxGrid = (w) => [
  ['WIND', w.windDegrees != null ? `${String(w.windDegrees).padStart(3, '0')}° ${w.windSpeedKts ?? '—'} kt${w.windGustKts ? ` G${w.windGustKts}` : ''}` : '—'],
  ['VISIBILITY', w.visibilityMeters != null ? (w.visibilityMeters >= 9999 ? '10 km+' : `${Math.round(w.visibilityMeters)} m`) : '—'],
  ['CEILING', w.ceilingFeet != null ? `${w.ceilingFeet} ft` : 'None'],
  ['TEMP / DEW', w.temperatureC != null ? `${w.temperatureC}° / ${w.dewpointC ?? '—'}°` : '—'],
  ['QNH', w.qnhHpa != null ? `${w.qnhHpa} hPa` : '—'],
  ['CATEGORY', w.category || '—'],
];
const FIELD_KEYS = ['q', 'a', 'b', 'c', 'd', 'e', 'f', 'g'];

/** One NOTAM, one field per line (Q A B C D E F G). `isNew`: staff have not checked it yet today. */
function NotamCard({ x, n, isNew }) {
  const fl = x.fields || {};
  const id = fl.id || x.number || x.id || `#${n}`;
  const rows = FIELD_KEYS.filter((k) => fl[k]);
  return (
    <div data-notam={id} data-new={isNew ? '' : undefined} style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, borderBottom: `1px solid ${c('l1')}` }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ ...MONO, fontSize: 13, fontWeight: 700, color: c('t1') }}>{id}</span>
        {isNew ? <span style={{ ...MONO, fontSize: 11, fontWeight: 700, color: c('warn') }}>NEW</span> : null}
        <span style={{ ...MONO, flex: 1, minWidth: 0, fontSize: 11, color: c('t3'), textAlign: 'right', overflowWrap: 'anywhere' }}>{validityText(fl)}</span>
      </div>
      {fl.parsed && rows.length ? (
        <div style={{ display: 'grid', gridTemplateColumns: '24px minmax(0,1fr)', rowGap: 4 }}>
          {rows.map((k) => [
            <span key={`${k}k`} style={{ ...MONO, fontSize: 11, lineHeight: k === 'e' ? '20.8px' : 1.6, color: c('t4') }}>{k.toUpperCase()})</span>,
            <span key={`${k}v`} data-notam-field={k.toUpperCase()} style={{ ...MONO, fontSize: k === 'e' ? 13 : 11, lineHeight: 1.6, color: k === 'e' ? c('t1') : k === 'q' ? c('t4') : c('t2'), whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{fl[k]}</span>,
          ])}
        </div>
      ) : <div style={{ ...MONO, fontSize: 13, lineHeight: 1.6, color: c('t1'), whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{fl.raw || x.condition || x.text || x.raw || ''}</div>}
    </div>
  );
}

function AirportSheet({ side, code, info, list, wxOn, ntmOn, staff, review, nowMs, again, onAgain, onRetry, onClose }) {
  const w = info.data?.weather?.[side] || null;
  const unreviewed = useMemo(() => new Set(staff && review && !review.checked ? (review.filtered || []).map((x) => x.number || x.id).filter(Boolean) : []), [staff, review]);
  const [tab, setTab] = useState(() => (!wxOn ? 'notams' : ntmOn && unreviewed.size ? 'notams' : 'wx'));
  const count = list?.ok ? list.items.length : null;
  const checked = info.at ? `${hm(info.at)}Z` : '';
  const obs = msOf(w?.observed);
  const isNew = (x) => unreviewed.has(x.number) || unreviewed.has(x.id) || unreviewed.has(x.fields?.id);
  let body;
  if (!info.data && info.state === 'loading') body = <div aria-busy="true" aria-label="Loading" data-skeleton="" style={{ padding: 16 }}>{block('100%', 96)}{block('100%', 64, 12)}{block('100%', 64, 12)}</div>;
  else if (!info.data) body = <Msg data-airport-failed="" title={bad(`Couldn’t fetch weather or NOTAMs for ${code}`)} body="The flight system didn’t answer. Nothing is shown rather than old data." action="Try again" onAction={onRetry} primary />;
  else if (tab === 'wx') {
    body = w && !w.error ? (
      <div data-weather={code} style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
          <span style={LAB}>METAR</span>
          <span style={{ ...MONO, fontSize: 11, color: c('t3') }}>{Number.isFinite(obs) ? `${hm(obs)}Z · ${agoText(obs, nowMs)}` : ''}</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: '12px 8px' }}>
          {wxGrid(w).map(([l, val]) => (
            <div key={l} style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
              <span style={LAB}>{l}</span>
              <span style={{ ...MONO, fontSize: 13, color: l === 'CATEGORY' && CAT[w.category] ? c(CAT[w.category]) : c('t1'), overflowWrap: 'anywhere' }}>{val}</span>
            </div>
          ))}
        </div>
        {w.rawText ? <div style={{ ...MONO, fontSize: 13, lineHeight: 1.6, color: c('t2'), background: c('s1'), padding: '8px 12px', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{w.rawText}</div> : null}
      </div>
    ) : <Msg data-weather-none="" title={`No weather published for ${code}`} body={`No METAR is on file for this airport right now.${checked ? ` Checked ${checked}.` : ''}`} />;
  } else if (!list?.ok) {
    body = <Msg data-notams-failed="" title={bad(`Couldn’t fetch NOTAMs for ${code}`)} body="The NOTAM service didn’t answer. Nothing is shown rather than an old list." action="Try again" onAction={onRetry} primary />;
  } else if (list.items.length === 0) {
    body = <Msg data-notams-none="" title={`No NOTAMs in force for ${code}`} body={`${checked ? `Checked ${checked}. ` : ''}New ones appear here when they are published.`} />;
  } else {
    body = (
      <>
        {list.old ? (
          <div data-notams-old="" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, borderBottom: `1px solid ${c('l1')}` }}>
            <div role="status" style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, lineHeight: 1.45, color: c('warn') }}>
              <Icon name="triangle-alert" size={16} style={{ marginTop: 1 }} />
              <span>{Number.isFinite(list.at) ? `These NOTAMs were fetched at ${hm(list.at)}Z, ${agoText(list.at, nowMs)}. Newer ones may be missing.` : 'These NOTAMs are an old list. Newer ones may be missing.'}</span>
            </div>
            {again.said ? <div role="alert" style={{ fontSize: 13, lineHeight: 1.45, color: c('bad') }}>{again.said}</div>
              : again.at ? <div role="status" style={{ fontSize: 13, lineHeight: 1.45, color: c('t3') }}>Asked again at {hm(again.at)}Z. No newer list came back yet.</div> : null}
            <Btn data-notams-again="" disabled={again.busy} onClick={() => onAgain(code)}><Icon name="rotate-cw" size={16} />{again.busy ? 'Fetching…' : 'Fetch again'}</Btn>
          </div>
        ) : null}
        <div style={{ opacity: list.old ? 0.6 : 1 }}>
          {list.items.map((x, i) => <NotamCard key={`${x.fields?.id || x.number || x.id || 'n'}-${i}`} x={x} n={i + 1} isNew={isNew(x)} />)}
        </div>
      </>
    );
  }
  return (
    <Sheet name="airport" data-airport-sheet={code} title={code} titleMono sub={side === 'dep' ? 'Departure' : 'Arrival'} height="88%" onClose={onClose}>
      {wxOn && ntmOn ? (
        <div style={{ padding: '12px 16px', borderBottom: `1px solid ${c('l1')}` }}>
          <Segmented label={`${code}: weather or NOTAMs`} data-airport-tabs="" value={tab} onChange={setTab}
            options={[{ value: 'wx', label: 'Weather' }, { value: 'notams', label: count == null ? 'NOTAMs' : `NOTAMs ${count}` }]} />
        </div>
      ) : null}
      {body}
    </Sheet>
  );
}

// ───────────────────────────────────────────────────────────────────────────────────────────── client sheets
/** A client's passenger list: exactly what the client read returns (names), and only when their account has it on. */
function ClientPax({ p, count, onClose }) {
  const f = p.raw;
  const [st, setSt] = useState({ state: 'loading', rows: [] });
  const [turn, setTurn] = useState(0);
  useEffect(() => {
    let stop = false;
    setSt({ state: 'loading', rows: [] });
    fetchPassengers(f.flightNid, f.oprId)
      .then((d) => { if (!stop) setSt({ state: 'ok', rows: Array.isArray(d?.passengers) ? d.passengers : [] }); })
      .catch(() => { if (!stop) setSt({ state: 'failed', rows: [] }); });
    return () => { stop = true; };
  }, [f.flightNid, f.oprId, turn]);
  const n = st.state === 'ok' ? st.rows.length : count;
  return (
    <Sheet name="passengers" title="Passengers" sub={n != null ? `${n} on ${p.cs}` : p.cs} height="62%" onClose={onClose}>
      <div style={{ padding: '12px 16px', display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, lineHeight: 1.45, color: c('t3'), borderBottom: `1px solid ${c('l1')}` }}>
        <Icon name="lock" size={16} style={{ marginTop: 1 }} /><span>Clearway shares names only. Documents stay with the ops team.</span>
      </div>
      {st.state === 'loading' ? <div aria-busy="true" aria-label="Loading" data-skeleton="" style={{ padding: 16 }}>{block('100%', 44)}{block('100%', 44, 8)}{block('100%', 44, 8)}</div>
        : st.state === 'failed' ? <Msg data-pax-failed="" title={bad('Couldn’t load passengers')} body="The flight system didn’t answer. Passenger data is never stored on this phone." action="Try again" onAction={() => setTurn((t) => t + 1)} primary />
          : st.rows.length === 0 ? <Msg data-pax-none="" title="No passengers entered yet" body={`The passenger list for ${p.cs} hasn’t been entered. It shows here as soon as it is.`} />
            : st.rows.map((r, i) => (
              <div key={r.id || i} data-pax-row="" style={{ minHeight: 52, padding: '12px 16px', display: 'grid', gridTemplateColumns: '24px minmax(0,1fr)', columnGap: 12, alignItems: 'baseline', borderBottom: `1px solid ${c('l1')}` }}>
                <span style={{ ...MONO, fontSize: 11, color: c('t4') }}>{p2(i + 1)}</span>
                <span style={{ fontSize: 16, fontWeight: 600, color: c('t1'), overflowWrap: 'anywhere' }}>{r.name}</span>
                {r.nationality ? <><span /><span style={{ display: 'flex', gap: 8, alignItems: 'baseline', marginTop: 4 }}><span style={{ ...LAB, width: 88 }}>NATIONALITY</span><span style={{ ...MONO, fontSize: 13, color: c('t2') }}>{r.nationality}</span></span></> : null}
              </div>
            ))}
    </Sheet>
  );
}

const NOTE_GROUPS = [['IMP', 'IMPORTANT'], ['LIM', 'LIMITATIONS'], ['CAA', 'AUTHORITY CONTACTS']];
/** A client's notes from ops on this flight, read only. Only the kinds their account has switched on arrive here. */
function NotesSheet({ notes, cs, onClose }) {
  return (
    <Sheet name="notes" title="Notes from ops" sub={`${notes.length} on ${cs}`} height="62%" onClose={onClose}>
      {notes.length === 0 ? <Msg title="No notes on this flight" /> : NOTE_GROUPS.map(([type, label]) => {
        const rows = notes.filter((n) => n.type === type);
        if (!rows.length) return null;
        return (
          <section key={type} data-notes={type}>
            <div style={{ minHeight: 32, padding: '0 16px', display: 'flex', alignItems: 'center', background: c('bg2'), borderBottom: `1px solid ${c('l1')}`, ...LAB, color: c('t3') }}>{label}</div>
            {rows.map((n, i) => {
              const caa = type === 'CAA' ? n.caa || {} : null;
              const lines = caa ? [caa.functionText, caa.contact, caa.phones, caa.mail].filter(Boolean).map(String) : [n.description].filter(Boolean).map(String);
              return (
                <div key={n.id ?? i} style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 4, borderBottom: `1px solid ${c('l1')}` }}>
                  <span style={{ fontSize: 16, fontWeight: 600, color: c('t1'), overflowWrap: 'anywhere' }}>{caa ? caa.authorityName || caa.country || n.title : n.title}</span>
                  {lines.map((t, k) => <span key={k} style={{ fontSize: 16, lineHeight: 1.5, color: c('t2'), overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>{t}</span>)}
                </div>
              );
            })}
          </section>
        );
      })}
    </Sheet>
  );
}
