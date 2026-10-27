// Screen 2 — the open flight (mobile-design-spec.md §3). What stays as it was: callsign and status, close, registration
// and operator, the route with VFR/IFR marks and the duration, STD/STA with ETD/ETA and the delta. The six changes:
// PAX (the one shared passenger viewer, in the room's colours), the Limitations pill, airports as buttons opening
// their weather and NOTAMs, the FlightRadar24 slot that says plainly it is not connected, Service status from Leon,
// and the five checks as a grid with Option B marking — each sheet marks its own items, the bottom bar is progress
// and "Next" (§3.6; the design's recommendation, flagged to ops).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ackNotamCheck, fetchFlightInfo, postFlightCheck } from '../../../services/timelineApi';
import { useAuth, useCanAction } from '../../../AuthGate';
import PassengerViewer from '../../../../../shared/passenger-viewer.jsx';
import { hmZ, spanText } from '../mobileUtil';
import { v } from './tokens';
import { lookOf } from './model';
import { Btn, CheckChip, CloseButton, Icon, Label, Msg, Scroll, Segmented, Sheet, SheetFoot } from './ui';

const KEYS = ['IMP', 'NTM', 'WX', 'CAA', 'LIM'];
const NAME = { IMP: 'Important', NTM: 'NOTAMs', WX: 'Weather', CAA: 'CAA', LIM: 'Limitations' };
const STATUS = { scheduled: 'SCHEDULED', boarding: 'SCHEDULED', delayed: 'DELAYED', ctot: 'CTOT', slot: 'CTOT', airborne: 'AIRBORNE', arrived: 'ARRIVED', cancelled: 'CANCELLED' };
const FC = { VFR: 'vfr', MVFR: 'mvfr', IFR: 'ifr', LIFR: 'lifr' };

/** "jane.t.adams@…" → "JTA"; "Rig Test" → "RT". Three letters at most. */
export function initialsOf(by) {
  const s = String(by || '').split('@')[0].replace(/\(.*\)/, '').trim();
  const parts = s.split(/[\s._-]+/).filter(Boolean);
  return (parts.length > 1 ? parts.map((x) => x[0]).join('') : s.slice(0, 3)).toUpperCase().slice(0, 3) || '—';
}

/** The phone wall's colours for the shared passenger viewer: every key it reads, so no portal token is ever its fallback. */
export const VIEWER_PALETTE = {
  'bg-raised': v('surface-3'), 'bg-scrim': v('scrim'), 'bg-sunken': v('surface-1'), 'bg-surface': v('surface-2'), border: v('line-2'),
  'ca-countdown-track': v('surface-4'), 'ca-sens-border': v('warn-line'), 'ca-sens-on-solid': v('on-solid'), 'ca-sens-solid': v('warn'), 'ca-sens-text': v('warn'), 'ca-sens-tint': v('warn-soft'), 'ca-watermark': 'rgba(255,255,255,.07)',
  'danger-text': v('bad'), divider: v('line-1'), primary: v('accent'), 'shadow-pop': `0 18px 40px ${v('scrim')}`, skeleton: v('surface-3'),
  text: v('text-1'), 'text-body': v('text-2'), 'text-muted': v('text-3'), 'text-on-primary': v('on-accent'), 'warning-text': v('warn'), sheet: v('bg-1'),
};

