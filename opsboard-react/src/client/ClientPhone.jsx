// The client's phone (design "Phone Views", 2026-11-10): the same Board as the desk, two hours across, one tap between
// the timeline and the list, a flight page with Map and Passengers buttons (one normal tap each; nothing is held),
// and the passengers sheet in the page's own calm surfaces. The portal shell around this frame carries the tab bar
// (Timeline, Flights, Account), so this page has none. Zoom: the Board's hours change only from the two buttons; the
// chosen zoom, day and scroll survive a refresh and a trip into a flight (sessionStorage, clientApi.readView).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Board from '../components/Board';
import { flattenFlights, hmZ } from '../components/mobile/mobileUtil';
import { dayIndex, dayLabel, dayName, dayShort, dayStartMs, groupOperators, matchesQuery, readView, writeView, fetchPassengers } from './clientApi';
import ClientFlightBody, { StatusChip, useFlightInfo } from './ClientFlight';
import MapView, { mapStateOf, useCoords } from './MapView';

const ZOOM = [{ label: '0.7×', hours: 3 }, { label: '1×', hours: 2 }, { label: '1.4×', hours: 1.5 }];
const H = 3600_000;

function PaxSheet({ p, onClose }) {
  const [st, setSt] = useState({ state: 'loading', rows: [] });
  useEffect(() => { let stop = false; fetchPassengers(p.flightNid, p.oprId).then((d) => { if (!stop) setSt({ state: 'ok', rows: d.passengers || [] }); }).catch((e) => { console.error('[passengers]', e); if (!stop) setSt({ state: 'failed', rows: [], error: 'The passenger list could not be read right now.' }); }); return () => { stop = true; }; }, [p.flightNid, p.oprId]);
  return (
    <>
      <div className="cwp-scrim" onClick={onClose} />
      <div className="cwp-sheet" role="dialog" aria-label="Passengers" data-pax-sheet="">
        <div className="cwp-handle" />
        <div className="cwp-sheet-head"><span><b>Passengers{st.state === 'ok' ? ` · ${st.rows.length}` : ''}</b><small className="cwd-mono">{p.fn} · {p.dep} → {p.arr}</small></span><button type="button" className="cwd-icon-btn" onClick={onClose} aria-label="Close">×</button></div>
        <div className="cwp-sheet-body">
          {st.state === 'loading' && <p className="cwd-muted" style={{ padding: 16 }}>Reading the passenger list…</p>}
          {st.state === 'failed' && <p className="cwd-muted" style={{ padding: 16 }}>{st.error || 'The passenger list could not be read.'}</p>}
          {st.state === 'ok' && !st.rows.length && <p className="cwd-muted" style={{ padding: 16 }}>No passengers entered for this flight.</p>}
          {st.state === 'ok' && st.rows.map((r, i) => <div key={r.id || i} className="cwp-pax-row"><span className="cwd-mono cwd-muted">{i + 1}</span><span>{r.name}</span></div>)}
          {st.state === 'ok' && st.rows.length > 0 && <p className="cwd-muted cwp-foot">Names as shared by Clearway ops.</p>}
        </div>
      </div>
    </>
  );
}

