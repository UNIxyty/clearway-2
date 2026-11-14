// This phone's own settings (carried over from the old phone wall, components/mobile/phone/prefs.js): kept on the
// device, per signed-in person, never written to the wall's settings. What is kept: the view and range the app opens
// in, the world clocks, keeping the screen awake, and which flight events make a notification.
// A list saved by the old phone wall (key "mw-phone-prefs:<who>") is taken over once: its clocks and its range stay.
import { useCallback, useEffect, useRef, useState } from 'react';
import { tidy } from '../pages/clocks';
import { RANGE_KEYS } from './model';

const KEY = (who) => `cw3-phone-prefs:${String(who || 'anyone').toLowerCase()}`;
const OLD_KEY = (who) => `mw-phone-prefs:${String(who || 'anyone').toLowerCase()}`;

export const NOTIFY_DEFAULTS = { delays: true, movements: true, services: true };
export const PREF_DEFAULTS = { view: 'timeline', range: '6H', clocksOn: true, clocks: null, awake: false, notify: NOTIFY_DEFAULTS };

/** Whatever was stored, in the one shape the app reads. Unknown values fall back to the defaults. */
export function normalisePrefs(p) {
  const o = p && typeof p === 'object' ? p : {};
  return {
    ...o,
    view: o.view === 'flights' || o.view === 'cards' ? 'flights' : 'timeline',
    range: RANGE_KEYS.includes(o.range) ? o.range : '6H',
    clocksOn: o.clocksOn !== false,
    clocks: Array.isArray(o.clocks) && o.clocks.length ? tidy(o.clocks) : null,
    awake: o.awake === true,
    notify: { ...NOTIFY_DEFAULTS, ...(o.notify && typeof o.notify === 'object' ? o.notify : null) },
  };
}

function read(who) {
  try {
    const raw = localStorage.getItem(KEY(who));
    if (raw) return normalisePrefs(JSON.parse(raw));
    const old = localStorage.getItem(OLD_KEY(who));
    if (!old) return null;
    const moved = normalisePrefs(JSON.parse(old));
    try { localStorage.setItem(KEY(who), JSON.stringify(moved)); } catch { /* read-only storage: taken over again next time */ }
    return moved;
  } catch { return null; }
}

/**
 * [prefs, setPrefs]. setPrefs(patch) merges, writes to the device and resolves with the new prefs; when the device
 * refuses the write it REJECTS and nothing changes, so a screen never shows a setting as kept when it was not.
 */
export function usePhonePrefs(who) {
  const [prefs, setState] = useState(() => read(who) || normalisePrefs(null));
  const ref = useRef(prefs);
  const whoRef = useRef(who);
  useEffect(() => {
    if (whoRef.current === who) return;
    whoRef.current = who;
    const next = read(who) || normalisePrefs(null);
    ref.current = next; setState(next);
  }, [who]);
  const setPrefs = useCallback((patch) => new Promise((resolve, reject) => {
    const cur = ref.current;
    const p = (typeof patch === 'function' ? patch(cur) : patch) || {};
    const next = normalisePrefs({ ...cur, ...p, notify: { ...cur.notify, ...(p.notify && typeof p.notify === 'object' ? p.notify : null) } });
    try { localStorage.setItem(KEY(who), JSON.stringify(next)); }
    catch { reject(new Error('The setting was not kept on this phone.')); return; }
    ref.current = next; setState(next); resolve(next);
  }), [who]);
  return [prefs, setPrefs];
}
