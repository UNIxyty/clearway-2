// Flight tools. All read the wall's OWN flight record — the board's decorated
// flight (leon-sync mapLeonFlight → decorateFlightWithLimitations) joined with
// its aircraft-group context by digital-wall/lib/flight-record.mjs — so the
// agent cannot show a dispatcher something different from the screen on the
// wall in front of them, and there is no second flight representation to
// drift out of step with it.
//
// Source: the wall's /api/flights/normalized (filters server-side, not limited
// to the board's visibility window). If the wall in front of us predates that
// endpoint (its unknown-/api fallback answers `{}`), the tools fall back to
// /api/timeline/flights and build the SAME records with the SAME module —
// only the reach differs (board window), and the result says so.
//
// Flight identity: the wall keys flights by Leon nid within an operator
// (oprId). A nid alone is ambiguous across operators, so flight_id here is
// "<oprId>:<flightNid>" (the record's `key`), with a bare nid accepted and
// resolved when it is unambiguous.
//
// Every call goes out on the caller's own session (http.mjs), so the wall's
// auth gate decides what they may read; every call is audited once by the
// framework (executeTool → audit kind "tool.call").

import { defineTool, S } from "./framework.mjs";
import { wallGet } from "./http.mjs";
import { NotFound, InvalidInput } from "./errors.mjs";
import {
  dayBounds,
  filterFlightRecords,
  flightRecordsFromTimeline,
  notamCheckState,
  sortFlightRecords,
  splitFlightKey,
} from "../../../digital-wall/lib/flight-record.mjs";

const FLIGHT_ID = {
  type: "string",
  minLength: 1,
  maxLength: 120,
  description: 'Flight identifier: the record key "<operatorId>:<flightNid>" (or a bare flight nid when unambiguous).',
};

// What the fields of a record mean — told to the model in the tools that
// return records, so it reads the wall's own field names correctly.
const RECORD_GUIDE =
  "Each flight is the wall's own record: key (\"<oprId>:<flightNid>\"), oprId, operatorName, registration, acftTypeIcao/acftTypeShortName (aircraft type), " +
  "notamCheck (dep/arr: in today's NOTAM check and who checked it; flightAck; unreviewed = ICAOs with unreviewed NOTAM markers), and `flight` exactly as the wall decorates it: " +
  "flightNo = callsign; adep/ades {icao,name,city}; startTimeUTC/endTimeUTC = STD/STA; etd/eta = estimates; atd/ata, takeOffUTC/landingUTC = actuals; ctot; departureDelayMin/arrivalDelayMin; " +
  "movementState = flight status (scheduled|delayed|ctot|airborne|arrived; movementStateEstimated = inferred from the clock, no movement data); isCnl = cancelled; " +
  "tripStatus = trip status (CONFIRMED|OPTION|OPPORTUNITY); tripNo/tripCode; limitations[] = everything attached (type LIM|CAA|IMP|NTM|WX, verbatim); checks = dispatcher acks; wxDep/wxArr = flight categories.";

const FLIGHT_RECORD_SCHEMA = {
  type: "object",
  required: ["key", "flight"],
  properties: {
    key: { type: "string", description: '"<oprId>:<flightNid>" — use as flight_id.' },
    oprId: { type: ["string", "null"] },
    flightNid: { type: ["string", "null"] },
    operatorName: { type: ["string", "null"] },
    registration: { type: ["string", "null"] },
    aircraftNid: {},
    acftTypeIcao: { type: ["string", "null"] },
    acftTypeShortName: { type: ["string", "null"] },
    defaultIcaoType: { type: ["string", "null"] },
    flight: { type: "object", description: "The wall's decorated flight, verbatim." },
    notamCheck: { type: ["object", "null"] },
  },
};

const LIST_OUTPUT = {
  type: "object",
  required: ["count", "flights"],
  properties: {
    count: { type: "integer", description: "Flights matched (before the limit)." },
    returned: { type: "integer" },
    truncated: { type: "boolean" },
    window: { type: ["string", "null"], description: '"all-cached" (every flight the wall holds), "board" (the wall\'s visibility window) or "board-fallback".' },
    note: { type: ["string", "null"] },
    flights: { type: "array", items: FLIGHT_RECORD_SCHEMA },
  },
};

