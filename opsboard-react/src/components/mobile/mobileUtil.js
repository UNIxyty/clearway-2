import { p2 } from '../../data';

/** "HH:MM" UTC of an epoch-ms instant ("--:--" when invalid). */
export function hmZ(ms) {
  const d = new Date(ms);
  if (!Number.isFinite(d.getTime())) return '--:--';
  return `${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`;
}

/** "HH:MM:SS" UTC of an epoch-ms instant. */
export function hmsZ(ms) {
  const d = new Date(ms);
  if (!Number.isFinite(d.getTime())) return '--:--:--';
  return `${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}:${p2(d.getUTCSeconds())}`;
}

/** "27 min" / "1h 32m" for a positive millisecond span. */
export function spanText(ms) {
  const min = Math.max(0, Math.round(ms / 60_000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/**
 * One flat flight list from the aircraft groups — each flight annotated with
 * its aircraft's registration and operator (mapAircraft puts the operator
 * name in `type`). Everything else on the flight is the exact mapFlight
 * shape (depKind/depHm/deltas/status/checks/...): display those fields,
 * never recompute.
 */
export function flattenFlights(aircraft) {
  const out = [];
  for (const ac of aircraft || []) {
    for (const f of ac.flights || []) {
      out.push({ ...f, __reg: ac.reg, __operator: ac.type });
    }
  }
  return out;
}

/** Console deep link that survives the /digital-wall base prefix. */
export function consoleHref(page) {
  const prefix =
    typeof window !== 'undefined' && window.location.pathname.includes('/digital-wall')
      ? '/digital-wall'
      : '';
  return `${prefix}/console/${page}`;
}

/** Movement-state chip label — the wall's exact state vocabulary. */
export const STATE_LABEL = {
  scheduled: 'SCHEDULED',
  boarding: 'BOARDING',
  delayed: 'DELAYED',
  ctot: 'CTOT',
  slot: 'CTOT',
  airborne: 'AIRBORNE',
  arrived: 'ARRIVED',
  cancelled: 'CANCELLED',
};

/** Status → wall colour TOKEN key (always a hex — chips derive tints). */
export const STATE_TOKEN = {
  scheduled: 'stateScheduled',
  boarding: 'stateScheduled',
  delayed: 'stateDelayed',
  ctot: 'stateCtot',
  slot: 'stateCtot',
  airborne: 'stateAirborne',
  arrived: 'stateArrived',
  cancelled: 'stateCancelled',
};
