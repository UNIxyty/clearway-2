import { CONNECTION, failureFrom, readPayload, ShownError, TRY_AGAIN } from './errorText';

const RAW_API_BASE = String(import.meta.env.VITE_API_BASE_URL || '').trim();

function normalizeApiBase() {
  if (!RAW_API_BASE) return '';
  // Allow "localhost:5174" style values from env.
  if (/^https?:\/\//i.test(RAW_API_BASE)) {
    return RAW_API_BASE.replace(/\/$/, '');
  }
  if (/^[\w.-]+:\d+/.test(RAW_API_BASE)) {
    return `http://${RAW_API_BASE.replace(/\/$/, '')}`;
  }
  return RAW_API_BASE.replace(/\/$/, '');
}

const API_BASE = normalizeApiBase();

export function buildApiUrl(pathWithQuery) {
  if (!API_BASE) return pathWithQuery;
  return `${API_BASE}${pathWithQuery}`;
}

/**
 * Resolve the current session. Returns:
 *  - { status: 'ok', user, authEnabled }  when signed in (or auth disabled)
 *  - { status: 'unauthorized' }           when a Supabase sign-in is required
 *  - { status: 'error', error }           when the backend is unreachable
 */
export async function fetchCurrentUser() {
  let response;
  try {
    response = await fetch(buildApiUrl('/api/user'));
  } catch (error) {
    console.error('[wall] sign-in check could not reach the server', error);
    return { status: 'error', error: CONNECTION };
  }
  if (response.status === 401) return { status: 'unauthorized' };
  let payload = {};
  try {
    payload = await response.json();
  } catch {
    /* non-JSON error page */
  }
  if (!response.ok) {
    return { status: 'error', error: (typeof payload.error === 'string' && payload.error) || `Couldn't check your sign-in. ${TRY_AGAIN}` };
  }
  return { status: 'ok', user: payload.user || payload, authEnabled: payload.authEnabled !== false };
}

// `what` is the sentence shown when the server sends none, e.g. "Couldn't load the flights." The network error and
// the API base setting go to the browser console, never to the screen.
async function fetchJson(pathWithQuery, what) {
  let response;
  try {
    response = await fetch(buildApiUrl(pathWithQuery));
  } catch (error) {
    console.error(`[wall] ${pathWithQuery} could not reach the server (API base "${RAW_API_BASE || '(empty)'}")`, error);
    throw new ShownError(CONNECTION);
  }
  const payload = await readPayload(response);
  if (!response.ok || payload.ok === false) {
    throw failureFrom(payload, what);
  }
  return payload;
}

// The facts a pill shows — the time that matters, signed deltas, the bar's span, the state and whether it is
// estimated — are the wall's rules, shared with the phone wall in the portal: shared/wall-facts.mjs (lifted from
// here verbatim on 2026-10-18; the display's rendering is unchanged). mapFlight keeps its exact shape.
import { flightTimes, statusFromFlight, toDate, toHm } from '../../../shared/wall-facts.mjs';

function toNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function mapFlight(flight, group) {
  const t = flightTimes(flight);
  if (!t) return null;
  const dep = flight.adep?.icao || 'UNK';
  const arr = flight.ades?.icao || 'UNK';
  const oprId = flight.oprId || group?.oprId || null;
  const flightNid = flight.flightNid != null ? String(flight.flightNid) : null;

  return {
    // Identity — flightNo repeats across many legs (JTY52W flies every jty
    // leg), so anything that needs to tell flights apart (React keys, lookups)
    // must use `id`, never `fn`. `fn` is display-only.
    id: flightNid
      ? `${oprId || 'opr'}:${flightNid}`
      : `${flight.flightNo || 'UNKNOWN'}|${dep}|${arr}|${t.startUtcMs}|${t.scheduledEndUtcMs}`,
    flightNid,
    oprId,
    fn: flight.flightNo || 'UNKNOWN',
    // ICAO flight-type LETTER (S/N/G/M/X) — reserved chip beside the flight
    // ID. Falls back to the aircraft's default (Leon Aircraft tab field)
    // when the flight doesn't carry its own value.
    icaoType: flight.icaoType || group?.defaultIcaoType || null,
    dep,
    arr,
    // STD / STA as HH:MM (the names are historical).
    etd: t.stdHm,
    eta: t.staHm,
    // Actual times (Leon flightWatch/journey log) — the pill tags delayed
    // segments with ETD→ATD / ETA→ATA when these exist; null = not departed/
    // arrived yet, and the pill omits the tag rather than inventing a value.
    atdHm: t.atdHm,
    ataHm: t.ataHm,
    dlyMin: Math.max(t.depDelayMin, t.arrDelayMin),
    depDelayMin: t.depDelayMin,
    arrDelayMin: t.arrDelayMin,
    // Ops timing display (exact rules): what to label each pill end with,
    // the value, and the SIGNED difference vs the initial schedule.
    depKind: t.depKind,
    arrKind: t.arrKind,
    depHm: t.depHm,
    arrHm: t.arrHm,
    eetMin: t.eetMin,
    arrBasis: t.arrBasis,
    depDeltaMin: t.depDeltaMin,
    arrDeltaMin: t.arrDeltaMin,
    status: statusFromFlight(flight),
    // Clock-derived estimate (no flight-watch data) — pill renders HOLLOW.
    estimated: flight.movementStateEstimated === true,
    // Leon-driven pill semantics (Part A):
    isConfirmed: flight.isConfirmed !== false,
    checklistColor: flight.checklistColor || null,
    ctot: flight.ctot || null,
    startUtcMs: t.startUtcMs,
    delayedStartUtcMs: t.delayedStartUtcMs,
    scheduledEndUtcMs: t.scheduledEndUtcMs,
    endUtcMs: t.endUtcMs,
    limitationIds: Array.isArray(flight.limitationIds) ? flight.limitationIds : [],
    limitations: Array.isArray(flight.limitations) ? flight.limitations : [],
    // CheckWX flight categories per airport (VFR/MVFR/IFR/LIFR or null).
    wxDep: flight.wxDep || null,
    wxArr: flight.wxArr || null,
    // Per-flight Checked acks (info tab) — { imp|ntm|wx|caa: {at, by} }.
    checks: flight.checks || {},
  };
}

function mapAircraft(group) {
  const mappedFlights = (group.flights || []).map((flight) => mapFlight(flight, group)).filter(Boolean);
  if (mappedFlights.length === 0) return null;
  return {
    // Identity: registrations are NOT unique across operators — cwy-cwy's
    // aggregator tenant carries other carriers' tails (LY-JMS, LY-BGS…) that
    // also exist under their own operator (klj). Rows must key on
    // oprId:registration, never the registration alone.
    id: `${group.oprId || 'opr'}:${group.registration || 'UNKNOWN'}`,
    oprId: group.oprId || null,
    reg: group.registration || 'UNKNOWN',
    type: group.operatorName || group.oprId || 'OPS',
    flights: mappedFlights,
  };
}

export async function fetchTimelineAircraft({ refresh = true } = {}) {
  const now = new Date();
  // Ops window: 1 day before through next 3 days.
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1, 0, 0, 0));
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 4, 0, 0, 0));
  // refresh=false serves re-decorated cached flights without forcing a Leon
  // sync — used for SSE-driven refetches so live events stay cheap.
  const query = new URLSearchParams({
    allOperators: 'true',
    refresh: refresh ? 'true' : 'false',
    from: from.toISOString(),
    to: to.toISOString(),
  });

  const payload = await fetchJson(`/api/timeline/flights?${query.toString()}`, "Couldn't load the flights.");
  const limitationsPayload = await fetchJson(
    '/api/timeline/limitations?includeInactive=false',
    "Couldn't load the limitations."
  ).catch(() => ({ limitations: [] }));

  const aircraft = (payload.aircraft || []).map(mapAircraft).filter(Boolean);
  return {
    // Flight-count check (bug report 7 follow-up item 2): what the server counted, and what reached the wall.
    windowCheck: payload.windowCheck ?? null,
    receivedFlights: Number.isFinite(payload.totalFlights) ? payload.totalFlights : null,
    drawnFlights: aircraft.reduce((n, a) => n + a.flights.length, 0),
    source: payload.source || 'unknown',
    totalAircraft: aircraft.length,
    aircraft,
    limitations: limitationsPayload.limitations || [],
    windowStartUtc: from.toISOString(),
    windowEndUtc: to.toISOString(),
  };
}

