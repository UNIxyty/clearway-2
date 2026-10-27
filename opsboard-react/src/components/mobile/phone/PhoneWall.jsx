// The Digital Wall on a phone (design: Mobile Wall - Phone.dc.html, mobile-design-spec.md; imported 2026-10-27).
// The wall, not the portal: it lives in the wall app, takes its colours and its font from the room's own wall
// settings (phoneTokens), reads no portal token and no data-theme, and is the same data the ops-room display draws
// (DisplayApp fetches; this arranges). Reached from the Wall tab in /m, which frames this page; a registered screen
// (device token) never gets it — it stays on the display at any size.
//
// Screen 1, the flight list: a timeline (new) and the cards view (kept), a floating rail to switch them and open this
// phone's settings, the range / filter / bell in the bottom bar where the thumb is (§1.5). Screen 2, the open flight,
// is OpenFlight.jsx; screen 3, this phone's settings, PhoneSettings.jsx.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useWallColors } from '../../../theme/WallColorsContext';
import { useAuth } from '../../../AuthGate';
import { flattenFlights, hmZ } from '../mobileUtil';
import useConnection from '../useConnection';
import { phoneTokens, v } from './tokens';
import { hmIn, usePhonePrefs } from './prefs';
import { Btn, CheckChip, Icon, Label, Msg, Scroll, Segmented, Sheet, Square, Toggle } from './ui';
import OpenFlight from './OpenFlight';
import { RANGES, chipList, lookOf, phoneFlight } from './model';
import PhoneSettings from './PhoneSettings';
import './mobile-wall.css';

const H = 3600_000;

/** Re-renders on every minute boundary, aligned to the device clock (§2.2: no seconds, no animation). */
function useMinute() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let id = null;
    const t = setTimeout(() => { setNow(Date.now()); id = setInterval(() => setNow(Date.now()), 60_000); }, 60_000 - (Date.now() % 60_000) + 20);
    return () => { clearTimeout(t); if (id) clearInterval(id); };
  }, []);
  return now;
}

/** Flight events seen on this phone since the list opened (§2.8: flight events only, never passenger data). */
function useEvents(flights, notamState) {
  const seen = useRef(null);
  const notamSeen = useRef(null);
  const [events, setEvents] = useState([]);
  useEffect(() => {
    if (!flights.length) return;
    const now = Date.now();
    const next = new Map(flights.map((p) => [p.id, { status: p.status, late: p.depLate }]));
    if (seen.current) {
      const add = [];
      for (const p of flights) {
        const was = seen.current.get(p.id);
        if (!was) continue;
        const route = `${p.adep} → ${p.ades}`;
        if (p.status === 'cancelled' && was.status !== 'cancelled') add.push({ icon: 'CNX', tone: 'bad', title: `${p.cs} cancelled`, sub: `${route} · was ${p.depT} UTC`, id: p.id });
        else if (p.status === 'airborne' && was.status !== 'airborne') add.push({ icon: 'DEP', tone: 'accent', title: `${p.cs} departed ${p.adep}`, sub: `${p.depKind === 'T/O' ? 'T/O' : 'ETD'} ${p.depT} UTC`, id: p.id });
        else if (p.status === 'arrived' && was.status !== 'arrived') add.push({ icon: 'LDG', tone: 'muted', title: `${p.cs} landed ${p.ades}`, sub: `${p.arrT} UTC`, id: p.id });
        else if (p.depLate >= 5 && p.depLate - (was.late || 0) >= 5) add.push({ icon: `+${p.depLate}`, tone: 'warn', title: `${p.cs} delayed ${p.depLate} min`, sub: `${p.depKind} ${p.depT} UTC · ${route}`, id: p.id });
      }
      if (add.length) setEvents((e) => [...add.map((x, i) => ({ ...x, key: `${now}-${i}`, at: now, read: false })), ...e].slice(0, 60));
    }
    seen.current = next;
  }, [flights]);
  useEffect(() => {
    const airports = (notamState?.airports || []).filter((a) => !a.checked && !a.error && (a.filtered?.length ?? 0) > 0);
    const now = Date.now();
    const cur = new Set(airports.map((a) => a.icao));
    if (notamSeen.current) {
      const add = airports.filter((a) => !notamSeen.current.has(a.icao)).map((a, i) => ({ icon: 'NTM', tone: 'ntm', title: `NOTAMs to check at ${a.icao}`, sub: `${a.filtered.length} for today's flights`, key: `${now}-n${i}`, at: now, read: false, icao: a.icao }));
      if (add.length) setEvents((e) => [...add, ...e].slice(0, 60));
    }
    notamSeen.current = cur;
  }, [notamState]);
  const unread = events.filter((e) => !e.read).length;
  const markAll = () => setEvents((e) => e.map((x) => ({ ...x, read: true })));
  const markOne = (key) => setEvents((e) => e.map((x) => (x.key === key ? { ...x, read: true } : x)));
  return { events, unread, markAll, markOne };
}

