// Device-bound wall session (bug report 6 item 7 — the logout problem).
//
// The wall display can run on a registered DEVICE identity instead of a
// person's sign-in: a long-lived token, issued when someone approves the
// device from the console, scoped server-side to read-only wall data. The
// token lives in localStorage next to the existing dw-device-id, so it
// survives browser and machine restarts — no Supabase session to expire.

import { getDeviceId } from './device';
import { buildApiUrl } from './timelineApi';

const TOKEN_KEY = 'dw-device-token';

export function getDeviceToken() {
  try {
    return window.localStorage.getItem(TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

export function setDeviceToken(token) {
  try {
    window.localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* storage-restricted context: the session just won't survive a restart */
  }
}

export function clearDeviceToken() {
  try {
    window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

// Every wall data call must carry the token, but the display's fetches are
// scattered (timeline, settings, clocks, overlays, info tabs). Rather than
// threading a header through each call site, wrap window.fetch ONCE on the
// display surface: any /api/ request gains x-device-token when a token is
// held. The server only honours it on the read-only display whitelist, so
// over-sending is harmless.
let fetchWrapped = false;
export function installDeviceFetch() {
  if (fetchWrapped || typeof window === 'undefined') return;
  fetchWrapped = true;
  const rawFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const token = getDeviceToken();
    const urlStr = typeof input === 'string' ? input : (input?.url || '');
    if (token && urlStr.includes('/api/')) {
      const headers = new Headers(init?.headers || (typeof input === 'object' ? input.headers : undefined) || {});
      if (!headers.has('x-device-token')) headers.set('x-device-token', token);
      return rawFetch(input, { ...(init || {}), headers });
    }
    return rawFetch(input, init);
  };
}

async function deviceApi(pathWithQuery, init) {
  const response = await fetch(buildApiUrl(pathWithQuery), init);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `Device request failed (${response.status})`);
  }
  return payload;
}

/** Ask to be registered; returns { status, code?, expiresAt? }. */
export function announceThisDevice() {
  return deviceApi('/api/device/announce', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ deviceId: getDeviceId() }),
  });
}

/** Poll our approval state; delivers the token exactly once when approved. */
export function fetchThisDeviceState() {
  return deviceApi(`/api/device/state?deviceId=${encodeURIComponent(getDeviceId())}`);
}
