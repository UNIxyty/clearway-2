// The phone's first screen (design "Mobile Flight List v3"), built on the old phone wall (components/mobile/phone/
// PhoneWall.jsx): one row per flight sorted by departure, the pill starting at its departure time, the now line at one
// sixth, up-and-down scrolling only, three ranges, one tap opens a flight. Only the look is v3.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from '../icons';
import { Logo, MONO, SAFE_BOTTOM, SAFE_TOP, Segmented, c } from '../kit';
import { hmIn } from '../pages/clocks';
import { NOW_AT, RANGE_KEYS, listStatus, lookOf } from './model';
import { H, dayHead, hm, utcDay } from './util';

const LIVE = {
  connecting: { t: 'CONNECTING', fg: c('t3') },
  none: { t: 'NO DATA', fg: c('bad') },
  stale: { t: 'NOT LIVE', fg: c('warn') },
  partial: { t: 'PARTLY LIVE', fg: c('warn') },
  live: { t: 'LIVE', fg: c('ok') },
  liveUnknown: { t: 'LIVE', fg: c('ok') },
};

/** Logo, "Digital Wall", the live state; under it the world clocks (or UTC alone in the top line when clocks are off). */
export function Header({ live, staleMin, clocks, clocksOn, nowMs }) {
  const l = LIVE[live] || LIVE.connecting;
  const label = live === 'stale' && Number.isFinite(staleMin) && staleMin > 0 ? `${l.t} · ${staleMin} MIN` : l.t;
  const showClocks = clocksOn && clocks.length >= 2;
  return (
    <header style={{ flex: 'none', paddingTop: `calc(${SAFE_TOP} + 8px)`, background: c('bg'), borderBottom: `1px solid ${c('l1')}` }}>
      <div style={{ height: 32, padding: '0 16px', display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <Logo height={16} />
        <span aria-hidden="true" style={{ width: 1, height: 14, background: c('l2'), flex: 'none' }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: c('t2'), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>Digital Wall</span>
        <span style={{ flex: 1 }} />
        {!showClocks ? <span data-utc-clock="" style={{ ...MONO, fontSize: 13, color: c('t2'), whiteSpace: 'nowrap' }}>{hm(nowMs)} UTC</span> : null}
        <span data-live={live} role="status" style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 'none', ...MONO, fontSize: 11, fontWeight: 700, color: l.fg, whiteSpace: 'nowrap' }}>
          <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: 3, background: l.fg }} />{label}
        </span>
      </div>
      {showClocks ? <Clocks clocks={clocks} nowMs={nowMs} /> : <div style={{ height: 8 }} />}
    </header>
  );
}

/** Two to five clocks in one row; city names give way to three-letter codes when the row is too narrow for them. */
function Clocks({ clocks, nowMs }) {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);
  const [overflow, setOverflow] = useState(false);
  const n = clocks.length;
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    setWidth(el.clientWidth);
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const names = clocks.map((k) => k.label).join('|');
  useEffect(() => { setOverflow(false); }, [n, width, names]);
  const cell = width ? (width - 32 - 4 * (n - 1)) / n : 999;
  const useCode = cell < 84 || overflow;
  useLayoutEffect(() => {
    if (useCode) return undefined;
    const check = () => {
      const el = ref.current;
      if (!el) return;
      if ([...el.querySelectorAll('[data-city]')].some((x) => x.scrollWidth > x.clientWidth + 1)) setOverflow(true);
    };
    check();
    let off = false;
    document.fonts?.ready?.then(() => { if (!off) check(); });
    return () => { off = true; };
  }, [useCode, n, width, names]);
  return (
    <div ref={ref} data-clocks={n} style={{ display: 'flex', gap: 4, padding: '4px 16px 8px', minWidth: 0 }}>
      {clocks.map((k) => (
        <div key={k.tz} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span data-city="" style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.08em', color: k.utc ? c('t2') : c('t3'), whiteSpace: 'nowrap', overflow: 'hidden' }}>{useCode ? k.code : k.label}</span>
          <span style={{ ...MONO, fontSize: 16, color: c('t1'), whiteSpace: 'nowrap' }}>{hmIn(nowMs, k.tz)}</span>
        </div>
      ))}
    </div>
  );
}