const TONE = {
  warn: { b: v('warn-soft'), c: v('warn'), br: v('warn-line') },
  bad: { b: v('bad-soft'), c: v('bad'), br: v('bad-line') },
  accent: { b: v('accent-soft'), c: v('st-airborne'), br: v('accent-line') },
  muted: { b: v('surface-3'), c: v('text-3'), br: v('line-3') },
  ok: { b: v('ok-soft'), c: v('ok'), br: v('ok-line') },
  ntm: { b: v('chk-ntm-bg'), c: v('chk-ntm-fg'), br: v('chk-ntm-line') },
};

function LivePill({ state, ageMin }) {
  const s = {
    live: { label: 'LIVE', bg: v('ok-soft'), line: v('ok-line'), fg: v('ok') },
    connecting: { label: 'CONNECTING', bg: v('surface-3'), line: v('line-3'), fg: v('text-3') },
    stale: { label: `STALE ${ageMin} MIN`, bg: v('warn-soft'), line: v('warn-line'), fg: v('warn') },
    none: { label: 'NO DATA', bg: v('bad-soft'), line: v('bad-line'), fg: v('bad') },
  }[state];
  return (
    <span data-live={state} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 20, padding: '0 7px', borderRadius: 5, background: s.bg, border: `1px solid ${s.line}`, flex: 'none' }}>
      <i style={{ width: 6, height: 6, borderRadius: '50%', background: s.fg, display: 'block' }} />
      <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.09em', color: s.fg, whiteSpace: 'nowrap' }}>{s.label}</span>
    </span>
  );
}

