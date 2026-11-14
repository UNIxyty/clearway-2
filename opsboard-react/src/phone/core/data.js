// The phone app's data, for both roles.
//   staff  — the wall's own feed, limitations, clocks, NOTAM check state, stream events and reload, read exactly as
//            the display reads them (DisplayApp.jsx): the same services, the same events, the same 60 s poll.
//   client — the same feed address (the server cuts it to the client's grants and fields) plus the portal's two client
//            reads (who they are, their saved start page and filter), exactly as the client desk reads them
//            (client/ClientApp.jsx). Nothing here asks for anything a client may not read.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildApiUrl, fetchDisplayClocks, fetchNotamCheckToday, fetchTimelineAircraft } from '../../services/timelineApi';
import { subscribeWallStream } from '../../services/wallStream';
import { errorText } from '../../services/errorText';
import { PORTAL_PREFS, fetchMe, normalisePrefs, savePrefs } from '../../client/clientApi';

const POLL_MS = 60_000;
// the display's own fallback (components/Header.jsx FALLBACK_CLOCKS), repeated so the phone does not pull the header in
const ROOM_FALLBACK = [{ label: 'Riga', timeZone: 'Europe/Riga', local: true }, { label: 'UTC', timeZone: 'UTC' }];
const FEED_EVENTS = ['limitations.changed', 'important.changed', 'caa.changed', 'roster.changed', 'flight.changed', 'weather.changed'];

/** Which answer the feed gives right now, as a number (0 = no answer). Only asked after a load failed. */
async function feedStatus() {
  const now = Date.now();
  const query = new URLSearchParams({ allOperators: 'true', refresh: 'false', from: new Date(now).toISOString(), to: new Date(now + 60_000).toISOString() });
  try {
    const r = await fetch(buildApiUrl(`/api/timeline/flights?${query.toString()}`), { cache: 'no-store', signal: AbortSignal.timeout(8000) });
    return r.status;
  } catch { return 0; }
}

async function readClientPrefs() {
  const r = await fetch(PORTAL_PREFS, { credentials: 'same-origin', cache: 'no-store' });
  const body = await r.json().catch(() => null);
  if (!r.ok || body?.ok === false) throw new Error('prefs not read');
  return normalisePrefs(body?.prefs);
}

/**
 * role: 'staff' | 'client' | null (not known yet: nothing is asked).
 * Returns the feed and everything around it. `denied` is 403 or 401 when the wall refused this person.
 */