async function agentJson(path, init) {
  const r = await fetch(`/agent/api${path}`, { credentials: 'same-origin', cache: 'no-store', ...init });
  const j = await r.json().catch(() => null);
  if (!r.ok || j?.ok === false) { const e = new Error(typeof j?.message === 'string' ? j.message : `The agent answered ${r.status}.`); e.shown = true; e.status = r.status; throw e; }
  return j;
}
async function fetchServices(flightNid, oprId) {
  const base = String(import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');
  const q = new URLSearchParams({ flightNid: String(flightNid) }); if (oprId) q.set('oprId', oprId);
  const r = await fetch(`${base}/api/flight-services?${q}`, { credentials: 'same-origin', cache: 'no-store' });
  const j = await r.json().catch(() => null);
  if (!r.ok || j?.ok === false) throw new Error(j?.error || "Couldn't read this flight's services.");
  return j;
}

/** Service rows by the design's rules (§3.5): Not applicable hidden (shown on request), date/time pairs stripped. */
export function serviceRows(items = []) {
  const kind = (cap) => {
    const c = String(cap || '').toLowerCase();
    if (/not\s*applicable|^n\/?a$/.test(c)) return 'na';
    if (/^\?$|request|sent|pending|await|wait|asked|in progress/.test(c)) return 'await';
    if (/confirm|approved|granted|received|done|ok\b|booked/.test(c)) return 'ok';
    if (/^yes$/.test(c)) return 'yes';
    if (/ack/.test(c)) return 'ack';
    return 'other';
  };
  return items.map((it) => ({
    ...it, kind: kind(it.caption),
    lines: String(it.comment || '').split(/\r?\n/).map((x) => x.trim()).filter((x) => x && !/^\s*\d{6}\s*\/\s*\d{6}\s*$/.test(x)),
  }));
}
const BADGE = {
  await: { label: '● Awaiting reply', bg: v('warn'), fg: v('on-solid'), line: v('warn') },
  ok: { label: '✓ Confirmed', bg: v('ok-soft'), fg: v('ok'), line: v('ok-line') },
  yes: { label: 'Yes', bg: v('ok-soft'), fg: v('ok'), line: v('ok-line') },
  ack: { label: 'Acknowledged', bg: v('accent-soft'), fg: v('accent-text'), line: v('accent-line') },
  na: { label: 'Not applicable', bg: 'transparent', fg: v('text-3'), line: v('line-3') },
};

function Linked({ text }) {
  const parts = String(text).split(/(https?:\/\/\S+)/g);
  return parts.map((p, i) => (/^https?:\/\//.test(p)
    ? <a key={i} href={p} target="_blank" rel="noreferrer" style={{ color: v('accent-text'), textDecoration: 'underline' }}>{p} ↗</a>
    : <span key={i}>{p}</span>));
}

export default function OpenFlight({ flight: p, limitations = [], notamState, nowMs, stale = false, onClose, gone = null }) {
  const { user } = useAuth();
  const can = useCanAction();
  const [info, setInfo] = useState({ state: 'loading', data: null });
  const [svc, setSvc] = useState({ state: 'loading', items: [], at: null });
  const [sheet, setSheet] = useState(null); // pax | lim | checks | ap:dep | ap:arr | services
  const [busy, setBusy] = useState(false);
  const [markError, setMarkError] = useState(null);
  const [notam, setNotam] = useState(notamState);
  useEffect(() => { setNotam(notamState); }, [notamState]);
  const f = p?.raw;

  const loadInfo = useCallback(() => {
    if (!f?.flightNid) return;
    setInfo((x) => ({ ...x, state: 'loading' }));
    fetchFlightInfo({ flightNid: f.flightNid, oprId: f.oprId }).then((d) => setInfo({ state: 'ok', data: d })).catch(() => setInfo({ state: 'failed', data: null }));
  }, [f?.flightNid, f?.oprId]);
  const loadServices = useCallback(() => {
    if (!f?.flightNid) return;
    setSvc((x) => ({ ...x, state: 'loading' }));
    fetchServices(f.flightNid, f.oprId).then((d) => setSvc({ state: 'ok', items: d.items || [], at: d.readAt || null })).catch(() => setSvc((x) => ({ ...x, state: 'failed' })));
  }, [f?.flightNid, f?.oprId]);
  useEffect(() => { loadInfo(); loadServices(); }, [loadInfo, loadServices]);

  if (gone || !p) {
    return (
      <Frame onClose={onClose}>
        <div style={{ padding: '6px 10px 0 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span style={{ fontSize: 25, fontWeight: 900 }}>Flight</span><CloseButton onClick={onClose} /></div>
        <div style={{ margin: '18px 16px' }}><Msg top={0} tone="bad" title="This flight isn’t on the wall" body="It is outside the wall’s time window, or it was taken off the schedule. The list shows what the wall has now." action="Back to flights" onAction={onClose} /></div>
      </Frame>
    );
  }

  const look = lookOf(p);
  const lims = f.limitations || [];
  const byId = new Map(limitations.map((l) => [l.id, l]));
  const limList = [...new Map([...(f.limitationIds || []).map((id) => byId.get(id)).filter(Boolean), ...lims.filter((l) => l.type === 'LIM')].map((l) => [l.id ?? l.title, l])).values()];
  const checks = f.checks || {};
  const present = { IMP: lims.some((l) => l.type === 'IMP'), NTM: lims.some((l) => l.source === 'alert' && l.type === 'NTM'), WX: Boolean(f.wxDep || f.wxArr), CAA: lims.some((l) => l.type === 'CAA'), LIM: limList.length > 0 };
  const cell = (k) => {
    const ch = checks[k.toLowerCase()];
    if (!present[k]) return { k, done: true, l1: 'None', l2: 'on flight', none: true };
    if (ch) return { k, done: true, l1: `✓ ${initialsOf(ch.by)}`, l2: ch.at ? String(ch.at).slice(11, 16) : '—', by: ch.by, at: ch.at };
    return { k, done: false, l1: 'To check', l2: '—' };
  };
  const cells = KEYS.map(cell);
  const doneN = cells.filter((c) => c.done).length;
  const firstOpen = cells.find((c) => !c.done);
  const sheetFor = (k) => (k === 'LIM' ? 'lim' : 'checks');

  // Marking (§3.6 Option B): NOTAMs are acknowledged per airport for the Riga day, the same acknowledgement as the
  // NOTAM Check page (wall.notam.ack); the other four are this flight's own checks (wall.flights.check).
  const ntmAirports = (notam?.airports || []).filter((a) => (a.icao === p.adep || a.icao === p.ades) && !a.checked && (a.filtered?.length ?? 0) > 0);
  const mark = async (keys) => {
    if (stale || busy) return;
    setBusy(true); setMarkError(null);
    try {
      const own = keys.filter((k) => k !== 'NTM').map((k) => k.toLowerCase());
      if (own.length) await postFlightCheck({ flightNid: f.flightNid, oprId: f.oprId, types: own });
      if (keys.includes('NTM')) for (const a of ntmAirports) { const s = await ackNotamCheck(a.icao); if (s?.airports) setNotam(s); }
      if (keys.includes('NTM') && !ntmAirports.length) await postFlightCheck({ flightNid: f.flightNid, oprId: f.oprId, types: ['ntm'] });
    } catch (e) { console.warn('[phone wall] marking failed', e?.message || e); setMarkError('The wall did not save it. Anything not shown as checked is still open — try again.'); }
    setBusy(false);
  };
  const canMark = (k) => can(k === 'NTM' ? 'wall.notam.ack' : 'wall.flights.check');

  const notamsOf = (side) => (info.state === 'ok' ? info.data?.notams?.[side] : null);
  const ntmCount = (side) => { const n = notamsOf(side); return n?.ok ? (n.notams?.length ?? 0) : null; };
  const durMs = p.arrMs - p.depMs;
  const svcRows = serviceRows(svc.items);
  const awaiting = svcRows.filter((r) => r.kind === 'await').length;
  const answered = svcRows.filter((r) => r.kind !== 'await' && r.kind !== 'na').length;

  const Airport = ({ side }) => {
    const code = side === 'dep' ? p.adep : p.ades;
    const cat = side === 'dep' ? f.wxDep : f.wxArr;
    const n = ntmCount(side);
    const right = side === 'arr';
    return (
      <button type="button" data-airport={code} onClick={() => setSheet(`ap:${side}`)} aria-label={`${code} weather and NOTAMs`}
        style={{ flex: 1, minWidth: 0, padding: '9px 11px', borderRadius: 12, background: v('surface-2'), border: `1px solid ${v('line-3')}`, display: 'flex', flexDirection: 'column', alignItems: right ? 'flex-end' : 'flex-start', gap: 3 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 7, flexDirection: right ? 'row-reverse' : 'row' }}>
          <span style={{ fontSize: 24, fontWeight: 900, lineHeight: 1.2, color: v('text-1') }}>{code}</span>
          {cat && FC[cat] && <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 900, color: v(`fc-${FC[cat]}`) }}><i style={{ width: 7, height: 7, borderRadius: '50%', background: v(`fc-${FC[cat]}`), display: 'block' }} />{cat}</span>}
        </span>
        <span style={{ fontSize: 12, fontWeight: 800, color: v('accent-text'), whiteSpace: 'nowrap' }}>Weather · NOTAM {n == null ? '' : `${n} `}›</span>
      </button>
    );
  };
  const timeRow = (label, value, delta, strong) => (
    <span style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
      <span style={{ fontSize: 11, fontWeight: 800, color: v('text-4'), minWidth: 30 }}>{label}</span>
      <span style={{ fontSize: strong ? 15 : 14, fontWeight: strong ? 900 : 800, color: strong ? v('text-1') : v('text-2') }}>{value}Z</span>
      {delta ? <span style={{ fontSize: 13, fontWeight: 900, color: delta > 0 ? v('warn') : v('ok') }}>{delta > 0 ? '+' : '−'}{Math.abs(delta)}</span> : null}
    </span>
  );

  return (
    <Frame onClose={onClose}>
      <div style={{ flex: 'none', padding: '4px 10px 8px 18px', borderBottom: `1px solid ${v('line-1')}`, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: 25, fontWeight: 900, letterSpacing: '-0.01em', lineHeight: 1.2, color: v('text-1') }}>{p.cs}</h2>
            <span style={{ height: 24, padding: '0 9px', borderRadius: 6, background: 'transparent', border: `1px ${look.borderStyle} ${look.color}`, fontSize: 10.5, fontWeight: 900, letterSpacing: '0.08em', color: look.color, display: 'flex', alignItems: 'center', whiteSpace: 'nowrap' }}>{STATUS[p.status] || String(p.status).toUpperCase()}{p.estimated ? '?' : ''}</span>
          </div>
          <CloseButton onClick={onClose} />
        </div>
        <div style={{ height: 44, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: v('text-3'), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{p.reg} · {p.operator}</span>
          <div style={{ display: 'flex', gap: 6, flex: 'none' }}>
            <button type="button" onClick={() => setSheet('pax')} style={{ height: 44, display: 'flex', alignItems: 'center' }} aria-label="Passengers">
              <span style={{ height: 34, padding: '0 10px', borderRadius: 9, background: v('surface-3'), border: `1px solid ${v('line-3')}`, display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 800, color: v('text-1') }}><Icon name="person" size={15} />PAX</span>
            </button>
            {limList.length > 0 && (
              <button type="button" onClick={() => setSheet('lim')} style={{ height: 44, display: 'flex', alignItems: 'center' }} aria-label={`Limitations, ${limList.length}`}>
                <span style={{ height: 34, padding: '0 10px', borderRadius: 9, background: v('chk-lim-bg'), border: `1px solid ${v('chk-lim-line')}`, display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 900, color: v('chk-lim-fg') }}>Limitations<span style={{ minWidth: 18, height: 18, padding: '0 5px', borderRadius: 9, background: v('chk-lim-fg'), color: v('bg-1'), fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{limList.length}</span></span>
              </button>
            )}
          </div>
        </div>
      </div>

      <Scroll innerStyle={{ padding: '14px 16px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'stretch', gap: 8 }}>
          <Airport side="dep" />
          <div style={{ flex: 'none', width: 48, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
            <span style={{ fontSize: 16, fontWeight: 900, color: v('text-3') }}>→</span>
            <span style={{ fontSize: 11, fontWeight: 800, color: v('text-4'), whiteSpace: 'nowrap' }}>{durMs > 0 ? spanText(durMs) : ''}</span>
          </div>
          <Airport side="arr" />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {timeRow('STD', f.etd, null, p.depKind === 'STD')}
            {p.depKind !== 'STD' && timeRow(p.depKind, p.depT, f.depDeltaMin, true)}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-end' }}>
            {timeRow('STA', f.eta, null, p.arrKind === 'STA')}
            {p.arrKind !== 'STA' && timeRow(p.arrKind, p.arrT, f.arrDeltaMin, true)}
          </div>
        </div>

        <div data-fr24 style={{ borderRadius: 14, border: `1px solid ${v('line-2')}`, backgroundColor: v('surface-1'), backgroundImage: `linear-gradient(${v('line-1')} 1px, transparent 1px), linear-gradient(90deg, ${v('line-1')} 1px, transparent 1px)`, backgroundSize: '28px 28px', padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ height: 20, padding: '0 6px', borderRadius: 5, background: v('surface-3'), border: `1px solid ${v('line-3')}`, fontSize: 10, fontWeight: 900, letterSpacing: '0.06em', color: v('text-3'), display: 'flex', alignItems: 'center' }}>FR24</span><span style={{ fontSize: 14, fontWeight: 800, color: v('text-1') }}>Live tracking isn’t connected yet</span></div>
          <div style={{ fontSize: 12.5, lineHeight: 1.5, color: v('text-3'), textWrap: 'pretty' }}>The map fills in once the FlightRadar24 data feed is set up. Times and status above come from Leon and are current.</div>
          <a href={`https://www.flightradar24.com/${encodeURIComponent(p.cs)}`} target="_blank" rel="noreferrer" style={{ alignSelf: 'flex-start', height: 44, padding: '0 14px', borderRadius: 11, background: v('surface-3'), border: `1px solid ${v('line-3')}`, display: 'flex', alignItems: 'center', gap: 7, fontSize: 13.5, fontWeight: 800, color: v('text-1'), textDecoration: 'none' }}>Open {p.cs} in FlightRadar24<Icon name="external" size={14} stroke={2.4} /></a>
        </div>

        <button type="button" onClick={() => setSheet('services')} style={{ minHeight: 56, padding: '0 14px', borderRadius: 12, background: v('surface-2'), border: `1px solid ${v('line-3')}`, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ flex: 1, fontSize: 15, fontWeight: 800, color: v('text-1') }}>Service status</span>
          {svc.state === 'ok' && awaiting > 0 && <span style={{ height: 22, padding: '0 8px', borderRadius: 6, background: v('warn'), color: v('on-solid'), fontSize: 11, fontWeight: 900, display: 'flex', alignItems: 'center' }}>{awaiting} awaiting</span>}
          <span style={{ fontSize: 12.5, fontWeight: 700, color: v('text-3') }}>{svc.state === 'loading' ? 'Reading Leon…' : svc.state === 'failed' ? 'Couldn’t read' : svcRows.length ? `${answered} answered` : 'None requested'}</span>
          <span style={{ fontSize: 18, color: v('text-3') }}>›</span>
        </button>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button type="button" onClick={() => setSheet('checks')} style={{ minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.12em', color: v('text-3') }}>LIMITATIONS AND CAA</span>
            <span style={{ fontSize: 13, fontWeight: 800, color: v('accent-text') }}>Open to check ›</span>
          </button>
          <div data-checks-grid style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 5 }}>
            {cells.map((c) => (
              <button key={c.k} type="button" data-check={c.k} data-done={c.done ? '1' : '0'} onClick={() => setSheet(sheetFor(c.k))} aria-label={`${NAME[c.k]}: ${c.none ? 'none on this flight' : c.done ? `checked by ${c.by || 'someone'}` : 'to check'}`}
                style={{ padding: '8px 2px 7px', borderRadius: 10, background: c.done && !c.none ? v('surface-2') : 'transparent', border: `1px ${c.done ? 'solid' : 'dashed'} ${c.done ? v('line-2') : v('warn-line')}`, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, minWidth: 0 }}>
                <CheckChip k={c.k} h={20} size={10} muted={c.none} />
                <span style={{ fontSize: 11.5, fontWeight: 900, color: c.none ? v('text-3') : c.done ? v('ok') : v('warn'), whiteSpace: 'nowrap' }}>{c.l1}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: v('text-3'), whiteSpace: 'nowrap' }}>{c.l2}</span>
              </button>
            ))}
          </div>
        </div>
      </Scroll>

      <div style={{ flex: 'none', borderTop: `1px solid ${v('line-1')}`, padding: '12px 16px', paddingBottom: 'max(12px, env(safe-area-inset-bottom))', background: v('bg-2'), display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: v('text-1') }}>{doneN === 5 ? '✓ All 5 checked' : `${doneN} of 5 checked`}</span>
          <div style={{ display: 'flex', gap: 3 }}>{cells.map((c) => <span key={c.k} style={{ flex: 1, height: 4, borderRadius: 2, background: c.done ? v('ok') : v('surface-4') }} />)}</div>
        </div>
        {firstOpen && <Btn h={48} onClick={() => setSheet(sheetFor(firstOpen.k))}>Next: {firstOpen.k} ›</Btn>}
      </div>

      {sheet === 'pax' && (
        <Sheet title="Passengers" sub="From Leon · names first, documents one at a time" onClose={() => setSheet(null)} height="88%">
          <Scroll innerStyle={{ padding: '4px 16px 20px', borderTop: `1px solid ${v('line-1')}` }}>
            <div style={{ paddingTop: 12 }}>
              <PassengerViewer phone palette={VIEWER_PALETTE} viewer={{ name: user?.name || user?.email || 'Viewer' }}
                api={{ list: () => agentJson(`/flights/${encodeURIComponent(`${f.oprId}:${f.flightNid}`)}/passengers`), reveal: (pid) => agentJson(`/flights/${encodeURIComponent(`${f.oprId}:${f.flightNid}`)}/passengers/${encodeURIComponent(pid)}/reveal`, { method: 'POST' }) }}
                icon={(name, size, color) => <Icon name={name} size={size} style={{ color: color || 'currentColor' }} />} />
            </div>
          </Scroll>
        </Sheet>
      )}

      {sheet === 'lim' && (
        <Sheet title="Limitations" sub={`${limList.length} on ${p.cs}`} onClose={() => setSheet(null)} height="62%"
          foot={<SheetFoot note={markError || (cell('LIM').done ? (cell('LIM').none ? 'No limitations on this flight.' : `Limitations ✓ ${cell('LIM').l1.slice(2)} ${cell('LIM').l2}`) : 'Read them, then mark them checked.')}>
            {!cell('LIM').done && <Btn kind="primary" h={48} disabled={busy || stale || !canMark('LIM')} onClick={() => mark(['LIM'])}>{busy ? 'Saving…' : 'Mark checked'}</Btn>}
          </SheetFoot>}>
          <Scroll innerStyle={{ padding: '12px 16px 20px', borderTop: `1px solid ${v('line-1')}`, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {limList.map((l) => (
              <div key={l.id ?? l.title} style={{ borderRadius: 12, background: v('surface-2'), border: `1px solid ${v('line-2')}`, padding: '12px 13px', display: 'flex', flexDirection: 'column', gap: 7 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{(l.icao || l.airport) && <span style={{ height: 20, padding: '0 6px', borderRadius: 5, background: v('surface-4'), fontSize: 11, fontWeight: 900, color: v('text-1'), display: 'flex', alignItems: 'center' }}>{l.icao || l.airport}</span>}<span style={{ fontSize: 14.5, fontWeight: 800, color: v('text-1') }}>{l.title || l.name || 'Limitation'}</span></div>
                {(l.description || l.body || l.text) && <div style={{ fontSize: 13.5, lineHeight: 1.5, color: v('text-2'), textWrap: 'pretty' }}>{l.description || l.body || l.text}</div>}
                {(l.validFrom || l.validTo) && <div style={{ fontSize: 12, fontWeight: 700, color: v('text-4') }}>{l.validFrom ? `From ${String(l.validFrom).slice(0, 16).replace('T', ' ')}Z` : ''}{l.validTo ? ` to ${String(l.validTo).slice(0, 16).replace('T', ' ')}Z` : ''}</div>}
              </div>
            ))}
            {!canMark('LIM') && <div style={{ fontSize: 12.5, color: v('text-3') }}>Your role can read these but not mark them checked.</div>}
          </Scroll>
        </Sheet>
      )}

      {sheet === 'checks' && (() => {
        const here = ['IMP', 'NTM', 'WX', 'CAA'].map(cell);
        const open = here.filter((c) => !c.done && canMark(c.k));
        const body = (k) => {
          if (k === 'IMP') return lims.filter((l) => l.type === 'IMP').map((l) => l.title || l.text || l.description).filter(Boolean).join(' · ') || 'Nothing important on this flight.';
          if (k === 'NTM') return ntmAirports.length ? `NOTAMs to check today at ${ntmAirports.map((a) => `${a.icao} (${a.filtered.length})`).join(' and ')}. Marking acknowledges them for every flight at that airport today, as on the NOTAM Check page.` : present.NTM ? 'The NOTAM alert on this flight is open.' : 'No NOTAM alert on this flight.';
          if (k === 'WX') return [f.wxDep && `${p.adep} ${f.wxDep}`, f.wxArr && `${p.ades} ${f.wxArr}`].filter(Boolean).join(' · ') || 'No weather category on this flight.';
          return lims.filter((l) => l.type === 'CAA').map((l) => l.title || l.text || l.description).filter(Boolean).join(' · ') || 'No CAA entry on this flight.';
        };
        return (
          <Sheet title="Limitations and CAA" sub="Important · NOTAMs · Weather · CAA" onClose={() => setSheet(null)} height="88%"
            foot={<SheetFoot note={markError || (open.length ? `${open.length} of 4 here still to check` : here.every((c) => c.done) ? 'All four here are checked.' : 'Your role can read these but not mark them.')}>
              {open.length > 0 && <Btn kind="primary" h={48} disabled={busy || stale} onClick={() => mark(open.map((c) => c.k))}>{busy ? 'Saving…' : `Mark ${open.length} checked`}</Btn>}
            </SheetFoot>}>
            <Scroll innerStyle={{ padding: '12px 16px 20px', borderTop: `1px solid ${v('line-1')}`, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {here.map((c) => (
                <div key={c.k} data-check-card={c.k} style={{ borderRadius: 12, background: v('surface-2'), border: `1px solid ${v('line-2')}`, padding: '11px 13px', display: 'flex', flexDirection: 'column', gap: 7 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <CheckChip k={c.k} muted={c.none} />
                    <span style={{ flex: 1, fontSize: 14.5, fontWeight: 800, color: v('text-1') }}>{NAME[c.k]}</span>
                    <span style={{ fontSize: 12.5, fontWeight: 900, color: c.none ? v('text-3') : c.done ? v('ok') : v('warn'), whiteSpace: 'nowrap' }}>{c.none ? 'None on flight' : c.done ? `${c.l1} ${c.l2}` : 'To check'}</span>
                  </div>
                  <div style={{ fontSize: 13, lineHeight: 1.5, color: v('text-2'), textWrap: 'pretty' }}>{body(c.k)}</div>
                </div>
              ))}
            </Scroll>
          </Sheet>
        );
      })()}

      {sheet?.startsWith('ap:') && <AirportSheet side={sheet.slice(3)} p={p} info={info} notam={notam} onRetry={loadInfo} onClose={() => setSheet(null)} />}

      {sheet === 'services' && <ServicesSheet p={p} svc={svc} rows={svcRows} awaiting={awaiting} answered={answered} onRetry={loadServices} onClose={() => setSheet(null)} />}
    </Frame>
  );
}

/** The open flight's frame: 56 px of the list showing above, the sheet below (§3.0). */
function Frame({ children, onClose }) {
  return (
    <div role="dialog" aria-modal="true" aria-label="Flight" style={{ position: 'absolute', inset: 0, zIndex: 20, background: v('scrim'), display: 'flex', flexDirection: 'column' }}>
      <div onClick={onClose} style={{ height: 56, flex: 'none' }} />
      <div className="mw-sheet" style={{ flex: 1, minHeight: 0, position: 'relative', background: v('bg-1'), borderTop: `1px solid ${v('line-3')}`, borderRadius: '24px 24px 0 0', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ flex: 'none', padding: '8px 0 0', display: 'flex', justifyContent: 'center' }}><span style={{ width: 40, height: 4, borderRadius: 3, background: v('line-3') }} /></div>
        {children}
      </div>
    </div>
  );
}

function AirportSheet({ side, p, info, notam, onRetry, onClose }) {
  const code = side === 'dep' ? p.adep : p.ades;
  const w = info.state === 'ok' ? info.data?.weather?.[side] : null;
  const n = info.state === 'ok' ? info.data?.notams?.[side] : null;
  const notams = n?.ok ? n.notams || [] : [];
  const review = (notam?.airports || []).find((a) => a.icao === code);
  const unreviewed = new Set(review && !review.checked ? (review.filtered || []).map((x) => x.number || x.id).filter(Boolean) : []);
  const [tab, setTab] = useState(unreviewed.size ? 'notams' : 'wx');
  const fmt = (x) => (x ? `${String(x).slice(8, 10)} ${['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'][Number(String(x).slice(5, 7)) - 1] || ''} ${String(x).slice(11, 16)}` : '—');
  const grid = w && !w.error ? [
    ['WIND', w.windDegrees != null ? `${String(w.windDegrees).padStart(3, '0')}° ${w.windSpeedKts ?? '—'} kt${w.windGustKts ? ` G${w.windGustKts}` : ''}` : '—'],
    ['VISIBILITY', w.visibilityMeters != null ? (w.visibilityMeters >= 9999 ? '10 km+' : `${Math.round(w.visibilityMeters)} m`) : '—'],
    ['CEILING', w.ceilingFeet != null ? `${w.ceilingFeet} ft` : 'None'],
    ['TEMP / DEW', w.temperatureC != null ? `${w.temperatureC}° / ${w.dewpointC ?? '—'}°` : '—'],
    ['QNH', w.qnhHpa != null ? `${w.qnhHpa} hPa` : '—'],
    ['CATEGORY', w.category || '—'],
  ] : null;
  return (
    <Sheet title={code} sub={`${side === 'dep' ? 'Departure' : 'Arrival'}${w?.station ? ` · ${w.station}` : ''}`} onClose={onClose} height="88%">
      <div style={{ flex: 'none', padding: '0 16px 10px' }}>
        <Segmented label="Airport" height={44} options={[{ value: 'wx', label: 'Weather' }, { value: 'notams', label: 'NOTAMs', count: n?.ok ? notams.length : null }]} value={tab} onChange={setTab} />
      </div>
      <Scroll innerStyle={{ padding: '12px 16px 20px', borderTop: `1px solid ${v('line-1')}`, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {info.state === 'loading' && [0, 1, 2].map((i) => <div key={i} className="mw-skel" style={{ height: 120, borderRadius: 12, background: v('surface-2'), opacity: 1 - i * 0.3 }} />)}
        {info.state === 'failed' && <Msg top={0} tone="bad" title={`Couldn’t load ${code}`} body="The wall service didn’t answer for this airport." action="Retry" onAction={onRetry} />}
        {info.state === 'ok' && tab === 'wx' && (w && !w.error ? (
          <div style={{ borderRadius: 12, background: v('surface-2'), border: `1px solid ${v('line-2')}`, padding: '12px 13px', display: 'flex', flexDirection: 'column', gap: 9 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><span style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.1em', color: v('text-3') }}>METAR</span><span style={{ fontSize: 12, fontWeight: 700, color: v('text-4') }}>{w.observed ? `${fmt(w.observed)} UTC` : ''}</span></div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
              {grid.map(([l, val]) => <div key={l} style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}><span style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.08em', color: v('text-4') }}>{l}</span><span style={{ fontSize: 14, fontWeight: 800, color: l === 'CATEGORY' && FC[w.category] ? v(`fc-${FC[w.category]}`) : v('text-1') }}>{val}</span></div>)}
            </div>
            {w.rawText && <div style={{ fontFamily: v('font-raw'), fontSize: 12, lineHeight: 1.55, color: v('text-2'), whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', padding: '8px 10px', borderRadius: 8, background: v('bg-1') }}>{w.rawText}</div>}
            <div style={{ fontSize: 12, color: v('text-4') }}>TAF is not carried by the wall yet; the airport page in the portal has it.</div>
          </div>
        ) : <Msg top={8} title="No weather published" body={w?.error || `The wall has no METAR for ${code} for today's flights.`} />)}
        {info.state === 'ok' && tab === 'notams' && (!n?.ok
          ? <Msg top={0} tone="bad" title={`Couldn’t load NOTAMs for ${code}`} body={n?.error || 'The NOTAM service didn’t answer.'} action="Retry" onAction={onRetry} />
          : notams.length === 0 ? <Msg top={8} title={`No NOTAMs in force for ${code}`} body={`Checked ${hmZ(Date.now())} UTC.`} />
            : notams.map((x, i) => {
              const id = x.number || x.id || `#${i + 1}`;
              const isNew = unreviewed.has(id);
              return (
                <div key={`${id}-${i}`} data-notam={id} style={{ borderRadius: 12, background: v('surface-2'), border: `1px solid ${isNew ? v('chk-ntm-line') : v('line-2')}`, padding: '12px 13px', display: 'flex', flexDirection: 'column', gap: 7 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}><span style={{ fontSize: 12.5, fontWeight: 900, color: v('text-2') }}>{id}{x.class ? ` · ${x.class}` : ''}</span>{isNew && <span style={{ height: 20, padding: '0 6px', borderRadius: 5, background: v('chk-ntm-bg'), color: v('chk-ntm-fg'), border: `1px solid ${v('chk-ntm-line')}`, fontSize: 10, fontWeight: 900, display: 'flex', alignItems: 'center' }}>TO CHECK</span>}</div>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: v('text-3') }}>{fmt(x.startDateUtc)} – {x.endDateUtc ? fmt(x.endDateUtc) : 'PERM'} UTC</div>
                  <div style={{ fontFamily: v('font-raw'), fontSize: 11.5, lineHeight: 1.55, color: v('text-2'), whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', padding: '8px 10px', borderRadius: 8, background: v('bg-1') }}>{x.condition || x.text || x.raw || ''}</div>
                </div>
              );
            }))}
      </Scroll>
    </Sheet>
  );
}

function ServicesSheet({ p, svc, rows, awaiting, answered, onRetry, onClose }) {
  const [showNa, setShowNa] = useState(false);
  const na = rows.filter((r) => r.kind === 'na');
  const shown = rows.filter((r) => r.kind !== 'na' || showNa);
  return (
    <Sheet title="Service status" sub={`${p.cs} · from Leon${svc.at ? ` · read ${hmZ(Date.parse(svc.at))} UTC` : ''}`} onClose={onClose} height="88%">
      <Scroll innerStyle={{ padding: '12px 16px 20px', borderTop: `1px solid ${v('line-1')}`, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {svc.state === 'loading' && [0, 1, 2].map((i) => <div key={i} className="mw-skel" style={{ height: 70, borderRadius: 12, background: v('surface-2'), opacity: 1 - i * 0.3 }} />)}
        {svc.state === 'failed' && <Msg top={0} tone="bad" title="Couldn’t read the services from Leon" body={svc.at ? `Last read ${hmZ(Date.parse(svc.at))} UTC.` : 'Leon didn’t answer.'} action="Retry" onAction={onRetry} />}
        {svc.state === 'ok' && rows.length === 0 && <Msg top={8} title="No services requested yet" body="Leon has no service items on this flight's checklist." />}
        {svc.state === 'ok' && rows.length > 0 && <>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {awaiting > 0 && <span style={{ height: 26, padding: '0 9px', borderRadius: 7, background: v('warn'), color: v('on-solid'), fontSize: 12, fontWeight: 900, display: 'flex', alignItems: 'center', gap: 6 }}><i style={{ width: 7, height: 7, borderRadius: '50%', background: v('on-solid'), display: 'block' }} />{awaiting} awaiting reply</span>}
            <span style={{ fontSize: 13, fontWeight: 700, color: v('text-3') }}>{answered} answered</span>
          </div>
          <div style={{ borderRadius: 12, border: `1px solid ${v('line-2')}`, overflow: 'hidden' }}>
            {shown.map((r, i) => {
              const b = BADGE[r.kind] || { label: r.caption || '—', bg: 'transparent', fg: v('text-2'), line: v('line-3') };
              return (
                <div key={`${r.nid}-${i}`} data-service={r.kind} style={{ padding: '11px 13px', background: r.kind === 'await' ? v('warn-soft') : 'transparent', borderTop: i ? `1px solid ${v('line-1')}` : 'none', display: 'flex', flexDirection: 'column', gap: 6, opacity: r.kind === 'na' ? 0.6 : 1 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                    <span style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}><span style={{ fontSize: 12.5, fontWeight: 900, letterSpacing: '0.04em', color: v('text-1'), lineHeight: 1.35 }}>{String(r.label).toUpperCase()}</span>{r.section && <span style={{ fontSize: 12, fontWeight: 700, color: v('text-3') }}>{r.section}</span>}</span>
                    <span style={{ flex: 'none', height: 24, padding: '0 8px', borderRadius: 6, background: b.bg, color: b.fg, border: `1px solid ${b.line}`, fontSize: 11.5, fontWeight: 900, display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>{b.label === '—' ? r.caption : b.label}</span>
                  </div>
                  {r.lines.map((ln, j) => <span key={j} style={{ fontSize: 13, lineHeight: 1.4, color: v('text-2'), overflowWrap: 'anywhere' }}><Linked text={ln} /></span>)}
                </div>
              );
            })}
          </div>
          {na.length > 0 && <button type="button" onClick={() => setShowNa((x) => !x)} style={{ minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: v('text-3') }}>{showNa ? `Hide ${na.length} not applicable` : `${na.length} not applicable · show`}</button>}
        </>}
      </Scroll>
    </Sheet>
  );
}
