// The staff-only part of the open flight: service status, the limitations and CAA block with the five checks,
// the one "Mark checked" button, and the passenger list with documents. Carried over from the old phone wall's flight
// view (components/mobile/phone/OpenFlight.jsx). A client session never asks for this file: PhoneApp.jsx imports it
// lazily and only for staff, so nothing here reaches a client's browser.
//
// What changed against the old view, on purpose (design "Mobile Open Flight v3"): marking is ONE button at the foot of
// the flight that marks every open check; the sheets are read only. The button turns to "All 5 checked" only from what
// the wall's feed says after the save, never from the tap.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ackNotamCheck, buildApiUrl, postFlightCheck } from '../../services/timelineApi';
import { useCanAction } from '../../AuthGate';
import PassengerViewer from '../../../../shared/passenger-viewer.jsx';
import { Icon } from '../icons';
import { Btn, MONO, Msg, SAFE_BOTTOM, Sheet, c } from '../kit';
import { hm, msOf } from './util';

const KEYS = ['IMP', 'NTM', 'WX', 'CAA', 'LIM'];
const NAME = { IMP: 'Important', NTM: 'NOTAM', WX: 'Weather', CAA: 'CAA', LIM: 'Limitations' };
const LAB = { fontSize: 11, fontWeight: 600, letterSpacing: '.08em', color: c('t3'), whiteSpace: 'nowrap' };
const READ_ONLY = 'Read only. Mark checked is at the bottom of the flight.';
const bad = (text) => <span style={{ color: c('bad') }}>{text}</span>;
const listWords = (keys) => (keys.length > 1 ? `${keys.slice(0, -1).join(', ')} and ${keys[keys.length - 1]}` : keys[0] || '');
const sleep = (ms) => new Promise((done) => { setTimeout(done, ms); });

function initialsOf(by) {
  const s = String(by || '').split('@')[0].replace(/\(.*\)/, '').trim();
  const parts = s.split(/[\s._-]+/).filter(Boolean);
  return (parts.length > 1 ? parts.map((x) => x[0]).join('') : s.slice(0, 3)).toUpperCase().slice(0, 3) || '—';
}

async function agentJson(path, init) {
  const r = await fetch(`/agent/api${path}`, { credentials: 'same-origin', cache: 'no-store', ...init });
  const j = await r.json().catch(() => null);
  if (!r.ok || j?.ok === false) { const e = new Error(typeof j?.message === 'string' ? j.message : 'The passenger service didn’t answer.'); e.shown = true; e.status = r.status; throw e; }
  return j;
}
async function fetchServices(flightNid, oprId) {
  const q = new URLSearchParams({ flightNid: String(flightNid) }); if (oprId) q.set('oprId', oprId);
  const r = await fetch(buildApiUrl(`/api/flight-services?${q}`), { credentials: 'same-origin', cache: 'no-store' });
  const j = await r.json().catch(() => null);
  if (!r.ok || j?.ok === false) throw new Error('services not read');
  return j;
}

/** Service rows by the old view's rules: the kind from the caption, date/time pairs dropped from the comment. */
function serviceRows(items = []) {
  const kind = (cap) => {
    const t = String(cap || '').toLowerCase();
    if (/not\s*applicable|^n\/?a$/.test(t)) return 'na';
    if (/^\?$|request|sent|pending|await|wait|asked|in progress/.test(t)) return 'await';
    if (/confirm|approved|granted|received|done|ok\b|booked/.test(t)) return 'ok';
    if (/^yes$/.test(t)) return 'yes';
    if (/ack/.test(t)) return 'ack';
    return 'other';
  };
  return items.map((it) => ({
    ...it, kind: kind(it.caption),
    lines: String(it.comment || '').split(/\r?\n/).map((x) => x.trim()).filter((x) => x && !/^\s*\d{6}\s*\/\s*\d{6}\s*$/.test(x)),
  }));
}
const SVC = {
  await: { label: 'Awaiting reply', fg: 'warn' }, ok: { label: 'Confirmed', fg: 'ok' }, yes: { label: 'Yes', fg: 'ok' },
  ack: { label: 'Acknowledged', fg: 't2' }, na: { label: 'Not applicable', fg: 't4' },
};
const Linked = ({ text }) => String(text).split(/(https?:\/\/\S+)/).map((part, i) => (
  /^https?:\/\//.test(part) ? <a key={i} href={part} target="_blank" rel="noreferrer" style={{ display: 'inline-block', padding: '14px 0', margin: '-14px 0', minWidth: 44, textDecoration: 'underline', textUnderlineOffset: 3, overflowWrap: 'anywhere' }}>{part}</a> : <span key={i}>{part}</span>
));

