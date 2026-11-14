import { useCallback, useEffect, useState } from 'react';

// Minimal client routing for the two surfaces (kept router-library-free on
// purpose, extending the existing history.replaceState convention):
//
//   Display          /digital-wall/timeline            (what hangs on the wall)
//   Display Console  /digital-wall/console/<page>      (management app)
//   Phone app        /digital-wall/phone               (staff and clients on a phone; src/phone/)
//
// In dev (vite, no /digital-wall prefix) the same shapes work without the
// prefix: /timeline, /console/operators, ...

export const CONSOLE_PAGES = ['flights', 'notam-check', 'operators', 'aircraft', 'limitations', 'important',
  'caa', 'webhooks', 'reports', 'settings'];
const LEGACY_CONSOLE_ALIASES = {
  aircrafts: 'aircraft',
  operators: 'operators',
  limitations: 'limitations',
};

function basePrefix() {
  if (typeof window === 'undefined') return '';
  return window.location.pathname.includes('/digital-wall') ? '/digital-wall' : '';
}

export function parseRoute(pathname) {
  const segments = String(pathname || '')
    .replace(/\/+$/, '')
    .split('/')
    .filter(Boolean);

  const consoleIndex = segments.indexOf('console');
  if (consoleIndex >= 0) {
    const page = (segments[consoleIndex + 1] || 'flights').toLowerCase();
    return {
      surface: 'console',
      page: CONSOLE_PAGES.includes(page) ? page : 'flights',
    };
  }

  // the phone app (v3, 2026-11-12): one address for staff and clients, /digital-wall/phone (?flight=<id>, #<page>)
  if (segments.includes('phone')) return { surface: 'phone' };

  const last = (segments[segments.length - 1] || '').toLowerCase();
  if (LEGACY_CONSOLE_ALIASES[last]) {
    return { surface: 'console', page: LEGACY_CONSOLE_ALIASES[last] };
  }
  // the client surface (2026-11-10): the display route framed by the portal's client shell with ?in=client
  const client = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('in') === 'client';
  return { surface: 'display', client };
}

export function routeToPath(route) {
  const prefix = basePrefix();
  if (route.surface === 'console') {
    return `${prefix}/console/${route.page || 'flights'}`;
  }
  if (route.surface === 'phone') return `${prefix}/phone`;
  return `${prefix}/timeline`;
}

/** The phone app's address, from anywhere in the wall app (a deep link keeps its ?flight= and #page). */
export function phoneHref({ flight = '', view = '', hash = '' } = {}) {
  const q = new URLSearchParams();
  if (flight) q.set('flight', flight);
  if (view) q.set('view', view);
  const qs = q.toString();
  return `${basePrefix()}/phone/${qs ? `?${qs}` : ''}${hash ? `#${String(hash).replace(/^#/, '')}` : ''}`;
}

export function useRoute() {
  const [route, setRoute] = useState(() =>
    typeof window === 'undefined' ? { surface: 'display' } : parseRoute(window.location.pathname)
  );

  useEffect(() => {
    const onPopState = () => setRoute(parseRoute(window.location.pathname));
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Normalize legacy URLs (/digital-wall/operators -> /digital-wall/console/operators).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const canonical = routeToPath(route);
    if (window.location.pathname !== canonical) {
      // Keep the query and the hash (2026-10-27): the phone shell's door passes ?in=m&flight=… and lost them here.
      window.history.replaceState({}, '', `${canonical}${window.location.search}${window.location.hash}`);
    }
  }, [route]);

  const navigate = useCallback((next) => {
    setRoute(next);
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', routeToPath(next));
    }
  }, []);

  return { route, navigate };
}
