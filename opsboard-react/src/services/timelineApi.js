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
  // new Date(null) is the 1970 epoch, not Invalid Date — a null ATD/ATA
  // must NOT read as "00:00" (it broke every has-actual-time check).
  if (value == null || value === '') return null;
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

// Pill fill state. The backend derives movementState from real Leon
// semantics (flight watch movement chain, CTOT, delay — see
// digital-wall/LEON-PILL-MAPPING.md); older cached flights without it fall
// back to a client-side derivation.
function statusFromFlight(flight) {
  if (flight?.isCnl) return 'cancelled';
  if (flight?.movementState) return flight.movementState;
  if (flight?.ata) return 'arrived';
  if (flight?.atd) return 'airborne';
  if ((flight?.delayMin ?? 0) > 0) return 'delayed';
  return 'scheduled';
}

function toNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function mapFlight(flight, group) {
  // ── Ops timing rules (bug report 7-9) ─────────────────────────────────
  // Initial schedule = STD/STA. Actual = T/O (departure) and LDG (arrival).
  // Departure display precedence: T/O beats everything; otherwise the
  // LATER of CTOT and ETD; plain STD when no flight-watch estimate exists.
  // Arrival display: LDG once landed; ETA once airborne (or estimated).
  // BLOFF is never displayed. Deltas vs schedule are SIGNED — early shows
  // as a negative difference, not just delays.
  const stdMs = toDate(flight.startTimeUTC)?.getTime();
  const staMs = toDate(flight.endTimeUTC)?.getTime();
  if (!Number.isFinite(stdMs) || !Number.isFinite(staMs)) return null;
  // Sanity clamp (stale epoch bugs once produced -29645850 min deltas):
  // any instant >48h from its scheduled anchor is unusable.
  const sane = (value, refMs) => {
    const ms = toDate(value)?.getTime();
    return Number.isFinite(ms) && Math.abs(ms - refMs) <= 48 * 3600_000 ? ms : null;
  };
  const toMs = sane(flight.takeOffUTC, stdMs);
  const ldgMs = sane(flight.landingUTC, staMs);
  const ctotMs = sane(flight.ctotUTC, stdMs);
  const etdMs = sane(flight.etd, stdMs) ?? stdMs;
  const etaMs = sane(flight.eta, staMs) ?? staMs;

  // Stale-estimate guard (bug report 2, item 4): a flight-watch ETD more
  // than 30 min BEFORE the schedule on a not-yet-departed flight is almost
  // always a leftover from re-planning (real case: 'ETD 07:00 -120' with a
  // backwards hatch). Real early departures still show through T/O, which
  // is actual data and always wins.
  const etdEffMs = toMs == null && etdMs < stdMs - 30 * 60_000 ? stdMs : etdMs;

  let depKind;
  let depDisplayMs;
  if (toMs != null) {
    depKind = 'T/O';
    depDisplayMs = toMs;
  } else if (ctotMs != null || etdEffMs !== stdMs) {
    // CTOT and ETD are EQUAL priority — the LATER (bigger) one is shown.
    depDisplayMs = Math.max(ctotMs ?? -Infinity, etdEffMs);
    depKind = ctotMs != null && ctotMs >= etdEffMs ? 'CTOT' : 'ETD';
  } else {
    depKind = 'STD';
    depDisplayMs = stdMs;
  }
  const depDeltaMin = Math.round((depDisplayMs - stdMs) / 60_000);

  // Arrival: explicit data wins; otherwise PROJECT the schedule's elapsed
  // time (EET = STA - STD) onto the displayed departure, so a delayed or
  // early flight keeps its real duration instead of being squashed against
  // the old STA (the giant-hatch/sliver bug).
  let arrKind;
  let arrDisplayMs;
  if (ldgMs != null) {
    arrKind = 'LDG';
    arrDisplayMs = ldgMs;
  } else if (etaMs !== staMs) {
    arrKind = 'ETA';
    arrDisplayMs = etaMs;
  } else if (toMs != null || depDeltaMin !== 0) {
    arrKind = 'ETA';
    arrDisplayMs = staMs + depDeltaMin * 60_000;
  } else {
    arrKind = 'STA';
    arrDisplayMs = staMs;
  }
  const arrDeltaMin = Math.round((arrDisplayMs - staMs) / 60_000);

  // Ops model, REVERSED in bug report 3 (their newest mockups): the hatch
  // LEADS the body — it spans schedule→actual departure (STD→T/O), and the
  // coloured body runs from the actual departure to the arrival. No
  // trailing tail; arrival differences show through the signed label.
  const spanStartMs = Math.min(stdMs, depDisplayMs);
  const hatchDepEndMs = depDisplayMs; // leading hatch = [STD, actual dep] when delayed
  const solidEndMs = Math.max(arrDisplayMs, depDisplayMs + 5 * 60_000);
  const spanEndMs = solidEndMs;

  const start = new Date(spanStartMs);
  const scheduledEnd = new Date(solidEndMs);
  const etd = toHm(new Date(stdMs));
  const eta = toHm(new Date(staMs));
  const dep = flight.adep?.icao || 'UNK';
  const arr = flight.ades?.icao || 'UNK';
  const depDelayMin = Math.max(depDeltaMin, 0);
  const arrDelayMin = Math.max(arrDeltaMin, 0);
  const delayedDep = new Date(hatchDepEndMs);
  const delayedArr = new Date(spanEndMs);

  const oprId = flight.oprId || group?.oprId || null;
  const flightNid = flight.flightNid != null ? String(flight.flightNid) : null;

  return {
    // Identity — flightNo repeats across many legs (JTY52W flies every jty
    // leg), so anything that needs to tell flights apart (React keys, lookups)
    // must use `id`, never `fn`. `fn` is display-only.
    id: flightNid
      ? `${oprId || 'opr'}:${flightNid}`
      : `${flight.flightNo || 'UNKNOWN'}|${dep}|${arr}|${start.getTime()}|${scheduledEnd.getTime()}`,
    flightNid,
    oprId,
    fn: flight.flightNo || 'UNKNOWN',
    // ICAO flight-type LETTER (S/N/G/M/X) — reserved chip beside the flight
    // ID. Falls back to the aircraft's default (Leon Aircraft tab field)
    // when the flight doesn't carry its own value.
    icaoType: flight.icaoType || group?.defaultIcaoType || null,
    dep,
    arr,
    etd,
    eta,
    // Actual times (Leon flightWatch/journey log) — the pill tags delayed
    // segments with ETD→ATD / ETA→ATA when these exist; null = not departed/
    // arrived yet, and the pill omits the tag rather than inventing a value.
    atdHm: toHm(flight.atd),
    ataHm: toHm(flight.ata),
    dlyMin: Math.max(depDelayMin, arrDelayMin),
    depDelayMin,
    arrDelayMin,
    // Ops timing display (exact rules): what to label each pill end with,
    // the value, and the SIGNED difference vs the initial schedule.
    depKind,
    arrKind,
    depHm: toHm(new Date(depDisplayMs)),
    arrHm: toHm(new Date(arrDisplayMs)),
    depDeltaMin,
    arrDeltaMin,
    status: statusFromFlight(flight),
    // Clock-derived estimate (no flight-watch data) — pill renders HOLLOW.
    estimated: flight.movementStateEstimated === true,
    // Leon-driven pill semantics (Part A):
    isConfirmed: flight.isConfirmed !== false,
    checklistColor: flight.checklistColor || null,
    ctot: flight.ctot || null,
    startUtcMs: start.getTime(),
    delayedStartUtcMs: delayedDep.getTime(),
    scheduledEndUtcMs: scheduledEnd.getTime(),
    endUtcMs: delayedArr.getTime(),
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

/** Item 3: registered display devices (viewport env + profile state). */
export async function fetchDisplayDevices() {
  return fetchJson('/api/display/devices', 'Devices request failed');
}

export async function renameDisplayDevice(deviceId, label) {
  const response = await fetch(buildApiUrl(`/api/display/devices/${encodeURIComponent(deviceId)}`), {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ label }),
  });
  const payload = await response.json();
  if (!response.ok || payload.ok === false) throw new Error(payload.error || 'Rename failed');
  return payload;
}