// the shared passenger viewer in the phone's colours (it reads no token of its own when a palette is handed in)
const PAX_PALETTE = {
  'bg-raised': c('s2'), 'bg-scrim': c('scrim'), 'bg-sunken': c('s1'), 'bg-surface': c('bg2'), border: c('l2'), 'ca-countdown-track': c('s2'),
  'ca-sens-border': c('warn'), 'ca-sens-on-solid': c('bg'), 'ca-sens-solid': c('warn'), 'ca-sens-text': c('warn'), 'ca-sens-tint': c('s1'),
  'ca-watermark': 'rgba(128,128,128,.16)', 'danger-text': c('bad'), divider: c('l1'), primary: c('inv'), 'shadow-pop': `0 8px 24px ${c('scrim')}`,
  skeleton: c('skel'), text: c('t1'), 'text-body': c('t2'), 'text-muted': c('t3'), 'text-on-primary': c('on-inv'), 'warning-text': c('warn'), sheet: c('bg'),
};
const paxIcon = (name, size, color) => <Icon name={name} size={size} style={{ color: color || 'currentColor' }} />;

export default function StaffFlight({ p, user, stale, limList, notamState, setNotamState, reload, dataUpdatedAt, sheet, setSheet, footSlot, layer }) {
  const f = p.raw;
  const can = useCanAction();
  const [svc, setSvc] = useState({ state: 'loading', items: [], at: null });
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(null); // { keys, refused } once a round of marking is over and the feed was read again
  const [showNa, setShowNa] = useState(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const feedAt = useRef(dataUpdatedAt);
  feedAt.current = dataUpdatedAt;
  const close = useCallback(() => setSheet(null), [setSheet]);

  const loadServices = useCallback(() => {
    if (!f?.flightNid) return;
    setSvc((x) => ({ ...x, state: 'loading' }));
    fetchServices(f.flightNid, f.oprId)
      .then((d) => { if (alive.current) setSvc({ state: 'ok', items: Array.isArray(d.items) ? d.items : [], at: d.readAt || null }); })
      .catch(() => { if (alive.current) setSvc((x) => ({ ...x, state: 'failed' })); });
  }, [f?.flightNid, f?.oprId]);
  useEffect(() => { loadServices(); }, [loadServices]);

  // ── the five checks, exactly as the old view worked them out
  const lims = Array.isArray(f.limitations) ? f.limitations : [];
  const checks = f.checks || {};
  const present = {
    IMP: lims.some((l) => l.type === 'IMP'), NTM: lims.some((l) => l.source === 'alert' && l.type === 'NTM'),
    WX: Boolean(f.wxDep || f.wxArr), CAA: lims.some((l) => l.type === 'CAA'), LIM: limList.length > 0,
  };
  const cell = (k) => {
    const ch = checks[k.toLowerCase()];
    if (!present[k]) return { k, done: true, none: true, l1: 'None', l2: 'on flight' };
    if (ch) return { k, done: true, l1: `✓ ${initialsOf(ch.by)}`, l2: ch.at ? String(ch.at).slice(11, 16) : '—', by: ch.by, at: ch.at };
    return { k, done: false, l1: 'To check', l2: '—' };
  };
  const cells = KEYS.map(cell);
  const open = cells.filter((x) => !x.done).map((x) => x.k);
  const openRef = useRef(open);
  openRef.current = open;
  const allDone = open.length === 0;
  // how many of the five apply to this flight: "All 5 checked" is said only when five were there to check
  const applies = cells.filter((x) => !x.none).length;
  const canMark = (k) => can(k === 'NTM' ? 'wall.notam.ack' : 'wall.flights.check');
  const mine = open.filter(canMark);
  const ntmAirports = (notamState?.airports || []).filter((a) => (a.icao === p.adep || a.icao === p.ades) && !a.checked && (a.filtered?.length ?? 0) > 0);

  const markAll = async () => {
    if (stale || busy || !mine.length) return;
    const keys = mine;
    setBusy(true); setTried(null);
    let refused = false;
    try {
      const own = keys.filter((k) => k !== 'NTM').map((k) => k.toLowerCase());
      if (own.length) await postFlightCheck({ flightNid: f.flightNid, oprId: f.oprId, types: own });
      if (keys.includes('NTM')) for (const a of ntmAirports) { const s = await ackNotamCheck(a.icao); if (s?.airports) setNotamState?.(s); }
      if (keys.includes('NTM') && !ntmAirports.length) await postFlightCheck({ flightNid: f.flightNid, oprId: f.oprId, types: ['ntm'] });
    } catch { refused = true; }
    // The result is read from the wall, not from the tap. A read that was already under way may be from before the
    // save, so wait for it and then read once more.
    try {
      const before = feedAt.current;
      await reload?.();
      for (let i = 0; i < 20 && alive.current && feedAt.current === before; i++) await sleep(150);
      await reload?.();
      await sleep(60);
    } catch { /* the stale banner says the wall is not answering */ }
    if (!alive.current) return;
    // what the wall still shows open right after the save is what was not saved; a check another person takes off
    // later is not a failed save of this one
    setTried({ keys, refused, failed: keys.filter((k) => openRef.current.includes(k)) });
    setBusy(false);
  };

  const stillMine = tried ? tried.failed.filter((k) => open.includes(k)) : [];
  let note = null; let noteTone = 't3';
  if (stale) { note = 'Not live. Marking waits until the wall is live again.'; noteTone = 'warn'; }
  else if (busy) note = null;
  else if (stillMine.length) { note = `The wall did not save ${listWords(stillMine)}. ${stillMine.length > 1 ? 'They are' : 'It is'} still open. Try again.`; noteTone = 'bad'; }
  else if (!allDone && !mine.length) note = `${listWords(open)} ${open.length > 1 ? 'are' : 'is'} still open. Your role can read ${open.length > 1 ? 'them' : 'it'} but not mark ${open.length > 1 ? 'them' : 'it'} checked.`;
  else if (!allDone && mine.length < open.length) note = `Your role can’t mark ${listWords(open.filter((k) => !mine.includes(k)))}. Mark checked marks the rest.`;

  const svcRows = useMemo(() => serviceRows(svc.items), [svc.items]);
  const awaiting = svcRows.filter((r) => r.kind === 'await').length;
  const answered = svcRows.filter((r) => r.kind !== 'await' && r.kind !== 'na').length;
  const naRows = svcRows.filter((r) => r.kind === 'na');
  const svcLoaded = svc.state === 'ok' || svc.items.length > 0 || svc.at;

  // ── what each check is about, for the read-only sheet
  const titles = (type) => lims.filter((l) => l.type === type).map((l) => l.title || l.text || l.description).filter(Boolean);
  const about = {
    IMP: titles('IMP').join(' · ') || 'Nothing important on this flight.',
    NTM: ntmAirports.length ? `NOTAMs to check today at ${ntmAirports.map((a) => `${a.icao} (${a.filtered.length})`).join(' and ')}. Marking checks them for every flight at that airport today.`
      : present.NTM ? 'The NOTAM alert on this flight is open.' : 'No NOTAM alert on this flight.',
    WX: f.wxDep || f.wxArr ? [f.wxDep ? `${p.adep} ${f.wxDep}` : '', f.wxArr ? `${p.ades} ${f.wxArr}` : ''].filter(Boolean).join(' · ') : 'No weather category on this flight.',
    CAA: titles('CAA').join(' · ') || 'No CAA entry on this flight.',
    LIM: limList.length ? limList.map((l) => l.title || l.name || 'Limitation').join(' · ') : 'No limitations on this flight.',
  };
  const stateOf = (x) => (x.none ? { t: 'None on flight', fg: c('t3') } : x.done ? { t: `${x.l1}${x.l2 && x.l2 !== '—' ? ` ${x.l2}` : ''}`, fg: c('ok') } : { t: 'Not checked', fg: c('warn') });
  const zTime = (v) => { const ms = msOf(v); return Number.isFinite(ms) ? `${new Date(ms).toISOString().slice(0, 16).replace('T', ' ')}Z` : ''; };

  const foot = (
    <div style={{ borderTop: `1px solid ${c('l1')}`, padding: `12px 16px calc(24px + ${SAFE_BOTTOM})`, background: c('bg2'), display: 'flex', flexDirection: 'column', gap: 8 }}>
      {note ? <div role={noteTone === 'bad' ? 'alert' : 'status'} data-mark-note="" style={{ fontSize: 13, lineHeight: 1.45, color: c(noteTone) }}>{note}</div> : null}
      {allDone
        ? <div role="status" data-mark-checked="" data-all-checked="" style={{ height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, border: `1px solid ${c('l2')}`, fontSize: 16, fontWeight: 600, color: c(applies ? 'ok' : 't2') }} data-checks-apply={applies}>{applies === 0 ? 'Nothing to check on this flight' : applies === 5 ? '✓ All 5 checked' : `✓ All ${applies} checked`}</div>
        : <Btn data-mark-checked="" data-open-checks={open.join(' ')} disabled={stale || busy || !mine.length} onClick={markAll}>{busy ? 'Saving…' : 'Mark checked'}</Btn>}
    </div>
  );

  const sheets = (
    <>
      {sheet === 'services' ? (
        <Sheet name="services" title="Service status" sub={p.cs} height="88%" onClose={close}>
          {svc.state === 'loading' && !svcLoaded ? <div aria-busy="true" aria-label="Loading" data-skeleton="" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>{[0, 1, 2, 3].map((i) => <div key={i} style={{ height: 48, background: c('skel'), borderRadius: 4, animation: 'cw3-pulse 1.4s ease-in-out infinite' }} />)}</div>
            : svc.state === 'failed' && !svcLoaded ? <Msg data-services-failed="" title={bad('Couldn’t read the service status')} body="The flight system didn’t answer. Nothing is shown rather than old answers." action="Try again" onAction={loadServices} primary />
              : svcRows.length === 0 ? <Msg data-services-none="" title="No services requested" body={`Nothing has been asked for on ${p.cs} yet.`} />
                : (
                  <>
                    <div style={{ padding: '12px 16px', display: 'flex', gap: 12, alignItems: 'baseline', flexWrap: 'wrap', borderBottom: `1px solid ${c('l1')}` }}>
                      {awaiting ? <span style={{ fontSize: 13, fontWeight: 600, color: c('warn') }}>{awaiting} awaiting reply</span> : null}
                      <span style={{ fontSize: 13, color: c('t3') }}>{answered} answered</span>
                      {svc.state === 'failed' ? <span role="alert" style={{ fontSize: 13, color: c('bad') }}>Couldn’t read it again. This is the last answer.</span> : null}
                      {msOf(svc.at) ? <span style={{ ...MONO, fontSize: 11, color: c('t4'), marginLeft: 'auto' }}>Read {hm(msOf(svc.at))}Z</span> : null}
                    </div>
                    {svcRows.filter((r) => r.kind !== 'na' || showNa).map((r, i) => {
                      const b = SVC[r.kind] || { label: r.caption || '—', fg: 't2' };
                      return (
                        <div key={r.nid ?? `${r.label}-${i}`} data-service={r.kind} style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 4, borderBottom: `1px solid ${c('l1')}`, opacity: r.kind === 'na' ? 0.6 : 1 }}>
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
                            <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: c('t1'), overflowWrap: 'anywhere' }}>{r.label || 'Service'}</span>
                            <span style={{ flex: 'none', fontSize: 13, fontWeight: 600, color: c(b.fg) }}>{b.label}</span>
                          </div>
                          {r.section ? <span style={{ ...MONO, fontSize: 11, color: c('t3') }}>{r.section}</span> : null}
                          {r.lines.map((t, k) => <span key={k} style={{ ...MONO, fontSize: 13, lineHeight: 1.5, color: c('t3'), overflowWrap: 'anywhere' }}><Linked text={t} /></span>)}
                        </div>
                      );
                    })}
                    {naRows.length ? (
                      <button type="button" data-services-na="" onClick={() => setShowNa((x) => !x)} style={{ width: '100%', minHeight: 44, padding: '0 16px', fontSize: 13, color: c('t2'), textDecoration: 'underline', textUnderlineOffset: 3, textAlign: 'left' }}>
                        {showNa ? `Hide ${naRows.length} not applicable` : `${naRows.length} not applicable. Show`}
                      </button>
                    ) : null}
                  </>
                )}
        </Sheet>
      ) : null}

      {sheet === 'checks' ? (
        <Sheet name="checks" title="Limitations and CAA" sub="Read only" height="88%" onClose={close}
          foot={<div style={{ fontSize: 13, lineHeight: 1.45, color: c('t3') }}>{READ_ONLY}</div>}>
          {cells.map((x) => {
            const s = stateOf(x);
            return (
              <div key={x.k} data-check-row={x.k} style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 4, borderBottom: `1px solid ${c('l1')}` }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ ...MONO, width: 32, flex: 'none', fontSize: 13, fontWeight: 700, color: c('t2') }}>{x.k}</span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 16, fontWeight: 600, color: c('t1') }}>{NAME[x.k]}</span>
                  <span style={{ flex: 'none', fontSize: 13, fontWeight: 600, color: s.fg }}>{s.t}</span>
                </div>
                <div style={{ fontSize: 16, lineHeight: 1.5, color: c('t2'), overflowWrap: 'anywhere', paddingLeft: 40 }}>{about[x.k]}</div>
              </div>
            );
          })}
        </Sheet>
      ) : null}

      {sheet === 'lim' ? (
        <Sheet name="limitations" title="Limitations" sub={`${limList.length} on this flight`} height="62%" onClose={close}
          foot={<div style={{ fontSize: 13, lineHeight: 1.45, color: c('t3') }}>{READ_ONLY}</div>}>
          {limList.length === 0 ? <Msg title="No limitations on this flight" /> : limList.map((l, i) => {
            const from = zTime(l.validFrom); const to = zTime(l.validTo);
            return (
              <div key={l.id ?? i} data-limitation="" style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 4, borderBottom: `1px solid ${c('l1')}` }}>
                {l.icao || l.airport ? <span style={{ ...MONO, fontSize: 13, fontWeight: 700, color: c('t2') }}>{l.icao || l.airport}</span> : null}
                <span style={{ fontSize: 16, fontWeight: 600, color: c('t1'), overflowWrap: 'anywhere' }}>{l.title || l.name || 'Limitation'}</span>
                {from || to ? <span style={{ ...MONO, fontSize: 11, color: c('t4') }}>{from ? `From ${from}` : ''}{from && to ? ' ' : ''}{to ? `to ${to}` : ''}</span> : null}
                {l.description || l.body || l.text ? <span style={{ fontSize: 16, lineHeight: 1.5, color: c('t2'), overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>{l.description || l.body || l.text}</span> : null}
              </div>
            );
          })}
        </Sheet>
      ) : null}

      {sheet === 'pax' ? <StaffPax f={f} cs={p.cs} user={user} onClose={close} /> : null}
    </>
  );

  return (
    <>
      <button type="button" className="cw3-press" data-open-services="" onClick={() => setSheet('services')}
        style={{ width: '100%', minHeight: 56, marginTop: 8, display: 'flex', alignItems: 'center', gap: 12, borderBottom: `1px solid ${c('l1')}`, textAlign: 'left' }}>
        <span style={{ flex: 1, minWidth: 0, fontSize: 16, color: c('t1') }}>Service status</span>
        {svc.state === 'loading' && !svcLoaded ? <span style={{ fontSize: 13, color: c('t3') }}>Reading…</span>
          : svc.state === 'failed' && !svcLoaded ? <span style={{ fontSize: 13, fontWeight: 600, color: c('bad') }}>Couldn’t read</span>
            : svcRows.length === 0 ? <span style={{ fontSize: 13, color: c('t3') }}>None requested</span>
              : <>{awaiting ? <span data-services-awaiting={awaiting} style={{ fontSize: 13, fontWeight: 600, color: c('warn'), whiteSpace: 'nowrap' }}>{awaiting} awaiting</span> : null}<span style={{ fontSize: 13, color: c('t3'), whiteSpace: 'nowrap' }}>{answered} answered</span></>}
        <Icon name="chevron-right" size={16} color={c('t4')} />
      </button>

      <div style={{ minHeight: 44, marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <span style={LAB}>LIMITATIONS AND CAA</span>
        <button type="button" data-open-checks-sheet="" onClick={() => setSheet('checks')} style={{ minHeight: 44, minWidth: 44, padding: '0 0 0 12px', fontSize: 13, fontWeight: 600, color: c('t1') }}>View ›</button>
      </div>
      <div data-checks-grid="" data-done={5 - open.length} style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0,1fr))', borderTop: `1px solid ${c('l1')}`, borderBottom: `1px solid ${c('l1')}` }}>
        {cells.map((x, i) => (
          <button key={x.k} type="button" className="cw3-press" data-check={x.k} data-done={x.done ? '1' : '0'} data-none={x.none ? '' : undefined} onClick={() => setSheet('checks')}
            aria-label={`${NAME[x.k]}: ${x.none ? 'none on this flight' : x.done ? `checked by ${initialsOf(x.by)}` : 'to check'}`}
            style={{ minHeight: 64, padding: '12px 0', borderLeft: i ? `1px solid ${c('l1')}` : 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 0, textAlign: 'center' }}>
            <span style={{ ...MONO, fontSize: 11, fontWeight: 700, color: c('t2') }}>{x.k}</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: x.none ? c('t3') : x.done ? c('ok') : c('warn'), whiteSpace: 'nowrap' }}>{x.l1}</span>
            <span style={{ ...MONO, fontSize: 11, color: c('t4'), whiteSpace: 'nowrap' }}>{x.l2}</span>
          </button>
        ))}
      </div>

      {footSlot ? createPortal(foot, footSlot) : null}
      {layer ? createPortal(sheets, layer) : null}
    </>
  );
}

/** Passengers for staff: the shared viewer, as the old phone wall used it. Names first; one tap shows one document. */
function StaffPax({ f, cs, user, onClose }) {
  const key = encodeURIComponent(`${f.oprId}:${f.flightNid}`);
  const api = useMemo(() => ({
    list: () => agentJson(`/flights/${key}/passengers`),
    reveal: (pid) => agentJson(`/flights/${key}/passengers/${encodeURIComponent(pid)}/reveal`, { method: 'POST' }),
  }), [key]);
  const viewer = useMemo(() => ({ name: user?.name || user?.email || 'Viewer' }), [user?.name, user?.email]);
  return (
    <Sheet name="passengers" title="Passengers" sub={cs} height="88%" onClose={onClose}>
      <div style={{ padding: '12px 16px 20px' }}>
        <PassengerViewer phone palette={PAX_PALETTE} viewer={viewer} api={api} icon={paxIcon} />
      </div>
    </Sheet>
  );
}
