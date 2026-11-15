// The client's desk. Timeline (2026-11-15): the ops Digital Wall timeline page itself (ClientTimeline.jsx: the display's
// clock bar and Board with its sidebar and legends, nothing restyled), under one slim bar that holds the client's own
// Operators & aircraft filter. Flights: a table grouped by day with search (design "Client Portal v3" / "Screen v3").
// A flight opens in a panel docked beside the page on a wide screen. Operators & aircraft is the view filter (saved
// on the account). Nothing here decides what the client may see: the wall backend already cut every answer to their
// scope, and sends no limitations, important notices, CAA details or ops checks to a client at all.
import { useCallback, useEffect, useMemo, useState } from 'react';
import ClientTimeline, { opsSidebarWidth } from './ClientTimeline';
import ErrorBoundary from '../components/ErrorBoundary';
import { flattenFlights, hmZ } from '../components/mobile/mobileUtil';
import { STATUS_WORD, dayIndex, dayLabel, dayName, groupOperators, matchesQuery, readView, writeView, tellShell, emptyFleetWords } from './clientApi';
import ClientFlightBody, { StatusChip, useFlightInfo } from './ClientFlight';
import Icon from './clientIcons';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const FL_GRID = '84px 84px 100px 96px minmax(120px,1fr) 150px 160px';
const NONE = { operators: [], registrations: [] };

/** One broken part of the desk shows this in its own place; the rest of the page keeps working. */
const guard = (where, children, resetKey) => <ErrorBoundary where={where} resetKey={resetKey} compact>{children}</ErrorBoundary>;

function OperatorsPanel({ aircraft, hidden, setHidden, saveFailed, onClose }) {
  const ops = useMemo(() => groupOperators(aircraft), [aircraft]);
  const hOps = new Set(hidden.operators); const hRegs = new Set(hidden.registrations);
  const regOn = (o, r) => !hOps.has(o.oprId) && !hRegs.has(r.reg);
  const total = ops.reduce((n, o) => n + o.regs.length, 0);
  const shown = ops.reduce((n, o) => n + o.regs.filter((r) => regOn(o, r)).length, 0);
  useEffect(() => { const onKey = (e) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); }, [onClose]);
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
    <div className="cwd-panel-in">
      <div className="cwd-panel-head"><span className="cwd-panel-title"><b>Operators and aircraft</b><span className="cwd-mono cwd-muted">{shown} of {total} shown</span></span><span className="cwd-panel-line">This only changes what’s on your screen, on Timeline and Flights. Only Clearway ops can add operators or aircraft.</span></div>
      <div className="cwd-panel-list">
        {ops.map((o) => { const n = o.regs.filter((r) => regOn(o, r)).length; const on = n > 0; return (
          <div key={o.oprId} className="cwd-op">
            <button type="button" role="switch" aria-checked={on} data-op-switch={o.oprId} onClick={() => toggleOp(o)} className="cwd-row"><span className="cwd-row-main"><b className={on ? '' : 'is-off'}>{o.name}</b><small>{n === o.regs.length ? `${o.regs.length} aircraft` : n === 0 ? `Hidden · ${o.regs.length} aircraft` : `${n} of ${o.regs.length} aircraft shown`}</small></span><span className={`cwd-toggle${on ? ' is-on' : ''}`} /></button>
            {o.regs.map((r) => { const v = regOn(o, r); return <button key={r.reg} type="button" role="switch" aria-checked={v} data-reg-switch={r.reg} onClick={() => toggleReg(o, r)} className="cwd-row is-reg"><span className={`cwd-mono cwd-row-reg${v ? '' : ' is-off'}`}>{r.reg}</span><small>{r.type}</small><span className={`cwd-toggle is-small${v ? ' is-on' : ''}`} /></button>; })}
          </div>); })}
        {!ops.length && <p className="cwd-panel-none">No aircraft on your account yet.</p>}
      </div>
      <div className="cwd-panel-foot">{saveFailed ? <span className="cwd-warn" role="alert" data-filter-save="failed">Not saved. It holds on this screen only.</span> : <span className="cwd-muted" data-filter-save="ok">Remembered for next time</span>}<button type="button" className="cwd-foot-btn" disabled={shown === total} onClick={() => setHidden(NONE)} data-show-all="">Show all</button></div>
    </div>
  );
}