export async function resetProfile(account) {
  const response = await fetch(buildApiUrl(`/api/display/settings/profile/${encodeURIComponent(account)}`), {
    method: 'DELETE',
  });
  const payload = await response.json();
  if (!response.ok || payload.ok === false) throw new Error(payload.error || 'Reset failed');
  return payload;
}

/** Item 1: report this screen's rendering environment (fire-and-forget). */
export function reportDisplayEnv(body) {
  fetch(buildApiUrl('/api/display/env'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }).catch(() => {});
}

/** Console Reports (bug report item 13). */
export async function fetchReports({ status = '', category = '', q = '' } = {}) {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (category) params.set('category', category);
  if (q) params.set('q', q);
  const qs = params.toString();
  return fetchJson(`/api/reports${qs ? `?${qs}` : ''}`, 'Reports request failed');
}

async function jsonRequest(path, method, body) {
  const response = await fetch(buildApiUrl(path), {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const payload = await response.json();
  if (!response.ok || payload.ok === false) throw new Error(payload.error || `${method} ${path} failed (${response.status})`);
  return payload;
}

// Upcoming Flight Table (bug report 3 item 10): flat rows since 00:01 UTC,
// no visibility window. Colours come from Leon checklists — FLIGHT by the
// OPS aggregate, ADEP/ADES by the SLOT & HANDLING services for that side.
export async function fetchUpcomingFlights() {
  const payload = await fetchJson('/api/upcoming/flights', 'Upcoming flights request failed');
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
        etaHm: toHm(flight.eta ?? flight.endTimeUTC),
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
export const fetchDigestConfig = () => fetchJson('/api/notam-check/digest-config', 'Digest config request failed');
export const saveDigestConfig = (body) => jsonRequest('/api/notam-check/digest-config', 'PUT', body);

// Manual trigger of the daily 00:01 UTC flight-weather pull.
export const refreshFlightWeather = () => jsonRequest('/api/admin/refresh-flight-weather', 'POST', {});

export const createReport = (body) => jsonRequest('/api/reports', 'POST', body);
export const updateReport = (id, body) => jsonRequest(`/api/reports/${encodeURIComponent(id)}`, 'PATCH', body);
export const deleteReport = (id) => jsonRequest(`/api/reports/${encodeURIComponent(id)}`, 'DELETE');
export const sendReport = (id, to) => jsonRequest(`/api/reports/${encodeURIComponent(id)}/send`, 'POST', { to });
export const saveReportsConfig = (body) => jsonRequest('/api/reports/config', 'PUT', body);

export async function fetchDisplayClocks() {
  return fetchJson('/api/display/clocks', 'Clocks request failed');
}

// Settings are per ACCOUNT (the main ops wall signs in as
// ops@clearway.aero — its profile IS the big screen). No account argument
// = your own profile, resolved server-side from the session.
export async function fetchDisplaySettings(account) {
  const query = account ? `?account=${encodeURIComponent(account)}` : '';
  return fetchJson(`/api/display/settings${query}`, 'Display settings request failed');
}

export async function saveDisplaySettings(settings, account) {
  const response = await fetch(buildApiUrl('/api/display/settings'), {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ settings, ...(account ? { account } : {}) }),
  });
  const payload = await response.json();
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `Failed to save display settings (${response.status})`);
  }
  return payload;
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

