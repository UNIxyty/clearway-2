// Flight tools. All read from the wall's timeline service — the same decorated
// payload the wall and console render, so the agent cannot show a dispatcher
// something different from the screen on the wall in front of them.
//
// Flight identity: the wall keys flights by Leon nid within an operator
// (oprId). A nid alone is ambiguous across operators, so flight_id here is
// "<oprId>:<flightNid>", with a bare nid accepted and resolved when it is
// unambiguous.

import { defineTool, S } from "./framework.mjs";
import { wallGet } from "./http.mjs";
import { NotFound, InvalidInput } from "./errors.mjs";

const FLIGHT_ID = {
  type: "string",
  minLength: 1,
  maxLength: 120,
  description: 'Flight identifier, "<operatorId>:<flightNid>" (or a bare flight nid when unambiguous).',
};

function splitFlightId(flightId) {
  const raw = String(flightId).trim();
  const idx = raw.lastIndexOf(":");
  if (idx > 0) return { oprId: raw.slice(0, idx), flightNid: raw.slice(idx + 1) };
  return { oprId: "", flightNid: raw };
}

function summariseFlight(flight, aircraft) {
  return {
    flightId: `${aircraft?.oprId ?? flight?.oprId ?? ""}:${flight?.nid ?? flight?.flightNid ?? ""}`,
    flightNid: String(flight?.nid ?? flight?.flightNid ?? ""),
    operatorId: String(aircraft?.oprId ?? flight?.oprId ?? ""),
    registration: aircraft?.registration ?? flight?.registration ?? null,
    callsign: flight?.callsign ?? null,
    departureIcao: flight?.adep?.icao ?? null,
    arrivalIcao: flight?.ades?.icao ?? null,
    scheduledDeparture: flight?.std ?? flight?.startTime ?? null,
    scheduledArrival: flight?.sta ?? flight?.endTime ?? null,
    status: flight?.status ?? null,
  };
}

const FLIGHT_SUMMARY_SCHEMA = {
  type: "object",
  properties: {
    flightId: { type: "string" },
    flightNid: { type: "string" },
    operatorId: { type: "string" },
    registration: { type: ["string", "null"] },
    callsign: { type: ["string", "null"] },
    departureIcao: { type: ["string", "null"] },
    arrivalIcao: { type: ["string", "null"] },
    scheduledDeparture: { type: ["string", "null"] },
    scheduledArrival: { type: ["string", "null"] },
    status: { type: ["string", "null"] },
  },
};

/** Pull the timeline once and index it, so the flight tools share one fetch shape. */
async function loadTimeline(user, { from, to } = {}) {
  const params = new URLSearchParams({ allOperators: "true" });
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const data = await wallGet(`/api/timeline/flights?${params}`, user, { timeoutMs: 25_000 });
  const aircraft = Array.isArray(data?.aircraft) ? data.aircraft : [];
  const out = [];
  for (const ac of aircraft) {
    for (const flight of ac.flights ?? []) out.push({ flight, aircraft: ac });
  }
  // Some payload shapes carry a flat list too.
  for (const flight of data?.flights ?? []) out.push({ flight, aircraft: flight.aircraft ?? null });
  return out;
}

defineTool({
  name: "get_flight",
  description:
    "One flight's schedule details by flight id: route, times, aircraft, operator and status. Use when the user names a specific flight and wants its basic facts.",
  permission: "user",
  sourceTier: "internal",
  sourceLabel: (input) => `Internal · Leon via the wall · ${input.flight_id}`,
  input: { type: "object", required: ["flight_id"], additionalProperties: false, properties: { flight_id: FLIGHT_ID } },
  output: { type: "object", required: ["flight"], properties: { flight: FLIGHT_SUMMARY_SCHEMA } },
  async handler({ flight_id }, { user }) {
    const { oprId, flightNid } = splitFlightId(flight_id);
    const all = await loadTimeline(user);
    const matches = all.filter(({ flight, aircraft }) => {
      const nid = String(flight?.nid ?? flight?.flightNid ?? "");
      if (nid !== flightNid) return false;
      return oprId ? String(aircraft?.oprId ?? flight?.oprId ?? "") === oprId : true;
    });
    if (matches.length === 0) throw NotFound(`No flight ${flight_id} on the wall timeline.`);
    if (matches.length > 1 && !oprId) {
      throw InvalidInput(`Flight nid ${flightNid} exists for several operators. Use "<operatorId>:${flightNid}".`);
    }
    return { flight: summariseFlight(matches[0].flight, matches[0].aircraft) };
  },
});