function FlightPanelBody({ p, me, names }) {
  const info = useFlightInfo(p);
  return <ClientFlightBody p={p} me={me} names={names} info={info} />;
}

function FlightPanel({ p, me, names, acType = '', onClose }) {
  useEffect(() => { const onKey = (e) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); }, [onClose]);
  return (
    <aside className="cwd-flight" data-flight-panel={p.fn} aria-label={`Flight ${p.fn}`}>
      <div className="cwd-flight-head"><b className="cwd-mono">{p.fn}</b><span className="cwd-mono cwd-muted">{[p.__reg, acType].filter(Boolean).join(' · ')}</span><span className="cwd-grow" /><button type="button" className="cwd-icon-btn" onClick={onClose} aria-label="Close" data-close-flight=""><Icon name="x" /></button></div>
      {/* the head and its Close stay outside the boundary: a flight whose body fails can still be closed */}
      <div className="cwd-flight-scroll">{guard('client/flight', <FlightPanelBody p={p} me={me} names={names} />, p.id)}</div>
    </aside>
  );
}

/** An empty state, left-aligned (v3): an icon, the headline, one line, and at most one button. */
function Empty({ kind, icon, title, line, children, box = false, style }) {
  return (
    <div className={`cwd-empty${box ? ' is-box' : ''}`} data-empty={kind} style={style}>
      {icon && <Icon name={icon} className="cwd-empty-icon" />}
      <span className="cwd-empty-text">{title && <b>{title}</b>}{line && <span>{line}</span>}{children}</span>
    </div>
  );
}

