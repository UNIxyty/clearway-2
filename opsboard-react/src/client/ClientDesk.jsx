// The client's desk (design "Client View v2", 2026-11-10): Timeline — the ops Board in a card that hugs its lanes, day
// and zoom controls, the legend, "Coming up" under it — and Flights, a list grouped by day with search. Operators &
// aircraft is the view filter (saved on the account); a flight opens in a side panel. Nothing here decides what the
// client may see: the wall backend already cut every answer to their scope.
import { useCallback, useEffect, useMemo, useState } from 'react';
import Board from '../components/Board';
import { flattenFlights, hmZ } from '../components/mobile/mobileUtil';
import { STATUS_WORD, dayIndex, dayLabel, dayName, dayShort, dayStartMs, groupOperators, matchesQuery, readView, writeView, tellShell } from './clientApi';
import ClientFlightBody, { StatusChip, useFlightInfo } from './ClientFlight';

const ZOOM = [{ label: '0.7×', hours: 13 }, { label: '1×', hours: 9 }, { label: '1.4×', hours: 6 }];
const LEGEND = [['Scheduled', 'var(--tl-scheduled)'], ['Delayed', 'var(--tl-delayed)'], ['CTOT / slot', 'var(--tl-ctot)'], ['Flying', 'var(--tl-flying)'], ['Arrived', 'var(--tl-arrived)'], ['AOG', 'var(--tl-aog)']];
const H = 3600_000;

function Clocks({ clocks }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const hm = (tz) => { try { return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz || 'UTC' }).format(now); } catch { return hmZ(now); } };
  return <div className="cwd-clocks">{clocks.map((c, i) => <span key={`${c.timeZone}-${c.name}`} className={i === 0 || c.utc ? 'is-utc' : ''}><small>{(c.code || c.name || 'UTC').toUpperCase()}</small><b suppressHydrationWarning>{hm(c.timeZone)}</b></span>)}</div>;
}

function OperatorsPanel({ aircraft, hidden, setHidden, onClose }) {
  const ops = useMemo(() => groupOperators(aircraft), [aircraft]);
  const hOps = new Set(hidden.operators); const hRegs = new Set(hidden.registrations);
  const regOn = (o, r) => !hOps.has(o.oprId) && !hRegs.has(r.reg);
  const total = ops.reduce((n, o) => n + o.regs.length, 0);
  const shown = ops.reduce((n, o) => n + o.regs.filter((r) => regOn(o, r)).length, 0);
  const toggleOp = (o) => {
    const on = o.regs.some((r) => regOn(o, r));
    const operators = on ? [...hOps, o.oprId] : [...hOps].filter((x) => x !== o.oprId);
    const registrations = on ? [...hRegs] : [...hRegs].filter((x) => !o.regs.some((r) => r.reg === x));
    setHidden({ operators, registrations });
  };
  const toggleReg = (o, r) => {
    const on = regOn(o, r);
    let registrations = on ? [...hRegs, r.reg] : [...hRegs].filter((x) => x !== r.reg);
    let operators = [...hOps];
    if (!on && hOps.has(o.oprId)) { operators = operators.filter((x) => x !== o.oprId); registrations = [...new Set([...registrations, ...o.regs.filter((x) => x.reg !== r.reg).map((x) => x.reg)])]; }
    setHidden({ operators, registrations });
  };
  return (
    <>
      <div className="cwd-scrim" onClick={onClose} />
      <div className="cwd-panel" role="dialog" aria-label="Operators and aircraft" data-operators-panel="">
        <div className="cwd-panel-head"><span><b>Operators and aircraft</b><span className="cwd-mono">{shown} of {total} shown</span></span><span className="cwd-muted">This only changes what’s on your screen, on Timeline and Flights. Only Clearway ops can add operators or aircraft.</span></div>
        <div className="cwd-panel-list">
          {ops.map((o) => { const n = o.regs.filter((r) => regOn(o, r)).length; const on = n > 0; return (
            <div key={o.oprId} className="cwd-op">
              <button type="button" role="switch" aria-checked={on} data-op-switch={o.oprId} onClick={() => toggleOp(o)} className="cwd-row"><span className="cwd-row-main"><b className={on ? '' : 'is-off'}>{o.name}</b><small>{n === o.regs.length ? `${o.regs.length} aircraft` : n === 0 ? `Hidden · ${o.regs.length} aircraft` : `${n} of ${o.regs.length} aircraft shown`}</small></span><span className={`cwd-toggle${on ? ' is-on' : ''}`} /></button>
              {o.regs.map((r) => { const v = regOn(o, r); return <button key={r.reg} type="button" role="switch" aria-checked={v} data-reg-switch={r.reg} onClick={() => toggleReg(o, r)} className="cwd-row is-reg"><span className={`cwd-mono${v ? '' : ' is-off'}`}>{r.reg}</span><small>{r.type}</small><span className={`cwd-toggle is-small${v ? ' is-on' : ''}`} /></button>; })}
            </div>); })}
          {!ops.length && <p className="cwd-muted" style={{ padding: 16 }}>No aircraft on your account yet.</p>}
        </div>
        <div className="cwd-panel-foot"><span className="cwd-muted">Remembered for next time</span><button type="button" className="cwd-btn" disabled={shown === total} onClick={() => setHidden({ operators: [], registrations: [] })} data-show-all="">Show all</button></div>
      </div>
    </>
  );
}