/** Item 3: registered display devices (viewport env + profile state). */
export async function fetchDisplayDevices() {
  return fetchJson('/api/display/devices', "Couldn't load the screens.");
}

export async function renameDisplayDevice(deviceId, label) {
  const response = await fetch(buildApiUrl(`/api/display/devices/${encodeURIComponent(deviceId)}`), {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ label }),
  });
  const payload = await readPayload(response);
  if (!response.ok || payload.ok === false) throw failureFrom(payload, "Couldn't rename the screen.");
  return payload;
}

/**
 * Bug report 6 item 7: device ACCESS management (distinct from the viewport
 * registry above — these are the screens allowed to read wall data without
 * a user session). Approve/revoke are audit-logged server-side.
 */
export async function fetchAuthDevices() {
  return fetchJson('/api/device/list', "Couldn't load the screens.");
}

export async function approveAuthDevice(deviceId, name) {
  const response = await fetch(buildApiUrl('/api/device/approve'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ deviceId, name }),
  });
  const payload = await readPayload(response);
  if (!response.ok || payload.ok === false) throw failureFrom(payload, "Couldn't approve the screen.");
  return payload;
}

export async function revokeAuthDevice(deviceId) {
  const response = await fetch(buildApiUrl('/api/device/revoke'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ deviceId }),
  });
  const payload = await readPayload(response);
  if (!response.ok || payload.ok === false) throw failureFrom(payload, "Couldn't remove the screen.");
  return payload;
}

export async function resetProfile(account) {
  const response = await fetch(buildApiUrl(`/api/display/settings/profile/${encodeURIComponent(account)}`), {
    method: 'DELETE',
  });
  const payload = await readPayload(response);
  if (!response.ok || payload.ok === false) throw failureFrom(payload, "Couldn't reset the settings.");
  return payload;
}

/** Item 1: report this screen's rendering environment (fire-and-forget). */
let lastRttMs = null;
export function reportDisplayEnv(body) {
  const started = performance.now();
  const payload = body.clock ? { ...body, clock: { ...body.clock, sentAt: Date.now(), rttMs: lastRttMs } } : body;
  fetch(buildApiUrl('/api/display/env'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  }).then(() => { lastRttMs = Math.round(performance.now() - started); }).catch(() => {});
}

/** Console Reports (bug report item 13). */
export async function fetchReports({ status = '', category = '', q = '' } = {}) {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (category) params.set('category', category);
  if (q) params.set('q', q);
  const qs = params.toString();
  return fetchJson(`/api/reports${qs ? `?${qs}` : ''}`, "Couldn't load the reports.");
}