/** World clocks (§2.2): UTC tinted and mandatory; names only if every name fits, otherwise every cell shows its code. */
function Clocks({ clocks, nowMs }) {
  const ref = useRef(null);
  const [width, setWidth] = useState(390);
  const [overflow, setOverflow] = useState(false);
  const n = clocks.length;
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return undefined;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth + 32));
    ro.observe(el); setWidth(el.clientWidth + 32);
    return () => ro.disconnect();
  }, []);
  const cell = (width - 32 - 4 * (n - 1)) / n;
  const useCode = cell < 84 || overflow;
  useLayoutEffect(() => {
    if (useCode) return;
    const check = () => { const el = ref.current; if (el && [...el.querySelectorAll('[data-city]')].some((x) => x.scrollWidth > x.clientWidth + 1)) setOverflow(true); };
    check(); document.fonts?.ready?.then(check);
  });
  useEffect(() => { setOverflow(false); }, [n, width]);
  const [cityFs, timeFs] = n <= 3 ? [11, 26] : n === 4 ? [10, 22] : [10, 19];
  return (
    <div ref={ref} data-clocks={n} style={{ display: 'flex', gap: 4 }}>
      {clocks.map((c) => (
        <div key={`${c.timeZone}-${c.name}`} style={{ flex: '1 1 0', minWidth: 0, padding: '6px 4px 7px', borderRadius: 10, background: c.utc ? v('utc-soft') : 'transparent', border: `1px solid ${c.utc ? v('utc-line') : 'transparent'}`, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
          <span data-city="1" style={{ maxWidth: '100%', fontSize: cityFs, fontWeight: 800, letterSpacing: '0.08em', color: c.utc ? v('utc') : v('text-3'), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{useCode ? c.code : c.name}</span>
          <span style={{ fontSize: timeFs, fontWeight: 800, lineHeight: 1.15, color: c.utc ? v('utc') : v('text-1'), whiteSpace: 'nowrap' }}>{hmIn(nowMs, c.timeZone)}</span>
        </div>
      ))}
    </div>
  );
}

function Pill({ p, onOpen }) {
  const l = lookOf(p);
  const chip = (code) => <span style={{ height: 17, padding: '0 6px', borderRadius: 9, background: l.chipBg, color: l.chipFg, fontSize: 10.5, fontWeight: 900, letterSpacing: '0.03em', display: 'flex', alignItems: 'center' }}>{code}</span>;
  return (
    <button type="button" data-pill={p.cs} onClick={() => onOpen(p)} aria-label={`${p.cs}, ${p.adep} ${p.depT} to ${p.ades} ${p.arrT}, ${p.status}`}
      style={{ flex: 'none', position: 'relative', zIndex: 3, height: 44, display: 'flex', alignItems: 'center', gap: 8, padding: '0 10px', borderRadius: 12, background: l.bg, border: `1px ${l.borderStyle} ${l.border}`, overflow: 'hidden' }}>
      <span style={{ fontSize: 14, fontWeight: 900, letterSpacing: '0.01em', color: l.color, whiteSpace: 'nowrap' }}>{p.cs}</span>
      <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>{chip(p.adep)}<span style={{ fontSize: 11, fontWeight: 800, color: l.depColor, textDecoration: l.deco, whiteSpace: 'nowrap' }}>{p.depT}</span></span>
      <span style={{ fontSize: 12, fontWeight: 900, color: v('text-4') }}>→</span>
      <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>{chip(p.ades)}
        <span style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 11, fontWeight: 800, color: l.arrColor, textDecoration: l.deco, whiteSpace: 'nowrap' }}>{p.arrT}{p.nextDay && <span style={{ fontSize: 8.5, fontWeight: 900, lineHeight: 1, padding: '1px 3px', borderRadius: 3, background: v('surface-4'), color: v('text-1') }}>+1</span>}</span>
      </span>
      {l.tag && <span style={{ height: 20, padding: '0 6px', borderRadius: 5, background: l.tag.bg, color: l.tag.fg, fontSize: 10.5, fontWeight: 900, display: 'flex', alignItems: 'center', whiteSpace: 'nowrap' }}>{l.tag.t}</span>}
      {p.progress != null && <span style={{ position: 'absolute', left: 0, bottom: 0, height: 2, width: `${Math.round(p.progress * 100)}%`, background: v('st-airborne') }} />}
    </button>
  );
}

function Timeline({ rows, win, nowMs, state, emptyMsg, onOpen, dim }) {
  const span = win.end - win.start;
  const X = (ms) => `${(Math.max(0, Math.min(1, (ms - win.start) / span)) * 100).toFixed(2)}%`;
  const has = rows.length > 0 && state === 'ok';
  const ticks = [];
  if (has) {
    const step = win.step * H;
    for (let t = Math.ceil(win.start / step) * step; t < win.end; t += step) {
      const x = (t - win.start) / span;
      if (Math.abs(x - 1 / 6) > 0.14 && x > 0.04 && x < 0.97) ticks.push({ x: `${(x * 100).toFixed(2)}%`, label: hmZ(t).slice(0, 2) });
    }
  }
  return (
    <>
      <div style={{ flex: 'none', height: 26, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', paddingRight: 10 }}>
        <span style={{ fontSize: 11.5, fontWeight: 800, color: v('text-3') }}>{hmZ(win.start)} – {hmZ(win.end)} UTC</span>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: v('text-4') }}>{win.rel}</span>
      </div>
      <div style={{ flex: 'none', height: 30, position: 'relative', marginRight: 10 }}>
        {ticks.map((k) => <span key={k.x} style={{ position: 'absolute', bottom: 4, left: k.x, transform: 'translateX(-50%)', fontSize: 11, fontWeight: 800, color: v('text-4') }}>{k.label}</span>)}
        {has && <span data-now-label style={{ position: 'absolute', bottom: 2, left: '16.667%', transform: 'translateX(-50%)', height: 22, padding: '0 7px', borderRadius: 6, background: v('text-1'), color: v('on-solid'), fontSize: 11.5, fontWeight: 900, display: 'flex', alignItems: 'center', whiteSpace: 'nowrap' }}>{hmZ(nowMs)} UTC</span>}
      </div>
      <Scroll style={{ marginRight: 10, opacity: dim ? 0.55 : 1 }}>
        <div style={{ position: 'relative', minHeight: '100%', paddingBottom: 150 }}>
          {has && <span style={{ position: 'absolute', top: 0, bottom: 0, left: '16.667%', width: 2, marginLeft: -1, background: v('text-1'), opacity: 0.85, zIndex: 2 }} />}
          {state === 'loading' && ['8%', '30%', '22%', '45%', '38%', '55%'].map((x, i) => (
            <div key={x} style={{ height: 56, display: 'flex', alignItems: 'center', borderBottom: `1px solid ${v('line-1')}` }}>
              <div style={{ flex: `0 1 ${x}`, minWidth: 0 }} />
              <div className="mw-skel" style={{ flex: 'none', width: [170, 150, 180, 160, 170, 140][i], height: 44, borderRadius: 12, background: v('surface-3'), opacity: 1 - i * 0.15 }} />
            </div>
          ))}
          {has && rows.map((p) => (
            <div key={p.id} className="mw-pill-row" style={{ height: 56, position: 'relative', display: 'flex', alignItems: 'center', borderBottom: `1px solid ${v('line-1')}` }}>
              <span aria-hidden="true" style={{ position: 'absolute', top: 2, left: X(p.depMs), width: 6, height: 6, marginLeft: -3, borderRadius: '50%', background: lookOf(p).color, zIndex: 3 }} />
              <div className="mw-spacer" style={{ flex: `0 1 ${X(p.depMs)}`, minWidth: 0 }} />
              <Pill p={p} onOpen={onOpen} />
            </div>
          ))}
          {emptyMsg}
        </div>
      </Scroll>
    </>
  );
}

function Cards({ air, next, tab, state, onOpen, nowMs }) {
  const rel = (ms) => { const m = Math.round((ms - nowMs) / 60_000); if (m <= 0) return 'departed'; return `in ${m >= 60 ? `${Math.floor(m / 60)}h ` : ''}${m % 60}m`; };
  return (
    <Scroll innerStyle={{ padding: '12px 2px 160px 0', display: 'flex', flexDirection: 'column', gap: 9 }}>
      {state === 'loading' && <>
        <div className="mw-skel" style={{ height: 132, borderRadius: 14, background: v('surface-2'), border: `1px solid ${v('line-2')}` }} />
        <div className="mw-skel" style={{ height: 60, borderRadius: 14, background: v('surface-1'), border: `1px solid ${v('line-1')}` }} />
        <div className="mw-skel" style={{ height: 60, borderRadius: 14, background: v('surface-1'), border: `1px solid ${v('line-1')}`, opacity: 0.6 }} />
      </>}
      {state === 'ok' && air.length > 0 && <Label style={{ paddingLeft: 2 }}>Airborne</Label>}
      {state === 'ok' && air.map((p) => (
        <button key={p.id} type="button" data-card={p.cs} onClick={() => onOpen(p)} style={{ background: v('surface-2'), border: `1px ${p.estimated ? 'dashed' : 'solid'} ${v('line-2')}`, borderRadius: 14, padding: '12px 13px', display: 'flex', flexDirection: 'column', gap: 9 }}>
          <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, width: '100%' }}>
            <span style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}><span style={{ fontSize: 17, fontWeight: 900, color: v('text-1') }}>{p.cs}</span><span style={{ fontSize: 12, fontWeight: 700, color: v('text-4'), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.reg}</span></span>
            <span style={{ height: 22, padding: '0 8px', borderRadius: 6, background: v('accent-soft'), border: `1px solid ${v('accent-line')}`, fontSize: 10, fontWeight: 900, letterSpacing: '0.08em', color: v('st-airborne'), display: 'flex', alignItems: 'center', flex: 'none' }}>{p.estimated ? 'AIRBORNE?' : 'AIRBORNE'}</span>
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: v('text-2') }}>{p.adep}</span>
            <span style={{ flex: 1, height: 14, position: 'relative', display: 'flex', alignItems: 'center' }}>
              <span style={{ position: 'absolute', left: 0, right: 0, height: 2, borderRadius: 2, background: v('surface-4') }} />
              <span style={{ position: 'absolute', left: 0, width: `${Math.round((p.progress ?? 0) * 100)}%`, height: 2, borderRadius: 2, background: v('st-airborne') }} />
              <span style={{ position: 'absolute', left: `${Math.round((p.progress ?? 0) * 100)}%`, width: 9, height: 9, borderRadius: '50%', background: v('text-1'), border: `2px solid ${v('bg-1')}`, marginLeft: -4 }} />
            </span>
            <span style={{ fontSize: 14, fontWeight: 800, color: v('text-2') }}>{p.ades}</span>
          </span>
          <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 12, color: v('text-3'), width: '100%' }}>
            <span>{p.depKind === 'T/O' ? 'ATD' : p.depKind} {p.depT}Z · {p.arrKind || 'ETA'} {p.arrT}Z</span>
            <span style={{ fontWeight: 800, color: p.arrLate ? v('warn') : v('ok') }}>{p.arrLate ? `+${p.arrLate}` : 'on time'}</span>
          </span>
          {p.open.length > 0 && <span style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap' }}>{chipList(p.open).map((k) => <CheckChip key={k} k={k} />)}</span>}
        </button>
      ))}
      {state === 'ok' && next.length > 0 && <Label style={{ paddingLeft: 2, marginTop: 4 }}>Next out</Label>}
      {state === 'ok' && next.map((p) => {
        const l = lookOf(p);
        return (
          <button key={p.id} type="button" data-card={p.cs} onClick={() => onOpen(p)} style={{ background: v('surface-1'), border: `1px ${l.borderStyle === 'dashed' ? 'dashed' : 'solid'} ${p.status === 'cancelled' ? v('bad-line') : v('line-1')}`, borderRadius: 14, padding: '11px 13px', display: 'flex', alignItems: 'center', gap: 10, minHeight: 60 }}>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, flex: 1 }}>
              <span style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}><span style={{ fontSize: 15, fontWeight: 900, color: l.color }}>{p.cs}</span><span style={{ fontSize: 12, fontWeight: 700, color: v('text-3'), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.adep} → {p.ades}</span></span>
              <span style={{ display: 'flex', gap: 5, alignItems: 'center', minHeight: 20 }}>{chipList(p.open).map((k) => <CheckChip key={k} k={k} h={20} size={10} />)}{l.tag && <span style={{ height: 20, padding: '0 6px', borderRadius: 5, background: l.tag.bg, color: l.tag.fg, fontSize: 10, fontWeight: 900, display: 'flex', alignItems: 'center' }}>{l.tag.t}</span>}</span>
            </span>
            <span style={{ textAlign: 'right', flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
              <span style={{ fontSize: 15, fontWeight: 900, color: l.depColor, textDecoration: l.deco }}>{p.depT}Z</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: v('text-4') }}>{p.status === 'cancelled' ? 'cancelled' : rel(p.depMs)}</span>
            </span>
          </button>
        );
      })}
      {state === 'ok' && !air.length && !next.length && (tab === 'attn'
        ? <Msg top={40} title="Nothing needs attention" body="Every flight in the next 6 hours has all five checks marked." />
        : <Msg top={40} title="No flights in the next 6 hours" body="Nothing is airborne and nothing is due out." />)}
    </Scroll>
  );
}

