import { useCallback, useEffect, useState } from 'react';

// Minimal client routing for the two surfaces (kept router-library-free on
// purpose, extending the existing history.replaceState convention):
//
//   Display          /digital-wall/timeline            (what hangs on the wall)
//   Display Console  /digital-wall/console/<page>      (management app)
//
// In dev (vite, no /digital-wall prefix) the same shapes work without the
// prefix: /timeline, /console/operators, ...

export const CONSOLE_PAGES = ['flights', 'notam-check', 'operators', 'aircraft', 'limitations', 'important',
  'caa', 'webhooks', 'settings'];
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

  const last = (segments[segments.length - 1] || '').toLowerCase();
  if (LEGACY_CONSOLE_ALIASES[last]) {
    return { surface: 'console', page: LEGACY_CONSOLE_ALIASES[last] };
  }
  return { surface: 'display' };
}

export function routeToPath(route) {
  const prefix = basePrefix();
  if (route.surface === 'console') {
    return `${prefix}/console/${route.page || 'flights'}`;
  }
  return `${prefix}/timeline`;
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
      window.history.replaceState({}, '', canonical);
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