async function jsonRequest(path, method, body) {
  const response = await fetch(buildApiUrl(path), {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const payload = await readPayload(response);
  if (!response.ok || payload.ok === false) throw failureFrom(payload, "Couldn't save the change.");
  return payload;
}

// Upcoming Flight Table (bug report 3 item 10): flat rows since 00:01 UTC,
// no visibility window. Colours come from Leon checklists — FLIGHT by the
// OPS aggregate, ADEP/ADES by the SLOT & HANDLING services for that side.
export async function fetchUpcomingFlights() {
  const payload = await fetchJson('/api/upcoming/flights', "Couldn't load the upcoming flights.");
  const rows = [];
  for (const group of payload.aircraft || []) {
    for (const flight of group.flights || []) {
      if (flight.isCnl) continue;
      const stdMs = toDate(flight.startTimeUTC)?.getTime();
      if (!Number.isFinite(stdMs)) continue;
      const dly = Number.isFinite(flight.departureDelayMin) ? flight.departureDelayMin : null;
      rows.push({
        id: `${group.oprId ?? 'unknown'}:${flight.flightNid}`,
        fn: flight.flightNo || group.registration || 'UNKNOWN',
        reg: group.registration || '',
        dep: flight.adep?.icao || '——',
        arr: flight.ades?.icao || '——',
        wxDep: flight.wxDep || null,
        wxArr: flight.wxArr || null,
        stdMs,
        etdHm: toHm(flight.etd ?? flight.startTimeUTC),
        dly,
        atdHm: toHm(flight.atd),
        // The table's ETA follows the SAME rule as the bar's end (LDG > departure + EET > ETA > STA ± delay),
        // so the table and the timeline never show two different arrivals for one flight (bug report 7 item 6).
        etaHm: (() => { if (flight.ataHm || flight.ata) return toHm(flight.eta ?? flight.endTimeUTC); const m = mapFlight(flight, group); return m?.arrHm ?? toHm(flight.eta ?? flight.endTimeUTC); })(),
        ataHm: toHm(flight.ata),
        date: (() => { const d = new Date(stdMs); return `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}`; })(),
        flightColor: flight.checklistColor || null,
        adepColor: flight.checklistAdepColor || null,
        adesColor: flight.checklistAdesColor || null,
      });
    }
  }
  rows.sort((a, b) => a.stdMs - b.stdMs);
  return rows;
}

// NOTAM digest config (console-editable; null field = env default).
export const fetchDigestConfig = () => fetchJson('/api/notam-check/digest-config', "Couldn't load the NOTAM email settings.");
export const saveDigestConfig = (body) => jsonRequest('/api/notam-check/digest-config', 'PUT', body);

// Manual trigger of the daily 00:01 UTC flight-weather pull.
export const refreshFlightWeather = () => jsonRequest('/api/admin/refresh-flight-weather', 'POST', {});

export const createReport = (body) => jsonRequest('/api/reports', 'POST', body);
export const updateReport = (id, body) => jsonRequest(`/api/reports/${encodeURIComponent(id)}`, 'PATCH', body);
export const deleteReport = (id) => jsonRequest(`/api/reports/${encodeURIComponent(id)}`, 'DELETE');
export const sendReport = (id, to) => jsonRequest(`/api/reports/${encodeURIComponent(id)}/send`, 'POST', { to });
export const saveReportsConfig = (body) => jsonRequest('/api/reports/config', 'PUT', body);

export async function fetchDisplayClocks() {
  return fetchJson('/api/display/clocks', "Couldn't load the clocks.");
}

// Settings are per ACCOUNT (the main ops wall signs in as
// ops@clearway.aero — its profile IS the big screen). No account argument
// = your own profile, resolved server-side from the session.
export async function fetchDisplaySettings(account) {
  const query = account ? `?account=${encodeURIComponent(account)}` : '';
  return fetchJson(`/api/display/settings${query}`, "Couldn't load the display settings.");
}

export async function saveDisplaySettings(settings, account) {
  const response = await fetch(buildApiUrl('/api/display/settings'), {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ settings, ...(account ? { account } : {}) }),
  });
  const payload = await readPayload(response);
  if (!response.ok || payload.ok === false) {
    throw failureFrom(payload, "Couldn't save the display settings.");
  }
  return payload;
}

export async function saveDisplayClocks(clocks) {
  const response = await fetch(buildApiUrl('/api/display/clocks'), {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ clocks }),
  });
  const payload = await readPayload(response);
  if (!response.ok || payload.ok === false) {
    throw failureFrom(payload, "Couldn't save the clocks.");
  }
  return payload;
}

/**
 * Raw (unmapped) timeline feed for the Console's flight list — keeps every
 * backend field (flightNid, timings, delays, limitations) that the board
 * mapping strips.
 */
/**
 * Flight search for the Limitations "Flight" match type: filters the cached
 * flight feed by callsign / registration / ICAO. Returns
 * [{ nid, label }] — nid is the stable Leon flightNid the matcher uses.
 */
export async function searchFlights(query, limit = 12) {
  const q = String(query || '').trim().toUpperCase();
  if (!q) return [];
  const payload = await fetchTimelineRaw({ refresh: false });
  const out = [];
  for (const group of payload.aircraft || []) {
    for (const flight of group.flights || []) {
      const hay = `${flight.flightNo || ''} ${group.registration || ''} ${flight.adep?.icao || ''} ${flight.ades?.icao || ''}`.toUpperCase();
      if (!hay.includes(q)) continue;
      const day = String(flight.startTimeUTC || '').slice(5, 10);
      out.push({
        nid: String(flight.flightNid),
        label: `${flight.flightNo || 'UNKNOWN'} ${flight.adep?.icao || '?'}→${flight.ades?.icao || '?'} · ${day}`,
      });
      if (out.length >= limit) return out;
    }
  }
  return out;
}