export default function PhoneWall({ aircraft = [], limitations = [], clocks: roomClocks = [], notamState, loadedOnce = false, error = '', dataUpdatedAt = 0, onReload, initialFlightId = null }) {
  const colors = useWallColors();
  const tokens = useMemo(() => phoneTokens(colors), [colors]);
  const { user } = useAuth();
  const who = user?.email || user?.id || 'anyone';
  const [prefs, setPrefs] = usePhonePrefs(who, roomClocks);
  const conn = useConnection(dataUpdatedAt);
  const nowMs = useMinute();
  const [range, setRange] = useState(prefs.range in RANGES ? prefs.range : '6H');
  const [view, setView] = useState(prefs.view === 'cards' ? 'cards' : 'timeline');
  const [tab, setTab] = useState('now');
  const [sel, setSel] = useState(null); // aircraft ids shown, or null for all (the session only, §2.7)
  const [sheet, setSheet] = useState(null); // 'filter' | 'notif'
  const [openId, setOpenId] = useState(initialFlightId);
  const [settings, setSettings] = useState(false);
  const [lastTry, setLastTry] = useState(() => Date.now());

  const all = useMemo(() => flattenFlights(aircraft).map((f) => phoneFlight(f, nowMs)).sort((a, b) => a.depMs - b.depMs), [aircraft, nowMs]);
  const { events, unread, markAll, markOne } = useEvents(all, notamState);
  const r = RANGES[range];
  const win = { start: nowMs - r.before * H, end: nowMs + r.after * H, step: r.step, rel: r.rel };
  const shown = sel ? all.filter((p) => sel.includes(p.acId)) : all;
  const inWin = (p) => p.arrMs >= win.start && p.depMs <= win.end;
  const rows = shown.filter(inWin);
  const acList = useMemo(() => (aircraft || []).map((a) => ({ id: `${a.oprId || 'opr'}:${a.reg}`, reg: a.reg, operator: a.type, n: (a.flights || []).length })).sort((a, b) => a.reg.localeCompare(b.reg)), [aircraft]);

  // The four states (§2.10): loading, failed with nothing, stale with the last list, normal.
  const failed = loadedOnce && Boolean(error) && aircraft.length === 0;
  const stale = !failed && loadedOnce && (conn.stale || Boolean(error));
  const state = !loadedOnce ? 'loading' : failed ? 'failed' : 'ok';
  const live = !loadedOnce ? 'connecting' : failed ? 'none' : stale ? 'stale' : conn.status === 'live' ? 'live' : 'connecting';
  const retry = () => { setLastTry(Date.now()); onReload?.(); };

  useEffect(() => { if (initialFlightId) setOpenId(initialFlightId); }, [initialFlightId]);
  // Keep screen awake (Settings › Phone only): only while this list is open and visible.
  useEffect(() => {
    if (!prefs.awake || !navigator.wakeLock) return undefined;
    let lock = null;
    const get = () => { if (document.visibilityState === 'visible') navigator.wakeLock.request('screen').then((l) => { lock = l; }).catch(() => {}); };
    get(); document.addEventListener('visibilitychange', get);
    return () => { document.removeEventListener('visibilitychange', get); lock?.release?.().catch?.(() => {}); };
  }, [prefs.awake]);

  const openFlight = all.find((p) => p.id === openId) || null;
  const onOpen = (p) => setOpenId(p.id);
  const showClocks = prefs.clocksOn && prefs.clocks.length >= 2;

  let emptyMsg = null;
  if (state === 'failed') emptyMsg = <Msg tone="bad" top={48} title="Couldn’t load flights" body={`The wall service didn’t answer. Nothing is shown rather than an old list. Last tried ${hmZ(lastTry)}:${String(new Date(lastTry).getUTCSeconds()).padStart(2, '0')} UTC.`} action="Retry" onAction={retry} />;
  else if (state === 'ok' && !rows.length) {
    if (sel) {
      const others = new Set(all.filter((p) => inWin(p) && !sel.includes(p.acId)).map((p) => p.acId)).size;
      emptyMsg = <Msg title={`None of your ${sel.length} selected aircraft fly in this window`} body={others ? `${others} other aircraft ${others === 1 ? 'has' : 'have'} flights between ${hmZ(win.start)} and ${hmZ(win.end)} UTC.` : `No aircraft fly between ${hmZ(win.start)} and ${hmZ(win.end)} UTC.`} action="Show all aircraft" onAction={() => setSel(null)} />;
    } else {
      const nextOut = all.find((p) => p.depMs > win.end && p.status !== 'cancelled');
      emptyMsg = <Msg title={`No flights between ${hmZ(win.start)} and ${hmZ(win.end)} UTC`} body={nextOut ? `Nothing is scheduled in this window. The next departure is ${nextOut.cs} at ${nextOut.depT} UTC.` : 'Nothing is scheduled in this window, and nothing later is on the board.'} action={range !== 'DAY' ? 'Show the whole day' : null} onAction={() => setRange('DAY')} />;
    }
  }

  // Cards view (§2.9, kept): Now = airborne + next out within six hours; Attention = those with checks still open.
  const soon = shown.filter((p) => p.status === 'airborne' || (p.depMs >= nowMs - 0.5 * H && p.depMs <= nowMs + 6 * H && p.status !== 'arrived'));
  const tabbed = tab === 'attn' ? soon.filter((p) => p.open.length) : soon;
  const air = tabbed.filter((p) => p.status === 'airborne');
  const next = tabbed.filter((p) => p.status !== 'airborne');
  const attnCount = soon.filter((p) => p.open.length).length;
  const dueHour = soon.filter((p) => p.status !== 'airborne' && p.status !== 'cancelled' && p.depMs > nowMs && p.depMs - nowMs <= H).length;
  const airCount = soon.filter((p) => p.status === 'airborne').length;

  const filterLabel = sel ? `Filtered · ${sel.length} of ${acList.length} aircraft` : 'All aircraft';
  const isTl = view === 'timeline';

  return (
    <div data-mobile-wall="" data-view={view} style={{ ...tokens, position: 'relative', height: '100dvh', width: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: v('bg-1') }}>
      <header style={{ flex: 'none', padding: '10px 16px 10px', paddingTop: 'max(10px, env(safe-area-inset-top))', display: 'flex', flexDirection: 'column', gap: 10, borderBottom: `1px solid ${v('line-1')}` }}>
        <div style={{ height: 30, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <h1 style={{ margin: 0, fontSize: 16, fontWeight: 800, letterSpacing: '-0.01em', color: v('text-1'), whiteSpace: 'nowrap' }}>Digital Wall</h1>
            <LivePill state={live} ageMin={conn.ageMin} />
          </div>
          {!showClocks && <span style={{ fontSize: 15, fontWeight: 800, color: v('utc'), whiteSpace: 'nowrap' }}>{hmZ(nowMs)} UTC</span>}
        </div>
        {showClocks && <Clocks clocks={prefs.clocks} nowMs={nowMs} />}
        {!isTl && <>
          <div style={{ fontSize: 13, lineHeight: 1.45, color: v('text-3') }}>{airCount} airborne · {dueHour} depart within the hour{attnCount ? <> · <span style={{ color: v('warn'), fontWeight: 800 }}>{attnCount} need attention</span></> : ''}</div>
          <Segmented label="Cards" height={44} size={14} options={[{ value: 'now', label: 'Now' }, { value: 'attn', label: 'Attention', count: attnCount || null }]} value={tab} onChange={setTab} />
        </>}
      </header>

      <div style={{ flex: 1, minHeight: 0, display: 'flex', position: 'relative' }}>
        <nav aria-label="Views" style={{ position: 'absolute', left: 8, bottom: 12, zIndex: 6, display: 'flex', flexDirection: 'column', gap: 4, padding: 4, borderRadius: 14, background: v('surface-3'), border: `1px solid ${v('line-3')}`, boxShadow: `0 8px 24px ${v('scrim')}` }}>
          <Square label="Timeline view" aria-pressed={isTl} onClick={() => setView('timeline')} style={{ borderRadius: 10, background: isTl ? v('accent-soft') : 'transparent', color: isTl ? v('accent-text') : v('text-3') }}><Icon name="timeline" /></Square>
          <Square label="Cards view" aria-pressed={!isTl} onClick={() => setView('cards')} style={{ borderRadius: 10, background: !isTl ? v('accent-soft') : 'transparent', color: !isTl ? v('accent-text') : v('text-3') }}><Icon name="cards" /></Square>
          <div style={{ height: 1, background: v('line-2'), margin: '2px 6px' }} />
          <Square label="Phone settings" onClick={() => setSettings(true)} style={{ borderRadius: 10, color: v('text-3') }}><Icon name="gear" /></Square>
        </nav>
        <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', position: 'relative', paddingLeft: 10 }}>
          {sel && (
            <div data-filter-banner style={{ flex: 'none', margin: '10px 10px 0 0', minHeight: 44, padding: '0 4px 0 12px', borderRadius: 12, background: v('accent-soft'), border: `1px solid ${v('accent-line')}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: v('accent-text') }}>{filterLabel}</span>
              <button type="button" onClick={() => setSel(null)} style={{ height: 44, padding: '0 10px', fontSize: 13, fontWeight: 800, color: v('text-1') }}>Show all</button>
            </div>
          )}
          {stale && (
            <div role="status" data-stale-banner style={{ flex: 'none', margin: '10px 10px 0 0', minHeight: 44, padding: '0 4px 0 12px', borderRadius: 12, background: v('warn-soft'), border: `1px solid ${v('warn-line')}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: v('warn'), lineHeight: 1.3 }}>Not updated since {conn.lastAliveMs ? hmZ(conn.lastAliveMs) : hmZ(dataUpdatedAt)} UTC</span>
              <button type="button" onClick={retry} style={{ height: 44, padding: '0 10px', fontSize: 13, fontWeight: 800, color: v('text-1') }}>Retry</button>
            </div>
          )}
          {isTl
            ? <Timeline rows={rows} win={win} nowMs={nowMs} state={state} emptyMsg={emptyMsg} onOpen={onOpen} dim={stale} />
            : state === 'failed' ? <div>{emptyMsg}</div> : <Cards air={air} next={next} tab={tab} state={state} onOpen={onOpen} nowMs={nowMs} />}
        </main>
      </div>

      <footer style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', paddingBottom: 'max(10px, env(safe-area-inset-bottom))', borderTop: `1px solid ${v('line-1')}`, background: v('bg-2') }}>
        {isTl
          ? <div style={{ flex: 1, minWidth: 0 }}><Segmented label="Range" options={['6H', '12H', 'DAY'].map((x) => ({ value: x, label: x }))} value={range} onChange={setRange} /></div>
          : <div style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, color: sel ? v('accent-text') : v('text-4'), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', paddingLeft: 4 }}>{filterLabel}</div>}
        <Square label={sel ? `Aircraft filter, ${sel.length} shown` : 'Aircraft filter'} onClick={() => setSheet('filter')} style={{ width: 46, height: 46, background: sel ? v('accent-soft') : v('surface-2'), border: `1px solid ${sel ? v('accent-line') : v('line-2')}`, color: sel ? v('accent-text') : v('text-2') }}>
          <Icon name="funnel" stroke={2} fill={sel ? 'currentColor' : 'none'} />
          {sel && <Badge n={sel.length} bg={v('accent')} />}
        </Square>
        <Square label={unread ? `Notifications, ${unread} new` : 'Notifications'} onClick={() => setSheet('notif')} style={{ width: 46, height: 46, background: v('surface-2'), border: `1px solid ${v('line-2')}`, color: v('text-2') }}>
          <Icon name="bell" stroke={2} />
          {unread > 0 && <Badge n={unread} bg={v('bad-solid')} />}
        </Square>
      </footer>

      {sheet === 'filter' && <FilterSheet acList={acList} sel={sel} setSel={setSel} rows={all.filter(inWin)} onClose={() => setSheet(null)} />}
      {sheet === 'notif' && <NotifSheet events={events} openedAt={OPENED_AT} markAll={markAll} onClose={() => setSheet(null)} onPick={(e) => { markOne(e.key); setSheet(null); if (e.id) setOpenId(e.id); }} />}
      {openFlight && <OpenFlight flight={openFlight} limitations={limitations} notamState={notamState} nowMs={nowMs} stale={stale} onClose={() => setOpenId(null)} />}
      {openId && !openFlight && state === 'ok' && <OpenFlight gone={openId} onClose={() => setOpenId(null)} />}
      {settings && <PhoneSettings prefs={prefs} setPrefs={setPrefs} roomClocks={roomClocks} nowMs={nowMs} onClose={() => { setSettings(false); }} onApply={(p) => { if (p.view) setView(p.view); if (p.range) setRange(p.range); }} />}
    </div>
  );
}

// When this page was opened: the notifications are what this phone saw since then.
const OPENED_AT = Date.now();

function Badge({ n, bg }) {
  return <span aria-hidden="true" style={{ position: 'absolute', top: -6, right: -6, minWidth: 20, height: 20, padding: '0 5px', borderRadius: 10, background: bg, color: v('on-accent'), border: `2px solid ${v('bg-2')}`, fontSize: 11, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{n > 99 ? '99+' : n}</span>;
}

function FilterSheet({ acList, sel, setSel, rows, onClose }) {
  const inRange = useMemo(() => { const m = new Map(); for (const p of rows) m.set(p.acId, (m.get(p.acId) || 0) + 1); return m; }, [rows]);
  const on = (id) => !sel || sel.includes(id);
  const toggle = (id) => {
    const cur = sel || acList.map((a) => a.id);
    const nx = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    setSel(nx.length === acList.length ? null : nx); // every aircraft on again = no filter (§2.7)
  };
  const n = sel ? sel.length : acList.length;
  return (
    <Sheet title="Aircraft" sub={sel ? `Showing ${n} of ${acList.length} aircraft` : `Showing all ${acList.length} aircraft`} onClose={onClose} maxHeight="80%"
      head={<button type="button" onClick={() => setSel(null)} style={{ height: 44, padding: '0 12px', fontSize: 14, fontWeight: 800, color: sel ? v('accent-text') : v('text-4') }}>Show all</button>}
      foot={<div style={{ flex: 'none', padding: '12px 16px max(20px, env(safe-area-inset-bottom))', borderTop: `1px solid ${v('line-1')}`, background: v('bg-2') }}><Btn kind="primary" h={48} onClick={onClose} style={{ width: '100%', fontSize: 15 }}>{sel ? `Show ${n} aircraft` : 'Done'}</Btn></div>}>
      <Scroll style={{ borderTop: `1px solid ${v('line-1')}` }}>
        {acList.map((a) => (
          <button key={a.id} type="button" role="switch" aria-checked={on(a.id)} onClick={() => toggle(a.id)} style={{ width: '100%', minHeight: 56, padding: '6px 16px 6px 18px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: `1px solid ${v('line-1')}` }}>
            <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}><span style={{ fontSize: 15, fontWeight: 900, color: on(a.id) ? v('text-1') : v('text-3') }}>{a.reg}</span><span style={{ fontSize: 12, fontWeight: 700, color: v('text-4') }}>{inRange.get(a.id) ? `${inRange.get(a.id)} in range` : '0 in range'}</span></span>
              <span style={{ fontSize: 12.5, color: v('text-3'), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.operator}</span>
            </span>
            <Toggle on={on(a.id)} />
          </button>
        ))}
      </Scroll>
    </Sheet>
  );
}

function NotifSheet({ events, openedAt, markAll, onClose, onPick }) {
  const fresh = events.filter((e) => !e.read), earlier = events.filter((e) => e.read);
  const group = (label, items) => items.length > 0 && (
    <div key={label}>
      <Label style={{ padding: '12px 18px 6px', borderTop: `1px solid ${v('line-1')}` }}>{label}</Label>
      {items.map((n) => {
        const t = TONE[n.tone] || TONE.muted;
        return (
          <button key={n.key} type="button" onClick={() => onPick(n)} style={{ width: '100%', minHeight: 64, padding: '8px 16px 8px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ flex: 'none', width: 40, height: 32, borderRadius: 7, background: t.b, color: t.c, border: `1px solid ${t.br}`, fontSize: 10.5, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{n.icon}</span>
            <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 14, fontWeight: n.read ? 600 : 800, color: v('text-1'), lineHeight: 1.3 }}>{n.title}</span>
              <span style={{ fontSize: 12.5, color: v('text-3'), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n.sub}</span>
            </span>
            <span style={{ flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: v('text-4') }}>{hmZ(n.at)}</span>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: n.read ? 'transparent' : v('accent') }} />
            </span>
          </button>
        );
      })}
    </div>
  );
  return (
    <Sheet title="Notifications" sub={`Flight events since you opened the wall at ${hmZ(openedAt)} UTC`} onClose={onClose} maxHeight="78%"
      head={<button type="button" onClick={markAll} style={{ height: 44, padding: '0 12px', fontSize: 14, fontWeight: 800, color: v('accent-text') }}>Mark all read</button>}>
      <Scroll innerStyle={{ paddingBottom: 26 }}>
        {events.length === 0 && <Msg top={32} title="Nothing new yet" body="Delays, departures, landings, cancellations and NOTAMs to check show here as they happen while this page is open. Passenger data never does." />}
        {group('New', fresh)}
        {group('Earlier', earlier)}
      </Scroll>
    </Sheet>
  );
}