export async function resyncNotamCheckAirport(icao) {
  const response = await fetch(buildApiUrl('/api/notam-check/resync'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ icao }),
  });
  const payload = await response.json();
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `Failed to resync ${icao} (${response.status})`);
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

/** Info-tab acknowledgement: per flight + per type ('all' for everything). */
export async function postFlightCheck({ flightNid, oprId, types, checked = true }) {
  const response = await fetch(buildApiUrl('/api/flight-checks'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ flightNid, oprId, types, checked }),
  });
  const payload = await response.json();
  if (!response.ok || payload.ok === false) throw new Error(payload.error || 'Check failed');
  return payload;
}

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
  // refresh=false: the backend's own poll keeps the cache current; forcing
  // a Leon sync from every Aircraft-page visit fed the rate limit.
  return fetchJson('/api/aircraft/schedule?days=7&refresh=false', 'Aircraft request failed');
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

export async function deleteAircraft({ oprId, registration }) {
  const response = await fetch(buildApiUrl('/api/aircraft'), {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ oprId, registration }),
  });
  const payload = await response.json();
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `Failed to delete aircraft (${response.status})`);
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
  const payload = await response.json();
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `Failed to update operator (${response.status})`);
  }
  return payload;
}

export async function deleteOperator(id) {
  const response = await fetch(buildApiUrl(`/api/operators/${encodeURIComponent(id)}`), {
    method: 'DELETE',
  });
  const payload = await response.json();
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `Failed to delete operator (${response.status})`);
  }
  return payload;
}