export async function fetchTimelineRaw({ refresh = false } = {}) {
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1, 0, 0, 0));
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 4, 0, 0, 0));
  const query = new URLSearchParams({
    allOperators: 'true',
    refresh: refresh ? 'true' : 'false',
    from: from.toISOString(),
    to: to.toISOString(),
  });
  return fetchJson(`/api/timeline/flights?${query.toString()}`, "Couldn't load the flights.");
}

// ── Presence + remote overlay (Feature 5) ───────────────────────────────────

export async function fetchPresence() {
  return fetchJson('/api/presence', "Couldn't load who is online.");
}

export async function fetchOverlay() {
  return fetchJson('/api/display/overlay', "Couldn't load the flight panel.");
}

async function postOverlay(body) {
  const response = await fetch(buildApiUrl('/api/display/overlay'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await readPayload(response);
  if (!response.ok || payload.ok === false) {
    throw failureFrom(payload, "Couldn't open or close the flight panel on the wall.");
  }
  return payload;
}

export function openFlightOverlay({ flightNid, oprId }) {
  return postOverlay({ action: 'open', flightNid, oprId });
}

export function closeFlightOverlay() {
  return postOverlay({ action: 'close' });
}

export async function fetchFlightInfo({ flightNid, oprId }) {
  const params = new URLSearchParams({ flightNid: String(flightNid) });
  if (oprId) params.set('oprId', oprId);
  return fetchJson(`/api/flight-info?${params.toString()}`, "Couldn't load the flight details.");
}

// ── Alert scanner (Feature 6) ───────────────────────────────────────────────

export async function fetchAlertFindings({ includeInactive = false } = {}) {
  const params = new URLSearchParams({ includeInactive: includeInactive ? 'true' : 'false' });
  return fetchJson(`/api/alerts/findings?${params.toString()}`, "Couldn't load the NOTAM findings.");
}

export async function fetchAlertRules() {
  return fetchJson('/api/alerts/rules', "Couldn't load the NOTAM rules.");
}

export async function saveAlertRules(rules) {
  const response = await fetch(buildApiUrl('/api/alerts/rules'), {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ rules }),
  });
  const payload = await readPayload(response);
  if (!response.ok || payload.ok === false) {
    throw failureFrom(payload, "Couldn't save the NOTAM rules.");
  }
  return payload;
}

// ── Daily NOTAM check (wall sign + per-airport acknowledgments) ────────────

export async function fetchNotamCheckToday() {
  return fetchJson('/api/notam-check/today', "Couldn't load the NOTAM check.");
}

export async function ackNotamCheck(icao) {
  const response = await fetch(buildApiUrl('/api/notam-check/ack'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ icao }),
  });
  const payload = await readPayload(response);
  if (!response.ok || payload.ok === false) {
    throw failureFrom(payload, `Couldn't save the check for ${icao}.`);
  }
  return payload;
}

export async function runNotamCheck() {
  const response = await fetch(buildApiUrl('/api/notam-check/run'), { method: 'POST' });
  const payload = await readPayload(response);
  if (!response.ok || payload.ok === false) {
    throw failureFrom(payload, "Couldn't run the NOTAM check.");
  }
  return payload;
}

export async function resyncNotamCheckAirport(icao) {
  const response = await fetch(buildApiUrl('/api/notam-check/resync'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ icao }),
  });
  const payload = await readPayload(response);
  if (!response.ok || payload.ok === false) {
    throw failureFrom(payload, `Couldn't resync ${icao}.`);
  }
  return payload;
}

export async function triggerAlertScan() {
  const response = await fetch(buildApiUrl('/api/alerts/scan'), { method: 'POST' });
  const payload = await readPayload(response);
  if (!response.ok) {
    throw failureFrom(payload, "Couldn't run the NOTAM scan.");
  }
  return payload;
}

