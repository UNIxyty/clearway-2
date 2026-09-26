// The wall's flight RECORD — one board flight plus the row context it sits on.
//
// The board (opsboard-react timelineApi.mapFlight) is fed by
// /api/timeline/flights: aircraft GROUPS ({ oprId, operatorName, registration,
// acftTypeIcao, … }) each carrying DECORATED flights (leon-sync mapLeonFlight
// → decorateFlightWithLimitations: times, movement state, trip status,
// limitations/IMP/CAA/NTM/WX markers, per-flight checks). A flight on its own
// does not know its operator name, registration or aircraft type — the group
// does — which is why anything that lifts a flight OUT of the board needs the
// two joined.
//
// This module is that join and nothing more. The decorated flight is carried
// VERBATIM under `flight` (no renamed fields, no second representation); the
// record adds only the group context and the wall's identity key
// "<oprId>:<flightNid>" (the same id the board and the console use).
//
// Pure, dependency-free and shared: the wall's /api/flights/normalized
// endpoint builds records with it, and the agent service imports the same file
// (agent/Dockerfile copies it alongside mailer.mjs) so both read one shape.

export const FLIGHT_RECORD_VERSION = 1;

/** The wall's flight identity, as the board and console key it. */
export function flightKey(oprId, flightNid) {
  return `${oprId || "unknown"}:${flightNid ?? ""}`;
}

/** Split "<oprId>:<flightNid>" (or a bare nid) into its parts. */
export function splitFlightKey(value) {
  const raw = String(value ?? "").trim();
  const idx = raw.lastIndexOf(":");
  if (idx > 0) return { oprId: raw.slice(0, idx), flightNid: raw.slice(idx + 1) };
  return { oprId: "", flightNid: raw };
}

/** One record: the decorated flight verbatim plus its aircraft-group context. */
export function flightRecord(flight, group = {}) {
  const oprId = String(group?.oprId ?? flight?.oprId ?? "") || null;
  const flightNid = flight?.flightNid != null ? String(flight.flightNid) : null;
  return {
    key: flightKey(oprId, flightNid),
    oprId,
    flightNid,
    operatorName: group?.operatorName ?? flight?.operatorName ?? oprId,
    registration: group?.registration ?? flight?.aircraftRegistration ?? null,
    aircraftNid: group?.aircraftNid ?? null,
    acftTypeIcao: group?.acftTypeIcao ?? null,
    acftTypeShortName: group?.acftTypeShortName ?? null,
    defaultIcaoType: group?.defaultIcaoType ?? null,
    flight,
  };
}

/** Flatten a /api/timeline/flights (or /api/upcoming/flights) payload. */
export function flightRecordsFromTimeline(payload) {
  const out = [];
  for (const group of Array.isArray(payload?.aircraft) ? payload.aircraft : []) {
    for (const flight of group?.flights ?? []) out.push(flightRecord(flight, group));
  }
  return out;
}

const upper = (value) => String(value ?? "").trim().toUpperCase();

/**
 * NOTAM check state for one record, from the wall's own state: the daily
 * NOTAM check (per airport, /api/notam-check/today's publicState), this
 * flight's "Checked" ack for NOTAMs (flight.checks.ntm), and the unreviewed
 * NTM markers the decorator attached (limitations of type "NTM"). Nothing is
 * derived that the wall does not already show.
 */
export function notamCheckState(record, notamState) {
  const flight = record?.flight ?? {};
  const airports = Array.isArray(notamState?.airports) ? notamState.airports : null;
  const side = (icao) => {
    const code = upper(icao) || null;
    if (!code) return null;
    const entry = airports ? airports.find((a) => upper(a?.icao) === code) : null;
    return {
      icao: code,
      inTodaysCheck: airports ? Boolean(entry) : null,
      checked: entry?.checked ?? null,
      error: entry?.error ?? null,
    };
  };
  const unreviewed = [
    ...new Set(
      (Array.isArray(flight.limitations) ? flight.limitations : [])
        .filter((l) => l?.type === "NTM")
        .map((l) => upper(l.icao))
        .filter(Boolean)
    ),
  ];
  return {
    day: notamState?.day ?? null,
    sign: notamState?.sign ?? null,
    dep: side(flight.adep?.icao),
    arr: side(flight.ades?.icao),
    flightAck: flight.checks?.ntm ?? null,
    unreviewed,
  };
}

