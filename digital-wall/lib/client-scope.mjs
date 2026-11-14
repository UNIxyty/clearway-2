// The wall backend's half of client access (Stage 5, 2026-10-25): what a CLIENT may ask the wall, and what of the
// answer is theirs. Decided on the server for every request, before the handler, in server.mjs; the handlers stay
// as they are and their payloads are cut down here. Outside scope the answer is 404 — never 403, which would confirm
// a flight exists. Anything not in CLIENT_READS does not exist for a client (404), writes included.
import { flightInScope, hasSwitch } from "../../lib/clients/scope.mjs";

/** GET paths a client may call, with the switch each needs (null: always, for an approved client). */
export const CLIENT_READS = {
  "/api/health": null,
  "/api/users/me": null,
  "/api/user": null,              // the same handler as /api/users/me; the wall app's sign-in check asks this name
  "/api/display/clocks": null,    // the room's clocks (names and time zones), nothing of anyone's
  "/api/stream": null,
  "/api/timeline/flights": "flight_board",
  "/api/flights/normalized": "flight_board",
  "/api/flights/data": "flight_board",
  "/api/upcoming/flights": "flight_board",
  "/api/timeline/aircraft": "flight_board",
  "/api/aircraft/schedule": "flight_board",
  "/api/flight-info": "flight_board",
  // (/api/flight-checks was here until 2026-11-09: ops' own "checked" marks, with the name of who ticked each one, and
  // no client page ever asked for it)
  "/api/notam-check/today": "notam_check_status",
  "/api/timeline/limitations": "limitations",
  "/api/limitations": "limitations",
  "/api/important": "important",
  "/api/caa": "caa",
  // (/api/aip-pdf, /api/airports/search, /api/geo/airports, /api/geo/countries, /api/countries were here until
  // 2026-11-10: Airports, AIP pages, airport search and Documents are no longer part of a client's world, and their
  // two switches are retired — lib/clients/switches.mjs)
  "/api/geo/coords": "radar",     // lat/lon of the asked airports, for the flight map (data/airport-coords.json)
  "/api/flight-passengers": "passengers", // the names of one of THEIR flights' passengers; "passengers" is the level, not a switch (see clientReadRefusal)
  "/api/timeline/sync-status": "service_status",
  "/api/client/view": null,       // the look of their own timeline (sizing, colours, font): read here, written by CLIENT_WRITES
};
/**
 * The writes a client may make at the wall (server.mjs handles them in the client block): their own view settings,
 * and the render-error report of their own page (2026-11-13) — one line in the server's log saying which part of the
 * page broke, so it can be fixed; it reads nothing, stores nothing and is answered 204 with no body.
 */
export const CLIENT_WRITES = { "/api/client/view": ["PUT", "DELETE"], "/api/ui-error": ["POST"] };

/** The 404 a client gets for anything that is not theirs. One sentence, the same for a flight and for a page. */
export const NOT_ON_ACCOUNT = { ok: false, error: "That is not on your account." };