export async function fetchWebhooks({ refresh = false } = {}) {
  return fetchJson(`/api/webhooks${refresh ? '?refresh=true' : ''}`, 'Webhooks request failed');
}

export async function fetchWebhookLog(oprId, event) {
  const params = new URLSearchParams({ opr: oprId, event });
  return fetchJson(`/api/webhooks/log?${params.toString()}`, 'Webhook log request failed');
}

export async function toggleWebhook({ oprId, event, enabled }) {
  const response = await fetch(buildApiUrl('/api/webhooks/toggle'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ oprId, event, enabled }),
  });
  const payload = await response.json();
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `Failed to toggle webhook (${response.status})`);
  }
  return payload;
}

export async function reregisterWebhooks(oprId) {
  const response = await fetch(buildApiUrl('/api/webhooks/reregister'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ oprId }),
  });
  const payload = await response.json();
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `Failed to re-register webhooks (${response.status})`);
  }
  return payload;
}

export async function deleteWebhook(oprId, label) {
  const response = await fetch(buildApiUrl(`/api/webhooks/${encodeURIComponent(label)}?oprId=${encodeURIComponent(oprId)}`), {
    method: 'DELETE',
  });
  const payload = await response.json();
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `Failed to delete webhook (${response.status})`);
  }
  return payload;
}

export async function fetchCaa({ withMatches = false } = {}) {
  const params = new URLSearchParams({ includeInactive: 'true' });
  if (withMatches) params.set('withMatches', 'true');
  return fetchJson(`/api/caa?${params.toString()}`, 'CAA request failed');
}

export async function upsertCaa(entry) {
  const response = await fetch(buildApiUrl('/api/caa'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(entry || {}),
  });
  const payload = await response.json();
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `Failed to save CAA entry (${response.status})`);
  }
  return payload;
}

export async function updateCaa(id, patch) {
  const response = await fetch(buildApiUrl(`/api/caa/${encodeURIComponent(id)}`), {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch || {}),
  });
  const payload = await response.json();
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `Failed to update CAA entry (${response.status})`);
  }
  return payload;
}

export async function setCaaActive(id, isActive) {
  return updateCaa(id, { isActive });
}

export async function deleteCaa(id) {
  const response = await fetch(buildApiUrl(`/api/caa/${encodeURIComponent(id)}`), { method: 'DELETE' });
  const payload = await response.json();
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `Failed to delete CAA entry (${response.status})`);
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

export async function updateImportant(id, patch) {
  const response = await fetch(buildApiUrl(`/api/important/${encodeURIComponent(id)}`), {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch || {}),
  });
  const payload = await response.json();
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `Failed to update Important entry (${response.status})`);
  }
  return payload;
}

export async function uploadImportantAttachment(id, file) {
  const dataBase64 = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(new Error('Could not read the file.'));
    reader.readAsDataURL(file);
  });
  const response = await fetch(buildApiUrl(`/api/important/${encodeURIComponent(id)}/attachments`), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ filename: file.name, contentType: file.type || 'application/octet-stream', dataBase64 }),
  });
  const payload = await response.json();
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `Failed to upload attachment (${response.status})`);
  }
  return payload;
}

export function importantAttachmentUrl(id, attachmentId) {
  return buildApiUrl(`/api/important/${encodeURIComponent(id)}/attachments/${encodeURIComponent(attachmentId)}`);
}

export async function deleteImportantAttachment(id, attachmentId) {
  const response = await fetch(importantAttachmentUrl(id, attachmentId), { method: 'DELETE' });
  const payload = await response.json();
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `Failed to delete attachment (${response.status})`);
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

