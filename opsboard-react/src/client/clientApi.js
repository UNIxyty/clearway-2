// The client surface's own plumbing (2026-11-10, design "Client View v2" / "Phone Views"). A client's flights are the
// wall's: the same fetches the ops display makes (timelineApi), answered by the wall backend after it cut them to the
// client's scope (digital-wall/lib/client-scope.mjs). What is the PORTAL's — who the client is, their switches, and
// their saved view preferences — comes from the portal's own two client APIs on the same origin.
//
// The frame talks to its parent (the portal's client shell) with postMessage: the page it shows (timeline | flights),
// so the shell's sidebar and the address bar follow a switch made inside; and a request to open the Account page.
import { buildApiUrl } from '../services/timelineApi';

export const PORTAL_ME = '/api/client/me';
export const PORTAL_PREFS = '/api/client/prefs';
export const PHONE_MAX = 699; // below this the phone views draw (the shell's own breakpoint, app/client/client.css)

async function json(url, init) {
  const r = await fetch(url, { credentials: 'same-origin', cache: 'no-store', ...init });
  const body = await r.json().catch(() => null);
  if (!r.ok || body?.ok === false) { const e = new Error(body?.error || body?.message || `The server answered ${r.status}.`); e.status = r.status; throw e; }
  return body;
}

/** Who is signed in (the portal): company, person, switches, passenger level. Null when the portal is not reachable. */
export const fetchMe = () => json(PORTAL_ME).catch(() => null);

/** Saved view preferences (the portal): { start, hidden: { operators: [], registrations: [] } }. */
export const fetchPrefs = () => json(PORTAL_PREFS).then((b) => normalisePrefs(b.prefs)).catch(() => normalisePrefs(null));
export const savePrefs = (prefs) => json(PORTAL_PREFS, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(prefs) }).then((b) => normalisePrefs(b.prefs));

export function normalisePrefs(p) {
  const list = (v) => (Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean) : []);
  return { start: p?.start === 'flights' ? 'flights' : p?.start === 'timeline' ? 'timeline' : null, hidden: { operators: list(p?.hidden?.operators), registrations: list(p?.hidden?.registrations) } };
}

/** The wall's own answers a client's pages read. Every path is in CLIENT_READS; the server cuts each to the client. */
/** The look of their own timeline (the wall's /api/client/view, 2026-11-11): { settings, defaults, source }. */
export const VIEW_PATH = '/api/client/view';
export const fetchView = () => json(buildApiUrl(VIEW_PATH));
export const saveView = (settings) => json(buildApiUrl(VIEW_PATH), { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ settings }) });
export const resetView = () => json(buildApiUrl(VIEW_PATH), { method: 'DELETE' });
/** The read/write pair the look cards use on the client surface (components/console/LookCards.jsx › DeviceCtx.api). */
export const viewApi = { fetch: () => fetchView(), save: (settings) => saveView(settings) };

/**
 * The empty board's words (2026-11-12): a client WITH a grant whose aircraft are not on the board right now must never
 * read "no aircraft on your account" — that sentence is for an account that was granted nothing yet. `me.scopeKinds`
 * says what the account covers (the portal's /api/client/me).
 */
export function emptyFleetWords(me) {
  const kinds = me?.scopeKinds ?? [];
  if (kinds.length === 0) return { kind: 'no-grant', title: 'No aircraft on your account yet', line: 'Clearway ops grants operators and aircraft. Until then this page stays empty.' };
  const what = kinds.map((k) => ({ operator: 'operator', registration: 'aircraft', trip: 'trip' }[k] || k)).join(', ');
  return { kind: 'nothing-on-board', title: 'Nothing of yours is on the board right now', line: `Your account covers ${kinds.length === 1 ? `an ${what}` : `these: ${what}`}. Flights appear here as soon as Clearway ops has them in the board's window.` };
}

export const fetchSyncStatus = () => json(buildApiUrl('/api/timeline/sync-status')).catch(() => null);
export const fetchPassengers = (flightNid, oprId) => json(buildApiUrl(`/api/flight-passengers?flightNid=${encodeURIComponent(flightNid)}${oprId ? `&oprId=${encodeURIComponent(oprId)}` : ''}`));

/** The frame → shell messages. */
export function tellShell(message) {
  if (window.top === window.self) return;
  try { window.parent.postMessage({ source: 'cw-client-frame', ...message }, window.location.origin); } catch { /* a detached frame */ }
}

/** Shell → frame: the page to show, when the person uses the sidebar. */
export function onShellMessage(handler) {
  const fn = (e) => { if (e.origin !== window.location.origin || e.data?.source !== 'cw-client-shell') return; handler(e.data); };
  window.addEventListener('message', fn);
  return () => window.removeEventListener('message', fn);
}