export function usePhoneData(role) {
  const [aircraft, setAircraft] = useState([]);
  const [limitations, setLimitations] = useState([]);
  const [error, setError] = useState('');
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [dataUpdatedAt, setDataUpdatedAt] = useState(0);
  const [lastTry, setLastTry] = useState(0);
  const [denied, setDenied] = useState(0);
  const [roomClocks, setRoomClocks] = useState(ROOM_FALLBACK);
  const [notamState, setNotamState] = useState(null);
  const [me, setMe] = useState(null);
  const [clientPrefs, setClientPrefs] = useState(null);
  const [clientPrefsState, setClientPrefsState] = useState('loading'); // loading | ok | failed
  const loadingRef = useRef(false);
  const prefsRef = useRef(null);

  const load = useCallback(async () => {
    if (!role || loadingRef.current) return;
    loadingRef.current = true;
    setLastTry(Date.now());
    try {
      const result = await fetchTimelineAircraft({ refresh: false });
      setAircraft(result.aircraft || []);
      setLimitations(role === 'staff' ? result.limitations || [] : []);
      setError('');
      setDenied(0);
      setDataUpdatedAt(Date.now());
    } catch (err) {
      setError(errorText(err));
      const status = await feedStatus();
      setDenied(status === 403 || status === 401 ? status : 0);
    } finally {
      setLoadedOnce(true);
      loadingRef.current = false;
    }
  }, [role]);

  const loadClocks = useCallback(() => {
    fetchDisplayClocks().then((p) => { if (Array.isArray(p?.clocks) && p.clocks.length > 0) setRoomClocks(p.clocks); }).catch(() => {});
  }, []);
  const loadNotam = useCallback(() => {
    fetchNotamCheckToday().then((p) => setNotamState(p)).catch(() => {});
  }, []);

  const loadClientPrefs = useCallback(async () => {
    try {
      const p = await readClientPrefs();
      prefsRef.current = p; setClientPrefs(p); setClientPrefsState('ok');
      return p;
    } catch (err) {
      setClientPrefsState((s) => (s === 'ok' ? 'ok' : 'failed'));
      throw err;
    }
  }, []);

  useEffect(() => {
    if (!role) return undefined;
    load();
    loadClocks();
    if (role === 'staff') loadNotam();
    if (role === 'client') {
      fetchMe().then((m) => { if (m) setMe(m); });
      loadClientPrefs().catch(() => {});
    }
    const id = setInterval(load, POLL_MS);
    const events = role === 'staff' ? [...FEED_EVENTS, 'alerts.changed'] : FEED_EVENTS;
    const unsubs = events.map((ev) => subscribeWallStream(ev, () => load()));
    if (role === 'staff') unsubs.push(subscribeWallStream('notam-check.changed', () => { load(); loadNotam(); }));
    unsubs.push(subscribeWallStream('config.changed', (event) => {
      if (!event?.section || event.section === 'clocks') loadClocks();
      if (role === 'staff' && (!event?.section || event.section === 'settings')) load();
    }));
    return () => { clearInterval(id); unsubs.forEach((off) => off()); };
  }, [role, load, loadClocks, loadNotam, loadClientPrefs]);

  /**
   * Keep a change to the client's saved view on their account. Resolves only after the server took it; rejects (and
   * puts the old value back) when it did not. With `eager` the screen shows the change while the server is asked.
   */
  const saveClientPrefs = useCallback(async (patch, { eager = false } = {}) => {
    if (role !== 'client') throw new Error('not a client');
    const base = prefsRef.current || await loadClientPrefs(); // never write over a list that could not be read
    const next = normalisePrefs({ ...base, ...patch });
    if (eager) setClientPrefs(next);
    try {
      const saved = await savePrefs(next);
      prefsRef.current = saved; setClientPrefs(saved); setClientPrefsState('ok');
      return saved;
    } catch (err) {
      if (eager) setClientPrefs(prefsRef.current);
      throw err;
    }
  }, [role, loadClientPrefs]);

  return { aircraft, limitations, error, loadedOnce, dataUpdatedAt, lastTry, denied, roomClocks, notamState, setNotamState, reload: load, me, clientPrefs, clientPrefsState, saveClientPrefs };
}

/** The clock, turning over on the minute. */
export function useMinute() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let interval = null;
    const first = setTimeout(() => {
      setNow(Date.now());
      interval = setInterval(() => setNow(Date.now()), 60_000);
    }, 60_000 - (Date.now() % 60_000) + 20);
    const onShow = () => { if (document.visibilityState === 'visible') setNow(Date.now()); };
    document.addEventListener('visibilitychange', onShow);
    return () => { clearTimeout(first); clearInterval(interval); document.removeEventListener('visibilitychange', onShow); };
  }, []);
  return now;
}

/** Keeps the screen on while `on` is true and the page is in front (the phone setting "Keep screen awake"). */
export function useWakeLock(on) {
  useEffect(() => {
    if (!on || !navigator.wakeLock?.request) return undefined;
    let lock = null; let off = false;
    const ask = () => {
      if (off || document.visibilityState !== 'visible') return;
      navigator.wakeLock.request('screen').then((l) => { if (off) l.release().catch(() => {}); else lock = l; }).catch(() => {});
    };
    ask();
    document.addEventListener('visibilitychange', ask);
    return () => { off = true; document.removeEventListener('visibilitychange', ask); lock?.release?.().catch(() => {}); };
  }, [on]);
}

