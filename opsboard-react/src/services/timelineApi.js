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

function buildApiUrl(pathWithQuery) {
  if (!API_BASE) return pathWithQuery;
  return `${API_BASE}${pathWithQuery}`;
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
  const dlyMin = Math.max(0, toNumber(flight.delayMin, toNumber(flight.departureDelayMin, 0)));

  if (!start || !scheduledEnd || !etd || !eta) return null;
  const end = new Date(scheduledEnd.getTime() + dlyMin * 60_000);

  return {
    fn: flight.flightNo || 'UNKNOWN',
    dep,
    arr,
    etd,
    eta,
    dlyMin,
    status: statusFromFlight(flight),
    startUtcMs: start.getTime(),
    scheduledEndUtcMs: scheduledEnd.getTime(),
    endUtcMs: end.getTime(),
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

export async function fetchTimelineAircraft() {
  const now = new Date();
  // Ops window: 1 day before through next 3 days.
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1, 0, 0, 0));
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 4, 0, 0, 0));
  const query = new URLSearchParams({
    allOperators: 'true',
    refresh: 'true',
    from: from.toISOString(),
    to: to.toISOString(),
  });

  const payload = await fetchJson(`/api/timeline/flights?${query.toString()}`, 'Timeline request failed');

  const aircraft = (payload.aircraft || []).map(mapAircraft).filter(Boolean);
  return {
    source: payload.source || 'unknown',
    totalAircraft: aircraft.length,
    aircraft,
    windowStartUtc: from.toISOString(),
    windowEndUtc: to.toISOString(),
  };
}

export async function fetchAircraftSchedule() {
  return fetchJson('/api/aircraft/schedule?days=7&refresh=true', 'Aircraft request failed');
}

export async function fetchLimitations() {
  return fetchJson('/api/timeline/limitations', 'Limitations request failed');
}