// ── Console-initiated AIP/GEN send (emailed to the signed-in user) ─────────

/** Info-tab acknowledgement: per flight + per type ('all' for everything). */
export async function postFlightCheck({ flightNid, oprId, types, checked = true }) {
  const response = await fetch(buildApiUrl('/api/flight-checks'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ flightNid, oprId, types, checked }),
  });
  const payload = await readPayload(response);
  if (!response.ok || payload.ok === false) throw failureFrom(payload, "Couldn't save the check.");
  return payload;
}

export async function sendFlightDocs({ flightNid, oprId, airports, docs }) {
  const response = await fetch(buildApiUrl('/api/aip/send'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ flightNid, oprId, airports, docs }),
  });
  const payload = await readPayload(response);
  if (!response.ok || payload.ok === false) {
    throw failureFrom(payload, "Couldn't start sending the documents.");
  }
  return payload;
}

export async function fetchAipSendJob(jobId) {
  return fetchJson(`/api/aip/send/${encodeURIComponent(jobId)}`, "Couldn't load the document send.");
}

export function aipPdfUrl(icao) {
  return buildApiUrl(`/api/aip-pdf?icao=${encodeURIComponent(String(icao || '').toUpperCase())}`);
}

export async function fetchAircraftSchedule() {
  // refresh=false: the backend's own poll keeps the cache current; forcing
  // a Leon sync from every Aircraft-page visit fed the rate limit.
  return fetchJson('/api/aircraft/schedule?days=7&refresh=false', "Couldn't load the aircraft.");
}

export async function setAircraftVisibility({ oprId, registration, enabled }) {
  const response = await fetch(buildApiUrl('/api/aircraft/visibility'), {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      oprId,
      registration,
      isHidden: !enabled,
    }),
  });
  const payload = await readPayload(response);
  if (!response.ok || payload.ok === false) {
    throw failureFrom(payload, "Couldn't change whether this aircraft is shown.");
  }
  return payload;
}

export async function deleteAircraft({ oprId, registration }) {
  const response = await fetch(buildApiUrl('/api/aircraft'), {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ oprId, registration }),
  });
  const payload = await readPayload(response);
  if (!response.ok || payload.ok === false) {
    throw failureFrom(payload, "Couldn't delete the aircraft.");
  }
  return payload;
}

export async function fetchOperators({ includeInactive = true } = {}) {
  const query = new URLSearchParams({
    includeInactive: includeInactive ? 'true' : 'false',
  });
  return fetchJson(`/api/operators?${query.toString()}`, "Couldn't load the operators.");
}

export async function upsertOperator({ name, oprId, refreshToken, isActive = true }) {
  const response = await fetch(buildApiUrl('/api/operators'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, oprId, refreshToken, isActive }),
  });
  const payload = await readPayload(response);
  if (!response.ok || payload.ok === false) {
    throw failureFrom(payload, "Couldn't save the operator.");
  }
  return payload;
}

export async function setOperatorActive(id, isActive) {
  const response = await fetch(buildApiUrl(`/api/operators/${encodeURIComponent(id)}`), {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ isActive }),
  });
  const payload = await readPayload(response);
  if (!response.ok || payload.ok === false) {
    throw failureFrom(payload, "Couldn't update the operator.");
  }
  return payload;
}

/**
 * Edit a saved operator (name / oprId / refresh token). The token is
 * write-only: pass a non-empty string to replace it, omit or blank to keep
 * the stored one. Response flags `webhooksNeedReregister` when the change
 * invalidates Leon webhook registrations (token rotation / tenant change).
 */