const STATUS_VALUES = ["scheduled", "delayed", "ctot", "airborne", "arrived", "cancelled", "CONFIRMED", "OPTION", "OPPORTUNITY"];

const FALLBACK_NOTE =
  "The wall has no /api/flights/normalized yet, so only flights inside the wall's visibility window were searched.";

/**
 * Records from the wall, filtered. `params` uses the endpoint's query names:
 * key, date, from, to, oprId, operator, icao, adep, ades, registration,
 * callsign, status, trip, window ("board" | null), limit.
 */
export async function fetchRecords(user, params = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v != null && v !== "") qs.set(k, String(v));
  let data = null;
  try {
    data = await wallGet(`/api/flights/normalized?${qs}`, user, { timeoutMs: 25_000 });
  } catch (error) {
    if (error?.code !== "NOT_FOUND") throw error; // 401/403/5xx/timeouts are real answers
  }
  if (data?.ok === true && Array.isArray(data.flights)) {
    return {
      flights: data.flights,
      count: Number.isInteger(data.total) ? data.total : data.flights.length,
      truncated: Boolean(data.truncated),
      window: data.window ?? null,
      note: null,
    };
  }
  return fallbackRecords(user, params);
}

/** Same records, same module, from the board feed — for a wall without the endpoint. */
async function fallbackRecords(user, params) {
  const bounds = params.date ? dayBounds(params.date) : null;
  const qs = new URLSearchParams({ allOperators: "true" });
  const from = bounds?.from ?? params.from;
  const to = bounds?.to ?? params.to;
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);
  const [payload, notamState] = await Promise.all([
    wallGet(`/api/timeline/flights?${qs}`, user, { timeoutMs: 25_000 }),
    wallGet("/api/notam-check/today", user, { timeoutMs: 15_000 }).catch(() => null),
  ]);
  const matched = sortFlightRecords(filterFlightRecords(flightRecordsFromTimeline(payload), params));
  const limit = Number(params.limit) || 100;
  return {
    flights: matched.slice(0, limit).map((r) => ({ ...r, notamCheck: notamState ? notamCheckState(r, notamState) : null })),
    count: matched.length,
    truncated: matched.length > limit,
    window: "board-fallback",
    note: FALLBACK_NOTE,
  };
}

/** One record by flight id; ambiguity across operators is an input error. */
async function resolveFlight(user, flightId) {
  const { oprId, flightNid } = splitFlightKey(flightId);
  if (!flightNid) throw InvalidInput("A flight nid is required.");
  const { flights } = await fetchRecords(user, { key: oprId ? `${oprId}:${flightNid}` : flightNid, limit: 5 });
  if (flights.length === 0) {
    throw NotFound(`No flight ${flightId} on the wall. If that is a callsign or registration, use find_flight.`);
  }
  if (flights.length > 1 && !oprId) {
    throw InvalidInput(`Flight nid ${flightNid} exists for several operators (${flights.map((f) => f.key).join(", ")}). Use the full key.`);
  }
  return flights[0];
}

/** The board feed as the wall shows it right now (get_wall_state, overlay labels). */
async function loadTimeline(user) {
  const data = await wallGet("/api/timeline/flights?allOperators=true", user, { timeoutMs: 25_000 });
  return flightRecordsFromTimeline(data);
}

const recordLabel = (r) =>
  `${r.flight?.flightNo ?? r.registration ?? r.key} ${r.flight?.adep?.icao ?? "?"} → ${r.flight?.ades?.icao ?? "?"}`;

defineTool({
  name: "get_flight",
  description:
    "One flight by flight id, as the wall holds it: callsign, registration, aircraft type, operator, route, STD/STA, ETD/ETA and actuals, flight and trip status, attached limitations and NOTAM check state. " +
    RECORD_GUIDE,
  permission: "user",
  sourceTier: "internal",
  sourceLabel: (input) => `Internal · Leon via the wall · ${input.flight_id}`,
  timeoutMs: 30_000,
  input: { type: "object", required: ["flight_id"], additionalProperties: false, properties: { flight_id: FLIGHT_ID } },
  output: { type: "object", required: ["flight"], properties: { flight: FLIGHT_RECORD_SCHEMA } },
  async handler({ flight_id }, { user }) {
    return { flight: await resolveFlight(user, flight_id) };
  },
});

