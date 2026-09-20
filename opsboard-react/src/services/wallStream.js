import { buildApiUrl } from './timelineApi';

// Shared EventSource wrapper for the backend's /api/stream SSE channel.
// One connection per app instance; consumers subscribe by event type.
// EventSource reconnects automatically; the UI's 60s poll remains the
// fallback, so a dead stream only means slower updates — never a blank wall.

let source = null;
let currentSurface = '';
const listeners = new Map(); // type -> Set<callback>

// ── Connection state (mobile/tablet LIVE · RECONNECTING · STALE strip) ──────
// The big-screen wall deliberately shows nothing here (its 60s poll is the
// backstop and a wall must never look broken); the phone/tablet views MUST,
// because a dispatcher away from the room cannot afford silently old data.
// live = stream open and something (event or heartbeat) arrived recently;
// reconnecting = EventSource is retrying; stale = nothing heard for staleAfterMs.
const connState = {
  status: 'connecting', // 'connecting' | 'live' | 'reconnecting'
  lastHeardAt: 0, // any activity: open, named event, heartbeat comment
  lastDataAt: 0, // last real broadcast event
};
const connListeners = new Set();

function notifyConn() {
  const snapshot = { ...connState };
  for (const callback of [...connListeners]) {
    try {
      callback(snapshot);
    } catch (err) {
      console.error('wallStream conn listener failed', err);
    }
  }
}

function markHeard(isData) {
  connState.lastHeardAt = Date.now();
  if (isData) connState.lastDataAt = connState.lastHeardAt;
  if (connState.status !== 'live') {
    connState.status = 'live';
    notifyConn();
  } else {
    notifyConn();
  }
}

function dispatch(event) {
  const callbacks = listeners.get(event.type);
  if (!callbacks) return;
  for (const callback of [...callbacks]) {
    try {
      callback(event);
    } catch (err) {
      console.error('wallStream listener failed', err);
    }
  }
}

function ensureConnected(surface) {
  if (source && currentSurface === surface) return;
  if (source) source.close();
  currentSurface = surface;
  // Device-registered walls authenticate the stream with their device token.
  // EventSource cannot send headers, so it rides as a query parameter; the
  // server accepts it only on the read-only display whitelist.
  let streamUrl = `/api/stream?surface=${encodeURIComponent(surface)}`;
  if (surface !== 'console') {
    try {
      const token = window.localStorage.getItem('dw-device-token');
      if (token) streamUrl += `&device_token=${encodeURIComponent(token)}`;
    } catch {
      /* storage-restricted context */
    }
  }
  source = new EventSource(buildApiUrl(streamUrl));
  source.onopen = () => markHeard(false);
  source.onerror = () => {
    if (connState.status !== 'reconnecting') {
      connState.status = 'reconnecting';
      notifyConn();
    }
  };
  source.onmessage = (message) => {
    markHeard(true);
    try {
      dispatch(JSON.parse(message.data));
    } catch {
      /* ignore malformed frames */
    }
  };
}

/**
 * Force the next subscriber to open a FRESH connection. Needed when the
 * device token changes (issued or revoked): EventSource reconnects with the
 * URL it was created with, so a token baked into that URL goes stale.
 */
export function resetWallStream() {
  if (source) source.close();
  source = null;
  currentSurface = '';
}

/**
 * Subscribe to stream connection state. Returns an unsubscribe function.
 * The callback receives { status, lastHeardAt, lastDataAt }; staleness is the
 * CALLER's judgement (compare lastHeardAt/lastDataAt against its own now) so
 * one wrapper serves both the 9-minute banner and per-card freshness copy.
 */
export function subscribeConnectionState(callback, { surface = 'display' } = {}) {
  ensureConnected(surface);
  connListeners.add(callback);
  callback({ ...connState });
  return () => {
    connListeners.delete(callback);
  };
}

export function getConnectionState() {
  return { ...connState };
}

/**
 * Subscribe to a broadcast event type ('limitations.changed',
 * 'config.changed', 'presence.changed', 'display.command', ...).
 * Returns an unsubscribe function.
 */
export function subscribeWallStream(type, callback, { surface = 'display' } = {}) {
  ensureConnected(surface);
  if (!listeners.has(type)) listeners.set(type, new Set());
  listeners.get(type).add(callback);
  return () => {
    listeners.get(type)?.delete(callback);
  };
}