/** View state kept across reloads and across pages (the timeline's zoom and day, the list's search): this browser only. */
const VIEW_KEY = 'cw-client-view';
export function readView() { try { return JSON.parse(sessionStorage.getItem(VIEW_KEY) || '{}') || {}; } catch { return {}; } }
export function writeView(patch) { try { sessionStorage.setItem(VIEW_KEY, JSON.stringify({ ...readView(), ...patch })); } catch { /* private mode */ } }

/** A flight's status, in the words a client reads (design: "status in plain words"). */
export const STATUS_WORD = { scheduled: 'Scheduled', delayed: 'Delayed', ctot: 'Slot time', airborne: 'In the air', arrived: 'Landed', cancelled: 'Cancelled' };

/** "HH:MM" → "HH:MMZ" for sentences. */
export const z = (hm) => (hm ? `${hm}Z` : '—');

/** The one sentence under the status (design: Client Portal v2 › f.sentence). */
export function statusSentence(p, names = {}) {
  const nm = (icao) => names[icao] || icao;
  switch (p.status) {
    case 'delayed': return `Delayed ${Math.max(0, p.depDeltaMin || 0)} min. Now departs ${nm(p.dep)} at ${z(p.depHm)} and lands at ${z(p.arrHm)}.`;
    case 'ctot': return `Slot time ${z(p.depHm)}, ${Math.max(0, p.depDeltaMin || 0)} min after schedule.`;
    case 'airborne': return `In the air since ${z(p.atdHm || p.depHm)}. Lands ${nm(p.arr)} at ${z(p.arrHm)}.`;
    case 'arrived': return `Landed in ${nm(p.arr)} at ${z(p.ataHm || p.arrHm)}.`;
    case 'cancelled': return `${p.fn} ${nm(p.dep)} → ${nm(p.arr)} will not fly.`;
    default: return `Departs ${nm(p.dep)} at ${z(p.depHm)}, lands ${nm(p.arr)} at ${z(p.arrHm)}.`;
  }
}

/** Day buckets for the list and the agenda, UTC: 0 = today, 1 = tomorrow, … (negative: yesterday). */
export function dayIndex(ms, nowMs = Date.now()) {
  const d = (x) => Math.floor(x / 86_400_000);
  return d(ms) - d(nowMs);
}
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function dayName(idx, nowMs = Date.now()) {
  if (idx === 0) return 'TODAY';
  if (idx === 1) return 'TOMORROW';
  if (idx === -1) return 'YESTERDAY';
  const d = new Date(nowMs + idx * 86_400_000);
  return `${DOW[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}`.toUpperCase();
}
export function dayLabel(idx, nowMs = Date.now()) {
  const d = new Date(nowMs + idx * 86_400_000);
  return `${DOW[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}`;
}
export function dayShort(idx, nowMs = Date.now()) {
  if (idx === 0) return 'Today';
  if (idx === 1) return 'Tomorrow';
  if (idx === -1) return 'Yesterday';
  const d = new Date(nowMs + idx * 86_400_000);
  return `${DOW[d.getUTCDay()]} ${d.getUTCDate()}`;
}

/** The instant a day starts at, UTC, as the timeline's scroll target (06:00 for other days, "now" for today). */
export function dayStartMs(idx, nowMs = Date.now()) {
  if (idx === 0) return nowMs;
  const d = new Date(nowMs + idx * 86_400_000);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 6, 0, 0);
}

/** Search (design: flight number, registration or airport ICAO), case-insensitive, dashes ignored in registrations. */
export function matchesQuery(p, q) {
  const Q = String(q || '').trim().toUpperCase();
  if (!Q) return true;
  const reg = String(p.__reg || '').toUpperCase().replace(/-/g, '');
  return String(p.fn || '').toUpperCase().includes(Q) || reg.includes(Q.replace(/-/g, '')) || String(p.dep).includes(Q) || String(p.arr).includes(Q);
}

/** The visible fleet after the client's own hide switches: a view filter only; the server already sent only what is theirs. */
export function applyHidden(aircraft, hidden) {
  const ops = new Set(hidden?.operators || []);
  const regs = new Set(hidden?.registrations || []);
  return (aircraft || []).filter((a) => !ops.has(String(a.oprId || '').toLowerCase()) && !regs.has(String(a.reg || '').toUpperCase()));
}

/** Operators → aircraft, from the fleet the server sent (the client's grants). */
export function groupOperators(aircraft) {
  const map = new Map();
  for (const a of aircraft || []) {
    const key = String(a.oprId || '').toLowerCase();
    if (!map.has(key)) map.set(key, { oprId: key, name: a.type || key.toUpperCase(), regs: [] });
    map.get(key).regs.push({ reg: a.reg, type: a.acType || a.icaoType || '', flights: (a.flights || []).length });
  }
  return [...map.values()].sort((x, y) => x.name.localeCompare(y.name)).map((o) => ({ ...o, regs: o.regs.sort((x, y) => x.reg.localeCompare(y.reg)) }));
}