defineTool({
  name: "get_flight_state",
  description:
    "Everything the ops wall knows about one flight right now: the full flight record (as get_flight) plus its limitations, IMPORTANT, CAA and NOTAM/WX alert entries split out, NOTAM, weather and AIP availability for both airports, and which per-flight checks the dispatcher has already ticked. Use before answering 'is this flight ready' or 'what applies to this flight'.",
  permission: "user",
  sourceTier: "internal",
  sourceLabel: (input) => `Internal · wall flight state · ${input.flight_id}`,
  timeoutMs: 45_000,
  maxResultBytes: 256 * 1024,
  input: { type: "object", required: ["flight_id"], additionalProperties: false, properties: { flight_id: FLIGHT_ID } },
  output: {
    type: "object",
    required: ["flightId", "flight"],
    properties: {
      flightId: { type: "string" },
      flight: FLIGHT_RECORD_SCHEMA,
      checks: { type: "object", description: "Per-type dispatcher acknowledgements for the current cycle." },
      limitations: { type: "array", items: { type: "object" }, description: "Matched limitations (type LIM), verbatim." },
      important: { type: "array", items: { type: "object" }, description: "Matched IMPORTANT entries (type IMP), verbatim." },
      caa: { type: "array", items: { type: "object" }, description: "Matched CAA authority entries, verbatim." },
      alerts: { type: "array", items: { type: "object" }, description: "Unreviewed NOTAM (NTM) and weather (WX) alert markers." },
      departure: { type: "object" },
      arrival: { type: "object" },
      infoError: { type: ["string", "null"] },
    },
  },
  async handler({ flight_id }, { user }) {
    const record = await resolveFlight(user, flight_id);
    const f = record.flight ?? {};
    // /api/flight-info answers { flight, aircraft, notams: {dep, arr}, weather: {dep, arr}, aip: {dep, arr} }.
    let info = null;
    let infoError = null;
    try {
      info = await wallGet(
        `/api/flight-info?flightNid=${encodeURIComponent(record.flightNid ?? "")}&oprId=${encodeURIComponent(record.oprId ?? "")}`,
        user,
        { timeoutMs: 40_000 }
      );
    } catch (error) {
      infoError = String(error?.message || error);
    }
    const lims = Array.isArray(f.limitations) ? f.limitations : [];
    const ofType = (...types) => lims.filter((l) => types.includes(l?.type));
    const side = (key, airport) => {
      const notams = info?.notams?.[key] ?? null;
      const list = notams?.data?.notams ?? notams?.notams ?? null;
      return {
        icao: airport?.icao ?? null,
        name: airport?.name ?? null,
        notamsAvailable: info ? Boolean(notams?.ok) : null,
        notamCount: Array.isArray(list) ? list.length : null,
        notamError: notams && !notams.ok ? (notams.error ?? null) : null,
        weather: info?.weather?.[key] ?? null,
        aipAvailable: info ? Boolean(info?.aip?.[key]?.available) : null,
        notamCheck: record.notamCheck?.[key] ?? null,
      };
    };
    return {
      flightId: record.key,
      flight: record,
      checks: f.checks ?? {},
      limitations: ofType("LIM"),
      important: ofType("IMP"),
      caa: ofType("CAA"),
      alerts: ofType("NTM", "WX"),
      departure: side("dep", f.adep),
      arrival: side("arr", f.ades),
      infoError,
    };
  },
});