/** One line under the header with one action: "N aircraft hidden · Show all", "Not live … · Try again". */
export function Banner({ words, action, onAction, tone = 't2', ...rest }) {
  return (
    <div {...rest} role="status" style={{ flex: 'none', minHeight: 44, padding: '0 4px 0 16px', display: 'flex', alignItems: 'center', gap: 8, background: c('bg2'), borderBottom: `1px solid ${c('l1')}` }}>
      <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: c(tone), padding: '6px 0', overflowWrap: 'anywhere' }}>{words}</span>
      {action ? <button type="button" data-banner-action="" onClick={onAction} className="cw3-press" style={{ flex: 'none', minHeight: 44, minWidth: 44, padding: '0 12px', fontSize: 13, fontWeight: 600, color: c('t1'), textDecoration: 'underline', textUnderlineOffset: 3 }}>{action}</button> : null}
    </div>
  );
}

function Pill({ p, onOpen }) {
  const look = lookOf(p);
  const ring = p.unconfirmed && p.status !== 'cancelled';
  const time = (t, color) => <span style={{ ...MONO, fontSize: 13, color, textDecoration: look.deco }}>{t || '--:--'}</span>;
  const code = (t) => <span style={{ ...MONO, fontSize: 11, color: c('t3') }}>{t}</span>;
  return (
    <button type="button" data-pill={p.cs} data-fid={p.id} data-status={p.status} data-unconfirmed={ring ? '' : undefined} onClick={() => onOpen(p.id)} className="cw3-press"
      aria-label={`${p.cs}, ${p.adep} ${p.depT} to ${p.ades} ${p.arrT} UTC, ${p.status}${ring ? ', not confirmed' : ''}`}
      style={{ position: 'relative', flex: 'none', maxWidth: '100%', minWidth: 0, height: 44, padding: '0 12px', display: 'flex', alignItems: 'center', gap: 8, borderRadius: 8, overflow: 'hidden', whiteSpace: 'nowrap',
        background: look.bg, border: `1px ${look.borderStyle} ${look.border}`, outline: ring ? `2px solid ${c('bad')}` : undefined, outlineOffset: ring ? 1 : undefined }}>
      <span style={{ ...MONO, fontSize: 13, fontWeight: 700, color: look.codeColor }}>{p.cs}</span>
      <span style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>{code(p.adep)}{time(p.depT, look.depColor)}</span>
      <Icon name="arrow-right" size={12} color={c('t4')} />
      <span style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        {code(p.ades)}{time(p.arrT, look.arrColor)}
        {p.nextDay ? <span style={{ ...MONO, fontSize: 11, color: c('t4') }}>+1</span> : null}
      </span>
      {look.tag ? <span data-pill-tag="" style={{ ...MONO, fontSize: 11, fontWeight: 700, color: look.tag.fg }}>{look.tag.t}</span> : null}
      {p.progress != null ? <span aria-hidden="true" data-progress="" style={{ position: 'absolute', left: 0, bottom: 0, height: 2, width: `${Math.round(p.progress * 100)}%`, background: c('air') }} /> : null}
    </button>
  );
}

const SKEL = [[8, 170], [30, 150], [22, 180], [45, 160], [38, 170], [55, 140]];

/**
 * The timeline. rows: the flights in the window, already sorted by departure. win: { start, end, step, rel }.
 * state: loading | failed | ok. `empty` is the message when there are no rows. `pad` leaves room for the rail.
 */
