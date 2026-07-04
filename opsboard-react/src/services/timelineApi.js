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
    return { status: 'error', error: error instanceof Error ? error.message : String(error) };
  }
  if (response.status === 401) return { status: 'unauthorized' };
  let payload = {};
  try {
    payload = await response.json();
  } catch {
    /* non-JSON error page */
  }
  if (!response.ok) {
    return { status: 'error', error: payload.error || `Auth check failed (${response.status})` };
  }
  return { status: 'ok', user: payload.user || payload, authEnabled: payload.authEnabled !== false };
}

async function fetchJson(pathWithQuery, errorPrefix) {
  let response;
  try {
    response = await fetch(buildApiUrl(pathWithQuery));
  } catch (error) {
    throw new Error(
      `${errorPrefix}: ${error instanceof Error ? error.message : String(error)}. ` +
      `Check VITE_API_BASE_URL="${RAW_API_BASE || '(empty)'}".`
    );
  }
  const payload = await response.json();
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `${errorPrefix} (${response.status})`);
  }
  return payload;
}

function toDate(value) {
  const dt = new Date(value);
  return Number.isFinite(dt.getTime()) ? dt : null;
}

function toHm(value) {
  const dt = toDate(value);
  if (!dt) return null;
  const hh = String(dt.getUTCHours()).padStart(2, '0');
  const mm = String(dt.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function statusFromFlight(flight) {
  if (flight?.isCnl) return 'slot';
  if (flight?.ata) return 'arrived';
  if (flight?.atd) return 'airborne';
  if ((flight?.delayMin ?? 0) > 0) return 'delayed';
  if (flight?.status && /airborne/i.test(flight.status)) return 'airborne';
  if (flight?.status && /arrived/i.test(flight.status)) return 'arrived';
  return 'scheduled';
}

function toNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function mapFlight(flight) {
  const start = toDate(flight.etd || flight.startTimeUTC);
  const scheduledEnd = toDate(flight.eta || flight.endTimeUTC);
  const etd = toHm(start);
  const eta = toHm(scheduledEnd);
  const dep = flight.adep?.icao || 'UNK';
  const arr = flight.ades?.icao || 'UNK';
  const depDelayMin = Math.max(0, toNumber(flight.departureDelayMin, toNumber(flight.delayMin, 0)));
  const arrDelayMin = Math.max(0, toNumber(flight.arrivalDelayMin, toNumber(flight.delayMin, 0)));

  if (!start || !scheduledEnd || !etd || !eta) return null;
  const delayedDep = toDate(flight.delayedDepartureUTC) || new Date(start.getTime() + depDelayMin * 60_000);
  const delayedArr = toDate(flight.delayedArrivalUTC) || new Date(scheduledEnd.getTime() + arrDelayMin * 60_000);

  return {
    fn: flight.flightNo || 'UNKNOWN',
    dep,
    arr,
    etd,
    eta,
    dlyMin: Math.max(depDelayMin, arrDelayMin),
    depDelayMin,
    arrDelayMin,
    status: statusFromFlight(flight),
    startUtcMs: start.getTime(),
    delayedStartUtcMs: delayedDep.getTime(),
    scheduledEndUtcMs: scheduledEnd.getTime(),
    endUtcMs: delayedArr.getTime(),
    limitationIds: Array.isArray(flight.limitationIds) ? flight.limitationIds : [],
    limitations: Array.isArray(flight.limitations) ? flight.limitations : [],
  };
}

function mapAircraft(group) {
  const mappedFlights = (group.flights || []).map(mapFlight).filter(Boolean);
  if (mappedFlights.length === 0) return null;
  return {
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

  const payload = await fetchJson(`/api/timeline/flights?${query.toString()}`, 'Timeline request failed');
  const limitationsPayload = await fetchJson(
    '/api/timeline/limitations?includeInactive=false',
    'Limitations request failed'
  ).catch(() => ({ limitations: [] }));

  const aircraft = (payload.aircraft || []).map(mapAircraft).filter(Boolean);
  return {
    source: payload.source || 'unknown',
    totalAircraft: aircraft.length,
    aircraft,
    limitations: limitationsPayload.limitations || [],
    windowStartUtc: from.toISOString(),
    windowEndUtc: to.toISOString(),
  };
}

export async function fetchDisplayClocks() {
  return fetchJson('/api/display/clocks', 'Clocks request failed');
}

export async function saveDisplayClocks(clocks) {
  const response = await fetch(buildApiUrl('/api/display/clocks'), {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ clocks }),
  });
  const payload = await response.json();
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `Failed to save clocks (${response.status})`);
  }
  return payload;
}

