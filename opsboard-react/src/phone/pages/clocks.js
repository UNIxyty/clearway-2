// World clocks for the phone (carried over from the old phone settings, components/mobile/phone/prefs.js): the list a
// person keeps, at most five, UTC always in it. A clock is written with BOTH field sets — { tz, label, code } (the
// phone core's contract) and { timeZone, name, utc } (the old shape) — and read from either, so a list saved by the
// old editor, by this one, or handed over by the core draws the same.
export const MAX_CLOCKS = 5;

const UTC_RE = /^(UTC|Etc\/UTC|GMT|Etc\/GMT)$/i;
export const isUtcZone = (tz, label) => UTC_RE.test(String(tz || '')) || String(label || '').trim().toLowerCase() === 'utc';

/** Three letters for the strip: the name's first three, else the zone's last part, else LOC. */
export function codeFor(label, tz) {
  const fromName = String(label || '').replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase();
  if (fromName.length === 3) return fromName;
  const last = String(tz || '').split('/').pop().replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase();
  return last || fromName || 'LOC';
}

/** One clock in the shape every reader understands. Null when it names no zone. */
export function clock(k) {
  if (!k) return null;
  const tz = String(k.tz || k.timeZone || '').trim();
  const rawLabel = String(k.label || k.name || '').trim();
  if (!tz && !rawLabel) return null;
  const utc = Boolean(k.utc) || isUtcZone(tz, rawLabel);
  const zone = utc ? 'UTC' : tz;
  if (!zone) return null;
  const label = utc ? 'UTC' : (rawLabel || zone.split('/').pop().replace(/_/g, ' ')).toUpperCase().slice(0, 12);
  const code = utc ? 'UTC' : String(k.code || '').trim().toUpperCase().slice(0, 4) || codeFor(label, zone);
  return { tz: zone, label, code, timeZone: zone, name: label, utc };
}

export const UTC_CLOCK = clock({ tz: 'UTC', label: 'UTC' });

/** A list with UTC in it, no zone twice, five at most. */
export function tidy(list) {
  const out = []; const seen = new Set();
  for (const k of Array.isArray(list) ? list : []) {
    const one = clock(k);
    if (!one || seen.has(one.tz)) continue;
    seen.add(one.tz); out.push(one);
  }
  if (!seen.has('UTC')) out.splice(Math.min(1, out.length), 0, UTC_CLOCK);
  if (out.length > MAX_CLOCKS) {
    const kept = out.slice(0, MAX_CLOCKS);
    if (!kept.some((k) => k.utc)) kept[MAX_CLOCKS - 1] = UTC_CLOCK;
    return kept;
  }
  return out;
}

/** The clocks a person sees: their own list when they made one, otherwise the standard ones. */
export const clocksOf = (prefs, roomClocks) => tidy(Array.isArray(prefs?.clocks) ? prefs.clocks : roomClocks);

/** HH:MM in a zone, 24 h. */
export function hmIn(ms, tz) {
  try { return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ms)); }
  catch { return '--:--'; }
}

/** "UTC+2" for a zone at a moment. */
export function offsetLabel(ms, tz) {
  try {
    const part = new Intl.DateTimeFormat('en-GB', { timeZone: tz, timeZoneName: 'shortOffset' }).formatToParts(new Date(ms)).find((p) => p.type === 'timeZoneName');
    const text = String(part?.value || '').replace('GMT', 'UTC').replace('-', '−');
    return text || 'UTC';
  } catch { return ''; }
}

export const CITY_CHOICES = [
  ['RIGA', 'RIX', 'Europe/Riga'], ['LONDON', 'LON', 'Europe/London'], ['PARIS', 'PAR', 'Europe/Paris'], ['MOSCOW', 'MOW', 'Europe/Moscow'],
  ['DUBAI', 'DXB', 'Asia/Dubai'], ['ISTANBUL', 'IST', 'Europe/Istanbul'], ['NEW YORK', 'NYC', 'America/New_York'], ['LOS ANGELES', 'LAX', 'America/Los_Angeles'],
  ['BAKU', 'BAK', 'Asia/Baku'], ['ALMATY', 'ALA', 'Asia/Almaty'], ['TASHKENT', 'TAS', 'Asia/Tashkent'], ['TEL AVIV', 'TLV', 'Asia/Jerusalem'],
  ['HONG KONG', 'HKG', 'Asia/Hong_Kong'], ['TOKYO', 'TYO', 'Asia/Tokyo'], ['SINGAPORE', 'SIN', 'Asia/Singapore'], ['MADRID', 'MAD', 'Europe/Madrid'],
].map(([label, code, tz]) => clock({ label, code, tz }));
