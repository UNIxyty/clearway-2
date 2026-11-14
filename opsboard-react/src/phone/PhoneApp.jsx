// The phone app (v3): /digital-wall/phone, ONE app for staff and for clients. This file is its frame: who is signed
// in, the data for that role, the first screen (timeline or flights list), the open flight over it, the pages and the
// sheets. The timeline and the flight view are the old phone wall's (/m/wall), restyled: see core/Timeline.jsx and
// core/Flight.jsx. Staff-only code is asked for only by a staff session (two lazy imports below); a client's browser
// never downloads it.
import './tokens.css';
import { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../AuthGate';
import ErrorBoundary from '../components/ErrorBoundary';
import useConnection from '../components/mobile/useConnection';
import { applyHidden, emptyFleetWords, matchesQuery } from '../client/clientApi';
import { Btn, Msg, SAFE_TOP, c } from './kit';
import { CommonPage, Onboarding, StatusScreen } from './pages/common';
import { COMMON_PAGES, STAFF_PAGES } from './pages/names';
import { clocksOf } from './pages/clocks';
import FlightView from './core/Flight';
import { Banner, BottomBar, FlightsList, Header, Rail, TimelineView, groupDays } from './core/Timeline';
import { FilterSheet, MenuSheet, NotifSheet } from './core/sheets';
import { useEvents, useMinute, usePhoneData, useWakeLock } from './core/data';
import { RANGES, RANGE_KEYS, phoneFlight } from './core/model';
import { usePhonePrefs } from './core/prefs';
import { usePhoneTheme } from './core/theme';
import { H, MIN, flatten, hm, hms, utcDay } from './core/util';

// staff only: each is fetched the first time a staff session draws it, never by a client session
const StaffPage = lazy(() => import('./pages/staff.jsx'));
const StaffFlight = lazy(() => import('./core/staffFlight.jsx'));

const bad = (text) => <span style={{ color: c('bad') }}>{text}</span>;
const winOf = (range, nowMs) => { const r = RANGES[range] || RANGES['6H']; return { start: nowMs - r.before * H, end: nowMs + r.after * H, step: r.step, rel: r.rel }; };
const flightsOf = (aircraft, nowMs) => flatten(aircraft).map((f) => phoneFlight(f, nowMs)).sort((a, b) => a.depMs - b.depMs);
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// ───────────────────────────────────────────────────────────────────────────────────────────── the address
const param = (name) => { try { return new URLSearchParams(window.location.search).get(name) || ''; } catch { return ''; } };
const hashName = () => { try { return decodeURIComponent(String(window.location.hash || '').replace(/^#/, '')).trim().toLowerCase(); } catch { return ''; } };
const address = (top) => `${window.location.pathname}${window.location.search}${top ? `#${top}` : ''}`;
function dropParam(name) {
  try {
    const u = new URL(window.location.href);
    if (!u.searchParams.has(name)) return;
    u.searchParams.delete(name);
    window.history.replaceState(window.history.state, '', `${u.pathname}${u.search}${u.hash}`);
  } catch { /* the address keeps the old parameter; nothing on the screen depends on it */ }
}

// a page opened from the address alone still has its way back: "#operators" opens over More, "#clocks" over Settings
const PARENT = { operators: 'more', aircraft: 'more', caa: 'more', reports: 'more', 'wall-settings': 'more', 'service-status': 'more', clocks: 'settings' };

/**
 * The pages on top of the first screen, as a stack of names (the last is the one in front). Each page opened makes a
 * history entry ("#name"), so the phone's own Back closes it; the old tab addresses (#notam #limits #important #more)
 * and #account open their page. A name this role may not open is never put on the stack.
 */
function usePages(role) {
  const valid = useCallback((n) => COMMON_PAGES.includes(n) || (role === 'staff' && STAFF_PAGES.includes(n)), [role]);
  const chain = useCallback((name) => {
    if (!valid(name)) return [];
    const out = [name];
    for (let cur = name; ;) {
      const up = PARENT[cur] || (role === 'staff' && cur === 'settings' ? 'more' : '');
      if (!up || !valid(up) || out.includes(up)) break;
      out.unshift(up); cur = up;
    }
    return out;
  }, [valid, role]);
  const read = useCallback(() => {
    const st = window.history.state;
    return st && Array.isArray(st.cw3) ? st.cw3.filter(valid) : chain(hashName());
  }, [valid, chain]);
  const [stack, setStack] = useState(read);
  const stackRef = useRef(stack); stackRef.current = stack;
  const closing = useRef(false);
  const depth = () => Number(window.history.state?.cw3d) || 0;
  const put = (next, d) => { try { window.history.replaceState({ ...(window.history.state || {}), cw3: next, cw3d: d }, '', address(next[next.length - 1])); } catch { /* the screen is right; only the address lags */ } };

  // this entry remembers its pages; a hash this person may not open is taken off the address
  useEffect(() => { put(stackRef.current, depth()); }, []);
  useEffect(() => {
    const onPop = () => {
      if (closing.current && depth() === 0) { closing.current = false; put([], 0); setStack([]); return; }
      setStack(read());
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [read]);

  const go = useCallback((name) => {
    if (!valid(name)) return false;
    const cur = stackRef.current;
    if (cur[cur.length - 1] === name) return true;
    const next = [...cur, name];
    try { window.history.pushState({ cw3: next, cw3d: depth() + 1 }, '', address(name)); } catch { /* no entry: Back on the page still closes it */ }
    setStack(next);
    return true;
  }, [valid]);
  const back = useCallback(() => {
    const cur = stackRef.current;
    if (!cur.length) return;
    if (depth() > 0) { window.history.back(); return; }
    const next = cur.slice(0, -1);
    put(next, 0); setStack(next);
  }, []);
  const closeAll = useCallback(() => {
    if (!stackRef.current.length) return;
    const d = depth();
    setStack([]);
    if (d > 0) { closing.current = true; window.history.go(-d); } else put([], 0);
  }, []);
  return { stack, go, back, closeAll };
}

// ───────────────────────────────────────────────────────────────────────────────────────────── the frame
/** The root: the phone tokens, the role, and one centred column of at most 480 px (a phone layout on any screen). */
function Shell({ theme, role, view, children }) {
  return (
    <div data-cw3={theme} data-phone-app="" data-role={role || 'unknown'} data-current-view={view || undefined}
      style={{ height: '100dvh', display: 'flex', justifyContent: 'center', background: c('bg2') }}>
      <div data-phone-column="" style={{ position: 'relative', width: '100%', maxWidth: 480, height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: c('bg'), boxShadow: `0 0 0 1px ${c('l1')}` }}>
        {children}
      </div>
    </div>
  );
}

export default function PhoneApp() {
  const { user: signedIn, booting } = useAuth();
  const themeApi = usePhoneTheme();
  // Who this is decides what is asked for and which code is fetched, so it is never guessed: no answer from the
  // sign-in check means no role, no data and no staff code. Once the check has named the person, a later check that
  // gets no answer (the network dropped) keeps that person; a sign-out is the gate's own screen.
  const [known, setKnown] = useState(null);
  useEffect(() => { if (signedIn) setKnown(signedIn); }, [signedIn]);
  const user = signedIn || known;
  const role = !user ? null : user.permRole === 'client' ? 'client' : 'staff';
  if (!role) {
    const nowMs = Date.now();
    return (
      <Shell theme={themeApi.resolved} role={null}>
        <Header live={booting ? 'connecting' : 'none'} clocks={[]} clocksOn={false} nowMs={nowMs} />
        {booting ? <TimelineView rows={[]} win={winOf('6H', nowMs)} nowMs={nowMs} state="loading" onOpen={() => {}} pad={0} /> : (
          <div className="cw3-scroll" data-no-session="" style={{ flex: 1 }}>
            <Msg title={bad('Couldn’t load flights')} body="The sign-in check didn’t answer, so nothing is shown. Check the connection and try again." action="Try again" onAction={() => window.location.reload()} primary />
          </div>
        )}
      </Shell>
    );
  }
  return <Phone key={role} role={role} user={user} themeApi={themeApi} />;
}

// ───────────────────────────────────────────────────────────────────────────────────────────── the app
function Phone({ role, user, themeApi }) {
  const staff = role === 'staff';
  const who = user?.email || user?.id || 'anyone';
  const [prefs, setPrefs] = usePhonePrefs(who);
  const data = usePhoneData(role);
  const { aircraft, limitations, error, loadedOnce, dataUpdatedAt, lastTry, denied, roomClocks, notamState, setNotamState, reload, me: portalMe, clientPrefs, clientPrefsState, saveClientPrefs } = data;
  const conn = useConnection(dataUpdatedAt);
  const nowMs = useMinute();
  useWakeLock(prefs.awake);
  const pages = usePages(role);

  // ── what is shown: the role's flights, then this person's aircraft filter (staff: this visit only; client: saved)
  const [hiddenIds, setHiddenIds] = useState(() => new Set());
  const [filterBusy, setFilterBusy] = useState(false);
  const [filterSaid, setFilterSaid] = useState('');
  const hidden = clientPrefs?.hidden;
  const shownAircraft = useMemo(() => (staff ? aircraft.filter((a) => !hiddenIds.has(a.id)) : applyHidden(aircraft, hidden)), [staff, aircraft, hiddenIds, hidden]);
  const hiddenCount = aircraft.length - shownAircraft.length;
  const scopeFlights = useMemo(() => flightsOf(aircraft, nowMs), [aircraft, nowMs]);
  const shown = useMemo(() => (hiddenCount ? flightsOf(shownAircraft, nowMs) : scopeFlights), [hiddenCount, shownAircraft, scopeFlights, nowMs]);
  const { events, unread, markAll, markOne } = useEvents(scopeFlights, notamState, { role, notify: prefs.notify });

  // ── the feed's four states (the old phone wall's rules): loading, failed with nothing, stale with the last list, live
  const failed = loadedOnce && Boolean(error) && aircraft.length === 0;
  const stale = !failed && loadedOnce && (conn.stale || Boolean(error));
  const state = !loadedOnce ? 'loading' : failed ? 'failed' : 'ok';
  const live = !loadedOnce ? 'connecting' : failed ? 'none' : stale ? 'stale' : conn.partial ? 'partial' : conn.status === 'live' ? (conn.feedUnknown ? 'liveUnknown' : 'live') : 'connecting';
  const staleSince = !stale ? 0 : error ? dataUpdatedAt : conn.ageMin > 0 ? nowMs - conn.ageMin * MIN : dataUpdatedAt;
  const staleMin = staleSince ? Math.max(0, Math.floor((Math.max(nowMs, Date.now()) - staleSince) / MIN)) : 0;

  // ── view and range. The range last chosen is kept on this phone; the view opens as the start page says.
  const urlView = useRef(param('view') === 'flights' ? 'flights' : param('view') === 'timeline' ? 'timeline' : '');
  const startPref = staff ? prefs.view : clientPrefsState === 'loading' ? '' : clientPrefs?.start || '';
  const [view, setView] = useState(() => urlView.current || (staff ? prefs.view : 'timeline'));
  const firstStart = useRef(true);
  useEffect(() => {
    if (!startPref) return;
    if (firstStart.current) { firstStart.current = false; if (urlView.current) return; }
    setView(startPref === 'flights' ? 'flights' : 'timeline'); // also when the start page is changed in Settings
  }, [startPref]);
  const [rangeNow, setRangeNow] = useState('');
  const range = RANGE_KEYS.includes(rangeNow) ? rangeNow : prefs.range;
  const pickRange = useCallback((k) => {
    if (!RANGE_KEYS.includes(k)) return;
    setRangeNow(k); // holds for this visit even when the phone refuses to keep it
    setPrefs({ range: k }).then(() => setRangeNow(''), () => {});
  }, [setPrefs]);
  const win = winOf(range, nowMs);
  const rows = shown.filter((p) => p.arrMs >= win.start && p.depMs <= win.end);

  const [query, setQuery] = useState('');
  const listed = useMemo(() => (query.trim() ? shown.filter((p) => matchesQuery(p.raw, query)) : shown), [shown, query]);
  const days = useMemo(() => groupDays(listed, nowMs), [listed, nowMs]);
  const total = days.reduce((n, d) => n + d.flights.length, 0);

  // each view keeps its own scroll place while the other is in front
  const tlScroll = useRef(null);
  const listScroll = useRef(null);
  const kept = useRef({ timeline: 0, flights: 0 });
  const viewRef = useRef(view);
  const switchView = (v) => {
    if (v === view) return;
    const el = (view === 'timeline' ? tlScroll : listScroll).current;
    if (el) kept.current[view] = el.scrollTop;
    dropParam('view');
    setView(v);
  };
  useLayoutEffect(() => {
    if (viewRef.current === view) return;
    viewRef.current = view;
    const el = (view === 'timeline' ? tlScroll : listScroll).current;
    if (el) el.scrollTop = kept.current[view] || 0;
  }, [view]);

  // ── sheets and the open flight
  // filter | notif | menu; the address #notifications opens the notifications (a sheet, so it is not on the page stack)
  const [sheet, setSheet] = useState(() => (hashName() === 'notifications' ? 'notif' : null));
  const closeSheet = useCallback(() => setSheet(null), []);
  const [openId, setOpenId] = useState(() => param('flight') || null);
  const found = openId ? scopeFlights.find((p) => String(p.id) === String(openId)) || null : null;
  const foundCs = found?.cs || '';
  const has = Boolean(found);
  const lastOpen = useRef(null);
  const [gone, setGone] = useState(null);
  useEffect(() => {
    if (!openId) { lastOpen.current = null; setGone(null); return; }
    if (has) { lastOpen.current = { id: openId, cs: foundCs }; setGone(null); return; }
    // it was open and the feed no longer has it: say when that was noticed
    if (state === 'ok' && lastOpen.current?.id === openId) setGone((g) => g || { cs: lastOpen.current.cs, at: Date.now() });
  }, [openId, has, foundCs, state]);
  const closeAll = pages.closeAll;
  const openFlight = useCallback((id) => {
    if (id === null || id === undefined || id === '') return;
    closeAll(); setSheet(null); setOpenId(id);
  }, [closeAll]);
  const closeFlight = useCallback(() => { setOpenId(null); dropParam('flight'); }, []);

  // ── the filter
  const showAll = useCallback(() => {
    if (staff) { setHiddenIds(new Set()); return; }
    setFilterBusy(true); setFilterSaid('');
    saveClientPrefs({ hidden: { operators: [], registrations: [] } }, { eager: true })
      .catch(() => setFilterSaid('Couldn’t save the filter. It is back as it was.'))
      .finally(() => setFilterBusy(false));
  }, [staff, saveClientPrefs]);
  const groups = useMemo(() => {
    const on = new Set(shownAircraft);
    const map = new Map();
    for (const a of aircraft) {
      const key = String(a.oprId || '').toLowerCase();
      if (!map.has(key)) map.set(key, { key, name: a.type || key.toUpperCase() || 'Operator', aircraft: [] });
      const n = (a.flights || []).length;
      map.get(key).aircraft.push({ id: a.id, reg: String(a.reg || ''), note: plural(n, 'flight', 'flights'), on: on.has(a) });
    }
    return [...map.values()].sort((x, y) => x.name.localeCompare(y.name)).map((g) => ({ ...g, aircraft: g.aircraft.sort((x, y) => x.reg.localeCompare(y.reg)) }));
  }, [aircraft, shownAircraft]);
  const saveHidden = (ops, regs) => {
    setFilterBusy(true); setFilterSaid('');
    saveClientPrefs({ hidden: { operators: [...ops], registrations: [...regs] } }, { eager: true })
      .catch(() => setFilterSaid('Couldn’t save the filter. It is back as it was.'))
      .finally(() => setFilterBusy(false));
  };
  const onAircraft = (g, a, v) => {
    if (staff) { setHiddenIds((s) => { const n = new Set(s); if (v) n.delete(a.id); else n.add(a.id); return n; }); return; }
    const ops = new Set(hidden?.operators || []); const regs = new Set(hidden?.registrations || []);
    const reg = a.reg.toUpperCase();
    if (v) {
      // the operator was hidden as a whole: it comes back, and its other aircraft stay hidden one by one
      if (ops.has(g.key)) { ops.delete(g.key); for (const o of g.aircraft) if (o.reg !== a.reg) regs.add(o.reg.toUpperCase()); }
      regs.delete(reg);
    } else regs.add(reg);
    saveHidden(ops, regs);
  };
  const onOperator = (g, v) => {
    if (staff) { setHiddenIds((s) => { const n = new Set(s); for (const a of g.aircraft) { if (v) n.delete(a.id); else n.add(a.id); } return n; }); return; }
    const ops = new Set(hidden?.operators || []); const regs = new Set(hidden?.registrations || []);
    for (const a of g.aircraft) regs.delete(a.reg.toUpperCase());
    if (v) ops.delete(g.key); else ops.add(g.key);
    saveHidden(ops, regs);
  };

  // ── what the pages get
  const me = useMemo(() => (staff ? user : { ...(portalMe || {}), email: user?.email || portalMe?.email, name: user?.name || portalMe?.name, can: user?.can }), [staff, user, portalMe]);
  const supportEmail = String(portalMe?.supportEmail || user?.supportEmail || '');
  const goPage = pages.go;
  const go = useCallback((name) => {
    if (name === 'notifications') { setSheet('notif'); return; }
    goPage(name);
  }, [goPage]);
  const signOut = useCallback(() => new Promise((resolve, reject) => {
    try {
      const form = document.createElement('form');
      form.method = 'POST'; form.action = '/auth/sign-out'; form.style.display = 'none';
      document.body.appendChild(form);
      form.submit();
      // the page leaves when the sign-out went through; still here after ten seconds means it did not
      setTimeout(() => { form.remove(); reject(new Error('sign-out')); }, 10_000);
    } catch (err) { reject(err); }
  }), []);
  const ctx = useMemo(() => ({
    role, me, theme: themeApi.theme, setTheme: themeApi.setTheme, resolvedTheme: themeApi.resolved, prefs, setPrefs, roomClocks, aircraft,
    flights: scopeFlights, limitations, notamState, stale, loadedOnce, error, reload, supportEmail, go, back: pages.back, openFlight,
    clientPrefs, saveClientPrefs, unread, events, signOut,
  }), [role, me, themeApi.theme, themeApi.setTheme, themeApi.resolved, prefs, setPrefs, roomClocks, aircraft, scopeFlights, limitations, notamState, stale, loadedOnce, error, reload, supportEmail, go, pages.back, openFlight, clientPrefs, saveClientPrefs, unread, events, signOut]);

  // the wall said this person may not read it: the one screen for that, nothing else
  if (denied === 403) {
    return <Shell theme={themeApi.resolved} role={role}><StatusScreen kind="403" ctx={ctx} /></Shell>;
  }

  // ── words for the states
  const noFleet = !staff && state === 'ok' && aircraft.length === 0 && portalMe ? emptyFleetWords(portalMe) : null;
  const failedMsg = (
    <Msg data-feed-failed="" title={bad('Couldn’t load flights')} primary action="Try again" onAction={reload}
      body={`The wall service didn’t answer. Nothing is shown rather than an old list.${lastTry ? ` Last tried ${hms(lastTry)}Z.` : ''}`} />
  );
  let tlEmpty = null;
  if (state === 'ok' && rows.length === 0) {
    if (noFleet) tlEmpty = <Msg data-empty={noFleet.kind} title={noFleet.title} body={noFleet.line} />;
    else if (hiddenCount > 0) {
      tlEmpty = <Msg data-empty="filtered" title="No flights from the aircraft you’re showing" body={`${plural(hiddenCount, 'hidden aircraft', 'hidden aircraft')} may have flights between ${hm(win.start)} and ${hm(win.end)} UTC.`} action="Show all aircraft" onAction={showAll} />;
    } else {
      const next = scopeFlights.find((p) => p.depMs > win.end && p.status !== 'cancelled');
      const day = next && utcDay(next.depMs) !== utcDay(nowMs) ? ` on ${new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short' }).format(new Date(next.depMs))}` : '';
      tlEmpty = <Msg data-empty="window" title={`No flights between ${hm(win.start)} and ${hm(win.end)} UTC`}
        body={next ? `Nothing is scheduled in this window. The next departure is ${next.cs}${day} at ${hm(next.depMs)} UTC.` : 'Nothing is scheduled in this window, and nothing later is on the schedule.'}
        action={range !== 'DAY' ? 'Show the whole day' : null} onAction={() => pickRange('DAY')} />;
    }
  }
  let listEmpty = null;
  if (state === 'ok' && total === 0) {
    const anyUnsearched = query.trim() ? groupDays(shown, nowMs).length > 0 : false;
    if (anyUnsearched) listEmpty = <Msg data-empty="search" title={`No flights match “${query.trim()}”`} body="Search looks at callsign, registration and both airports, across today and tomorrow." action="Clear search" onAction={() => setQuery('')} />;
    else if (noFleet) listEmpty = <Msg data-empty={noFleet.kind} title={noFleet.title} body={noFleet.line} />;
    else if (hiddenCount > 0) listEmpty = <Msg data-empty="filtered" title="No flights today or tomorrow" body={`${plural(hiddenCount, 'aircraft is', 'aircraft are')} hidden by the filter.`} action="Show all aircraft" onAction={showAll} />;
    else listEmpty = <Msg data-empty="days" title="No flights today or tomorrow" body={staff ? 'Nothing is scheduled.' : 'Nothing is scheduled for your operators.'} action="Open timeline" onAction={() => switchView('timeline')} />;
  }

  // ── rail, menu, notifications
  const rail = [
    { key: 'timeline', icon: 'align-left', label: 'Timeline', active: view === 'timeline', onClick: () => switchView('timeline') },
    { key: 'flights', icon: 'list', label: 'Flights', active: view === 'flights', onClick: () => switchView('flights') },
    ...(staff
      ? [{ key: 'menu', icon: 'menu', label: 'NOTAM check, Limits, Important, More', active: false, onClick: () => setSheet('menu') }]
      : [{ key: 'settings', icon: 'settings', label: 'Settings', active: false, onClick: () => go('settings') },
        { key: 'account', icon: 'circle-user', label: 'Account', active: false, onClick: () => go('account') }]),
  ];
  const pad = rail.length * 48 + 24;
  let menuRows = [];
  if (staff && sheet === 'menu') {
    const airports = Array.isArray(notamState?.airports) ? notamState.airports : null;
    const toCheck = airports ? airports.filter((a) => !a.checked && !a.error && (a.filtered?.length ?? 0) > 0).length : 0;
    const review = scopeFlights.filter((p) => p.open.includes('IMP')).length;
    menuRows = [
      { key: 'notam', icon: 'radio-tower', label: 'NOTAM check', value: toCheck > 0 ? `${toCheck} to check` : airports && airports.length ? 'All checked' : null, warn: toCheck > 0 },
      { key: 'limits', icon: 'triangle-alert', label: 'Limits', value: limitations.length ? `${limitations.length} active` : null },
      { key: 'important', icon: 'info', label: 'Important', value: review > 0 ? (review === 1 ? '1 needs review' : `${review} need review`) : null, warn: review > 0 },
      { key: 'more', icon: 'menu', label: 'More' },
      { key: 'settings', icon: 'settings', label: 'Phone settings' },
      { key: 'account', icon: 'circle-user', label: 'Account' },
    ];
  }
  const pickEvent = (e) => {
    markOne(e.key); setSheet(null);
    if (e.id) openFlight(e.id);
    else if (e.kind === 'NTM' && staff) goPage('notam');
  };
  const signIn = () => { window.location.assign(`/login?next=${encodeURIComponent(`${window.location.pathname}${window.location.search}${window.location.hash}`)}`); };

  // a client's first run: where the app opens. Only when the saved answer was READ and is empty.
  const onboarding = !staff && clientPrefsState === 'ok' && clientPrefs && clientPrefs.start === null;
  const filterLabel = hiddenCount > 0 ? `${hiddenCount} aircraft hidden` : `All ${aircraft.length} aircraft`;

  return (
    <Shell theme={themeApi.resolved} role={role} view={view}>
      <Header live={live} staleMin={staleMin} clocks={clocksOf(prefs, roomClocks)} clocksOn={prefs.clocksOn} nowMs={nowMs} />
      {denied === 401 ? <Banner data-signed-out="" tone="warn" words="Your sign-in has ended." action="Sign in" onAction={signIn} /> : null}
      {stale ? (
        <Banner data-stale-banner="" tone="warn" action="Try again" onAction={reload}
          words={staleSince ? `Not live. Last update ${hm(staleSince)}Z, ${staleMin} min ago.` : 'Not live. This list may be old.'} />
      ) : null}
      {state === 'ok' && hiddenCount > 0 ? <Banner data-filter-banner="" words={`${hiddenCount} aircraft hidden`} action="Show all" onAction={showAll} /> : null}
      {filterSaid && sheet !== 'filter' ? <Banner data-filter-failed="" tone="bad" words={filterSaid} action="OK" onAction={() => setFilterSaid('')} /> : null}

      <div data-main="" style={{ flex: 1, minHeight: 0, position: 'relative', display: 'flex', flexDirection: 'column' }}>
        {view === 'timeline' ? (
          <ErrorBoundary key="timeline" where="phone/timeline" fallback={(retry) => <Failed title="Couldn’t show the timeline" onRetry={retry} leave="Open flights list" onLeave={() => switchView('flights')} />}>
            <TimelineView rows={rows} win={win} nowMs={nowMs} state={state} empty={tlEmpty} failed={failedMsg} onOpen={openFlight} dim={stale} scrollRef={tlScroll} pad={pad} />
          </ErrorBoundary>
        ) : (
          <ErrorBoundary key="list" where="phone/list" fallback={(retry) => <Failed title="Couldn’t show the flights list" onRetry={retry} leave="Open timeline" onLeave={() => switchView('timeline')} />}>
            <FlightsList days={days} total={total} nowMs={nowMs} state={state} empty={listEmpty} failed={failedMsg} onOpen={openFlight} dim={stale} query={query} setQuery={setQuery} scrollRef={listScroll} pad={pad} />
          </ErrorBoundary>
        )}
        <Rail items={rail} />
      </div>
      <BottomBar view={view} range={range} onRange={pickRange} filterLabel={filterLabel} hiddenCount={hiddenCount} unread={unread} onFilter={() => { setFilterSaid(''); setSheet('filter'); }} onBell={() => setSheet('notif')} />

      {sheet === 'filter' ? (
        <FilterSheet groups={groups} hiddenCount={hiddenCount} total={aircraft.length} onAircraft={onAircraft} onOperator={onOperator} onShowAll={showAll} onClose={closeSheet} failed={filterSaid} busy={filterBusy} />
      ) : null}
      {sheet === 'menu' && staff ? <MenuSheet rows={menuRows} onPick={(key) => { setSheet(null); go(key); }} onClose={closeSheet} /> : null}

      {openId ? (
        <ErrorBoundary where="phone/flight" resetKey={openId} fallback={(retry) => <Failed z={20} title="Couldn’t show this flight" onRetry={retry} leave="Close" onLeave={closeFlight} />}>
          <FlightView p={found} id={openId} feedState={found ? 'ok' : state} gone={gone} onClose={closeFlight} reload={reload} role={role} me={me} user={user}
            nowMs={nowMs} stale={stale} limitations={limitations} notamState={notamState} setNotamState={setNotamState} dataUpdatedAt={dataUpdatedAt}
            theme={themeApi.resolved} Staff={staff ? StaffFlight : null} />
        </ErrorBoundary>
      ) : null}

      {pages.stack.map((name, i) => (
        <ErrorBoundary key={`${i}:${name}`} where={`phone/outer/${name}`} resetKey={name} fallback={(retry) => <Failed z={25} title="Couldn’t show this page" onRetry={retry} leave="Back" onLeave={pages.back} />}>
          {staff && STAFF_PAGES.includes(name)
            ? <Suspense fallback={<PageWait />}><StaffPage name={name} ctx={ctx} /></Suspense>
            : COMMON_PAGES.includes(name) ? <CommonPage name={name} ctx={ctx} /> : null}
        </ErrorBoundary>
      ))}

      {onboarding ? (
        <ErrorBoundary where="phone/onboarding" fallback={(retry) => <Failed z={30} title="Couldn’t show this screen" onRetry={retry} />}>
          <Onboarding ctx={{ ...ctx, back: () => { if (window.history.length > 1) window.history.back(); } }} onDone={(start) => setView(start === 'flights' ? 'flights' : 'timeline')} />
        </ErrorBoundary>
      ) : null}

      {sheet === 'notif' ? <NotifSheet z={35} events={events} nowMs={nowMs} onPick={pickEvent} onMarkAll={markAll} onClose={closeSheet} role={role} /> : null}
    </Shell>
  );
}

/**
 * A part that broke while it was drawn (ErrorBoundary): its place, with words and a way on. The error's own text is
 * never shown. `z` = it was a layer over the screen (a flight, a page), so the message covers the same place.
 */
function Failed({ title, onRetry, leave, onLeave, z }) {
  const words = (
    <Msg role="alert" data-part-failed="" data-part-title={title || ''} title="This part failed." body="The rest of the app still works.">
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
        <Btn kind="primary" height={44} block={false} onClick={onRetry} data-part-reload="" style={{ fontSize: 13 }}>Reload</Btn>
        {leave ? <Btn kind="line" height={44} block={false} onClick={onLeave} data-part-leave="" style={{ fontSize: 13 }}>{leave}</Btn> : null}
      </div>
    </Msg>
  );
  if (!z) return <div className="cw3-scroll" style={{ flex: 1, minHeight: 0 }}>{words}</div>;
  return <div className="cw3-scroll" style={{ position: 'absolute', inset: 0, zIndex: z, background: c('bg'), paddingTop: SAFE_TOP }}>{words}</div>;
}

/** While the staff pages' code arrives (a second or two on a slow line): the page's place, quiet. */
function PageWait() {
  return <div aria-busy="true" aria-label="Loading" data-page-wait="" style={{ position: 'absolute', inset: 0, zIndex: 25, background: c('bg') }} />;
}