export function TimelineView({ rows, win, nowMs, state, empty, failed, onOpen, dim, scrollRef, pad = 150 }) {
  const span = win.end - win.start;
  const X = (ms) => Math.max(0, Math.min(100, ((ms - win.start) / span) * 100));
  const ticks = [];
  const step = win.step * H;
  for (let t = Math.ceil(win.start / step) * step; t <= win.end; t += step) ticks.push({ t, x: (t - win.start) / span });
  const loading = state === 'loading';
  const hasRows = state === 'ok' && rows.length > 0;
  const nowLeft = `${(NOW_AT * 100).toFixed(3)}%`;
  return (
    <div data-view="timeline" data-state={state} style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 'none', height: 24, padding: '0 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, ...MONO, fontSize: 11, color: c('t3'), whiteSpace: 'nowrap' }}>
        <span data-window="">{hm(win.start)} – {hm(win.end)} UTC</span>
        <span style={{ color: c('t4') }}>{win.rel}</span>
      </div>
      <div aria-hidden="true" style={{ flex: 'none', position: 'relative', height: 28, margin: '0 16px', borderBottom: `1px solid ${c('l1')}` }}>
        {hasRows ? ticks.filter((k) => Math.abs(k.x - NOW_AT) > 0.16 && k.x > 0.04 && k.x < 0.97).map((k) => (
          <span key={k.t} style={{ position: 'absolute', left: `${(k.x * 100).toFixed(2)}%`, top: 6, transform: 'translateX(-50%)', ...MONO, fontSize: 11, color: c('t4') }}>{hm(k.t).slice(0, 2)}</span>
        )) : null}
        {state !== 'failed' ? (
          <span data-now="" style={{ position: 'absolute', left: nowLeft, top: 4, transform: 'translateX(-50%)', padding: '2px 6px', borderRadius: 4, background: c('inv'), color: c('on-inv'), ...MONO, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>{hm(nowMs)} UTC</span>
        ) : null}
      </div>
      <div ref={scrollRef} data-timeline-scroll="" className="cw3-scroll" style={{ flex: 1, opacity: dim ? 0.55 : 1 }}>
        {state === 'failed' ? failed : null}
        {state === 'ok' && rows.length === 0 ? empty : null}
        {loading || hasRows ? (
          <div style={{ position: 'relative', minHeight: '100%', margin: '0 16px', paddingBottom: pad }}>
            {ticks.filter((k) => k.x > 0.01 && k.x < 0.99).map((k) => (
              <span key={k.t} aria-hidden="true" style={{ position: 'absolute', top: 0, bottom: 0, left: `${(k.x * 100).toFixed(2)}%`, width: 1, background: c('l1') }} />
            ))}
            <span aria-hidden="true" data-now-line="" style={{ position: 'absolute', top: 0, bottom: 0, left: nowLeft, width: 2, marginLeft: -1, background: c('inv') }} />
            {loading ? (
              <div aria-busy="true" aria-label="Loading flights" data-skeleton="">
                {SKEL.map(([x, w], i) => (
                  <div key={x} style={{ height: 56, display: 'flex', alignItems: 'center', opacity: 1 - i * 0.15 }}>
                    <span style={{ flex: `0 1 ${x}%` }} />
                    <span style={{ flex: 'none', width: w, maxWidth: '100%', height: 44, borderRadius: 8, background: c('skel'), animation: 'cw3-pulse 1.4s ease-in-out infinite' }} />
                  </div>
                ))}
              </div>
            ) : rows.map((p) => {
              const x = X(p.depMs).toFixed(2);
              return (
                <div key={p.id} data-row="" style={{ position: 'relative', height: 56, display: 'flex', alignItems: 'center' }}>
                  <span aria-hidden="true" style={{ position: 'absolute', left: `${x}%`, top: 2, width: 1, height: 6, background: c('t4') }} />
                  <span style={{ flex: `0 1 ${x}%` }} />
                  <Pill p={p} onOpen={onOpen} />
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The Flights list: search, then the flights by UTC day. `days`: [{ key, ms, flights }] already filtered by the search.
 */
export function FlightsList({ days, total, nowMs, state, failed, empty, onOpen, dim, query, setQuery, scrollRef, pad = 150 }) {
  return (
    <div data-view="flights" data-state={state} style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 'none', padding: '8px 16px', borderBottom: `1px solid ${c('l1')}` }}>
        <div style={{ height: 44, display: 'flex', alignItems: 'center', gap: 8, padding: '0 0 0 12px', borderRadius: 8, border: `1px solid ${c('l2')}`, background: c('bg2') }}>
          <Icon name="search" size={16} color={c('t3')} />
          <input data-search="" type="search" inputMode="search" enterKeyHint="search" autoComplete="off" autoCorrect="off" autoCapitalize="characters" spellCheck={false} aria-label="Search flights"
            placeholder="Callsign, registration, airport" value={query} onChange={(e) => setQuery(e.target.value)}
            style={{ flex: 1, minWidth: 0, height: 42, border: 0, background: 'transparent', fontSize: 16, padding: 0 }} />
          {query ? (
            <button type="button" data-search-clear="" aria-label="Clear search" onClick={() => setQuery('')} style={{ width: 44, height: 44, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', color: c('t3') }}><Icon name="x" size={16} /></button>
          ) : <span style={{ width: 12, flex: 'none' }} />}
        </div>
      </div>
      <div ref={scrollRef} data-list-scroll="" className="cw3-scroll" style={{ flex: 1, opacity: dim ? 0.55 : 1 }}>
        {state === 'failed' ? failed : null}
        {state === 'loading' ? (
          <div aria-busy="true" aria-label="Loading flights" data-skeleton="">
            {SKEL.map(([x], i) => <div key={x} style={{ height: 56, borderBottom: `1px solid ${c('l1')}`, background: c('skel'), opacity: 1 - i * 0.15, animation: 'cw3-pulse 1.4s ease-in-out infinite' }} />)}
          </div>
        ) : null}
        {state === 'ok' && total === 0 ? empty : null}
        {state === 'ok' && total > 0 ? (
          <div style={{ paddingBottom: pad }}>
            {days.map((d) => (
              <section key={d.key} data-day={d.key}>
                <div style={{ position: 'sticky', top: 0, zIndex: 1, height: 32, padding: '0 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: c('bg2'), borderBottom: `1px solid ${c('l1')}` }}>
                  <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.08em', color: c('t3'), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{dayHead(d.ms, nowMs)}</span>
                  <span style={{ ...MONO, fontSize: 11, color: c('t4'), flex: 'none' }}>{d.flights.length} {d.flights.length === 1 ? 'flight' : 'flights'}</span>
                </div>
                {d.flights.map((p) => <ListRow key={p.id} p={p} onOpen={onOpen} />)}
              </section>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ListRow({ p, onOpen }) {
  const st = listStatus(p);
  const dimmed = p.status === 'cancelled' || p.status === 'arrived';
  const deco = p.status === 'cancelled' ? 'line-through' : 'none';
  return (
    <button type="button" data-flight-row={p.id} data-status={p.status} onClick={() => onOpen(p.id)} className="cw3-press"
      aria-label={`${p.cs}, ${p.adep} ${p.depT} to ${p.ades} ${p.arrT} UTC, ${st.t}`}
      style={{ width: '100%', minHeight: 56, padding: '8px 16px', display: 'grid', gridTemplateColumns: '48px minmax(0,1fr) auto', alignItems: 'center', columnGap: 12, borderBottom: `1px solid ${c('l1')}`, textAlign: 'left' }}>
      <span style={{ ...MONO, fontSize: 13, fontWeight: 700, color: dimmed ? c('t3') : c('t1'), textDecoration: deco, whiteSpace: 'nowrap' }}>{p.depT || '--:--'}<span style={{ fontSize: 11, fontWeight: 400, color: c('t4') }}>Z</span></span>
      <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0, whiteSpace: 'nowrap' }}>
          <span style={{ ...MONO, fontSize: 13, fontWeight: 700, color: dimmed ? c('t3') : c('t1') }}>{p.cs}</span>
          <span style={{ ...MONO, fontSize: 11, color: c('t3'), overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.reg}</span>
        </span>
        <span style={{ ...MONO, fontSize: 11, color: c('t3'), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.adep} → {p.ades} · {p.arrT || '--:--'}Z{p.nextDay ? ' +1' : ''}</span>
      </span>
      <span style={{ ...MONO, fontSize: 11, fontWeight: 700, color: st.fg, whiteSpace: 'nowrap' }}>{st.t}</span>
    </button>
  );
}

/** The flights of today and tomorrow (UTC) by day, plus anything from before that has not landed yet. */
export function groupDays(flights, nowMs) {
  const today = utcDay(nowMs);
  const map = new Map();
  for (const p of flights) {
    const d = utcDay(p.depMs);
    if (!Number.isFinite(d) || d > today + 1) continue;
    if (d < today && !(p.status === 'airborne' || (p.arrMs >= nowMs && p.status !== 'arrived' && p.status !== 'cancelled'))) continue;
    if (!map.has(d)) map.set(d, { key: String(d), ms: d * 86_400_000, flights: [] });
    map.get(d).flights.push(p);
  }
  return [...map.values()].sort((a, b) => a.ms - b.ms);
}

function SquareBtn({ icon, label, onClick, badge, active, ...rest }) {
  return (
    <button type="button" aria-label={badge ? `${label}, ${badge}` : label} title={label} onClick={onClick} className="cw3-press" {...rest}
      style={{ position: 'relative', width: 44, height: 44, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, border: `1px solid ${c('l2')}`, background: active ? c('s2') : 'transparent', color: c('t1') }}>
      <Icon name={icon} size={20} />
      {badge ? <span data-badge="" style={{ position: 'absolute', top: -8, right: -8, minWidth: 20, height: 20, padding: '0 4px', borderRadius: 2, background: c('inv'), color: c('on-inv'), border: `2px solid ${c('bg2')}`, ...MONO, fontSize: 11, fontWeight: 700, lineHeight: '16px', textAlign: 'center' }}>{badge}</span> : null}
    </button>
  );
}

/** Bottom bar: the range (timeline) or the filter in words (list), the filter button, the bell. */
export function BottomBar({ view, range, onRange, filterLabel, hiddenCount, unread, onFilter, onBell }) {
  return (
    <div data-bottom-bar="" style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 8, padding: `8px 16px max(24px, calc(8px + ${SAFE_BOTTOM}))`, background: c('bg2'), borderTop: `1px solid ${c('l1')}` }}>
      {view === 'timeline' ? (
        <Segmented data-range={range} label="Time range" value={range} onChange={onRange} style={{ flex: 1, background: 'transparent' }}
          options={RANGE_KEYS.map((k) => ({ value: k, label: <span style={{ ...MONO, fontSize: 13, fontWeight: 700 }}>{k}</span> }))} />
      ) : (
        <span data-filter-label="" style={{ flex: 1, minWidth: 0, fontSize: 13, color: c('t3'), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{filterLabel}</span>
      )}
      <SquareBtn data-filter-btn="" icon="list-filter" label="Operators and aircraft" onClick={onFilter} badge={hiddenCount > 0 ? String(hiddenCount > 99 ? '99+' : hiddenCount) : null} active={hiddenCount > 0} />
      <SquareBtn data-bell="" icon="bell" label="Notifications" onClick={onBell} badge={unread > 0 ? (unread > 99 ? '99+' : String(unread)) : null} />
    </div>
  );
}

/** The rail, bottom left over the list. items: [{ key, icon, label, active, onClick }] */
export function Rail({ items }) {
  return (
    <nav data-rail="" aria-label="Views" style={{ position: 'absolute', left: 8, bottom: 12, zIndex: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
      {items.map((it) => (
        <button key={it.key} type="button" data-rail-btn={it.key} aria-label={it.label} title={it.label} aria-current={it.active ? 'page' : undefined} onClick={it.onClick} className="cw3-press"
          style={{ width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 4, border: `1px solid ${c('l2')}`, background: it.active ? c('s2') : c('bg2'), color: it.active ? c('t1') : c('t3') }}>
          <Icon name={it.icon} size={20} />
        </button>
      ))}
    </nav>
  );
}

