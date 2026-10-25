// The wall backend's half of client access (Stage 5, 2026-10-25): what a CLIENT may ask the wall, and what of the
// answer is theirs. Decided on the server for every request, before the handler, in server.mjs; the handlers stay
// as they are and their payloads are cut down here. Outside scope the answer is 404 — never 403, which would confirm
// a flight exists. Anything not in CLIENT_READS does not exist for a client (404), writes included.
import { flightInScope, hasSwitch } from "../../lib/clients/scope.mjs";

/** GET paths a client may call, with the switch each needs (null: always, for an approved client). */
export const CLIENT_READS = {
  "/api/health": null,
  "/api/users/me": null,
  "/api/stream": null,
  "/api/timeline/flights": "flight_board",
  "/api/flights/normalized": "flight_board",
  "/api/flights/data": "flight_board",
  "/api/upcoming/flights": "flight_board",
  "/api/timeline/aircraft": "flight_board",
  "/api/aircraft/schedule": "flight_board",
  "/api/flight-info": "flight_board",
  "/api/flight-checks": "flight_board",
  "/api/notam-check/today": "notam_check_status",
  "/api/timeline/limitations": "limitations",
  "/api/limitations": "limitations",
  "/api/important": "important",
  "/api/caa": "caa",
  "/api/aip-pdf": "documents",
  "/api/airports/search": "airport_search",
  "/api/geo/airports": "airport_search",
  "/api/geo/countries": "airport_search",
  "/api/countries": "airport_search",
  "/api/timeline/sync-status": "service_status",
};

/** The 404 a client gets for anything that is not theirs. One sentence, the same for a flight and for a page. */
export const NOT_ON_ACCOUNT = { ok: false, error: "That is not on your account." };

/** May this client call this path at all? Returns the reason it may not, or null. */
export function clientReadRefusal(scope, method, pathname) {
  if (method !== "GET" && method !== "HEAD") return "not-a-read";
  const path = pathname.replace(/\/+$/, "");
  if (!(path in CLIENT_READS)) return "not-in-their-world";
  const sw = CLIENT_READS[path];
  if (sw && !hasSwitch(scope, sw)) return "switch-off";
  return null;
}

/** The flights (from the service's cache) that exist for this client: [{ nid, flight, aircraft }]. */
export function scopedFlights(timelineService, scope) {
  const out = [];
  for (const [nid, flight] of timelineService.flightsByNid.entries()) {
    const aircraft = timelineService.aircraftByFlightNid.get(nid) ?? {};
    if (flightInScope(scope, flight, { oprId: aircraft.oprId ?? flight.oprId, registration: aircraft.registration ?? flight.aircraftRegistration })) out.push({ nid, flight, aircraft });
  }
  return out;
}

/** The airports (ICAO) their flights touch. */
export function scopedAirports(timelineService, scope) {
  const set = new Set();
  for (const { flight } of scopedFlights(timelineService, scope)) for (const i of [flight?.adep?.icao, flight?.ades?.icao]) if (i) set.add(String(i).toUpperCase());
  return set;
}

const groupFilter = (groups, scope) => (Array.isArray(groups) ? groups : [])
  .map((g) => ({ ...g, flights: (g.flights ?? []).filter((f) => flightInScope(scope, f, { oprId: g.oprId ?? f.oprId, registration: g.registration ?? f.aircraftRegistration })) }))
  .filter((g) => g.flights.length > 0);

/**
 * Cuts a payload down to the client's flights. `pathname` says which shape it is. Returns the payload to send, or
 * { status: 404 } when the thing asked for is a single flight outside scope.
 */