/** UTC calendar day → [from, to] ISO bounds (inclusive end of day). */
export function dayBounds(date) {
  const day = String(date ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const from = new Date(`${day}T00:00:00.000Z`);
  if (Number.isNaN(from.getTime())) return null;
  return { from: from.toISOString(), to: new Date(`${day}T23:59:59.999Z`).toISOString() };
}

/**
 * Filter records. Every filter is optional and they AND together.
 *   key          "<oprId>:<flightNid>" or bare nid
 *   oprId        operator id (exact, case-insensitive)
 *   operator     operator id OR name substring
 *   icao         departure or arrival
 *   adep / ades  one side only
 *   registration exact, dash-insensitive
 *   callsign     flightNo substring
 *   status       movement state (scheduled|delayed|ctot|airborne|arrived),
 *                "cancelled", or trip status (CONFIRMED|OPTION|OPPORTUNITY)
 *   trip         trip number or trip code (exact)
 */
export function filterFlightRecords(records, filters = {}) {
  const f = filters ?? {};
  const key = f.key ? splitFlightKey(f.key) : null;
  const oprId = f.oprId ? String(f.oprId).trim().toLowerCase() : null;
  const operator = f.operator ? String(f.operator).trim().toLowerCase() : null;
  const icao = f.icao ? upper(f.icao) : null;
  const adep = f.adep ? upper(f.adep) : null;
  const ades = f.ades ? upper(f.ades) : null;
  const reg = f.registration ? upper(f.registration).replace(/-/g, "") : null;
  const cs = f.callsign ? upper(f.callsign).replace(/\s+/g, "") : null;
  const status = f.status ? String(f.status).trim().toLowerCase() : null;
  const trip = f.trip != null && String(f.trip).trim() ? String(f.trip).trim().toUpperCase() : null;

  return records.filter((r) => {
    const fl = r.flight ?? {};
    if (key) {
      if (String(r.flightNid) !== key.flightNid) return false;
      if (key.oprId && String(r.oprId ?? "").toLowerCase() !== key.oprId.toLowerCase()) return false;
    }
    if (oprId && String(r.oprId ?? "").toLowerCase() !== oprId) return false;
    if (operator && String(r.oprId ?? "").toLowerCase() !== operator && !String(r.operatorName ?? "").toLowerCase().includes(operator)) return false;
    const dep = upper(fl.adep?.icao);
    const arr = upper(fl.ades?.icao);
    if (icao && dep !== icao && arr !== icao) return false;
    if (adep && dep !== adep) return false;
    if (ades && arr !== ades) return false;
    if (reg && upper(r.registration).replace(/-/g, "") !== reg) return false;
    if (cs && !upper(fl.flightNo).replace(/\s+/g, "").includes(cs)) return false;
    if (status) {
      const movement = String(fl.movementState ?? "").toLowerCase();
      const tripStatus = String(fl.tripStatus ?? fl.status ?? "").toLowerCase();
      const cancelled = fl.isCnl === true;
      const ok = status === "cancelled" ? cancelled : !cancelled && (movement === status || tripStatus === status);
      if (!ok) return false;
    }
    if (trip && upper(fl.tripNo) !== trip && upper(fl.tripCode) !== trip) return false;
    return true;
  });
}

/** Chronological (scheduled departure), the board's own ordering. */
export function sortFlightRecords(records) {
  const t = (r) => {
    const ms = Date.parse(r?.flight?.startTimeUTC ?? "");
    return Number.isFinite(ms) ? ms : Number.MAX_SAFE_INTEGER;
  };
  return [...records].sort((a, b) => t(a) - t(b));
}
