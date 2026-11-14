// A render error anywhere in the wall app is reported here: once to the browser console (with the stack, for whoever
// has the devtools open) and once to the wall server's log (POST /api/ui-error: where it broke, the page, the error's
// name and the top of its stack — enough to find it). Nothing here is ever shown to the person: the boundary that
// caught it draws its own small message (components/ErrorBoundary.jsx). Bounded: at most 20 reports per page load and
// never the same one twice, so a part that fails on every render cannot flood the log.
const API = String(import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
const seen = new Set();
let sent = 0;

// The page it happened on: the path, the names of any query keys (never their values: a link can carry a token) and
// the phone app's own #page.
function pagePath() {
  try {
    const { pathname, search, hash } = window.location;
    const keys = [...new URLSearchParams(search).keys()].slice(0, 8).join('&');
    return `${pathname}${keys ? `?${keys}` : ''}${/^#[\w/-]{1,60}$/.test(hash) ? hash : ''}`.slice(0, 200);
  } catch { return ''; }
}

export function reportUiError(where, error, info) {
  const name = String(error?.name || 'Error').slice(0, 60);
  const message = String(error?.message || error || '').slice(0, 300);
  const stack = String(error?.stack || '').split('\n').slice(0, 8).join('\n').slice(0, 1600);
  const component = String(info?.componentStack || '').split('\n').filter(Boolean).slice(0, 6).join('\n').slice(0, 800);
  try { console.error(`[ui-error] ${where}: ${name}: ${message}`, error, component); } catch { /* no console */ }
  const key = `${where}|${name}|${message}`;
  if (seen.has(key) || sent >= 20) return;
  seen.add(key); sent += 1;
  try {
    const body = JSON.stringify({ where: String(where || '').slice(0, 80), name, message, stack, component, path: pagePath() });
    fetch(`${API}/api/ui-error`, { method: 'POST', credentials: 'include', keepalive: true, headers: { 'content-type': 'application/json' }, body }).catch(() => {});
  } catch { /* the report is best effort; the boundary's message does not depend on it */ }
}
