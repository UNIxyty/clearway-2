// The phone's reading of the wall's flights: positions, the pill's look, the chips. Every value is the display's own
// (mapFlight in services/timelineApi.js, shared/wall-facts.mjs); nothing here recomputes a time or a status.
import { openChecksOf } from '../../../../../shared/wall-facts.mjs';
import { v } from './tokens';

// §0.2: the past is always one sixth of the window, so the now-line sits at 16.667% in every range.
export const RANGES = { '6H': { before: 1, after: 5, step: 1, rel: '−1h · +5h' }, '12H': { before: 2, after: 10, step: 2, rel: '−2h · +10h' }, DAY: { before: 4, after: 20, step: 4, rel: '−4h · +20h' } };
const ORDER = ['IMP', 'NTM', 'WX', 'CAA', 'LIM'];

/** The chips a card shows: the first three outstanding, then "+N" for the rest, in fixed order (§0.7). */
export function chipList(open) {
  const s = ORDER.filter((k) => open.includes(k));
  const out = s.slice(0, 3);
  if (s.length > 3) out.push(`+${s.length - 3}`);
  return out;
}

/** The phone's reading of one mapped flight — every value is the display's (mapFlight / wall-facts), never recomputed. */
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
    depLate, arrLate,
    nextDay: Number.isFinite(arrMs) && Number.isFinite(depMs) && day(arrMs) > day(depMs),
    arrChanged: arrLate > 0 && depLate === 0 && f.status !== 'cancelled' && f.status !== 'arrived',
    open: openChecksOf(f).map((k) => k.toUpperCase()),
    progress: f.status === 'airborne' && span > 0 ? Math.max(0, Math.min(1, (nowMs - depMs) / span)) : null,
  };
}

/** Pill / card look per state (§2.5), all through the phone's tokens. */
export function lookOf(p) {
  const st = p.status;
  const color = v(`st-${{ scheduled: 'scheduled', boarding: 'scheduled', delayed: 'delayed', ctot: 'ctot', slot: 'ctot', airborne: 'airborne', arrived: 'arrived', cancelled: 'cancelled' }[st] || 'scheduled'}`);
  const dim = st === 'cancelled' || st === 'arrived';
  let tag = null;
  if (st === 'delayed' && p.depLate) tag = { t: `+${p.depLate}`, bg: v('warn-soft'), fg: v('warn') };
  if (st === 'ctot') tag = { t: 'CTOT', bg: v('surface-3'), fg: v('text-2') };
  if (st === 'cancelled') tag = { t: 'CNX', bg: v('bad-soft'), fg: v('bad') };
  if (st === 'arrived') tag = { t: p.estimated ? 'LDG?' : 'LDG', bg: v('surface-3'), fg: v('text-3') };
  if (p.arrChanged && st !== 'delayed') tag = { t: `ETA +${p.arrLate}`, bg: v('warn-soft'), fg: v('warn') };
  return {
    color, tag, dim,
    bg: st === 'cancelled' ? 'transparent' : st === 'arrived' ? v('surface-1') : v('surface-2'),
    border: st === 'cancelled' ? v('bad-line') : st === 'airborne' ? v('accent-line') : v('line-2'),
    borderStyle: st === 'cancelled' || (st === 'airborne' && p.estimated) ? 'dashed' : 'solid',
    chipBg: dim ? v('surface-3') : v('surface-4'), chipFg: dim ? v('text-3') : v('text-1'),
    depColor: st === 'delayed' || st === 'ctot' ? v('warn') : dim ? v('text-4') : v('text-2'),
    arrColor: st === 'delayed' || p.arrChanged ? v('warn') : dim ? v('text-4') : v('text-2'),
    deco: st === 'cancelled' ? 'line-through' : 'none',
  };
}