export async function updateOperator(id, { name, oprId, refreshToken } = {}) {
  const body = {};
  if (name !== undefined) body.name = name;
  if (oprId !== undefined) body.oprId = oprId;
  if (refreshToken) body.refreshToken = refreshToken;
  const response = await fetch(buildApiUrl(`/api/operators/${encodeURIComponent(id)}`), {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await readPayload(response);
  if (!response.ok || payload.ok === false) {
    throw failureFrom(payload, "Couldn't update the operator.");
  }
  return payload;
}

export async function deleteOperator(id) {
  const response = await fetch(buildApiUrl(`/api/operators/${encodeURIComponent(id)}`), {
    method: 'DELETE',
  });
  const payload = await readPayload(response);
  if (!response.ok || payload.ok === false) {
    throw failureFrom(payload, "Couldn't delete the operator.");
  }
  return payload;
}

export async function fetchWebhooks({ refresh = false } = {}) {
  return fetchJson(`/api/webhooks${refresh ? '?refresh=true' : ''}`, "Couldn't load the webhooks.");
}

export async function fetchWebhookLog(oprId, event) {
  const params = new URLSearchParams({ opr: oprId, event });
  return fetchJson(`/api/webhooks/log?${params.toString()}`, "Couldn't load the webhook log.");
}

export async function toggleWebhook({ oprId, event, enabled }) {
  const response = await fetch(buildApiUrl('/api/webhooks/toggle'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ oprId, event, enabled }),
  });
  const payload = await readPayload(response);
  if (!response.ok || payload.ok === false) {
    throw failureFrom(payload, "Couldn't change the webhook.");
  }
  return payload;
}

export async function reregisterWebhooks(oprId) {
  const response = await fetch(buildApiUrl('/api/webhooks/reregister'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ oprId }),
  });
  const payload = await readPayload(response);
  if (!response.ok || payload.ok === false) {
    throw failureFrom(payload, "Couldn't re-register the webhooks.");
  }
  return payload;
}

export async function deleteWebhook(oprId, label) {
  const response = await fetch(buildApiUrl(`/api/webhooks/${encodeURIComponent(label)}?oprId=${encodeURIComponent(oprId)}`), {
    method: 'DELETE',
  });
  const payload = await readPayload(response);
  if (!response.ok || payload.ok === false) {
    throw failureFrom(payload, "Couldn't delete the webhook.");
  }
  return payload;
}

export async function fetchCaa({ withMatches = false } = {}) {
  const params = new URLSearchParams({ includeInactive: 'true' });
  if (withMatches) params.set('withMatches', 'true');
  return fetchJson(`/api/caa?${params.toString()}`, "Couldn't load the CAA details.");
}

export async function upsertCaa(entry) {
  const response = await fetch(buildApiUrl('/api/caa'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(entry || {}),
  });
  const payload = await readPayload(response);
  if (!response.ok || payload.ok === false) {
    throw failureFrom(payload, "Couldn't save the CAA entry.");
  }
  return payload;
}

export async function updateCaa(id, patch) {
  const response = await fetch(buildApiUrl(`/api/caa/${encodeURIComponent(id)}`), {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch || {}),
  });
  const payload = await readPayload(response);
  if (!response.ok || payload.ok === false) {
    throw failureFrom(payload, "Couldn't update the CAA entry.");
  }
  return payload;
}

export async function setCaaActive(id, isActive) {
  return updateCaa(id, { isActive });
}

export async function deleteCaa(id) {
  const response = await fetch(buildApiUrl(`/api/caa/${encodeURIComponent(id)}`), { method: 'DELETE' });
  const payload = await readPayload(response);
  if (!response.ok || payload.ok === false) {
    throw failureFrom(payload, "Couldn't delete the CAA entry.");
  }
  return payload;
}

export async function fetchLimitations({ withMatches = false } = {}) {
  const params = new URLSearchParams({ includeInactive: 'true' });
  if (withMatches) params.set('withMatches', 'true');
  return fetchJson(`/api/timeline/limitations?${params.toString()}`, "Couldn't load the limitations.");
}

export async function fetchSyncStatus() {
  return fetchJson('/api/timeline/sync-status', "Couldn't load the sync status.");
}

export async function forceTimelineRefresh() {
  const response = await fetch(buildApiUrl('/api/timeline/refresh'), { method: 'POST' });
  const payload = await readPayload(response);
  if (!response.ok || payload.ok === false) {
    throw failureFrom(payload, "Couldn't start a Leon sync.");
  }
  return payload;
}

// ── Important entries (class IMP) ───────────────────────────────────────────

export async function fetchImportant({ includeInactive = true, withMatches = false } = {}) {
  const params = new URLSearchParams({ includeInactive: includeInactive ? 'true' : 'false' });
  if (withMatches) params.set('withMatches', 'true');
  return fetchJson(`/api/important?${params.toString()}`, "Couldn't load the Important entries.");
}