defineTool({
  name: "search_flights",
  description:
    "List flights on the ops wall, filtered by date, time window, operator, airport, registration, callsign, flight/trip status or trip. With no date or from/to it searches what the wall currently shows; with a date it searches every flight the wall holds for that day. Use for 'which flights go to X', 'what is flying today', 'delayed flights for operator Y'. " +
    RECORD_GUIDE,
  permission: "user",
  sourceTier: "internal",
  sourceLabel: () => "Internal · wall flights",
  timeoutMs: 30_000,
  maxResultBytes: 768 * 1024,
  input: {
    type: "object",
    additionalProperties: false,
    properties: {
      date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", description: "UTC day, YYYY-MM-DD: flights overlapping that day." },
      from: { type: "string", description: "ISO timestamp (window start)." },
      to: { type: "string", description: "ISO timestamp (window end)." },
      operator: { type: "string", maxLength: 80, description: "Operator id or part of its name." },
      operatorId: { type: "string", maxLength: 40, description: "Exact operator id (oprId)." },
      icao: { ...S.icao, description: "Matches either departure or arrival." },
      adep: { ...S.icao, description: "Departure airport only." },
      ades: { ...S.icao, description: "Arrival airport only." },
      registration: { type: "string", maxLength: 16 },
      callsign: { type: "string", maxLength: 24, description: "Callsign (flightNo), partial match." },
      status: { type: "string", enum: STATUS_VALUES, description: "Flight status (movement state), 'cancelled', or trip status." },
      trip: { type: "string", maxLength: 40, description: "Trip number or trip code." },
      window: { type: "string", enum: ["board", "all"], description: "board = only what the wall shows now; all = every cached flight. Default: board without a date/from/to, all with one." },
      limit: S.limit(100, 25),
    },
  },
  output: LIST_OUTPUT,
  async handler(input, { user }) {
    const { date, from, to, operator, operatorId, icao, adep, ades, registration, callsign, status, trip, limit } = input;
    const hasRange = Boolean(date || from || to);
    const window = input.window ?? (hasRange ? "all" : "board");
    const res = await fetchRecords(user, {
      date, from, to, operator, oprId: operatorId, icao, adep, ades, registration, callsign, status, trip,
      window: window === "board" ? "board" : null,
      limit,
    });
    return { count: res.count, returned: res.flights.length, truncated: res.truncated, window: res.window, note: res.note, flights: res.flights };
  },
});

defineTool({
  name: "find_flight",
  description:
    "Look up flights by callsign or registration (e.g. 'where is BTI472', 'what is YL-ABC doing today'). Searches every flight the wall holds (optionally one UTC day) and marks the current one: airborne now, else the next to depart, else the most recent. Returns the same records as get_flight.",
  permission: "user",
  sourceTier: "internal",
  sourceLabel: (i) => `Internal · wall flights · ${i.callsign ?? i.registration ?? ""}`.trim(),
  timeoutMs: 30_000,
  maxResultBytes: 512 * 1024,
  input: {
    type: "object",
    additionalProperties: false,
    properties: {
      callsign: { type: "string", minLength: 2, maxLength: 24, description: "Callsign (flightNo), partial match." },
      registration: { type: "string", minLength: 2, maxLength: 16, description: "Aircraft registration, dash-insensitive." },
      date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", description: "Optional UTC day, YYYY-MM-DD." },
      limit: S.limit(50, 20),
    },
  },
  output: {
    type: "object",
    required: ["count", "flights"],
    properties: { ...LIST_OUTPUT.properties, current: { type: ["string", "null"], description: "Key of the current flight among the matches." } },
  },
  async handler({ callsign, registration, date, limit }, { user }) {
    if (!callsign && !registration) throw InvalidInput("Give a callsign or a registration.");
    const res = await fetchRecords(user, { callsign, registration, date, limit });
    const now = Date.now();
    const ms = (v) => { const t = Date.parse(v ?? ""); return Number.isFinite(t) ? t : null; };
    const live = res.flights.filter((r) => !r.flight?.isCnl);
    const airborne = live.find((r) => r.flight?.movementState === "airborne");
    const next = live.find((r) => (ms(r.flight?.atd ?? r.flight?.etd ?? r.flight?.startTimeUTC) ?? -Infinity) >= now);
    const recent = [...live].reverse().find((r) => (ms(r.flight?.startTimeUTC) ?? Infinity) < now);
    return {
      count: res.count, returned: res.flights.length, truncated: res.truncated, window: res.window, note: res.note,
      current: (airborne ?? next ?? recent)?.key ?? null,
      flights: res.flights,
    };
  },
});