function FlightPage({ p, me, names, onBack, role = 'client', onChanged, staff = null }) {
  const info = useFlightInfo(p);
  const [sub, setSub] = useState(null); // null | 'map' | 'pax'
  const [full, setFull] = useState(false);
  const coords = useCoords([p.dep, p.arr]);
  const paxOn = me?.passengerLevel && me.passengerLevel !== 'off' && p.status !== 'cancelled';
  const radarOn = Boolean(me?.switches?.includes('radar'));
  const mapState = mapStateOf(p, null, info.state !== 'loading');
  if (sub === 'map') {
    return (
      <div className="cwp-page" data-flight-page={p.fn} data-sub="map">
        {!full && <div className="cwp-bar"><button type="button" className="cwp-back" onClick={() => setSub(null)} aria-label="Back to the flight">‹</button><span className="cwp-bar-title"><b className="cwd-mono">{p.fn}</b><small>Map</small></span><button type="button" className="cwd-icon-btn" onClick={() => setFull(true)} aria-label="Full screen">⤢</button></div>}
        <MapView p={p} coords={coords} position={null} state={mapState} theme={document.documentElement.getAttribute('data-theme') || 'light'} full={full} onToggleFull={() => setFull(false)} onBack={() => setSub(null)} />
      </div>
    );
  }
  return (
    <div className="cwp-page" data-flight-page={p.fn}>
      <div className="cwp-bar"><button type="button" className="cwp-back" onClick={onBack} aria-label="Back" data-back="">‹</button><span className="cwp-bar-title"><b className="cwd-mono">{p.fn}</b><small>{p.dep} → {p.arr} · {dayLabel(dayIndex(p.delayedStartUtcMs))}</small></span></div>
      <div className="cwp-scroll">
        <ClientFlightBody p={p} me={me} names={names} info={info} afterTop={role === 'staff' && staff?.Checks && p.status !== 'cancelled' ? <staff.Checks p={p} onChanged={onChanged} /> : null} extraTop={
          <div className="cwp-btns" style={{ gridTemplateColumns: paxOn ? '1fr 1.25fr' : '1fr' }}>
            {radarOn && <button type="button" className="cwp-big" onClick={() => setSub('map')} data-open-map="">Map{p.status === 'airborne' && <span className="cwp-live">AIRBORNE</span>}</button>}
            {paxOn && <button type="button" className="cwp-big" onClick={() => setSub('pax')} data-open-pax="">Passengers{Number.isFinite(p.passengerCount) ? ` · ${p.passengerCount}` : ''}</button>}
          </div>
        } />
      </div>
      {sub === 'pax' && <PaxSheet p={p} onClose={() => setSub(null)} />}
    </div>
  );
}