export default function ClientDesk({ page, me, prefs, setHidden, hideSaveFailed = false, aircraft, visible, windowStartUtc, windowEndUtc, clocks, loadedOnce, error, feed, onReload, settings }) {
  const view0 = readView();
  const [q, setQ] = useState(() => view0.q || '');
  const [panel, setPanel] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => { writeView({ q }); }, [q]);
  useEffect(() => { const t = setInterval(() => setNowMs(Date.now()), 30_000); return () => clearInterval(t); }, []);

  const all = useMemo(() => flattenFlights(visible), [visible]);
  const flights = useMemo(() => all.slice().sort((a, b) => a.delayedStartUtcMs - b.delayedStartUtcMs), [all]);
  const openF = openId ? flights.find((f) => f.id === openId) || null : null;
  const names = useMemo(() => { const m = {}; for (const f of all) { if (f.depName) m[f.dep] = f.depName; if (f.arrName) m[f.arr] = f.arrName; } return m; }, [all]);
  const grants = useMemo(() => groupOperators(aircraft), [aircraft]);
  // The aircraft's type (C56X), from the aircraft itself. A flight's own `icaoType` is the flight plan's "type of
  // flight" letter (N, G…), not an aircraft type, and is never shown as one.
  const typeOf = (f) => { const a = (aircraft || []).find((x) => x.reg === f.__reg && String(x.oprId || '') === String(f.oprId || x.oprId || '')); return String(a?.acType || '').trim(); };
  const nHidden = aircraft.length - visible.length;
  const today = flights.filter((f) => dayIndex(f.delayedStartUtcMs, nowMs) === 0).length;
  const listed = flights.filter((f) => matchesQuery(f, q));
  const days = [];
  for (const f of listed) { const k = dayIndex(f.delayedStartUtcMs, nowMs); let g = days.find((x) => x.k === k); if (!g) { g = { k, rows: [] }; days.push(g); } g.rows.push(f); }
  const allHidden = aircraft.length > 0 && visible.length === 0;
  const empty = loadedOnce && aircraft.length > 0 && all.length === 0 && !allHidden;
  const noFleet = loadedOnce && aircraft.length === 0;
  // the feed's own verdict (every client may read it since 2026-11-15); null until it has answered
  const live = feed == null ? null : feed.live === true && feed.healthy !== false;   // the client answer's live is true or false (client-scope.mjs)
  const closePanel = useCallback(() => setPanel(false), []);
  const closeFlight = useCallback(() => setOpenId(null), []);
  const showAll = () => setHidden(NONE);
  const opsLabel = grants.length === 1 ? grants[0].name : `${grants.length} operators`;
  const fleetWords = emptyFleetWords(me);
  const sub = noFleet ? fleetWords.title : `${opsLabel} · ${visible.length} aircraft · ${empty ? 'nothing scheduled' : `${today} flight${today === 1 ? '' : 's'} today`}`;
  // "nothing scheduled until 17 Nov": the last day the feed's window covers, when the feed says it
  const endMs = Date.parse(windowEndUtc || '');
  const until = Number.isFinite(endMs) ? `${new Date(endMs - 1).getUTCDate()} ${MON[new Date(endMs - 1).getUTCMonth()]}` : '';
  const emptyLine = `${me?.company ? `${me.company}’s` : 'Your'} aircraft have nothing scheduled${until ? ` until ${until}` : ''}. New flights appear here as soon as Clearway ops has them.`;
  const hiddenLine = 'Every operator is switched off in Operators & aircraft. The flights are still there, just not on your screen.';
  const updatedMs = feed?.updatedAt ? Date.parse(feed.updatedAt) : NaN;
  const agoMin = Number.isFinite(updatedMs) ? Math.round((nowMs - updatedMs) / 60_000) : null;
  const allHiddenBlock = (
    <Empty kind="all-hidden" icon="eye-off" title="You’ve hidden every aircraft" line={hiddenLine}>
      <button type="button" className="cwd-cta" onClick={showAll} data-show-all=""><Icon name="eye" />Show all</button>
    </Empty>
  );
  const row = (f) => (
    <button type="button" key={f.id} className={`cwd-frow${f.status === 'airborne' ? ' is-air' : ''}${f.status === 'cancelled' ? ' is-cnl' : ''}`} style={{ gridTemplateColumns: FL_GRID }} onClick={() => setOpenId(f.id)} data-flight-row={f.fn} data-status={f.status}>
      <span className="cwd-ftime"><b>{f.depHm}</b>{f.depKind !== 'STD' && f.depHm !== f.etd && <s>{f.etd}</s>}</span>
      <span className="cwd-ftime"><b>{f.arrHm}</b>{f.arrKind !== 'STA' && f.arrHm !== f.eta && <s>{f.eta}</s>}</span>
      <span className="cwd-fcs">{f.fn}</span>
      <span className="cwd-freg">{f.__reg}</span>
      <span className="cwd-fop">{f.__operator}</span>
      <span className="cwd-froute">{f.dep} → {f.arr}</span>
      <span className="cwd-fstatus"><StatusChip status={f.status} />{f.status === 'airborne' && <Icon name="plane" className="cwd-air-icon" />}</span>
    </button>
  );

  const weatherOn = Boolean(me?.switches?.includes('weather'));
  const hiddenChip = nHidden > 0 && <span className="cwd-hidden" data-hidden-chip=""><Icon name="eye-off" />{nHidden} aircraft hidden<button type="button" className="cwd-mini" onClick={showAll} data-show-all="">Show all</button></span>;
  // the panel hangs under its button, wherever the row wraps
  const filter = (
    <span className="cwd-anchor">
      <button type="button" className={`cwd-btn${panel ? ' is-on' : ''}`} onClick={() => setPanel((v) => !v)} data-operators-button="" aria-expanded={panel}><Icon name="sliders" className="cwd-muted" />Operators &amp; aircraft<span className="cwd-mono cwd-count">{visible.length} of {aircraft.length}</span><Icon name="chevron-down" className="cwd-muted" /></button>
      {panel && (
        <>
          <div className="cwd-scrim" onClick={closePanel} />
          <div className="cwd-panel" role="dialog" aria-label="Operators and aircraft" data-operators-panel="">
            {guard('client/filter', <OperatorsPanel aircraft={aircraft} hidden={prefs.hidden} setHidden={setHidden} saveFailed={hideSaveFailed} onClose={closePanel} />)}
          </div>
        </>
      )}
    </span>
  );
  const lines = (
    <>
      {live === false && (
        <div className="cwd-notlive" data-service-status="behind"><Icon name="wifi-off" /><span><b>Not live right now.</b> Last updated at <span className="cwd-mono">{Number.isFinite(updatedMs) ? `${hmZ(updatedMs)}Z` : '—'}</span>{agoMin != null && agoMin >= 1 && agoMin < 600 ? `, ${agoMin} min ago` : ''}. The page reconnects on its own.</span></div>
      )}
      {error && loadedOnce && !aircraft.length && <div className="cwd-notlive" data-error=""><Icon name="triangle-alert" /><span><b>Couldn’t load flights.</b> {error}</span><button type="button" className="cwd-btn" onClick={onReload} data-try-again=""><Icon name="rotate-ccw" />Try again</button></div>}
    </>
  );
  const flightPanel = openF && <FlightPanel p={openF} me={me} names={names} acType={typeOf(openF)} onClose={closeFlight} />;

  if (page === 'timeline') {
    return (
      <div className={`cwt${openF ? ' has-flight' : ''}`} data-client-page="timeline">
        <div className="cwt-col">
          {/* the one thing the client's page adds to the ops page: their own filter, in a slim bar above it */}
          <div className="cwt-bar" data-timeline-bar="">
            <span className="cwd-sub" data-page-sub="">{sub}</span>
            <span className="cwd-grow" />
            {hiddenChip}
            {filter}
          </div>
          {lines}
          <div className="cwt-ops" data-card="timeline">
            {guard('client/timeline', (
              <ClientTimeline aircraft={visible} windowStartUtc={windowStartUtc} windowEndUtc={windowEndUtc} clocks={clocks} settings={settings} weatherOn={weatherOn} onPillTap={(f) => setOpenId(f.id)}>
                {/* what an empty board means, said over the lanes (the ops page has no words for it) */}
                {(!loadedOnce || empty || noFleet || allHidden) && (
                  <div className="cwt-over" style={{ paddingLeft: opsSidebarWidth(settings) }}>
                    {!loadedOnce && <Empty box line="Loading your flights…" />}
                    {allHidden && <Empty kind="all-hidden" box icon="eye-off" title="You’ve hidden every aircraft" line={hiddenLine}><button type="button" className="cwd-cta" onClick={showAll} data-show-all=""><Icon name="eye" />Show all</button></Empty>}
                    {empty && <Empty kind="no-flights" box icon="calendar-x" title="No flights in the next 7 days" line={emptyLine} />}
                    {noFleet && <Empty kind={fleetWords.kind} box icon="calendar-x" title={fleetWords.title} line={fleetWords.line} />}
                  </div>
                )}
              </ClientTimeline>
            ))}
          </div>
        </div>
        {flightPanel}
      </div>
    );
  }

  return (
    <div className={`cwd-wrap${openF ? ' has-flight' : ''}`}>
      <div className="cwd" data-client-page={page}>
        <div className="cwd-titlerow">
          <div className="cwd-title"><h1>Flights</h1><span className="cwd-sub" data-page-sub="">{sub}</span></div>
          {hiddenChip}
          {filter}
        </div>
        {lines}
        <label className="cwd-search"><Icon name="search" className="cwd-muted" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Flight number, registration or airport" spellCheck={false} aria-label="Search flights" data-flights-search="" />{q && <button type="button" className="cwd-clear" onClick={() => setQ('')} aria-label="Clear search" data-clear-search=""><Icon name="x" /></button>}</label>
        <section className="cwd-card" data-card="flights">
          {guard('client/flights', (
            <div className="cwd-table">
              {days.length > 0 && <div className="cwd-fhead" style={{ gridTemplateColumns: FL_GRID }} data-flights-head=""><span>DEP UTC</span><span>ARR UTC</span><span>FLIGHT</span><span>AIRCRAFT</span><span>OPERATOR</span><span>ROUTE</span><span>STATUS</span></div>}
              {days.map((g) => <div key={g.k} data-day-group={g.k}><div className="cwd-dayhead">{dayName(g.k, nowMs)}<span className="cwd-mono">{dayLabel(g.k, nowMs)}</span></div>{g.rows.map(row)}</div>)}
              {allHidden && allHiddenBlock}
              {!allHidden && q && !listed.length && all.length > 0 && <Empty kind="no-match" icon="search-x" title={`No flights match “${q}”`} line="Search looks at flight numbers, registrations and airport ICAO codes." />}
              {empty && <Empty kind="no-flights" icon="calendar-x" title="No flights in the next 7 days" line={emptyLine} />}
              {noFleet && <Empty kind={fleetWords.kind} icon="calendar-x" title={fleetWords.title} line={fleetWords.line} />}
              {!loadedOnce && <Empty line="Loading your flights…" />}
            </div>
          ))}
        </section>
      </div>
      {flightPanel}
    </div>
  );
}

export { STATUS_WORD, tellShell };