defineTool({
  name: "get_trip_legs",
  description:
    "All legs of one trip, in order: pass a flight_id (its trip is used) or a trip number/code (optionally with operatorId). Returns the same records as get_flight for every leg.",
  permission: "user",
  sourceTier: "internal",
  sourceLabel: (i) => `Internal · wall trip · ${i.trip ?? i.flight_id ?? ""}`.trim(),
  timeoutMs: 45_000,
  maxResultBytes: 512 * 1024,
  input: {
    type: "object",
    additionalProperties: false,
    properties: {
      flight_id: FLIGHT_ID,
      trip: { type: "string", maxLength: 40, description: "Trip number or trip code." },
      operatorId: { type: "string", maxLength: 40 },
    },
  },
  output: {
    type: "object",
    required: ["legs"],
    properties: {
      trip: { type: ["string", "null"] },
      tripCode: { type: ["string", "null"] },
      operatorId: { type: ["string", "null"] },
      count: { type: "integer" },
      window: { type: ["string", "null"] },
      note: { type: ["string", "null"] },
      legs: { type: "array", items: FLIGHT_RECORD_SCHEMA },
    },
  },
  async handler({ flight_id, trip, operatorId }, { user }) {
    if (!flight_id && !trip) throw InvalidInput("Give a flight_id or a trip number/code.");
    let oprId = operatorId ?? null;
    let tripRef = trip ?? null;
    if (flight_id) {
      const anchor = await resolveFlight(user, flight_id);
      oprId = anchor.oprId ?? oprId;
      tripRef = anchor.flight?.tripNo ?? anchor.flight?.tripCode ?? null;
      if (tripRef == null) {
        return { trip: null, tripCode: null, operatorId: oprId, count: 1, window: null, note: "The wall has no trip number for this flight; only the flight itself is shown.", legs: [anchor] };
      }
    }
    const res = await fetchRecords(user, { trip: String(tripRef), oprId, limit: 100 });
    const legs = res.flights;
    if (legs.length === 0) throw NotFound(`No legs for trip ${tripRef}${oprId ? ` (${oprId})` : ""} on the wall.`);
    const operators = [...new Set(legs.map((l) => l.oprId).filter(Boolean))];
    return {
      trip: legs[0].flight?.tripNo != null ? String(legs[0].flight.tripNo) : String(tripRef),
      tripCode: legs[0].flight?.tripCode ?? null,
      operatorId: operators.length === 1 ? operators[0] : oprId,
      count: legs.length,
      window: res.window,
      note: operators.length > 1 ? `Trip ${tripRef} exists for several operators (${operators.join(", ")}); pass operatorId to narrow.` : res.note,
      legs,
    };
  },
});

defineTool({
  name: "get_wall_state",
  description:
    "A snapshot of the ops wall as it stands: how many flights are shown, the Leon feed's health and last sync, how many limitations and IMPORTANT entries are active, and whether today's NOTAM check is done. Use for 'how are things looking' or to check the wall is healthy.",
  permission: "user",
  sourceTier: "internal",
  sourceLabel: () => "Internal · ops wall",
  timeoutMs: 30_000,
  input: { type: "object", additionalProperties: false, properties: {} },
  output: {
    type: "object",
    required: ["flightCount"],
    properties: {
      flightCount: { type: "integer" },
      aircraftCount: { type: "integer" },
      leon: { type: "object" },
      activeLimitations: { type: "integer" },
      activeImportant: { type: "integer" },
      notamCheckComplete: { type: ["boolean", "null"] },
      notamCheckOutstanding: { type: ["integer", "null"] },
      generatedAt: { type: "string" },
    },
  },
  async handler(_input, { user }) {
    // Each panel is fetched independently and a failure degrades that panel
    // only: a wall snapshot that reports "unknown" for one section is useful,
    // one that fails entirely because the NOTAM store hiccuped is not.
    const [timeline, syncStatus, limitations, important, notamCheck] = await Promise.all([
      loadTimeline(user).catch(() => []),
      wallGet("/api/timeline/sync-status", user, { timeoutMs: 15_000 }).catch(() => null),
      wallGet("/api/timeline/limitations?includeInactive=false", user, { timeoutMs: 15_000 }).catch(() => null),
      wallGet("/api/important?includeInactive=false", user, { timeoutMs: 15_000 }).catch(() => null),
      wallGet("/api/notam-check/today", user, { timeoutMs: 15_000 }).catch(() => null),
    ]);
    const airports = Array.isArray(notamCheck?.airports) ? notamCheck.airports : null;
    return {
      flightCount: timeline.length,
      aircraftCount: new Set(timeline.map((r) => `${r.oprId}:${r.registration}`).filter(Boolean)).size,
      leon: syncStatus ?? { available: false },
      activeLimitations: Array.isArray(limitations?.limitations) ? limitations.limitations.length : 0,
      activeImportant: Array.isArray(important?.entries) ? important.entries.length : 0,
      notamCheckComplete: airports ? airports.every((a) => a.checked ?? a.at) : null,
      notamCheckOutstanding: airports ? airports.filter((a) => !(a.checked ?? a.at)).length : null,
      generatedAt: new Date().toISOString(),
    };
  },
});