const KIND_OF = { CNX: 'delays', DELAY: 'delays', DEP: 'movements', LDG: 'movements', NTM: 'notam' };

/**
 * Flight events since the app opened, worked out from the feed as it changes (the old phone wall's rules): a flight
 * cancelled, departed, landed, or delayed by five minutes more. Staff also get "NOTAMs to check" per airport.
 * `notify` (this phone's switches) and the role decide which are shown; a client never gets NTM or CNX items.
 */
export function useEvents(flights, notamState, { role, notify }) {
  const [events, setEvents] = useState([]);
  const seen = useRef(new Map());
  const notamSeen = useRef(null);

  useEffect(() => {
    if (!flights.length) return;
    const now = Date.now();
    const fresh = [];
    for (const p of flights) {
      const was = seen.current.get(p.id);
      const route = `${p.adep} → ${p.ades}`;
      if (was) {
        if (p.status === 'cancelled' && was.status !== 'cancelled') {
          fresh.push({ kind: 'CNX', icon: 'CNX', tone: 'bad', title: `${p.cs} cancelled`, sub: `${route} · was ${p.depT} UTC`, id: p.id });
        } else if (p.status === 'airborne' && was.status !== 'airborne') {
          fresh.push({ kind: 'DEP', icon: 'DEP', tone: 'air', title: `${p.cs} departed ${p.adep}`, sub: `${p.depKind === 'T/O' ? 'T/O' : 'ETD'} ${p.depT} UTC`, id: p.id });
        } else if (p.status === 'arrived' && was.status !== 'arrived') {
          fresh.push({ kind: 'LDG', icon: 'LDG', tone: 'muted', title: `${p.cs} landed ${p.ades}`, sub: `${p.arrT} UTC`, id: p.id });
        } else if (p.depLate >= 5 && p.depLate - (was.late || 0) >= 5) {
          fresh.push({ kind: 'DELAY', icon: `+${p.depLate}`, tone: 'warn', title: `${p.cs} delayed ${p.depLate} min`, sub: `${p.depKind} ${p.depT} UTC · ${route}`, id: p.id });
        }
      }
      seen.current.set(p.id, { status: p.status, late: p.depLate });
    }
    if (fresh.length) setEvents((list) => [...fresh.map((e, i) => ({ ...e, key: `${now}-${i}`, at: now, read: false })), ...list].slice(0, 60));
  }, [flights]);

  useEffect(() => {
    if (role !== 'staff' || !notamState?.airports) return;
    const open = notamState.airports.filter((a) => !a.checked && !a.error && (a.filtered?.length ?? 0) > 0);
    const known = notamSeen.current || new Set();
    const now = Date.now();
    const fresh = open.filter((a) => !known.has(a.icao)).map((a, i) => ({ kind: 'NTM', icon: 'NTM', tone: 'plain', title: `NOTAMs to check at ${a.icao}`, sub: `${a.filtered.length} for today’s flights`, icao: a.icao, key: `${now}-n${i}`, at: now, read: false }));
    notamSeen.current = new Set(open.map((a) => a.icao));
    if (fresh.length) setEvents((list) => [...fresh, ...list].slice(0, 60));
  }, [notamState, role]);

  const shown = useMemo(() => events.filter((e) => {
    const group = KIND_OF[e.kind];
    if (role !== 'staff' && (e.kind === 'NTM' || e.kind === 'CNX')) return false;
    if (group === 'delays') return notify?.delays !== false;
    if (group === 'movements') return notify?.movements !== false;
    return true;
  }), [events, role, notify]);

  const markAll = useCallback(() => setEvents((list) => list.map((e) => ({ ...e, read: true }))), []);
  const markOne = useCallback((key) => setEvents((list) => list.map((e) => (e.key === key ? { ...e, read: true } : e))), []);
  return { events: shown, unread: shown.filter((e) => !e.read).length, markAll, markOne };
}
