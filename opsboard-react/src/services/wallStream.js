import { buildApiUrl } from './timelineApi';

// Shared EventSource wrapper for the backend's /api/stream SSE channel.
// One connection per app instance; consumers subscribe by event type.
// EventSource reconnects automatically; the UI's 60s poll remains the
// fallback, so a dead stream only means slower updates — never a blank wall.

let source = null;
let currentSurface = '';
const listeners = new Map(); // type -> Set<callback>

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
  source = new EventSource(buildApiUrl(`/api/stream?surface=${encodeURIComponent(surface)}`));
  source.onmessage = (message) => {
    try {
      dispatch(JSON.parse(message.data));
    } catch {
      /* ignore malformed frames */
    }
  };
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