// ── The wall overlay: the console's "Show / Close on wall" as tools ───────────
// Standard confirmation (framework CONFIRM_LEVELS). The wall records who
// opened it from the requester's own session, as the console does.
defineTool({
  name: "show_flight_on_wall",
  permission: "user",
  description:
    "Show one flight on the wall display (opens the wall overlay for it). Only one flight is live at a time; showing another replaces it. Use when the user asks to put, open or show a flight on the wall.",
  sourceLabel: (i) => `Internal · wall overlay · ${i.flight_id}`,
  input: {
    type: "object",
    additionalProperties: false,
    required: ["flight_id"],
    properties: { flight_id: FLIGHT_ID },
  },
  output: {
    type: "object",
    required: ["ok", "flightId"],
    properties: { ok: { type: "boolean" }, flightId: { type: "string" }, callsign: { type: ["string", "null"] }, openedAt: { type: ["string", "null"] }, replaced: { type: ["string", "null"], description: "The flight that was on the wall before, if any." } },
  },
  readback: async ({ flight_id }, { user }) => {
    const { oprId, flightNid } = splitFlightKey(flight_id);
    const rows = await loadTimeline(user).catch(() => []);
    const hit = filterFlightRecords(rows, { key: oprId ? `${oprId}:${flightNid}` : flightNid })[0];
    return hit ? recordLabel(hit) : flight_id;
  },
  async handler({ flight_id }, { user }) {
    const { oprId, flightNid } = splitFlightKey(flight_id);
    const before = await wallGet("/api/display/overlay", user, { timeoutMs: 15_000 }).catch(() => null);
    const res = await wallGet("/api/display/overlay", user, { method: "POST", timeoutMs: 20_000, body: { action: "open", flightNid, ...(oprId ? { oprId } : {}) } });
    if (!res?.ok) throw NotFound(res?.error || `No flight ${flight_id} on the wall timeline.`);
    const rows = await loadTimeline(user).catch(() => []);
    const hit = filterFlightRecords(rows, { key: oprId ? `${oprId}:${flightNid}` : flightNid })[0];
    const callsign = hit?.flight?.flightNo ?? null;
    return { ok: true, flightId: flight_id, callsign, openedAt: res.overlay?.openedAt ?? null, replaced: before?.overlay?.open && String(before.overlay.flightNid) !== flightNid ? String(before.overlay.flightNid) : null };
  },
});

defineTool({
  name: "close_flight_on_wall",
  permission: "user",
  description: "Close whatever flight is currently shown on the wall display (the wall returns to its idle view).",
  sourceLabel: () => "Internal · wall overlay",
  input: { type: "object", additionalProperties: false, properties: {} },
  output: { type: "object", required: ["ok"], properties: { ok: { type: "boolean" }, wasOpen: { type: "boolean" } } },
  async handler(_input, { user }) {
    const before = await wallGet("/api/display/overlay", user, { timeoutMs: 15_000 }).catch(() => null);
    const res = await wallGet("/api/display/overlay", user, { method: "POST", timeoutMs: 20_000, body: { action: "close" } });
    return { ok: Boolean(res?.ok), wasOpen: Boolean(before?.overlay?.open) };
  },
});