/**
 * Raw (unmapped) timeline feed for the Console's flight list — keeps every
 * backend field (flightNid, timings, delays, limitations) that the board
 * mapping strips.
 */
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
  return fetchJson(`/api/timeline/flights?${query.toString()}`, 'Timeline request failed');
}

// ── Presence + remote overlay (Feature 5) ───────────────────────────────────

export async function fetchPresence() {
  return fetchJson('/api/presence', 'Presence request failed');
}

export async function fetchOverlay() {
  return fetchJson('/api/display/overlay', 'Overlay state request failed');
}

async function postOverlay(body) {
  const response = await fetch(buildApiUrl('/api/display/overlay'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `Overlay command failed (${response.status})`);
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
  return fetchJson(`/api/flight-info?${params.toString()}`, 'Flight info request failed');
}

// ── Alert scanner (Feature 6) ───────────────────────────────────────────────

export async function fetchAlertFindings({ includeInactive = false } = {}) {
  const params = new URLSearchParams({ includeInactive: includeInactive ? 'true' : 'false' });
  return fetchJson(`/api/alerts/findings?${params.toString()}`, 'Alert findings request failed');
}

export async function fetchAlertRules() {
  return fetchJson('/api/alerts/rules', 'Alert rules request failed');
}

export async function saveAlertRules(rules) {
  const response = await fetch(buildApiUrl('/api/alerts/rules'), {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ rules }),
  });
  const payload = await response.json();
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `Failed to save alert rules (${response.status})`);
  }
  return payload;
}

// ── Daily NOTAM check (wall sign + per-airport acknowledgments) ────────────

export async function fetchNotamCheckToday() {
  return fetchJson('/api/notam-check/today', 'NOTAM check request failed');
}

export async function ackNotamCheck(icao) {
  const response = await fetch(buildApiUrl('/api/notam-check/ack'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ icao }),
  });
  const payload = await response.json();
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `Failed to acknowledge ${icao} (${response.status})`);
  }
  return payload;
}

export async function runNotamCheck() {
  const response = await fetch(buildApiUrl('/api/notam-check/run'), { method: 'POST' });
  const payload = await response.json();
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `Failed to run NOTAM check (${response.status})`);
  }
  return payload;
}

export async function triggerAlertScan() {
  const response = await fetch(buildApiUrl('/api/alerts/scan'), { method: 'POST' });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || `Failed to run alert scan (${response.status})`);
  }
  return payload;
}

// ── Console-initiated AIP/GEN send (emailed to the signed-in user) ─────────

export async function sendFlightDocs({ flightNid, oprId, airports, docs }) {
  const response = await fetch(buildApiUrl('/api/aip/send'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ flightNid, oprId, airports, docs }),
  });
  const payload = await response.json();
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `Failed to start document send (${response.status})`);
  }
  return payload;
}

export async function fetchAipSendJob(jobId) {
  return fetchJson(`/api/aip/send/${encodeURIComponent(jobId)}`, 'Send job request failed');
}

export function aipPdfUrl(icao) {
  return buildApiUrl(`/api/aip-pdf?icao=${encodeURIComponent(String(icao || '').toUpperCase())}`);
}

export async function fetchAircraftSchedule() {
  return fetchJson('/api/aircraft/schedule?days=7&refresh=true', 'Aircraft request failed');
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
  const payload = await response.json();
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `Failed to update aircraft visibility (${response.status})`);
  }
  return payload;
}