defineTool({
  name: "get_flight_state",
  description:
    "Everything the ops wall knows about one flight right now: its limitations and IMPORTANT matches, NOTAM and weather availability for both airports, and which per-flight checks the dispatcher has already ticked. Use before answering 'is this flight ready' or 'what applies to this flight'.",
  permission: "user",
  sourceTier: "internal",
  sourceLabel: (input) => `Internal · wall flight state · ${input.flight_id}`,
  timeoutMs: 45_000,
  maxResultBytes: 256 * 1024,
  input: { type: "object", required: ["flight_id"], additionalProperties: false, properties: { flight_id: FLIGHT_ID } },
  output: {
    type: "object",
    required: ["flightId"],
    properties: {
      flightId: { type: "string" },
      flight: FLIGHT_SUMMARY_SCHEMA,
      checks: { type: "object", description: "Per-type dispatcher acknowledgements for the current cycle." },
      limitations: { type: "array", items: { type: "object" }, description: "Matched limitations, verbatim." },
      important: { type: "array", items: { type: "object" }, description: "Matched IMPORTANT entries, verbatim." },
      departure: { type: "object" },
      arrival: { type: "object" },
    },
  },
  async handler({ flight_id }, { user }) {
    const { oprId, flightNid } = splitFlightId(flight_id);
    if (!flightNid) throw InvalidInput("A flight nid is required.");
    const info = await wallGet(
      `/api/flight-info?flightNid=${encodeURIComponent(flightNid)}&oprId=${encodeURIComponent(oprId)}`,
      user,
      { timeoutMs: 40_000 }
    );
    const flight = info?.flight ?? info ?? {};
    const checks = await wallGet(
      `/api/flight-checks?oprId=${encodeURIComponent(oprId || flight.oprId || "")}&flightNid=${encodeURIComponent(flightNid)}`,
      user,
      { timeoutMs: 15_000 }
    ).catch(() => null);

    return {
      flightId: flight_id,
      flight: summariseFlight(flight, { oprId: oprId || flight.oprId, registration: flight.registration }),
      checks: checks?.checks ?? {},
      // Verbatim, as in list_limitations / list_important.
      limitations: Array.isArray(flight.limitations) ? flight.limitations : (info?.limitations ?? []),
      important: Array.isArray(flight.important) ? flight.important : (info?.important ?? []),
      departure: {
        icao: flight?.adep?.icao ?? null,
        notamCount: Array.isArray(info?.depNotams?.notams) ? info.depNotams.notams.length : null,
        notamsAvailable: Boolean(info?.depNotams?.ok),
        weather: info?.wxDep ?? null,
        aipAvailable: Boolean(info?.depAip?.available),
      },
      arrival: {
        icao: flight?.ades?.icao ?? null,
        notamCount: Array.isArray(info?.arrNotams?.notams) ? info.arrNotams.notams.length : null,
        notamsAvailable: Boolean(info?.arrNotams?.ok),
        weather: info?.wxArr ?? null,
        aipAvailable: Boolean(info?.arrAip?.available),
      },
    };
  },
});

defineTool({
  name: "search_flights",
  description:
    "Find flights on the ops wall by airport, registration, operator, callsign or time window. Use to answer 'which flights go to X', 'what is flying today', or to find a flight id before using the other flight tools.",
  permission: "user",
  sourceTier: "internal",
  sourceLabel: () => "Internal · wall timeline",
  timeoutMs: 30_000,
  maxResultBytes: 256 * 1024,
  input: {
    type: "object",
    additionalProperties: false,
    properties: {
      icao: { ...S.icao, description: "Matches either departure or arrival." },
      registration: { type: "string", maxLength: 16 },
      operatorId: { type: "string", maxLength: 40 },
      callsign: { type: "string", maxLength: 24 },
      from: { type: "string", description: "ISO timestamp; defaults to the wall's current window." },
      to: { type: "string" },
      limit: S.limit(200, 50),
    },
  },
  output: {
    type: "object",
    required: ["count", "flights"],
    properties: {
      count: { type: "integer" },
      truncated: { type: "boolean" },
      flights: { type: "array", items: FLIGHT_SUMMARY_SCHEMA },
    },
  },
  async handler({ icao, registration, operatorId, callsign, from, to, limit }, { user }) {
    const all = await loadTimeline(user, { from, to });
    const code = icao ? String(icao).toUpperCase() : null;
    const reg = registration ? registration.toUpperCase() : null;
    const cs = callsign ? callsign.toUpperCase() : null;

    const rows = all
      .map(({ flight, aircraft }) => summariseFlight(flight, aircraft))
      .filter((f) => (code ? f.departureIcao === code || f.arrivalIcao === code : true))
      .filter((f) => (reg ? String(f.registration ?? "").toUpperCase() === reg : true))
      .filter((f) => (operatorId ? f.operatorId === operatorId : true))
      .filter((f) => (cs ? String(f.callsign ?? "").toUpperCase().includes(cs) : true));

    return { count: rows.length, truncated: rows.length > limit, flights: rows.slice(0, limit) };
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
      aircraftCount: new Set(timeline.map(({ aircraft }) => aircraft?.registration).filter(Boolean)).size,
      leon: syncStatus ?? { available: false },
      activeLimitations: Array.isArray(limitations?.limitations) ? limitations.limitations.length : 0,
      activeImportant: Array.isArray(important?.entries) ? important.entries.length : 0,
      notamCheckComplete: airports ? airports.every((a) => a.checked ?? a.at) : null,
      notamCheckOutstanding: airports ? airports.filter((a) => !(a.checked ?? a.at)).length : null,
      generatedAt: new Date().toISOString(),
    };
  },
});
