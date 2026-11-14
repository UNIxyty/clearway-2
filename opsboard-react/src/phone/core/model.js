// The phone's reading of the wall's flights (carried over from the old phone wall, components/mobile/phone/model.js):
// positions, the pill's look, the words of a status. Every value is the wall's own (mapFlight in
// services/timelineApi.js, shared/wall-facts.mjs); nothing here recomputes a time or a status.
import { openChecksOf } from '../../../../shared/wall-facts.mjs';

const c = (name) => `var(--c-${name})`;

// The past is always one sixth of the window, so the now line sits at 16.667 % in every range.
export const RANGES = {
  '6H': { before: 1, after: 5, step: 1, rel: '−1h · +5h', label: '6H' },
  '12H': { before: 2, after: 10, step: 2, rel: '−2h · +10h', label: '12H' },
  DAY: { before: 4, after: 20, step: 4, rel: '−4h · +20h', label: 'DAY' },
};
export const RANGE_KEYS = ['6H', '12H', 'DAY'];
export const NOW_AT = 1 / 6;

/** One mapped flight as the phone reads it. */
export function phoneFlight(f, nowMs) {
  const depMs = Number(f.delayedStartUtcMs);
  const arrMs = Number(f.endUtcMs);
  const day = (ms) => Math.floor(ms / 86_400_000);
  const depLate = Math.max(0, Number(f.depDeltaMin) || 0);
  const arrLate = Math.max(0, Number(f.arrDeltaMin) || 0);
  const span = arrMs - depMs;
  return {
    raw: f, id: f.id, cs: f.fn, reg: f.__reg, operator: f.__operator, acId: `${f.oprId || 'opr'}:${f.__reg}`,
    adep: f.dep, ades: f.arr, depMs, arrMs, depT: f.depHm, arrT: f.arrHm, depKind: f.depKind, arrKind: f.arrKind,
    status: f.status, estimated: f.estimated === true,
    unconfirmed: f.isConfirmed === false,
    depLate, arrLate,
    nextDay: Number.isFinite(arrMs) && Number.isFinite(depMs) && day(arrMs) > day(depMs),
    arrChanged: arrLate > 0 && depLate === 0 && f.status !== 'cancelled' && f.status !== 'arrived',
    open: openChecksOf(f).map((k) => k.toUpperCase()),
    progress: f.status === 'airborne' && span > 0 ? Math.max(0, Math.min(1, (nowMs - depMs) / span)) : null,
  };
}

const COLOR = { scheduled: 'ok', boarding: 'ok', delayed: 'warn', ctot: 'warn', slot: 'warn', airborne: 'air', arrived: 't3', cancelled: 'bad' };

/** The pill's look per state, in the phone tokens only. */
export function lookOf(p) {
  const st = p.status;
  const dim = st === 'cancelled' || st === 'arrived';
  let tag = null;
  if (st === 'delayed' && p.depLate) tag = { t: `+${p.depLate}`, fg: c('warn') };
  if (st === 'ctot' || st === 'slot') tag = { t: 'CTOT', fg: c('warn') };
  if (st === 'cancelled') tag = { t: 'CNX', fg: c('bad') };
  if (st === 'arrived') tag = { t: p.estimated ? 'LDG?' : 'LDG', fg: c('t3') };
  if (p.arrChanged && st !== 'delayed') tag = { t: `ETA +${p.arrLate}`, fg: c('warn') };
  return {
    color: c(COLOR[st] || 'ok'), tag, dim,
    bg: dim ? 'transparent' : c('s1'),
    border: st === 'cancelled' ? c('bad') : st === 'airborne' ? c('air') : c('l2'),
    borderStyle: st === 'cancelled' || (st === 'airborne' && p.estimated) ? 'dashed' : 'solid',
    codeColor: dim ? c('t3') : c('t1'),
    depColor: st === 'delayed' || st === 'ctot' || st === 'slot' ? c('warn') : dim ? c('t4') : c('t2'),
    arrColor: st === 'delayed' || p.arrChanged ? c('warn') : dim ? c('t4') : c('t2'),
    deco: st === 'cancelled' ? 'line-through' : 'none',
  };
}

/** The short status of a row in the Flights list: { t, fg }. */
export function listStatus(p) {
  const st = p.status;
  if (p.unconfirmed && st !== 'cancelled') return { t: 'UNCONFIRMED', fg: c('bad') };
  if (st === 'cancelled') return { t: 'CNX', fg: c('bad') };
  if (st === 'airborne') return { t: p.estimated ? 'AIRBORNE?' : 'AIRBORNE', fg: c('air') };
  if (st === 'arrived') return { t: p.estimated ? 'LDG?' : 'LDG', fg: c('t3') };
  if (st === 'ctot' || st === 'slot') return { t: 'CTOT', fg: c('warn') };
  if (st === 'delayed') return { t: p.depLate ? `+${p.depLate}` : 'DELAYED', fg: c('warn') };
  if (p.arrChanged) return { t: `ETA +${p.arrLate}`, fg: c('warn') };
  return { t: 'ON TIME', fg: c('ok') };
}

const WORD = { scheduled: 'SCHEDULED', boarding: 'SCHEDULED', delayed: 'DELAYED', ctot: 'CTOT', slot: 'CTOT', airborne: 'AIRBORNE', arrived: 'ARRIVED', cancelled: 'CANCELLED' };

/** The status line of an open flight: { t, fg }. A state worked out from the clock alone carries a "?". */
export function flightStatus(p) {
  const word = WORD[p.status] || 'SCHEDULED';
  return { t: p.estimated ? `${word}?` : word, fg: c(COLOR[p.status] || 'ok') };
}

/** The limitations that touch one flight: the ones the server matched by id plus the LIM notes on the flight itself. */
export function limListOf(f, limitations) {
  const byId = new Map((limitations || []).map((l) => [l.id, l]));
  const own = (f?.limitations || []).filter((l) => l.type === 'LIM');
  const matched = (f?.limitationIds || []).map((id) => byId.get(id)).filter(Boolean);
  return [...new Map([...matched, ...own].map((l) => [l.id ?? l.title, l])).values()];
}