// `staffParts` ({ Checks, openChips }) comes only from the staff surface (StaffPhone.jsx): a client's bundle never holds the
// wall's check code or the NOTAM Check page's address (rig/client-allow-check.mjs sweeps for staff routes).
export default function ClientPhone({ page, goPage, me, prefs, setHidden, aircraft, visible, windowStartUtc, windowEndUtc, clocks, loadedOnce, error, feed, serviceOn, onReload, look, role = 'client', staffParts = null }) {
  const staff = role === 'staff';
  const openCheckChips = (f) => (staffParts?.openChips ? staffParts.openChips(f) : []);
  const view0 = readView();
  const [zoom, setZoom] = useState(() => (Number.isInteger(view0.zoom) ? Math.max(0, Math.min(2, view0.zoom)) : 1));
  const [day, setDay] = useState(() => (Number.isInteger(view0.day) ? view0.day : 0));
  const [scrollTo, setScrollTo] = useState(null);
  const [openId, setOpenId] = useState(() => view0.openId || null);
  const [filter, setFilter] = useState(false);
  const [q, setQ] = useState(() => view0.q || '');
  const lanesRef = useRef(null);
  useEffect(() => { writeView({ zoom, day, openId, q }); }, [zoom, day, openId, q]);
  // the scroll position of the lanes survives a trip into a flight (and a reload)
  useEffect(() => { const el = lanesRef.current; if (!el) return undefined; const v = readView(); if (Number.isFinite(v.lanesTop)) el.scrollTop = v.lanesTop; const on = () => writeView({ lanesTop: el.scrollTop }); el.addEventListener('scroll', on, { passive: true }); return () => el.removeEventListener('scroll', on); }, [openId, page]);

  const all = useMemo(() => flattenFlights(visible), [visible]);
  const flights = useMemo(() => all.slice().sort((a, b) => a.delayedStartUtcMs - b.delayedStartUtcMs), [all]);
  const names = useMemo(() => { const m = {}; for (const f of all) { if (f.depName) m[f.dep] = f.depName; if (f.arrName) m[f.arr] = f.arrName; } return m; }, [all]);
  const openF = openId ? flights.find((f) => f.id === openId) || null : null;
  const nowMs = Date.now();
  const nHidden = aircraft.length - visible.length;
  const allHidden = aircraft.length > 0 && visible.length === 0;
  const listed = flights.filter((f) => matchesQuery(f, q));
  const days = [];
  for (const f of listed) { const k = dayIndex(f.delayedStartUtcMs, nowMs); let g = days.find((x) => x.k === k); if (!g) { g = { k, rows: [] }; days.push(g); } g.rows.push(f); }
  const live = !serviceOn || feed == null ? null : feed.live === 'working' && feed.healthy !== false;
  const goDay = (d) => { const idx = Math.max(-1, Math.min(6, d)); setDay(idx); setScrollTo(dayStartMs(idx)); };
  const ops = useMemo(() => groupOperators(aircraft), [aircraft]);
  const failed = loadedOnce && Boolean(error) && aircraft.length === 0;

  if (openF) return <FlightPage p={openF} me={me} names={names} onBack={() => setOpenId(null)} role={role} onChanged={onReload} staff={staffParts} />;
  if (openId && loadedOnce && !openF) { /* the flight left the board while it was open */ setOpenId(null); }

  return (
    <div className="cwp" data-client-page={page}>
      <div className="cwp-bar">
        <span className="cwp-bar-title"><b>{page === 'flights' ? (staff ? 'List' : 'Flights') : 'Timeline'}</b><small>{dayShort(day, nowMs)} · {visible.length} aircraft{nHidden ? ` · ${nHidden} hidden` : ''}</small></span>
        <div className="cwp-toggle" role="tablist"><button type="button" role="tab" aria-selected={page === 'timeline'} className={page === 'timeline' ? 'is-on' : ''} onClick={() => goPage('timeline')} aria-label="Timeline" data-view-timeline="">▤</button><button type="button" role="tab" aria-selected={page === 'flights'} className={page === 'flights' ? 'is-on' : ''} onClick={() => goPage('flights')} aria-label="List" data-view-list="">☰</button></div>
        <button type="button" className={`cwd-icon-btn${nHidden ? ' is-on' : ''}`} onClick={() => setFilter(true)} aria-label="Aircraft shown" data-operators-button="">⚙</button>
      </div>
      {serviceOn && live === false && <div className="cwp-banner" data-service-status="behind"><b>Not live right now.</b> Last update {feed?.updatedAt ? `${hmZ(Date.parse(feed.updatedAt))}Z` : '—'}.</div>}
      {nHidden > 0 && <div className="cwp-banner is-hidden" data-hidden-chip=""><span>{nHidden} aircraft hidden</span><button type="button" onClick={() => setHidden({ operators: [], registrations: [] })} data-show-all="">Show all</button></div>}
      {failed && <div className="cwp-error" data-error=""><b>Couldn’t load flights</b><span>The wall service didn’t answer. Nothing is shown rather than an old list.</span><button type="button" className="cwd-btn is-primary" onClick={onReload}>Try again</button></div>}

      {page === 'timeline' && !failed && (
        <>
          <div className="cwp-controls">
            <div className="cwd-seg"><button type="button" onClick={() => goDay(day - 1)} aria-label="Previous day" data-prev-day="">‹</button><span>{dayShort(day, nowMs)}</span><button type="button" onClick={() => goDay(day + 1)} aria-label="Next day" data-next-day="">›</button></div>
            <span style={{ flex: 1 }} />
            <div className="cwd-seg"><button type="button" onClick={() => setZoom((z) => Math.max(0, z - 1))} aria-label="Zoom out" data-zoom-out="">−</button><button type="button" onClick={() => setZoom((z) => Math.min(2, z + 1))} aria-label="Zoom in" data-zoom-in="">+</button></div>
            <button type="button" className="cwd-btn" onClick={() => goDay(0)} data-go-now="">Now</button>
          </div>
          <div className="cwp-lanes" ref={lanesRef} data-board="">
            {allHidden ? <div className="cwd-empty" data-empty="all-hidden"><b>You’ve hidden every aircraft</b><span>The flights are still there, just not on your screen.</span><button type="button" className="cwd-btn is-primary" onClick={() => setHidden({ operators: [], registrations: [] })} data-show-all="">Show all</button></div>
              : <div style={{ height: 30 + Math.max(1, visible.length) * 78 }}>
                <Board aircraft={visible} limitations={[]} windowStartUtc={windowStartUtc} windowEndUtc={windowEndUtc} scale={look.scale} timeZoom={look.timeZoom} rowZoom={look.rowZoom} pillHeight={look.pillHeight} markerScale={look.markerScale} labelScale={look.labelScale} autoFitRows={look.autoFitRows} hideSidebar rowHeightPx={Math.round(78 * look.rowZoom)} viewportHoursOverride={ZOOM[zoom].hours} autoReturnToNow={false} scrollToMs={scrollTo} onPillTap={(f) => setOpenId(f.id)} showUnconfirmedRing={staff} touchHitMinPx={44} maxMarkers={staff ? 2 : 1} forceMarkerMode="dots" markersInside bodyContent="callsign" bodyRight="times" belowText="none" acColScale={0.8} />
              </div>}
            {!loadedOnce && <p className="cwd-muted" style={{ padding: 16 }}>Loading your flights…</p>}
            {loadedOnce && aircraft.length > 0 && all.length === 0 && !allHidden && <div className="cwd-empty" data-empty="no-flights"><b>No flights in the next 7 days</b><span>New flights appear here as soon as Clearway ops has them.</span></div>}
            {loadedOnce && aircraft.length === 0 && !error && <div className="cwd-empty" data-empty="no-fleet"><b>No aircraft on your account yet</b><span>Clearway ops grants operators and aircraft.</span></div>}
            <div className="cwd-legend is-phone">{[['Scheduled', 'var(--tl-scheduled)'], ['Delayed', 'var(--tl-delayed)'], ['CTOT / slot', 'var(--tl-ctot)'], ['Flying', 'var(--tl-flying)'], ['Arrived', 'var(--tl-arrived)']].map(([t, bg]) => <span key={t}><i style={{ background: bg }} />{t}</span>)}</div>
          </div>
        </>
      )}

      {page === 'flights' && !failed && (
        <div className="cwp-list">
          <label className="cwd-search is-phone"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Flight, registration or airport" spellCheck={false} data-flights-search="" />{q && <button type="button" onClick={() => setQ('')} aria-label="Clear search">×</button>}</label>
          {days.map((g) => (
            <div key={g.k}>
              <div className="cwd-dayhead">{dayName(g.k, nowMs)}<span className="cwd-mono cwd-muted">{dayLabel(g.k, nowMs)}</span></div>
              {g.rows.map((f) => (
                <button type="button" key={f.id} className={`cwp-row${f.status === 'airborne' ? ' is-air' : ''}${f.status === 'cancelled' ? ' is-cnl' : ''}`} onClick={() => setOpenId(f.id)} data-flight-row={f.fn}>
                  <span className="cwp-row-time"><b className="cwd-mono">{f.depHm}</b><small className="cwd-mono">→ {f.arrHm}</small></span>
                  <span className="cwp-row-main"><span><b className="cwd-mono">{f.fn}</b><small className="cwd-mono">{f.__reg}</small></span><small className="cwd-mono">{f.dep} → {f.arr}</small>{staff && openCheckChips(f).length > 0 && <span className="cwp-row-chips" data-open-checks={openCheckChips(f).join(' ')}>{openCheckChips(f).map((k) => <span key={k}>{k}</span>)}</span>}</span>
                  <StatusChip status={f.status} />
                </button>
              ))}
            </div>
          ))}
          {allHidden && <div className="cwd-empty" data-empty="all-hidden"><b>You’ve hidden every aircraft</b><button type="button" className="cwd-btn is-primary" onClick={() => setHidden({ operators: [], registrations: [] })} data-show-all="">Show all</button></div>}
          {!allHidden && q && !listed.length && all.length > 0 && <div className="cwd-empty" data-empty="no-match"><b>No flights match “{q}”</b><span>Search looks at flight numbers, registrations and airport codes.</span></div>}
          {loadedOnce && aircraft.length > 0 && all.length === 0 && !allHidden && <div className="cwd-empty" data-empty="no-flights"><b>No flights in the next 7 days</b><span>New flights appear here as soon as Clearway ops has them.</span></div>}
          {loadedOnce && aircraft.length === 0 && !error && <div className="cwd-empty" data-empty="no-fleet"><b>No aircraft on your account yet</b></div>}
          {!loadedOnce && <p className="cwd-muted" style={{ padding: 16 }}>Loading your flights…</p>}
        </div>
      )}

      {filter && (
        <>
          <div className="cwp-scrim" onClick={() => setFilter(false)} />
          <div className="cwp-sheet" role="dialog" aria-label="Operators and aircraft" data-operators-panel="">
            <div className="cwp-handle" />
            <div className="cwp-sheet-head"><span><b>Operators and aircraft</b><small>{visible.length} of {aircraft.length} shown · only changes your screen</small></span><button type="button" className="cwd-icon-btn" onClick={() => setFilter(false)} aria-label="Close">×</button></div>
            <div className="cwp-sheet-body">
              {ops.map((o) => { const hOps = new Set(prefs.hidden.operators); const hRegs = new Set(prefs.hidden.registrations); const on = (r) => !hOps.has(o.oprId) && !hRegs.has(r.reg); const n = o.regs.filter(on).length; const opOn = n > 0; return (
                <div key={o.oprId}>
                  <button type="button" role="switch" aria-checked={opOn} data-op-switch={o.oprId} className="cwd-row" onClick={() => setHidden({ operators: opOn ? [...hOps, o.oprId] : [...hOps].filter((x) => x !== o.oprId), registrations: opOn ? [...hRegs] : [...hRegs].filter((x) => !o.regs.some((r) => r.reg === x)) })}><span className="cwd-row-main"><b className={opOn ? '' : 'is-off'}>{o.name}</b><small>{n === o.regs.length ? `${o.regs.length} aircraft` : n === 0 ? `Hidden · ${o.regs.length} aircraft` : `${n} of ${o.regs.length} shown`}</small></span><span className={`cwd-toggle${opOn ? ' is-on' : ''}`} /></button>
                  {o.regs.map((r) => { const v = on(r); return <button key={r.reg} type="button" role="switch" aria-checked={v} data-reg-switch={r.reg} className="cwd-row is-reg" onClick={() => { let registrations = v ? [...hRegs, r.reg] : [...hRegs].filter((x) => x !== r.reg); let operators = [...hOps]; if (!v && hOps.has(o.oprId)) { operators = operators.filter((x) => x !== o.oprId); registrations = [...new Set([...registrations, ...o.regs.filter((x) => x.reg !== r.reg).map((x) => x.reg)])]; } setHidden({ operators, registrations }); }}><span className={`cwd-mono${v ? '' : ' is-off'}`}>{r.reg}</span><small>{r.type}</small><span className={`cwd-toggle is-small${v ? ' is-on' : ''}`} /></button>; })}
                </div>); })}
            </div>
            <div className="cwd-panel-foot is-settings"><button type="button" className="cwd-btn" onClick={() => { setFilter(false); goPage('settings'); }} data-display-settings="">Display settings</button></div>
            <div className="cwd-panel-foot"><span className="cwd-muted">Remembered for next time</span><button type="button" className="cwd-btn" disabled={!nHidden} onClick={() => setHidden({ operators: [], registrations: [] })} data-show-all="">Show all</button></div>
          </div>
        </>
      )}
    </div>
  );
}

export { useCallback };