export async function fetchOperators({ includeInactive = true } = {}) {
  const query = new URLSearchParams({
    includeInactive: includeInactive ? 'true' : 'false',
  });
  return fetchJson(`/api/operators?${query.toString()}`, 'Operators request failed');
}

export async function upsertOperator({ name, oprId, refreshToken, isActive = true }) {
  const response = await fetch(buildApiUrl('/api/operators'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, oprId, refreshToken, isActive }),
  });
  const payload = await response.json();
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `Failed to save operator (${response.status})`);
  }
  return payload;
}

export async function setOperatorActive(id, isActive) {
  const response = await fetch(buildApiUrl(`/api/operators/${encodeURIComponent(id)}`), {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ isActive }),
  });
  const payload = await response.json();
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `Failed to update operator (${response.status})`);
  }
  return payload;
}

export async function fetchLimitations({ withMatches = false } = {}) {
  const params = new URLSearchParams({ includeInactive: 'true' });
  if (withMatches) params.set('withMatches', 'true');
  return fetchJson(`/api/timeline/limitations?${params.toString()}`, 'Limitations request failed');
}

export async function fetchSyncStatus() {
  return fetchJson('/api/timeline/sync-status', 'Sync status request failed');
}

export async function forceTimelineRefresh() {
  const response = await fetch(buildApiUrl('/api/timeline/refresh'), { method: 'POST' });
  const payload = await response.json();
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `Failed to trigger sync (${response.status})`);
  }
  return payload;
}

// ── Important entries (class IMP) ───────────────────────────────────────────

export async function fetchImportant({ includeInactive = true, withMatches = false } = {}) {
  const params = new URLSearchParams({ includeInactive: includeInactive ? 'true' : 'false' });
  if (withMatches) params.set('withMatches', 'true');
  return fetchJson(`/api/important?${params.toString()}`, 'Important request failed');
}

export async function upsertImportant(entry) {
  const response = await fetch(buildApiUrl('/api/important'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(entry || {}),
  });
  const payload = await response.json();
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `Failed to save Important entry (${response.status})`);
  }
  return payload;
}

export async function setImportantActive(id, isActive) {
  const response = await fetch(buildApiUrl(`/api/important/${encodeURIComponent(id)}`), {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ isActive }),
  });
  const payload = await response.json();
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `Failed to update Important entry (${response.status})`);
  }
  return payload;
}

export async function deleteImportant(id) {
  const response = await fetch(buildApiUrl(`/api/important/${encodeURIComponent(id)}`), {
    method: 'DELETE',
  });
  const payload = await response.json();
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `Failed to delete Important entry (${response.status})`);
  }
  return payload;
}

export async function searchAirports(query, limit = 30) {
  const q = String(query || '').trim();
  const params = new URLSearchParams({ q, limit: String(limit) });
  return fetchJson(`/api/airports/search?${params.toString()}`, 'Airport search failed');
}

export async function fetchCountries(query = '', limit = 200) {
  const q = String(query || '').trim();
  const params = new URLSearchParams({ q, limit: String(limit) });
  return fetchJson(`/api/countries?${params.toString()}`, 'Countries request failed');
}

export async function upsertLimitation(input) {
  const response = await fetch(buildApiUrl('/api/timeline/limitations'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input || {}),
  });
  const payload = await response.json();
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `Failed to save limitation (${response.status})`);
  }
  return payload;
}

export async function setLimitationActive(id, isActive) {
  const response = await fetch(buildApiUrl(`/api/timeline/limitations/${encodeURIComponent(id)}`), {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ isActive }),
  });
  const payload = await response.json();
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `Failed to update limitation (${response.status})`);
  }
  return payload;
}

export async function deleteLimitation(id) {
  const response = await fetch(buildApiUrl(`/api/timeline/limitations/${encodeURIComponent(id)}`), {
    method: 'DELETE',
  });
  const payload = await response.json();
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `Failed to delete limitation (${response.status})`);
  }
  return payload;
}