function FlightPanel({ p, me, names, onClose }) {
  const info = useFlightInfo(p);
  useEffect(() => { const onKey = (e) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); }, [onClose]);
  return (
    <aside className="cwd-flight" data-flight-panel={p.fn} aria-label={`Flight ${p.fn}`}>
      <div className="cwd-flight-head"><b className="cwd-mono">{p.fn}</b><span className="cwd-mono cwd-muted">{p.__reg}{p.icaoType ? ` · ${p.icaoType}` : ''}</span><span style={{ flex: 1 }} /><button type="button" className="cwd-icon-btn" onClick={onClose} aria-label="Close" data-close-flight="">×</button></div>
      <div className="cwd-flight-scroll"><ClientFlightBody p={p} me={me} names={names} info={info} /></div>
    </aside>
  );
}

export default function ClientDesk({ page, goPage, me, prefs, setHidden, aircraft, visible, windowStartUtc, windowEndUtc, clocks, loadedOnce, error, feed, serviceOn, onReload }) {
  const view0 = readView();
  const [zoom, setZoom] = useState(() => (Number.isInteger(view0.zoom) ? Math.max(0, Math.min(2, view0.zoom)) : 1));
  const [day, setDay] = useState(() => (Number.isInteger(view0.day) ? view0.day : 0));
  const [scrollTo, setScrollTo] = useState(null);
  const [q, setQ] = useState(() => view0.q || '');
  const [panel, setPanel] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [viewRange, setViewRange] = useState(null);
  useEffect(() => { writeView({ zoom, day, q }); }, [zoom, day, q]);

  const all = useMemo(() => flattenFlights(visible), [visible]);
  const flights = useMemo(() => all.slice().sort((a, b) => a.delayedStartUtcMs - b.delayedStartUtcMs), [all]);
  const openF = openId ? flights.find((f) => f.id === openId) || null : null;
  const names = useMemo(() => { const m = {}; for (const f of all) { if (f.depName) m[f.dep] = f.depName; if (f.arrName) m[f.arr] = f.arrName; } return m; }, [all]);
  const grants = useMemo(() => groupOperators(aircraft), [aircraft]);
  const nHidden = aircraft.length - visible.length;
  const nowMs = Date.now();
  const today = flights.filter((f) => dayIndex(f.delayedStartUtcMs, nowMs) === 0).length;
  const upcoming = flights.filter((f) => f.status !== 'arrived' && f.status !== 'cancelled' && f.endUtcMs > nowMs - H);
  const agenda = upcoming.slice(0, 5);
  const listed = flights.filter((f) => matchesQuery(f, q));
  const days = [];
  for (const f of listed) { const k = dayIndex(f.delayedStartUtcMs, nowMs); let g = days.find((x) => x.k === k); if (!g) { g = { k, rows: [] }; days.push(g); } g.rows.push(f); }
  const allHidden = aircraft.length > 0 && visible.length === 0;
  const empty = loadedOnce && aircraft.length > 0 && all.length === 0 && !allHidden;
  const noFleet = loadedOnce && aircraft.length === 0;
  const live = !serviceOn ? null : feed == null ? null : feed.live === 'working' && feed.healthy !== false;
  const onRange = useCallback((r) => setViewRange(r), []);
  const goDay = (d) => { const idx = Math.max(-1, Math.min(6, d)); setDay(idx); setScrollTo(dayStartMs(idx)); };
  const dayIdx = viewRange ? dayIndex(viewRange.startMs + (viewRange.endMs - viewRange.startMs) * 0.3, nowMs) : day;
  const opsLabel = grants.length === 1 ? grants[0].name : `${grants.length} operators`;
  const sub = noFleet ? 'No aircraft on your account yet' : `${opsLabel} · ${visible.length} aircraft · ${empty ? 'nothing scheduled' : `${today} flight${today === 1 ? '' : 's'} today`}`;
  const laneH = 96;
  const boardH = 34 + Math.max(1, visible.length) * laneH;
  const row = (f, grid) => (
    <button type="button" key={f.id} className={`cwd-frow${f.status === 'airborne' ? ' is-air' : ''}${f.status === 'cancelled' ? ' is-cnl' : ''}`} style={{ gridTemplateColumns: grid }} onClick={() => setOpenId(f.id)} data-flight-row={f.fn}>
      <span className="cwd-mono is-time"><b>{f.depHm}</b>{f.depKind !== 'STD' && f.depHm !== f.etd && <s>{f.etd}</s>}</span>
      <span className="cwd-mono is-time"><b>{f.arrHm}</b>{f.arrKind !== 'STA' && f.arrHm !== f.eta && <s>{f.eta}</s>}</span>
      <span className="cwd-mono is-cs">{f.fn}</span>
      <span className="cwd-mono cwd-body">{f.__reg}</span>
      <span className="cwd-body is-op">{f.__operator}</span>
      <span className="cwd-mono">{f.dep} → {f.arr}</span>
      <StatusChip status={f.status} />
    </button>
  );
  const FL_GRID = '84px 84px 100px 96px minmax(120px,1fr) 150px 160px';
  return (
    <div className="cwd" data-client-page={page}>
      <div className="cwd-titlerow">
        <div className="cwd-title"><h1>{page === 'flights' ? 'Flights' : 'Timeline'}</h1><span className="cwd-muted" data-page-sub="">{sub}</span></div>
        {nHidden > 0 && <span className="cwd-hidden" data-hidden-chip="">{nHidden} aircraft hidden<button type="button" onClick={() => setHidden({ operators: [], registrations: [] })} data-show-all="">Show all</button></span>}
        <button type="button" className={`cwd-btn${panel ? ' is-on' : ''}`} onClick={() => setPanel((v) => !v)} data-operators-button="" aria-expanded={panel}>Operators &amp; aircraft<span className="cwd-mono cwd-muted">{visible.length} of {aircraft.length}</span></button>
      </div>
      {serviceOn && live === false && <div className="cwd-offline" data-service-status="behind"><b>Not live right now.</b> Last updated at <span className="cwd-mono">{feed?.updatedAt ? hmZ(Date.parse(feed.updatedAt)) : '—'}Z</span>. The page reconnects on its own.</div>}
      {serviceOn && live === true && <div className="cwd-live" data-service-status="live">Flight data is live{feed?.updatedAt ? <> · updated <span className="cwd-mono">{hmZ(Date.parse(feed.updatedAt))}Z</span></> : null}</div>}
      {error && loadedOnce && !aircraft.length && <div className="cwd-offline" data-error=""><b>Couldn’t load flights.</b> {error}<button type="button" className="cwd-btn" onClick={onReload}>Try again</button></div>}

      {page === 'timeline' && (
        <>
          <section className="cwd-card" data-card="timeline">
            <div className="cwd-tl-head">
              <div className="cwd-day"><small>{dayName(dayIdx, nowMs)}</small><b>{dayLabel(dayIdx, nowMs)}</b></div>
              <Clocks clocks={clocks} />
              <div className="cwd-controls">
                <div className="cwd-seg"><button type="button" onClick={() => goDay(day - 1)} aria-label="Previous day" data-prev-day="">‹</button><span>{dayShort(day, nowMs)}</span><button type="button" onClick={() => goDay(day + 1)} aria-label="Next day" data-next-day="">›</button></div>
                <div className="cwd-seg"><button type="button" onClick={() => setZoom((z) => Math.max(0, z - 1))} aria-label="More hours" data-zoom-out="">−</button><span className="cwd-mono" data-zoom-label="">{ZOOM[zoom].label}</span><button type="button" onClick={() => setZoom((z) => Math.min(2, z + 1))} aria-label="Fewer hours" data-zoom-in="">+</button></div>
                <button type="button" className="cwd-btn" onClick={() => goDay(0)} data-go-now="">Now</button>
              </div>
            </div>
            <div className="cwd-legend">{LEGEND.map(([t, bg]) => <span key={t}><i style={{ background: bg }} />{t}</span>)}</div>
            {allHidden ? (
              <div className="cwd-empty" data-empty="all-hidden"><b>You’ve hidden every aircraft</b><span>Every operator is switched off in Operators &amp; aircraft. The flights are still there, just not on your screen.</span><button type="button" className="cwd-btn is-primary" onClick={() => setHidden({ operators: [], registrations: [] })} data-show-all="">Show all</button></div>
            ) : (
              <div className="cwd-board" style={{ height: boardH }} data-board="">
                <Board aircraft={visible} limitations={[]} windowStartUtc={windowStartUtc} windowEndUtc={windowEndUtc} scale={1} timeZoom={1} rowZoom={1} hideSidebar rowHeightPx={laneH} viewportHoursOverride={ZOOM[zoom].hours} autoReturnToNow={false} scrollToMs={scrollTo} onViewRange={onRange} onPillTap={(f) => setOpenId(f.id)} showUnconfirmedRing={false} touchHitMinPx={44} maxMarkers={2} />
                {!loadedOnce && <div className="cwd-empty is-over"><span>Loading your flights…</span></div>}
                {empty && <div className="cwd-empty is-over" data-empty="no-flights"><b>No flights in the next 7 days</b><span>Nothing is scheduled for your aircraft. New flights appear here as soon as Clearway ops has them.</span></div>}
                {noFleet && <div className="cwd-empty is-over" data-empty="no-fleet"><b>No aircraft on your account yet</b><span>Clearway ops grants operators and aircraft. Until then this page stays empty.</span></div>}
              </div>
            )}
          </section>
          {agenda.length > 0 && !allHidden && (
            <section className="cwd-card" data-card="coming-up">
              <div className="cwd-card-head"><b>Coming up</b><span className="cwd-mono cwd-muted">{upcoming.length}</span><span style={{ flex: 1 }} /><button type="button" className="cwd-link" onClick={() => goPage('flights')} data-all-flights="">All in Flights →</button></div>
              {agenda.map((f) => (
                <button type="button" key={f.id} className="cwd-frow is-agenda" onClick={() => setOpenId(f.id)} data-agenda-row={f.fn}>
                  <span className="cwd-muted">{dayShort(dayIndex(f.delayedStartUtcMs, nowMs), nowMs)}</span>
                  <span className="cwd-mono">{f.depHm}–{f.arrHm}</span>
                  <span className="cwd-mono is-cs">{f.fn}</span>
                  <span className="cwd-mono cwd-body">{f.dep} → {f.arr}</span>
                  <span className="cwd-mono cwd-muted">{f.__reg}</span>
                  <StatusChip status={f.status} />
                </button>
              ))}
            </section>
          )}
        </>
      )}

      {page === 'flights' && (
        <>
          <label className="cwd-search"><span aria-hidden>⌕</span><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Flight number, registration or airport" spellCheck={false} data-flights-search="" />{q && <button type="button" onClick={() => setQ('')} aria-label="Clear search">×</button>}</label>
          <section className="cwd-card" data-card="flights">
            {days.length > 0 && <div className="cwd-fhead" style={{ gridTemplateColumns: FL_GRID }}><span>DEP UTC</span><span>ARR UTC</span><span>FLIGHT</span><span>AIRCRAFT</span><span>OPERATOR</span><span>ROUTE</span><span>STATUS</span></div>}
            {days.map((g) => <div key={g.k}><div className="cwd-dayhead">{dayName(g.k, nowMs)}<span className="cwd-mono cwd-muted">{dayLabel(g.k, nowMs)}</span></div>{g.rows.map((f) => row(f, FL_GRID))}</div>)}
            {allHidden && <div className="cwd-empty" data-empty="all-hidden"><b>You’ve hidden every aircraft</b><span>Every operator is switched off in Operators &amp; aircraft. The flights are still there, just not on your screen.</span><button type="button" className="cwd-btn is-primary" onClick={() => setHidden({ operators: [], registrations: [] })} data-show-all="">Show all</button></div>}
            {!allHidden && q && !listed.length && all.length > 0 && <div className="cwd-empty" data-empty="no-match"><b>No flights match “{q}”</b><span>Search looks at flight numbers, registrations and airport ICAO codes.</span></div>}
            {empty && <div className="cwd-empty" data-empty="no-flights"><b>No flights in the next 7 days</b><span>Nothing is scheduled for your aircraft. New flights appear here as soon as Clearway ops has them.</span></div>}
            {noFleet && <div className="cwd-empty" data-empty="no-fleet"><b>No aircraft on your account yet</b><span>Clearway ops grants operators and aircraft. Until then this page stays empty.</span></div>}
            {!loadedOnce && <div className="cwd-empty"><span>Loading your flights…</span></div>}
          </section>
        </>
      )}

      {panel && <OperatorsPanel aircraft={aircraft} hidden={prefs.hidden} setHidden={setHidden} onClose={() => setPanel(false)} />}
      {openF && <FlightPanel p={openF} me={me} names={names} onClose={() => setOpenId(null)} />}
    </div>
  );
}

export { STATUS_WORD, tellShell };
