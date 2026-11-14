// Small time helpers of the phone app. Every time a person reads here is UTC, and says so (a "Z" or "UTC" beside it).
export const H = 3_600_000;
export const MIN = 60_000;
export const p2 = (n) => String(n).padStart(2, '0');

const valid = (ms) => Number.isFinite(new Date(ms).getTime());

/** "HH:MM" UTC of an instant ("--:--" when there is none). */
export function hm(ms) {
  if (ms == null || !valid(ms)) return '--:--';
  const d = new Date(ms);
  return `${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`;
}

/** "HH:MM:SS" UTC. */
export function hms(ms) {
  if (ms == null || !valid(ms)) return '--:--:--';
  const d = new Date(ms);
  return `${hm(ms)}:${p2(d.getUTCSeconds())}`;
}

/** "27 min" / "1h 32m" for a span. */
export function spanText(ms) {
  if (!Number.isFinite(ms)) return '';
  const min = Math.max(0, Math.round(ms / MIN));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/** "12 min ago" / "3 h ago" / "2 days ago". */
export function agoText(ms, nowMs = Date.now()) {
  if (!Number.isFinite(ms)) return '';
  const min = Math.max(0, Math.floor((nowMs - ms) / MIN));
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.floor(h / 24)} days ago`;
}

const DOW = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
export const utcDay = (ms) => Math.floor(ms / 86_400_000);

/** "TODAY · TUE 06 OCT" for the UTC day an instant falls on. */
export function dayHead(ms, nowMs = Date.now()) {
  const d = new Date(ms);
  if (!valid(ms)) return '';
  const diff = utcDay(ms) - utcDay(nowMs);
  const date = `${DOW[d.getUTCDay()]} ${p2(d.getUTCDate())} ${MON[d.getUTCMonth()]}`;
  const word = diff === 0 ? 'TODAY' : diff === 1 ? 'TOMORROW' : diff === -1 ? 'YESTERDAY' : '';
  return word ? `${word} · ${date}` : date;
}

/** Epoch ms of an ISO text or a number; NaN when it is neither. */
export function msOf(value) {
  if (value == null || value === '') return NaN;
  if (typeof value === 'number') return value;
  const t = Date.parse(String(value));
  return Number.isFinite(t) ? t : NaN;
}

/** One flat flight list from the aircraft groups, each flight carrying its registration and operator name. */
export function flatten(aircraft) {
  const out = [];
  for (const ac of aircraft || []) for (const f of ac.flights || []) out.push({ ...f, __reg: ac.reg, __operator: ac.type });
  return out;
}
