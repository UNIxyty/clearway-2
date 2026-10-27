// This phone's own settings (design §4.1): stored on the device, keyed by the signed-in person, never written to the
// wall's account settings, never read by the wall. What a phone may set for itself: the world clocks, which view and
// range it opens in, and keeping the screen awake. What it may NOT set: the font and the colours — the phone wall
// reads the room's, so it reads the same way as the screen in the ops room (2026-10-27). A phone with nothing saved
// copies the room's clocks once, then is independent.
import { useCallback, useEffect, useState } from 'react';

const KEY = (who) => `mw-phone-prefs:${String(who || 'anyone').toLowerCase()}`;
export const MAX_CLOCKS = 5;
export const UTC_CLOCK = { name: 'UTC', code: 'UTC', timeZone: 'UTC', utc: true };

/** "LONDON" → "LON"; a zone's last segment otherwise. Three letters, uppercase. */
export function codeFor(name, timeZone) {
  const n = String(name || '').replace(/[^A-Za-z]/g, '').toUpperCase();
  if (n.length >= 3) return n.slice(0, 3);
  const z = String(timeZone || '').split('/').pop().replace(/[^A-Za-z]/g, '').toUpperCase();
  return (z || 'LOC').slice(0, 3);
}

/** The room's clocks as a phone's starting list: UTC first-class, at most five, names ≤ 12 characters. */
export function clocksFromRoom(roomClocks = []) {
  const out = [];
  let utcSeen = false;
  for (const c of roomClocks) {
    if (!c?.timeZone) continue;
    const isUtc = /^(UTC|Etc\/UTC|GMT|Etc\/GMT)$/i.test(c.timeZone) || /^utc$/i.test(String(c.label || '').trim());
    if (isUtc) { if (!utcSeen) { out.push({ ...UTC_CLOCK }); utcSeen = true; } continue; }
    const name = String(c.label || c.timeZone.split('/').pop().replace(/_/g, ' ')).toUpperCase().slice(0, 12);
    out.push({ name, code: codeFor(name, c.timeZone), timeZone: c.timeZone, utc: false });
  }
  if (!utcSeen) out.splice(Math.min(1, out.length), 0, { ...UTC_CLOCK });
  return out.slice(0, MAX_CLOCKS);
}

const DEFAULTS = { view: 'timeline', range: '6H', clocksOn: true, clocks: null, awake: false };

function read(who) {
  try { const raw = localStorage.getItem(KEY(who)); return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : null; } catch { return null; }
}
function write(who, prefs) {
  try { localStorage.setItem(KEY(who), JSON.stringify(prefs)); } catch { /* private mode: this session only */ }
}

/** [prefs, update] — update merges and saves. `roomClocks` seeds the clocks the first time only. */
export function usePhonePrefs(who, roomClocks) {
  const [prefs, setPrefs] = useState(() => read(who) || { ...DEFAULTS });
  useEffect(() => { setPrefs(read(who) || { ...DEFAULTS }); }, [who]);
  useEffect(() => {
    if (prefs.clocks || !roomClocks?.length) return;
    const next = { ...prefs, clocks: clocksFromRoom(roomClocks) };
    setPrefs(next); write(who, next);
  }, [prefs, roomClocks, who]);
  const update = useCallback((patch) => {
    setPrefs((p) => { const next = { ...p, ...(typeof patch === 'function' ? patch(p) : patch) }; write(who, next); return next; });
  }, [who]);
  const clocks = prefs.clocks || clocksFromRoom(roomClocks);
  return [{ ...prefs, clocks }, update];
}

/** HH:MM in a zone, from the device clock. */
export function hmIn(ms, timeZone) {
  try {
    return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone }).format(new Date(ms));
  } catch { return '--:--'; }
}
/** "UTC+1", "UTC−7", "UTC" for a zone, now. */
export function offsetLabel(ms, timeZone) {
  try {
    const p = new Intl.DateTimeFormat('en-GB', { timeZone, timeZoneName: 'shortOffset' }).formatToParts(new Date(ms)).find((x) => x.type === 'timeZoneName')?.value || '';
    return p.replace('GMT', 'UTC').replace('-', '−') || 'UTC';
  } catch { return ''; }
}

/** Cities a phone can add (beyond the room's own), by zone. Short on purpose: the room's list comes first. */
export const CITY_CHOICES = [
  ['RIGA', 'RIX', 'Europe/Riga'], ['LONDON', 'LON', 'Europe/London'], ['PARIS', 'PAR', 'Europe/Paris'], ['MOSCOW', 'MOW', 'Europe/Moscow'],
  ['DUBAI', 'DXB', 'Asia/Dubai'], ['ISTANBUL', 'IST', 'Europe/Istanbul'], ['NEW YORK', 'NYC', 'America/New_York'], ['LOS ANGELES', 'LAX', 'America/Los_Angeles'],
  ['BAKU', 'BAK', 'Asia/Baku'], ['ALMATY', 'ALA', 'Asia/Almaty'], ['TASHKENT', 'TAS', 'Asia/Tashkent'], ['TEL AVIV', 'TLV', 'Asia/Jerusalem'],
  ['HONG KONG', 'HKG', 'Asia/Hong_Kong'], ['TOKYO', 'TYO', 'Asia/Tokyo'], ['SINGAPORE', 'SIN', 'Asia/Singapore'], ['MADRID', 'MAD', 'Europe/Madrid'],
].map(([name, code, timeZone]) => ({ name, code, timeZone, utc: false }));