export function scopePayload({ pathname, payload, scope, timelineService, importantStore, caaStore }) {
  const path = pathname.replace(/\/+$/, "");
  if (!payload || typeof payload !== "object") return payload;
  switch (path) {
    case "/api/timeline/flights":
    case "/api/upcoming/flights": {
      const aircraft = groupFilter(payload.aircraft, scope);
      return { ...payload, aircraft, totalAircraft: aircraft.length, totalFlights: aircraft.reduce((n, g) => n + g.flights.length, 0), operators: [...new Set(aircraft.map((g) => g.oprId).filter(Boolean))], windowCheck: undefined };
    }
    case "/api/flights/normalized": {
      const flights = (payload.flights ?? []).filter((r) => flightInScope(scope, r.flight ?? r, { oprId: r.oprId, registration: r.registration }));
      return { ...payload, flights, total: flights.length, truncated: false };
    }
    case "/api/flights/data": {
      const rows = (Array.isArray(payload) ? payload : []).map((row) => ({ ...row, flights: (row.flights ?? []).filter((f) => flightInScope(scope, f, { oprId: row.oprId, registration: row.registration })) })).filter((row) => row.flights.length > 0);
      return rows;
    }
    case "/api/timeline/aircraft":
    case "/api/aircraft/schedule": {
      // An aircraft exists for them when it is in their registrations, or it flew one of their flights.
      const theirs = new Set(scopedFlights(timelineService, scope).map(({ aircraft, flight }) => `${String(aircraft.oprId ?? flight.oprId ?? "").toLowerCase()}:${String(aircraft.registration ?? flight.aircraftRegistration ?? "").toUpperCase()}`));
      const aircraft = (payload.aircraft ?? []).filter((a) => theirs.has(`${String(a.oprId ?? "").toLowerCase()}:${String(a.registration ?? "").toUpperCase()}`))
        .map((a) => (Array.isArray(a.flights) ? { ...a, flights: a.flights.filter((f) => flightInScope(scope, f, { oprId: a.oprId, registration: a.registration })) } : a));
      return { ...payload, aircraft, totalAircraft: aircraft.length };
    }
    case "/api/notam-check/today": {
      const theirs = scopedAirports(timelineService, scope);
      const airports = (payload.airports ?? []).filter((a) => theirs.has(String(a.icao ?? "").toUpperCase()));
      // Their sign: checked when every airport of THEIR flights is checked. Ops' email and reminder bookkeeping is not theirs.
      const sign = airports.length === 0 ? "NONE" : airports.every((a) => a.checked) ? "CHECKED" : "CHECK";
      return { ok: true, day: payload.day ?? null, timeZone: payload.timeZone ?? null, checkHour: payload.checkHour ?? null, ranAt: payload.ranAt ?? null, sign, done: airports.filter((a) => a.checked).length, total: airports.length, airports };
    }
    case "/api/timeline/limitations":
    case "/api/limitations": {
      const ids = new Set();
      for (const { flight } of scopedFlights(timelineService, scope)) for (const id of timelineService.getMatchedLimitationIds?.(flight) ?? []) ids.add(String(id));
      const list = (payload.limitations ?? []).filter((l) => ids.has(String(l.id)));
      return { ...payload, limitations: list, matchCounts: undefined };
    }
    case "/api/important": {
      const ids = new Set();
      if (importantStore?.loaded) for (const { flight, aircraft } of scopedFlights(timelineService, scope)) for (const e of importantStore.matchFlight(timelineService.buildFlightMatchContext(flight, { oprId: aircraft.oprId, registration: aircraft.registration }))) ids.add(String(e.id));
      return { ...payload, entries: (payload.entries ?? []).filter((e) => ids.has(String(e.id))) };
    }
    case "/api/caa": {
      const ids = new Set();
      if (caaStore) for (const { flight, aircraft } of scopedFlights(timelineService, scope)) for (const e of caaStore.matchFlight(timelineService.buildFlightMatchContext(flight, { oprId: aircraft.oprId, registration: aircraft.registration }))) ids.add(String(e.id));
      return { ...payload, entries: (payload.entries ?? []).filter((e) => ids.has(String(e.id))) };
    }
    case "/api/flight-checks": {
      // Keyed "oprId:nid" → only keys of their flights.
      const theirs = new Set(scopedFlights(timelineService, scope).map(({ nid, flight, aircraft }) => `${String(aircraft.oprId ?? flight.oprId ?? "")}:${nid}`));
      const out = {};
      for (const [k, v] of Object.entries(payload.checks ?? payload.statuses ?? {})) if (theirs.has(k)) out[k] = v;
      return { ...payload, ...(payload.checks ? { checks: out } : {}), ...(payload.statuses ? { statuses: out } : {}) };
    }
    case "/api/timeline/sync-status":
      return { ok: payload.ok ?? true, lastSyncTimestamp: payload.lastSyncTimestamp ?? null, healthy: payload.healthy ?? null };
    default:
      return payload;
  }
}

/**
 * /api/flight-info is one flight: 404 when it is not theirs; otherwise the pieces their switches cover.
 * `found` is timelineService.getFlightByNid(...)'s { flight, aircraft } or null.
 */
export function flightInfoForClient(found, scope) {
  if (!found || !flightInScope(scope, found.flight, { oprId: found.aircraft?.oprId, registration: found.aircraft?.registration })) return null;
  return {
    notams: hasSwitch(scope, "notams"),
    weather: hasSwitch(scope, "weather"),
    aip: hasSwitch(scope, "documents"),
    radar: hasSwitch(scope, "radar"),
  };
}

/** Which stream events a client's stream carries: flight.changed cut to their keys, nothing about devices, overlays, presence or reports. */
export function clientStreamFilter(scope, timelineService) {
  return (event) => {
    if (!event || event.type !== "flight.changed") return null;
    const theirs = new Set(scopedFlights(timelineService, scope).map(({ nid, flight, aircraft }) => `${String(aircraft.oprId ?? flight.oprId ?? "")}:${nid}`));
    const updated = (event.updated ?? []).filter((k) => theirs.has(String(k?.key ?? k)));
    const deleted = (event.deleted ?? []).filter((k) => theirs.has(String(k?.key ?? k)));
    if (!updated.length && !deleted.length) return null;
    return { type: "flight.changed", via: event.via ?? "sync", updated, deleted };
  };
}