export async function upsertImportant(entry) {
  const response = await fetch(buildApiUrl('/api/important'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(entry || {}),
  });
  const payload = await readPayload(response);
  if (!response.ok || payload.ok === false) {
    throw failureFrom(payload, "Couldn't save the Important entry.");
  }
  return payload;
}

export async function updateImportant(id, patch) {
  const response = await fetch(buildApiUrl(`/api/important/${encodeURIComponent(id)}`), {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch || {}),
  });
  const payload = await readPayload(response);
  if (!response.ok || payload.ok === false) {
    throw failureFrom(payload, "Couldn't update the Important entry.");
  }
  return payload;
}

export async function uploadImportantAttachment(id, file) {
  const dataBase64 = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(new ShownError("Couldn't read the file. Pick it again."));
    reader.readAsDataURL(file);
  });
  const response = await fetch(buildApiUrl(`/api/important/${encodeURIComponent(id)}/attachments`), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ filename: file.name, contentType: file.type || 'application/octet-stream', dataBase64 }),
  });
  const payload = await readPayload(response);
  if (!response.ok || payload.ok === false) {
    throw failureFrom(payload, "Couldn't upload the attachment.");
  }
  return payload;
}

export function importantAttachmentUrl(id, attachmentId) {
  return buildApiUrl(`/api/important/${encodeURIComponent(id)}/attachments/${encodeURIComponent(attachmentId)}`);
}

export async function deleteImportantAttachment(id, attachmentId) {
  const response = await fetch(importantAttachmentUrl(id, attachmentId), { method: 'DELETE' });
  const payload = await readPayload(response);
  if (!response.ok || payload.ok === false) {
    throw failureFrom(payload, "Couldn't delete the attachment.");
  }
  return payload;
}

export async function setImportantActive(id, isActive) {
  const response = await fetch(buildApiUrl(`/api/important/${encodeURIComponent(id)}`), {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ isActive }),
  });
  const payload = await readPayload(response);
  if (!response.ok || payload.ok === false) {
    throw failureFrom(payload, "Couldn't update the Important entry.");
  }
  return payload;
}

export async function deleteImportant(id) {
  const response = await fetch(buildApiUrl(`/api/important/${encodeURIComponent(id)}`), {
    method: 'DELETE',
  });
  const payload = await readPayload(response);
  if (!response.ok || payload.ok === false) {
    throw failureFrom(payload, "Couldn't delete the Important entry.");
  }
  return payload;
}

export async function searchAirports(query, limit = 30) {
  const q = String(query || '').trim();
  const params = new URLSearchParams({ q, limit: String(limit) });
  return fetchJson(`/api/airports/search?${params.toString()}`, "Couldn't search the airports.");
}

export async function fetchCountries(query = '', limit = 200) {
  const q = String(query || '').trim();
  const params = new URLSearchParams({ q, limit: String(limit) });
  return fetchJson(`/api/countries?${params.toString()}`, "Couldn't load the countries.");
}

export async function upsertLimitation(input) {
  const response = await fetch(buildApiUrl('/api/timeline/limitations'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input || {}),
  });
  const payload = await readPayload(response);
  if (!response.ok || payload.ok === false) {
    throw failureFrom(payload, "Couldn't save the limitation.");
  }
  return payload;
}

export async function setLimitationActive(id, isActive) {
  const response = await fetch(buildApiUrl(`/api/timeline/limitations/${encodeURIComponent(id)}`), {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ isActive }),
  });
  const payload = await readPayload(response);
  if (!response.ok || payload.ok === false) {
    throw failureFrom(payload, "Couldn't update the limitation.");
  }
  return payload;
}

export async function deleteLimitation(id) {
  const response = await fetch(buildApiUrl(`/api/timeline/limitations/${encodeURIComponent(id)}`), {
    method: 'DELETE',
  });
  const payload = await readPayload(response);
  if (!response.ok || payload.ok === false) {
    throw failureFrom(payload, "Couldn't delete the limitation.");
  }
  return payload;
}