/** May this client call this path at all? Returns the reason it may not, or null. */
export function clientReadRefusal(scope, method, pathname) {
  if (method !== "GET" && method !== "HEAD") return "not-a-read";
  const path = pathname.replace(/\/+$/, "");
  if (!(path in CLIENT_READS)) return "not-in-their-world";
  const sw = CLIENT_READS[path];
  // passengers is a level (off | names | documents), not a switch: anything but off opens the names read
  if (sw === "passengers") return scope.passengerLevel && scope.passengerLevel !== "off" ? null : "switch-off";
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

/**
 * What of ONE flight is a client's (2026-11-09): a list of fields, not the wall's own record with pieces taken out.
 * Until now a client's feed carried each flight as the ops wall keeps it, verbatim: with `limitations` (the ops notes
 * matched to the flight — Limitations, Important entries and their attachment names, CAA contacts, unreviewed NOTAM and
 * weather markers) and `checks` (who in ops ticked what, by name), whatever the client's switches said. The page drew
 * none of it; the browser was given all of it. Now a flight is these fields and nothing else, and the notes come back
 * only by switch: Limitations (LIM), Important notices (IMP, title and text, no attachments), CAA details (CAA).
 * Ops' review marks (NTM, WX), `checks`, the checklist colour and the trip's internal status never leave.
 */
export const CLIENT_FLIGHT_FIELDS = [
  "flightNid", "flightNo", "tripNo", "status", "movementState", "isCnl", "oprId", "operatorName", "aircraftRegistration", "icaoType", "flightType",
  "startTimeUTC", "endTimeUTC", "etd", "eta", "atd", "ata", "ctot", "ctotUTC", "takeOffUTC", "landingUTC", "blockOff", "takeOff", "landing", "blockOn",
  "delayMin", "departureDelayMin", "arrivalDelayMin", "delayedDepartureUTC", "delayedArrivalUTC", "eetMin", "isAirborne", "hasArrived",
  "isCommercial", "isFerry", "adep", "ades", "passengerCount",
];
const CAA_FIELDS = ["country", "authorityName", "validity", "functionText", "info", "contact", "phones", "mail", "sita", "aftn"];
const NOTE_SWITCH = { LIM: "limitations", IMP: "important", CAA: "caa" };
export function clientFlight(flight, scope) {
  if (!flight || typeof flight !== "object") return flight;
  const out = {};
  for (const k of CLIENT_FLIGHT_FIELDS) if (k in flight) out[k] = flight[k];
  const notes = [];
  for (const l of Array.isArray(flight.limitations) ? flight.limitations : []) {
    const sw = NOTE_SWITCH[l?.type];
    if (!sw || !hasSwitch(scope, sw)) continue;
    const note = { id: l.id, type: l.type, title: l.title ?? null };
    if (l.type === "CAA") { note.caa = {}; for (const k of CAA_FIELDS) if (l.caa?.[k] != null && l.caa[k] !== "") note.caa[k] = l.caa[k]; }
    else note.description = l.description ?? null;
    notes.push(note);
  }
  out.limitations = notes;
  return out;
}

/** What names an aircraft or a row of flights, for a client: who flies it, its registration and type. Nothing else. */
const ROW_FIELDS = ["key", "oprId", "operatorName", "registration", "acftTypeIcao", "acftTypeShortName", "flightNid"];
export function clientRow(row) { const out = {}; for (const k of ROW_FIELDS) if (row && k in row) out[k] = row[k]; return out; }

const groupFilter = (groups, scope) => (Array.isArray(groups) ? groups : [])
  .map((g) => ({ ...clientRow(g), flights: (g.flights ?? []).filter((f) => flightInScope(scope, f, { oprId: g.oprId ?? f.oprId, registration: g.registration ?? f.aircraftRegistration })).map((f) => clientFlight(f, scope)) }))
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
      // each record's flight as a client's (clientFlight); the NOTAM check state only with its switch, and then only
      // whether each airport is in today's check and checked, never the name on a tick
      const side = (x) => (x ? { icao: x.icao ?? null, inTodaysCheck: x.inTodaysCheck ?? null, checked: x.checked ?? null } : null);
      const flights = (payload.flights ?? []).filter((r) => flightInScope(scope, r.flight ?? r, { oprId: r.oprId, registration: r.registration }))
        .map((r) => { const { notamCheck } = r; return { ...clientRow(r), ...(r.flight ? { flight: clientFlight(r.flight, scope) } : {}), ...(notamCheck && hasSwitch(scope, "notam_check_status") ? { notamCheck: { day: notamCheck.day ?? null, dep: side(notamCheck.dep), arr: side(notamCheck.arr) } } : {}) }; });
      return { ...payload, flights, total: flights.length, truncated: false };
    }
    case "/api/flights/data": {
      const rows = (Array.isArray(payload) ? payload : []).map((row) => ({ ...clientRow(row), flights: (row.flights ?? []).filter((f) => flightInScope(scope, f, { oprId: row.oprId, registration: row.registration })).map((f) => clientFlight(f, scope)) })).filter((row) => row.flights.length > 0);
      return rows;
    }
    case "/api/timeline/aircraft":
    case "/api/aircraft/schedule": {
      // An aircraft exists for them when it is in their registrations, or it flew one of their flights.
      const theirs = new Set(scopedFlights(timelineService, scope).map(({ aircraft, flight }) => `${String(aircraft.oprId ?? flight.oprId ?? "").toLowerCase()}:${String(aircraft.registration ?? flight.aircraftRegistration ?? "").toUpperCase()}`));
      const aircraft = (payload.aircraft ?? []).filter((a) => theirs.has(`${String(a.oprId ?? "").toLowerCase()}:${String(a.registration ?? "").toUpperCase()}`))
        .map((a) => (Array.isArray(a.flights) ? { ...clientRow(a), flights: a.flights.filter((f) => flightInScope(scope, f, { oprId: a.oprId, registration: a.registration })).map((f) => clientFlight(f, scope)) } : clientRow(a)));
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
      // what a limitation says, not what it is matched on (other operators' registrations) or who wrote it (2026-11-09)
      const list = (payload.limitations ?? []).filter((l) => ids.has(String(l.id))).map((l) => ({ id: l.id, title: l.title ?? null, description: l.description ?? null, isPermanent: l.isPermanent ?? null, startDate: l.startDate ?? null, endDate: l.endDate ?? null }));
      return { limitations: list };
    }
    case "/api/important": {
      const ids = new Set();
      if (importantStore?.loaded) for (const { flight, aircraft } of scopedFlights(timelineService, scope)) for (const e of importantStore.matchFlight(timelineService.buildFlightMatchContext(flight, { oprId: aircraft.oprId, registration: aircraft.registration }))) ids.add(String(e.id));
      // the notice's title and text: no match criteria (other operators), no attachments, no names from the audit trail
      return { ok: payload.ok ?? true, entries: (payload.entries ?? []).filter((e) => ids.has(String(e.id))).map((e) => ({ id: e.id, title: e.title ?? null, body: e.body ?? null })) };
    }
    case "/api/caa": {
      const ids = new Set();
      if (caaStore) for (const { flight, aircraft } of scopedFlights(timelineService, scope)) for (const e of caaStore.matchFlight(timelineService.buildFlightMatchContext(flight, { oprId: aircraft.oprId, registration: aircraft.registration }))) ids.add(String(e.id));
      return { ok: payload.ok ?? true, entries: (payload.entries ?? []).filter((e) => ids.has(String(e.id))).map((e) => { const o = { id: e.id }; for (const k of CAA_FIELDS) if (e[k] != null && e[k] !== "") o[k] = e[k]; return o; }) };
    }
    case "/api/timeline/sync-status":
      // is the flight data live, and when was it last brought up to date: the two things a client's page says
      // (2026-11-09); nothing about operators, errors, storage or the cache
      return { ok: payload.ok ?? true, lastSyncTimestamp: payload.lastSyncTimestamp ?? null, healthy: payload.healthy ?? null, live: payload.verdict === "working" || payload.verdict === "partial", updatedAt: payload.lastSuccessAt ?? null };
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
    // a sync says how many flights changed, not which (2026-11-09: the counts were read as lists, the filter threw, and
    // the hub dropped the client's stream at the first sync): a client with flights is told to look again, no numbers
    if (!Array.isArray(event.updated) && !Array.isArray(event.deleted)) return scopedFlights(timelineService, scope).length ? { type: "flight.changed", via: event.via ?? "sync" } : null;
    const theirs = new Set(scopedFlights(timelineService, scope).map(({ nid, flight, aircraft }) => `${String(aircraft.oprId ?? flight.oprId ?? "")}:${nid}`));
    const list = (v) => (Array.isArray(v) ? v : []);
    const updated = list(event.updated).filter((k) => theirs.has(String(k?.key ?? k)));
    const deleted = list(event.deleted).filter((k) => theirs.has(String(k?.key ?? k)));
    if (!updated.length && !deleted.length) return null;
    return { type: "flight.changed", via: event.via ?? "sync", updated, deleted };
  };
}
