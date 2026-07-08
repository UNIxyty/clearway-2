import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_POLL_MS = 30 * 1000;
const ACCESS_TOKEN_TTL_MS = 25 * 60 * 1000;
const THREE_MONTHS_DAYS = 92;
const LOCAL_CACHE_FILE = path.resolve(process.cwd(), "data", "timeline-cache.json");
const AIRPORT_DIRECTORY_CANDIDATES = [
  path.resolve(process.cwd(), "shared-data", "ead-airports-with-names.json"),
  path.resolve(process.cwd(), "shared-data", "airports.json"),
  path.resolve(process.cwd(), "..", "data", "ead-airports-with-names.json"),
  path.resolve(process.cwd(), "..", "data", "airports.json"),
];

function parseDate(value) {
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) {
    return null;
  }
  return dt;
}

function toIsoOrNull(value) {
  const dt = parseDate(value);
  return dt ? dt.toISOString() : null;
}

function normalizeDateLike(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    // Leon can return unix seconds or unix milliseconds.
    const ms = value > 1e12 ? value : value * 1000;
    return new Date(ms).toISOString();
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    // Leon sometimes returns unix timestamps as strings.
    if (/^\d+$/.test(trimmed)) {
      const asNumber = Number(trimmed);
      if (Number.isFinite(asNumber)) {
        const ms = asNumber > 1e12 ? asNumber : asNumber * 1000;
        return new Date(ms).toISOString();
      }
    }
    const dt = parseDate(value);
    if (dt) return dt.toISOString();
    return null;
  }
  return null;
}

function diffMinutes(actual, planned) {
  const actualMs = parseDate(actual)?.getTime();
  const plannedMs = parseDate(planned)?.getTime();
  if (actualMs === undefined || plannedMs === undefined) return null;
  return Math.round((actualMs - plannedMs) / 60000);
}

function addMinutesIso(base, minutes) {
  if (base === null || base === undefined || minutes === null || minutes === undefined) return null;
  const baseMs = parseDate(base)?.getTime();
  if (baseMs === undefined) return null;
  return new Date(baseMs + Number(minutes) * 60000).toISOString();
}

function addDelayIso(base, delayMinutes) {
  if (delayMinutes === null || delayMinutes === undefined || Number(delayMinutes) <= 0) return null;
  return addMinutesIso(base, delayMinutes);
}

function normalizeIcao(value) {
  return String(value || "").trim().toUpperCase();
}

function normalizeCountry(value) {
  return String(value || "").trim();
}

function toUniqueSorted(values = []) {
  return [...new Set(values.filter(Boolean).map((v) => String(v).trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b)
  );
}

// Baseline selection — known-good on every tenant (this is what production
// synced with before the pill work). The richer movement/CTOT/checklist
// fields are added dynamically after schema introspection (see
// resolveFlightSelection): a GraphQL query naming a non-existent field fails
// whole, so we only request what the tenant's schema actually has.
const LEGACY_FLIGHTWATCH_FIELDS = ["atd", "ata", "toIso", "ldgIso"];
// Wanted flightWatch fields, superset across known Leon schemas
// (flight-support documents: tobt ctotIso etdIso offBlock toIso eetIso
// etaIso ldgIso blonIso; plain tenants often expose etd/eta/ctot variants).
const WANTED_FLIGHTWATCH_FIELDS = [
  "atd", "ata", "toIso", "ldgIso",
  "etd", "etdIso", "eta", "etaIso",
  "ctot", "ctotIso", "tobt",
  "offBlock", "bloffIso", "blonIso",
];

function buildFlightSelection({ flightWatchFields, includeChecklist, checklistItemHasDefinition = true }) {
  return `
  flightNid
  flightNo
  status
  startTimeUTC
  endTimeUTC
  startAirport {
    code { icao }
  }
  endAirport {
    code { icao }
  }
  acft {
    aircraftNid
    registration
  }
  ${flightWatchFields.length > 0 ? `flightWatch {\n    ${flightWatchFields.join("\n    ")}\n  }` : ""}
  ${includeChecklist ? `checklist {\n    allItems { cdNid csId${checklistItemHasDefinition ? " definition { groupId }" : ""} }\n  }` : ""}
  passengerList {
    count
  }
  crewMemberList {
    loginNid
  }
`;
}

function addDays(baseDate, days) {
  const dt = new Date(baseDate.getTime());
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt;
}

function minDate(a, b) {
  return a.getTime() <= b.getTime() ? a : b;
}

function overlapsRange(flight, fromIso, toIso) {
  if (!fromIso && !toIso) {
    return true;
  }
  const start = parseDate(flight.startTimeUTC);
  const end = parseDate(flight.endTimeUTC);
  if (!start || !end) {
    return false;
  }
  const from = fromIso ? parseDate(fromIso) : null;
  const to = toIso ? parseDate(toIso) : null;
  if (from && end < from) {
    return false;
  }
  if (to && start > to) {
    return false;
  }
  return true;
}

function flightDedupKey(flight, registration) {
  const adep = flight.adep?.icao ?? "UNK";
  const ades = flight.ades?.icao ?? "UNK";
  const start = flight.startTimeUTC ?? "no-start";
  const end = flight.endTimeUTC ?? "no-end";
  const no = flight.flightNo ?? "UNKNOWN";
  return `${registration}|${no}|${adep}|${ades}|${start}|${end}`;
}

function mapStaticFlight(rawFlight) {
  const plannedDeparture = normalizeDateLike(rawFlight.startTimeUTC ?? null);
  const plannedArrival = normalizeDateLike(rawFlight.endTimeUTC ?? null);
  const etd = normalizeDateLike(rawFlight.flightWatch?.etd ?? null);
  const eta = normalizeDateLike(rawFlight.flightWatch?.eta ?? null);
  const atd = normalizeDateLike(rawFlight.flightWatch?.atd ?? null);
  const ata = normalizeDateLike(rawFlight.flightWatch?.ata ?? null);
  const departureDelayMin = diffMinutes(atd ?? etd, plannedDeparture);
  const arrivalDelayMin = diffMinutes(ata ?? eta, plannedArrival);
  const delayedDepartureUTC = addDelayIso(etd ?? plannedDeparture, departureDelayMin);
  const delayedArrivalUTC = addDelayIso(eta ?? plannedArrival, arrivalDelayMin);

  const hasArrived = Boolean(ata);
  const isAirborne = Boolean(atd) && !hasArrived;

  return {
    // Pill-semantics defaults for static seeds (no Leon extras available).
    blockOff: null,
    takeOff: null,
    landing: null,
    blockOn: null,
    hasArrived,
    isAirborne,
    ctot: null,
    tripStatus: rawFlight.tripStatus ?? rawFlight.status ?? null,
    isConfirmed: true,
    checklistColor: null,
    movementState: movementStateOf({ hasArrived, isAirborne, ctot: null, departureDelayMin }),
    flightNid: rawFlight.flightNid ?? rawFlight.id,
    flightNo: rawFlight.flightNo ?? "UNKNOWN",
    tripNo: rawFlight.tripNo ?? null,
    tripCode: rawFlight.tripCode ?? null,
    status: rawFlight.tripStatus ?? rawFlight.status ?? null,
    startTimeUTC: plannedDeparture,
    endTimeUTC: plannedArrival,
    etd,
    eta,
    atd,
    ata,
    departureDelayMin,
    arrivalDelayMin,
    delayMin: departureDelayMin ?? arrivalDelayMin,
    delayedDepartureUTC,
    delayedArrivalUTC,
    aircraftRegistration: rawFlight.acft ?? null,
    isCnl: Boolean(rawFlight.isCnl),
    flightLastModificationTime: rawFlight.flightLastModificationTime ?? null,
    adep: rawFlight.adep
      ? {
          icao: rawFlight.adep.code ?? null,
          iata: null,
          name: rawFlight.adep.name ?? null,
          city: rawFlight.adep.city ?? null,
          weather: rawFlight.wx_dep ?? rawFlight.adep.weather ?? null,
        }
      : null,
    ades: rawFlight.ades
      ? {
          icao: rawFlight.ades.code ?? null,
          iata: null,
          name: rawFlight.ades.name ?? null,
          city: rawFlight.ades.city ?? null,
          weather: rawFlight.wx_arr ?? rawFlight.ades.weather ?? null,
        }
      : null,
    crewCount: Array.isArray(rawFlight.crewMemberList) ? rawFlight.crewMemberList.length : 0,
    passengerCount: rawFlight.passengerList?.count ?? null,
  };
}

/**
 * Movement state for the wall pill fill (LEON-PILL-MAPPING.md):
 * arrived → airborne → ctot → delayed → scheduled.
 * NOTE: a flight that has both an active CTOT and a delay renders "ctot"
 * (CTOT wins) — flagged for ops confirmation; swap the two checks to change.
 */
export function movementStateOf({ hasArrived, isAirborne, ctot, departureDelayMin }) {
  if (hasArrived) return "arrived";
  if (isAirborne) return "airborne";
  if (ctot) return "ctot";
  if ((departureDelayMin ?? 0) > 0) return "delayed";
  return "scheduled";
}

/**
 * One color per flight from its OPS checklist items: the least-complete item
 * (earliest position in its definition's ordered status list) wins.
 *
 * OPS-only is enforced twice (Item 1): items carrying a definition.groupId
 * other than OPS are skipped outright, and the defs map itself only holds
 * definitions from getAvailableDefinitions(groupId: OPS) — so a SALES (or
 * any other group's) item can never drive the flight-ID colour even on a
 * tenant whose flight checklist mixes groups or whose defs query ignores
 * the group filter. (Live finding: on the reference tenant SALES items hang
 * on the TRIP checklist, and salesDotColor is uniformly #FF0000 — an OPS
 * item at a red status is visually identical to it, which is why the colour
 * source needed proving, not just eyeballing.)
 */
function aggregateChecklistColor(rawChecklist, defs) {
  const items = rawChecklist?.allItems;
  if (!Array.isArray(items) || items.length === 0 || !defs) return null;
  let worst = null;
  for (const item of items) {
    const itemGroup = item?.definition?.groupId;
    if (itemGroup && String(itemGroup).toUpperCase() !== "OPS") continue;
    const def = defs.get(item?.cdNid);
    if (!def) continue;
    const index = def.order.indexOf(item.csId);
    if (index < 0) continue;
    const progress = def.order.length > 1 ? index / (def.order.length - 1) : 1;
    if (!worst || progress < worst.progress) {
      worst = { progress, color: def.colorByStatus[item.csId] ?? null };
    }
  }
  return normalizeHexColor(worst?.color);
}

/** Leon checklist colors come back as bare hex ("86BF53") — prefix them. */
function normalizeHexColor(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const hex = raw.startsWith("#") ? raw.slice(1) : raw;
  return /^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(hex) ? `#${hex}` : null;
}

// Item 1: only flights with a REAL trip status reach the wall/console.
// Leon's FlightStatus enum is CONFIRMED | OPTION | OPPORTUNITY (confirmed vs
// unconfirmed — both stay); drafts/blanks/other non-trip records that slip
// through the flightList have no usable status and are dropped at ingestion,
// which also keeps them out of NOTAM/WX airport collection.
const VALID_TRIP_STATUSES = new Set(["CONFIRMED", "OPTION", "OPPORTUNITY"]);

export function hasValidTripStatus(flight) {
  return VALID_TRIP_STATUSES.has(String(flight?.tripStatus ?? flight?.status ?? "").trim().toUpperCase());
}

export function mapLeonFlight(rawFlight, checklistDefs = null) {
  const fw = rawFlight.flightWatch ?? {};
  const jl = rawFlight.journeyLog ?? {};
  const plannedDeparture = normalizeDateLike(rawFlight.startTimeUTC ?? null);
  const plannedArrival = normalizeDateLike(rawFlight.endTimeUTC ?? null);
  const etd = normalizeDateLike(fw.etd ?? fw.etdIso ?? rawFlight.startTimeUTC ?? null);
  const eta = normalizeDateLike(fw.eta ?? fw.etaIso ?? rawFlight.endTimeUTC ?? null);
  // Movement chain: block-off → take-off → landing → block-on.
  const blockOff = normalizeDateLike(fw.offBlock ?? fw.bloffIso ?? jl.bloffUTC ?? null);
  const takeOff = normalizeDateLike(fw.toIso ?? jl.toTimeUTC ?? null);
  const landing = normalizeDateLike(fw.ldgIso ?? jl.ldgTimeUTC ?? null);
  const blockOn = normalizeDateLike(fw.blonIso ?? jl.blonUTC ?? null);
  const atd = normalizeDateLike(fw.atd ?? null) ?? takeOff ?? normalizeDateLike(jl.atd ?? null) ?? blockOff;
  const ata = normalizeDateLike(fw.ata ?? null) ?? landing ?? normalizeDateLike(jl.ata ?? null) ?? blockOn;
  const departureDelayMin = diffMinutes(atd ?? etd, plannedDeparture);
  const arrivalDelayMin = diffMinutes(ata ?? eta, plannedArrival);
  // The "delayed until" instant is the ACTUAL (or estimated) time itself —
  // never estimate+delay, which double-counts whenever the delay is measured
  // against ATD but drawn from ETD (real case: NUM221 ATD 11:49, ETD 11:30,
  // delay 49 min → old math said 12:19).
  const delayedDepartureUTC = (departureDelayMin ?? 0) > 0 ? (atd ?? etd) : null;
  const delayedArrivalUTC = (arrivalDelayMin ?? 0) > 0 ? (ata ?? eta) : null;
  const ctot = normalizeDateLike(fw.ctotIso ?? fw.ctot ?? fw.tobt ?? null);
  const hasArrived = Boolean(ata);
  const isAirborne = Boolean(atd) && !hasArrived;
  const tripStatus = rawFlight.status ?? null;

  return {
    // ── Leon-driven pill semantics (see LEON-PILL-MAPPING.md) ──
    blockOff,
    takeOff,
    landing,
    blockOn,
    hasArrived,
    isAirborne,
    ctot,
    tripStatus,
    isConfirmed: tripStatus == null ? true : String(tripStatus).toUpperCase() === "CONFIRMED",
    checklistColor: aggregateChecklistColor(rawFlight.checklist, checklistDefs),
    movementState: movementStateOf({
      hasArrived,
      isAirborne,
      ctot,
      departureDelayMin,
    }),
    flightNid: rawFlight.flightNid ?? rawFlight.id ?? null,
    flightNo: rawFlight.flightNo ?? rawFlight.flightNumber ?? "UNKNOWN",
    tripNo: rawFlight.trip?.tripNumber ?? rawFlight.tripNo ?? null,
    tripCode: rawFlight.trip?.flightOrderNoFull ?? rawFlight.trip?.tripNid ?? null,
    status: rawFlight.status ?? null,
    startTimeUTC: plannedDeparture,
    endTimeUTC: plannedArrival,
    etd,
    eta,
    atd,
    ata,
    departureDelayMin,
    arrivalDelayMin,
    delayMin: departureDelayMin ?? arrivalDelayMin,
    delayedDepartureUTC,
    delayedArrivalUTC,
    aircraftRegistration: rawFlight.acft?.registration ?? null,
    isCnl: Boolean(rawFlight.isCnl),
    flightLastModificationTime: rawFlight.flightLastModificationTime ?? null,
    adep: rawFlight.startAirport
      ? {
          icao: rawFlight.startAirport.code?.icao ?? null,
          iata: rawFlight.startAirport.code?.iata ?? null,
          name: rawFlight.startAirport.name ?? null,
          city: rawFlight.startAirport.city ?? null,
          weather: null,
        }
      : null,
    ades: rawFlight.endAirport
      ? {
          icao: rawFlight.endAirport.code?.icao ?? null,
          iata: rawFlight.endAirport.code?.iata ?? null,
          name: rawFlight.endAirport.name ?? null,
          city: rawFlight.endAirport.city ?? null,
          weather: null,
        }
      : null,
    crewCount: Array.isArray(rawFlight.crewMemberList)
      ? rawFlight.crewMemberList.length
      : Array.isArray(rawFlight.crewList)
        ? rawFlight.crewList.length
        : 0,
    passengerCount: rawFlight.passengerList?.count ?? null,
  };
}

/**
 * Heal flights persisted by OLDER sync code. Leon's getModifiedFlightList
 * only re-delivers flights that change, so a cache entry written before the
 * pill-semantics fields existed keeps its stale shape forever: no
 * movementState (pill falls back to white even for long-arrived flights) and
 * absurd delay minutes from a since-fixed epoch-parsing bug (e.g.
 * -29645850). Run once per entry on cache load.
 */
const SANE_DELAY_LIMIT_MIN = 48 * 60;

function healCachedFlight(flight) {
  const healed = { ...flight };

  const saneDelay = (value, actual, planned) => {
    if (value !== null && value !== undefined && Math.abs(Number(value)) <= SANE_DELAY_LIMIT_MIN) {
      return Number(value);
    }
    const recomputed = diffMinutes(actual, planned);
    return recomputed !== null && Math.abs(recomputed) <= SANE_DELAY_LIMIT_MIN ? recomputed : null;
  };
  healed.departureDelayMin = saneDelay(flight.departureDelayMin, flight.atd ?? flight.etd, flight.startTimeUTC);
  healed.arrivalDelayMin = saneDelay(flight.arrivalDelayMin, flight.ata ?? flight.eta, flight.endTimeUTC);
  healed.delayMin = healed.departureDelayMin ?? healed.arrivalDelayMin;

  // The delayed-until instant is the actual/estimated time itself.
  healed.delayedDepartureUTC = (healed.departureDelayMin ?? 0) > 0 ? (flight.atd ?? flight.etd ?? null) : null;
  healed.delayedArrivalUTC = (healed.arrivalDelayMin ?? 0) > 0 ? (flight.ata ?? flight.eta ?? null) : null;

  if (!healed.movementState) {
    const hasArrived = Boolean(flight.ata);
    healed.hasArrived = hasArrived;
    healed.isAirborne = Boolean(flight.atd) && !hasArrived;
    healed.movementState = movementStateOf({
      hasArrived,
      isAirborne: healed.isAirborne,
      ctot: flight.ctot ?? null,
      departureDelayMin: healed.departureDelayMin,
    });
  }
  if (healed.isConfirmed === undefined) healed.isConfirmed = true;
  if (healed.checklistColor !== undefined) healed.checklistColor = normalizeHexColor(healed.checklistColor);
  return healed;
}

// ── Manual limitations, reworked model (Item 9) ─────────────────────────────
// { id, title, description, isPermanent, startDate|null, endDate|null,
//   match: { flights: [{nid,label}], airportIcaos: [], countries: [] },
//   isActive, createdAt, updatedAt }
// No more type taxonomy. Matching is OR across every selected target
// (flight OR airport OR country). The date window gates matching AND the
// sidebar; permanent entries ignore the window and cannot be deleted.

function migrateCustomLimitation(item) {
  if (!item) return item;
  if (item.match && typeof item.match === "object") {
    return {
      ...item,
      isPermanent: item.isPermanent === true,
      startDate: item.startDate ?? null,
      endDate: item.endDate ?? null,
      match: {
        flights: Array.isArray(item.match.flights) ? item.match.flights : [],
        airportIcaos: Array.isArray(item.match.airportIcaos) ? item.match.airportIcaos : [],
        countries: Array.isArray(item.match.countries) ? item.match.countries : [],
      },
    };
  }
  // Legacy shape: {type, airportIcaos, countries} -> Airport/Country match,
  // type dropped, non-permanent, no window.
  const { type: _droppedType, airportIcaos, countries, ...rest } = item;
  return {
    ...rest,
    isPermanent: false,
    startDate: null,
    endDate: null,
    match: {
      flights: [],
      airportIcaos: Array.isArray(airportIcaos) ? airportIcaos : [],
      countries: Array.isArray(countries) ? countries : [],
    },
  };
}

/** Inside the optional [startDate .. endDate] window (UTC calendar days;
 *  end is inclusive end-of-day). Permanent entries are always in-window. */
function limitationInWindow(item, nowMs = Date.now()) {
  if (item?.isPermanent) return true;
  if (item?.startDate) {
    const startMs = Date.parse(`${item.startDate}T00:00:00Z`);
    if (Number.isFinite(startMs) && nowMs < startMs) return false;
  }
  if (item?.endDate) {
    const endMs = Date.parse(`${item.endDate}T23:59:59.999Z`);
    if (Number.isFinite(endMs) && nowMs > endMs) return false;
  }
  return true;
}

function groupFlights(records) {
  const groups = new Map();
  for (const row of records) {
    const registration = row.registration || "UNKNOWN";
    const oprId = row.oprId || "unknown";
    const key = `${oprId}:${row.aircraftNid ?? "none"}:${registration}`;
    if (!groups.has(key)) {
      groups.set(key, {
        oprId,
        operatorName: row.operatorName ?? oprId,
        aircraftNid: row.aircraftNid ?? null,
        registration,
        flights: [],
      });
    }
    groups.get(key).flights.push(row.flight);
  }
  return [...groups.values()].map((group) => {
    group.flights.sort((a, b) => {
      const aTime = parseDate(a.startTimeUTC)?.getTime() ?? 0;
      const bTime = parseDate(b.startTimeUTC)?.getTime() ?? 0;
      return aTime - bTime;
    });
    return group;
  });
}

async function readJsonIfExists(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function gqlString(value) {
  return String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

export class LeonTimelineService {
  constructor({ staticRoot, operatorsStore = null, importantStore = null, alertsStore = null }) {
    this.staticRoot = staticRoot;
    this.operatorsStore = operatorsStore;
    // Optional extra decoration sources: Important entries (class IMP) and
    // NOTAM/weather alert findings (classes NTM/WX). Both plug into the same
    // limitation-chip pipeline the UI already renders.
    this.importantStore = importantStore;
    this.alertsStore = alertsStore;
    this.pollMs = Number(process.env.LEON_SYNC_POLL_MS || DEFAULT_POLL_MS);
    this.operatorId = process.env.LEON_OPR_ID || "";
    this.refreshToken = process.env.LEON_REFRESH_TOKEN || "";
    this.clientId = process.env.LEON_CLIENT_ID || "";
    this.clientSecret = process.env.LEON_CLIENT_SECRET || "";
    this.useOAuth = this.clientId && this.clientSecret && this.refreshToken;

    this.token = null;
    this.tokenExpiresAtMs = 0;
    this.interval = null;
    this.tokensByOperator = new Map();
    this.tokenExpiryByOperator = new Map();
    this.refreshTokensByOperator = new Map();

    this.flightsByNid = new Map();
    this.aircraftByFlightNid = new Map();
    this.aircraftCacheByOperator = new Map();
    this.flightSelectionByOperator = new Map(); // oprId -> GraphQL selection string
    this.checklistDefsByOperator = new Map(); // oprId -> Map(cdNid -> {order[], colorByStatus{}})
    this.syncStateByOperator = new Map();
    this.limitations = [];
    this.rawLimitations = [];
    this.customLimitations = [];
    this.airportDirectoryByIcao = new Map();
    this.countryOptions = [];
    this.hasLiveLeonData = false;
    this.cacheFilePath = LOCAL_CACHE_FILE;

    this.state = {
      source: "static-seed",
      healthy: true,
      lastSyncTimestamp: null,
      lastRunAt: null,
      lastError: null,
      configured: Boolean(this.operatorId && this.refreshToken),
      mode: this.useOAuth ? "oauth-refresh-token" : "api-key-refresh-token",
      cacheStats: {
        updated: 0,
        skipped: 0,
        deleted: 0,
      },
    };
  }

  get isLeonConfigured() {
    return Boolean(this.operatorId && this.refreshToken);
  }

  flightCacheKey(oprId, flightNid) {
    return `${oprId}:${flightNid}`;
  }

  aircraftHideKey(oprId, registration) {
    return `${oprId}:${registration}`;
  }

  async listConfiguredOperators() {
    if (this.operatorsStore) {
      try {
        const fromStore = await this.operatorsStore.getOperatorCredentials();
        for (const operator of fromStore) {
          this.refreshTokensByOperator.set(operator.oprId, operator.refreshToken);
        }
        // When operators store is configured, operators must come from there only.
        return fromStore;
      } catch (error) {
        this.state.lastError = error instanceof Error ? error.message : String(error);
        return [];
      }
    }
    if (this.operatorId && this.refreshToken) {
      this.refreshTokensByOperator.set(this.operatorId, this.refreshToken);
      return [
        {
          id: "env-default",
          oprId: this.operatorId,
          name: this.operatorId,
          refreshToken: this.refreshToken,
        },
      ];
    }
    return [];
  }

  async isAnyOperatorConfigured() {
    const operators = await this.listConfiguredOperators();
    return operators.length > 0;
  }

  async resolveOperatorRefreshToken(oprId) {
    if (this.refreshTokensByOperator.has(oprId)) {
      return this.refreshTokensByOperator.get(oprId);
    }
    await this.listConfiguredOperators();
    if (this.refreshTokensByOperator.has(oprId)) {
      return this.refreshTokensByOperator.get(oprId);
    }
    if (oprId === this.operatorId && this.refreshToken) {
      return this.refreshToken;
    }
    throw new Error(`No refresh token configured for operator ${oprId}.`);
  }

  async listHiddenAircraftKeys() {
    if (!this.operatorsStore) return new Set();
    const hidden = await this.operatorsStore.listHiddenAircraftKeys();
    return new Set(hidden);
  }

  get baseUrl() {
    return this.getBaseUrl(this.operatorId);
  }

  getBaseUrl(oprId = this.operatorId) {
    const domain = process.env.LEON_SANDBOX === "true" ? "sandbox.leon.aero" : "leon.aero";
    return `https://${oprId}.${domain}`;
  }

  async bootstrap() {
    await this.loadAirportDirectory();
    const loadedFromCache = await this.loadLocalCache();
    if (!loadedFromCache) {
      await this.loadStaticSeeds();
    }
    const configured = await this.isAnyOperatorConfigured();
    this.state.configured = configured;
    if (configured) {
      await this.runSyncCycle().catch((error) => {
        this.state.healthy = false;
        this.state.lastError = error instanceof Error ? error.message : String(error);
      });
      this.startPolling();
    }
  }

  async loadStaticSeeds() {
    const staticFlights = await readJsonIfExists(path.join(this.staticRoot, "api", "flights", "data.html"));
    const staticLimitations = await readJsonIfExists(path.join(this.staticRoot, "api", "limitations.html"));

    if (Array.isArray(staticFlights)) {
      for (const aircraftGroup of staticFlights) {
        const aircraftNid = aircraftGroup.acftNid ?? null;
        const registration = aircraftGroup.flights?.[0]?.acft ?? "UNKNOWN";
        for (const flight of aircraftGroup.flights ?? []) {
          const mapped = mapStaticFlight(flight);
          const nid = String(mapped.flightNid);
          this.flightsByNid.set(nid, mapped);
          this.aircraftByFlightNid.set(nid, { aircraftNid, registration });
        }
      }
    }

    if (staticLimitations?.limitations && Array.isArray(staticLimitations.limitations)) {
      this.rawLimitations = staticLimitations.limitations;
      // Keep legacy limitations for backward compatibility, but use custom limitations for timeline logic.
      this.limitations = staticLimitations.limitations.map((item) => ({
        id: item.id,
        title: item.title,
        description: item.description,
        isPermanent: Boolean(item.isPermanent),
        type: item.type,
        startDate: item.startDate,
        endDate: item.endDate,
      }));
    }
  }

  async loadAirportDirectory() {
    let payload = null;
    for (const filePath of AIRPORT_DIRECTORY_CANDIDATES) {
      payload = await readJsonIfExists(filePath);
      if (payload) break;
    }
    this.airportDirectoryByIcao.clear();
    if (!payload || typeof payload !== "object") {
      this.countryOptions = [];
      return;
    }

    const countries = new Set();
    const addEntry = (entry, fallbackIcao = "") => {
      const icao = normalizeIcao(entry?.icao || fallbackIcao);
      if (!icao) return;
      const country = normalizeCountry(entry?.country);
      if (country) countries.add(country);
      this.airportDirectoryByIcao.set(icao, {
        icao,
        name: String(entry?.name || "").trim(),
        country,
      });
    };

    if (Array.isArray(payload)) {
      for (const row of payload) addEntry(row);
    } else {
      for (const [icaoKey, row] of Object.entries(payload)) addEntry(row, icaoKey);
    }
    this.countryOptions = [...countries].sort((a, b) => a.localeCompare(b));
  }

  async loadLocalCache() {
    const payload = await readJsonIfExists(this.cacheFilePath);
    if (!payload || !Array.isArray(payload.flights)) return false;

    this.flightsByNid.clear();
    this.aircraftByFlightNid.clear();
    let droppedStatusless = 0;
    for (const entry of payload.flights) {
      if (!entry?.key || !entry?.flight) continue;
      if (!hasValidTripStatus(entry.flight)) {
        droppedStatusless += 1;
        continue;
      }
      this.flightsByNid.set(entry.key, healCachedFlight(entry.flight));
      if (entry.aircraft) {
        this.aircraftByFlightNid.set(entry.key, entry.aircraft);
      }
    }

    this.syncStateByOperator.clear();
    if (payload.syncStateByOperator && typeof payload.syncStateByOperator === "object") {
      for (const [oprId, syncState] of Object.entries(payload.syncStateByOperator)) {
        if (syncState?.lastSyncTimestamp) {
          this.syncStateByOperator.set(oprId, syncState);
        }
      }
    }

    this.aircraftCacheByOperator.clear();
    if (payload.aircraftCacheByOperator && typeof payload.aircraftCacheByOperator === "object") {
      for (const [oprId, list] of Object.entries(payload.aircraftCacheByOperator)) {
        if (Array.isArray(list)) this.aircraftCacheByOperator.set(oprId, list);
      }
    }

    if (Array.isArray(payload.limitations)) {
      this.limitations = payload.limitations;
    }
    if (Array.isArray(payload.rawLimitations)) {
      this.rawLimitations = payload.rawLimitations;
    }
    if (Array.isArray(payload.customLimitations)) {
      this.customLimitations = payload.customLimitations.map(migrateCustomLimitation);
    }

    if (droppedStatusless > 0) {
      console.log(`[leon-sync] cache load: dropped ${droppedStatusless} flight(s) without a trip status`);
    }
    if (this.flightsByNid.size > 0) {
      this.state.source = "local-cache";
      this.state.lastRunAt = payload.savedAt ?? null;
      return true;
    }
    return false;
  }

  async persistLocalCache() {
    const payload = {
      version: 1,
      savedAt: new Date().toISOString(),
      flights: [...this.flightsByNid.entries()].map(([key, flight]) => ({
        key,
        flight,
        aircraft: this.aircraftByFlightNid.get(key) ?? null,
      })),
      syncStateByOperator: Object.fromEntries(this.syncStateByOperator.entries()),
      aircraftCacheByOperator: Object.fromEntries(this.aircraftCacheByOperator.entries()),
      limitations: this.limitations,
      rawLimitations: this.rawLimitations,
      customLimitations: this.customLimitations,
    };
    await fs.mkdir(path.dirname(this.cacheFilePath), { recursive: true });
    await fs.writeFile(this.cacheFilePath, JSON.stringify(payload), "utf-8");
  }

  startPolling() {
    if (this.interval) {
      clearInterval(this.interval);
    }
    this.interval = setInterval(() => {
      this.runSyncCycle().catch((error) => {
        this.state.healthy = false;
        this.state.lastError = error instanceof Error ? error.message : String(error);
      });
    }, this.pollMs);
  }

  /**
   * One-shot flight-cache purge (Item 4): drops every cached flight and the
   * per-operator sync checkpoints so the NEXT sync is a full initialSync that
   * repopulates with the current normalization. FLIGHTS ONLY — limitations
   * (and every other store: clocks, important, notam-check) are untouched;
   * persistLocalCache keeps them in the cache file.
   */
  async clearFlightCache() {
    const cleared = this.flightsByNid.size;
    this.flightsByNid.clear();
    this.aircraftByFlightNid.clear();
    this.syncStateByOperator.clear();
    await this.persistLocalCache();
    console.log(`[leon-sync] flight cache cleared (${cleared} flight(s)) — next sync repopulates from scratch`);
    // Kick a sync right away so the wall recovers without waiting for the poll.
    this.runSyncCycle().catch((error) => {
      console.error("[leon-sync] post-clear sync failed:", error?.message || error);
    });
    return cleared;
  }

  /**
   * Drop every in-memory trace of one operator after it was deleted from the
   * store: its cached flights/aircraft, per-operator sync state, credential
   * caches and GraphQL/checklist caches. Persists the trimmed cache so the
   * operator's flights don't reappear on a reload.
   */
  async purgeOperator(oprId) {
    const key = String(oprId || "").trim();
    if (!key) return 0;
    let removed = 0;
    const prefix = `${key}:`;
    for (const cacheKey of [...this.flightsByNid.keys()]) {
      if (cacheKey.startsWith(prefix)) {
        this.flightsByNid.delete(cacheKey);
        this.aircraftByFlightNid.delete(cacheKey);
        removed += 1;
      }
    }
    this.syncStateByOperator.delete(key);
    this.aircraftCacheByOperator.delete(key);
    this.flightSelectionByOperator.delete(key);
    this.checklistDefsByOperator.delete(key);
    this.tokensByOperator.delete(key);
    this.tokenExpiryByOperator.delete(key);
    this.refreshTokensByOperator.delete(key);
    await this.persistLocalCache();
    console.log(`[leon-sync] purged operator ${key} (${removed} cached flight(s))`);
    return removed;
  }

  /**
   * Remove one aircraft (tail) from the wall. Leon is the source of truth, so
   * a true delete isn't possible while the tail still has flights in Leon —
   * instead this purges its currently-cached flights (immediate lane/list
   * removal), marks those flights deleted in the shared cache so a reload
   * won't bring them back, and hides the tail persistently so any flights a
   * later sync re-adds stay off the wall. Returns the count purged.
   */
  async purgeAircraft(oprId, registration) {
    const opr = String(oprId || "").trim();
    const reg = String(registration || "").trim();
    if (!opr || !reg) throw new Error("oprId and registration are required.");

    const purgedNids = [];
    for (const [cacheKey, aircraft] of [...this.aircraftByFlightNid.entries()]) {
      if ((aircraft?.oprId ?? "") === opr && (aircraft?.registration ?? "") === reg) {
        const flight = this.flightsByNid.get(cacheKey);
        const nid = flight?.flightNid ?? cacheKey.split(":").pop();
        if (nid != null) purgedNids.push(String(nid));
        this.flightsByNid.delete(cacheKey);
        this.aircraftByFlightNid.delete(cacheKey);
      }
    }
    // Keep the tail off the wall even if a later sync re-adds its flights.
    if (this.operatorsStore) {
      await this.operatorsStore.setAircraftHidden({ oprId: opr, registration: reg, isHidden: true }).catch(() => {});
      if (purgedNids.length > 0) {
        await this.operatorsStore.markFlightsDeleted({ oprId: opr, flightNids: purgedNids }).catch(() => {});
      }
    }
    await this.persistLocalCache();
    console.log(`[leon-sync] purged aircraft ${opr}:${reg} (${purgedNids.length} cached flight(s)) — hidden persistently`);
    return purgedNids.length;
  }

  async runSyncCycle() {
    const cycleStats = { updated: 0, skipped: 0, deleted: 0 };
    try {
      const operators = await this.listConfiguredOperators();
      if (operators.length === 0) {
        throw new Error("No Leon operators configured.");
      }

      for (const operator of operators) {
        await this.fetchAircraftForOperator(operator.oprId);
        if (!this.syncStateByOperator.has(operator.oprId)) {
          const stats = await this.initialSync(operator.oprId);
          cycleStats.updated += stats.updated ?? 0;
          cycleStats.skipped += stats.skipped ?? 0;
          cycleStats.deleted += stats.deleted ?? 0;
        } else {
          const stats = await this.incrementalSync(operator.oprId);
          cycleStats.updated += stats.updated ?? 0;
          cycleStats.skipped += stats.skipped ?? 0;
          cycleStats.deleted += stats.deleted ?? 0;
        }
      }

      this.state.source = operators.length > 1 ? "leon-multi" : "leon";
      this.state.healthy = true;
      this.state.lastError = null;
      this.state.lastRunAt = new Date().toISOString();
      this.state.cacheStats = cycleStats;
      if (cycleStats.skipped > 0) {
        console.log(`[leon-sync] sync cycle: filtered ${cycleStats.skipped} flight(s) without a trip status`);
      }
      if (cycleStats.updated > 0 || cycleStats.deleted > 0 || this.flightsByNid.size === 0) {
        await this.persistLocalCache();
      }
    } catch (error) {
      this.state.healthy = false;
      this.state.lastError = error instanceof Error ? error.message : String(error);
      this.state.lastRunAt = new Date().toISOString();
      this.state.cacheStats = cycleStats;
    }
  }

  async getAccessToken(oprId = this.operatorId) {
    const cached = this.tokensByOperator.get(oprId);
    const cachedExpiry = this.tokenExpiryByOperator.get(oprId) ?? 0;
    if (cached && Date.now() < cachedExpiry) {
      return cached;
    }

    const refreshToken = await this.resolveOperatorRefreshToken(oprId);

    if (this.useOAuth) {
      const form = new URLSearchParams();
      form.set("grant_type", "refresh_token");
      form.set("client_id", this.clientId);
      form.set("client_secret", this.clientSecret);
      form.set("refresh_token", refreshToken);

      const response = await fetch(`${this.getBaseUrl(oprId)}/oauth2/code/token/`, {
        method: "POST",
        body: form,
      });

      if (!response.ok) {
        throw new Error(`OAuth token refresh failed: ${response.status}`);
      }

      const payload = await response.json();
      const token = payload.access_token;
      const tokenExpiresAtMs = Date.now() + ACCESS_TOKEN_TTL_MS;
      this.tokensByOperator.set(oprId, token);
      this.tokenExpiryByOperator.set(oprId, tokenExpiresAtMs);
      return token;
    }

    const form = new URLSearchParams();
    form.set("refresh_token", refreshToken);
    const response = await fetch(`${this.getBaseUrl(oprId)}/access_token/refresh/`, {
      method: "POST",
      body: form,
    });
    if (!response.ok) {
      throw new Error(`API key token refresh failed: ${response.status}`);
    }
    const tokenText = (await response.text()).trim();
    if (!tokenText) {
      throw new Error("Token refresh returned an empty access token.");
    }
    const tokenExpiresAtMs = Date.now() + ACCESS_TOKEN_TTL_MS;
    this.tokensByOperator.set(oprId, tokenText);
    this.tokenExpiryByOperator.set(oprId, tokenExpiresAtMs);
    return tokenText;
  }

  async graphqlRequest(query, variables, oprId = this.operatorId) {
    const token = await this.getAccessToken(oprId);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    let response;
    try {
      response = await fetch(`${this.getBaseUrl(oprId)}/api/graphql/`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ query, variables }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`GraphQL request failed: ${response.status} ${errorBody.slice(0, 400)}`);
    }
    const payload = await response.json();
    if (payload.errors?.length) {
      throw new Error(`GraphQL returned errors: ${payload.errors[0].message}`);
    }
    return payload.data;
  }

  async introspectTypeFields(typeName, oprId) {
    const data = await this.graphqlRequest(
      `query { __type(name: ${JSON.stringify(typeName)}) { fields { name } } }`,
      undefined,
      oprId
    );
    return new Set((data.__type?.fields ?? []).map((field) => field.name));
  }

  /**
   * Build the flightList selection for this tenant from what its schema
   * actually exposes (introspected once per operator per process). Falls
   * back to the legacy minimal selection when introspection fails, so a
   * schema quirk can never take the sync down.
   */
  async resolveFlightSelection(oprId) {
    if (this.flightSelectionByOperator.has(oprId)) {
      return this.flightSelectionByOperator.get(oprId);
    }
    let selection;
    try {
      const [fwFields, flightFields, checklistItemFields] = await Promise.all([
        this.introspectTypeFields("FlightWatch", oprId),
        this.introspectTypeFields("Flight", oprId),
        this.introspectTypeFields("ChecklistItem", oprId).catch(() => new Set()),
      ]);
      const flightWatchFields = flightFields.has("flightWatch")
        ? WANTED_FLIGHTWATCH_FIELDS.filter((name) => fwFields.has(name))
        : [];
      selection = buildFlightSelection({
        flightWatchFields: flightWatchFields.length > 0 ? flightWatchFields : LEGACY_FLIGHTWATCH_FIELDS,
        includeChecklist: flightFields.has("checklist"),
        // Item 1: per-item group is fetched so SALES items can be excluded
        // explicitly; omitted on tenants whose schema doesn't expose it
        // (the OPS defs map still guards those).
        checklistItemHasDefinition: checklistItemFields.has("definition"),
      });
    } catch {
      selection = buildFlightSelection({
        flightWatchFields: LEGACY_FLIGHTWATCH_FIELDS,
        includeChecklist: false,
      });
    }
    this.flightSelectionByOperator.set(oprId, selection);
    return selection;
  }

  /** Checklist status definitions (id -> ordered statuses + colors), cached. */
  async ensureChecklistDefs(oprId) {
    if (this.checklistDefsByOperator.has(oprId)) {
      return this.checklistDefsByOperator.get(oprId);
    }
    let defs = null;
    try {
      const data = await this.graphqlRequest(
        `query { checklist { getAvailableDefinitions(groupId: OPS) { nid statuses { status color } } } }`,
        undefined,
        oprId
      );
      const definitions = data.checklist?.getAvailableDefinitions ?? [];
      defs = new Map(
        definitions.map((definition) => [
          definition.nid,
          {
            order: (definition.statuses ?? []).map((s) => s.status),
            colorByStatus: Object.fromEntries((definition.statuses ?? []).map((s) => [s.status, s.color])),
          },
        ])
      );
      if (defs.size === 0) defs = null;
    } catch {
      defs = null; // tenant without OPS checklist definitions — IDs use default color
    }
    this.checklistDefsByOperator.set(oprId, defs);
    return defs;
  }

  async fetchAircraftForOperator(oprId = this.operatorId) {
    if (!oprId) return [];
    const data = await this.graphqlRequest(
      `
        query {
          aircraftList {
            registration
            paxCapacity
            acftType {
              acftTypeId
              icao
              shortName
              iata
            }
          }
        }
      `,
      undefined,
      oprId
    );

    const aircraft = (data.aircraftList ?? [])
      .map((row, index) => ({
        id: row.aircraftNid ?? `${oprId}-${row.registration ?? "UNKNOWN"}-${index}`,
        registration: row.registration ?? "UNKNOWN",
        paxCapacity: row.paxCapacity ?? null,
        acftTypeId: row.acftType?.acftTypeId ?? null,
        acftTypeIcao: row.acftType?.icao ?? null,
        acftTypeShortName: row.acftType?.shortName ?? null,
        acftTypeIata: row.acftType?.iata ?? null,
      }))
      .sort((a, b) => a.registration.localeCompare(b.registration));

    this.aircraftCacheByOperator.set(oprId, aircraft);
    return aircraft;
  }

  async fetchFlightsForOperatorRange(oprId, fromDate, toDate) {
    const allRawFlights = [];
    const selection = await this.resolveFlightSelection(oprId);
    let chunkStart = new Date(fromDate);

    while (chunkStart <= toDate) {
      const chunkEnd = minDate(addDays(chunkStart, 9), toDate);
      const chunkStartText = chunkStart.toISOString().slice(0, 10);
      // Leon rejects zero-length intervals in some tenants; ensure at least 1 day.
      const requestedEnd = chunkEnd <= chunkStart ? addDays(chunkStart, 1) : chunkEnd;
      const chunkEndText = requestedEnd.toISOString().slice(0, 10);
      const data = await this.graphqlRequest(
        `
          query {
            flightList(filter: { timeInterval: { start: "${gqlString(chunkStartText)}", end: "${gqlString(chunkEndText)}" } }) {
              ${selection}
            }
          }
        `,
        undefined,
        oprId
      );
      allRawFlights.push(...(data.flightList ?? []));
      chunkStart = addDays(chunkEnd, 1);
    }

    return allRawFlights;
  }

  async initialSync(oprId = this.operatorId) {
    const now = new Date();
    const start = parseDate(process.env.LEON_SYNC_RANGE_START) ?? addDays(now, -7);
    const end = parseDate(process.env.LEON_SYNC_RANGE_END) ?? addDays(now, 30);
    const checkpointBeforeStart = new Date().toISOString();
    const selection = await this.resolveFlightSelection(oprId);
    const checklistDefs = await this.ensureChecklistDefs(oprId);

    const stats = { updated: 0, skipped: 0, deleted: 0 };
    let chunkStart = start;
    while (chunkStart <= end) {
      const chunkEnd = minDate(addDays(chunkStart, THREE_MONTHS_DAYS), end);
      const chunkStartText = chunkStart.toISOString().slice(0, 10);
      const chunkEndText = chunkEnd.toISOString().slice(0, 10);
      const data = await this.graphqlRequest(
        `
          query {
            flightList(filter: { timeInterval: { start: "${gqlString(chunkStartText)}", end: "${gqlString(chunkEndText)}" } }) {
              ${selection}
            }
          }
        `,
        undefined,
        oprId
      );

      for (const rawFlight of data.flightList ?? []) {
        const mapped = mapLeonFlight(rawFlight, checklistDefs);
        if (!hasValidTripStatus(mapped)) {
          stats.skipped += 1;
          continue;
        }
        mapped.oprId = oprId;
        const nid = this.flightCacheKey(oprId, mapped.flightNid);
        this.flightsByNid.set(nid, mapped);
        stats.updated += 1;
        this.aircraftByFlightNid.set(nid, {
          oprId,
          aircraftNid: rawFlight.acft?.aircraftNid ?? null,
          registration: rawFlight.acft?.registration ?? "UNKNOWN",
        });
      }

      chunkStart = addDays(chunkEnd, 1);
    }

    this.syncStateByOperator.set(oprId, { lastSyncTimestamp: checkpointBeforeStart });
    this.hasLiveLeonData = true;
    return stats;
  }

  async incrementalSync(oprId = this.operatorId) {
    const operatorState = this.syncStateByOperator.get(oprId);
    const dateTime = operatorState?.lastSyncTimestamp ?? new Date().toISOString();
    const selection = await this.resolveFlightSelection(oprId);
    const checklistDefs = await this.ensureChecklistDefs(oprId);
    const data = await this.graphqlRequest(
      `
        query {
          flights {
            getModifiedFlightList(dateTime: "${gqlString(dateTime)}") {
              timestamp
              created {
                ${selection}
              }
              changed {
                ${selection}
              }
              deleted
            }
          }
        }
      `,
      undefined,
      oprId
    );

    const stats = { updated: 0, skipped: 0, deleted: 0 };
    const delta = data.flights?.getModifiedFlightList;
    if (!delta) {
      return stats;
    }

    for (const row of [...(delta.created ?? []), ...(delta.changed ?? [])]) {
      const mapped = mapLeonFlight(row, checklistDefs);
      const nid = this.flightCacheKey(oprId, mapped.flightNid);
      if (!hasValidTripStatus(mapped)) {
        // A modified flight can LOSE its trip status — evict it too.
        if (this.flightsByNid.delete(nid)) this.aircraftByFlightNid.delete(nid);
        stats.skipped += 1;
        continue;
      }
      mapped.oprId = oprId;
      this.flightsByNid.set(nid, mapped);
      stats.updated += 1;
      this.aircraftByFlightNid.set(nid, {
        oprId,
        aircraftNid: row.acft?.aircraftNid ?? null,
        registration: row.acft?.registration ?? "UNKNOWN",
      });
    }

    for (const deletedNid of delta.deleted ?? []) {
      const key = this.flightCacheKey(oprId, deletedNid);
      this.flightsByNid.delete(key);
      this.aircraftByFlightNid.delete(key);
      stats.deleted += 1;
    }

    const nextTimestamp =
      typeof delta.timestamp === "number"
        ? new Date(delta.timestamp * 1000).toISOString()
        : toIsoOrNull(delta.timestamp) || dateTime;
    this.syncStateByOperator.set(oprId, { lastSyncTimestamp: nextTimestamp });
    return stats;
  }

  async refreshNow() {
    await this.runSyncCycle();
  }

  async getFlights({ from, to, oprId, refresh, allOperators } = {}) {
    const forceLive = refresh === true || String(refresh) === "true";
    const targetOprId = String(oprId || "").trim();
    const useAllOperators = allOperators === true || (!targetOprId && forceLive);
    const hiddenKeys = await this.listHiddenAircraftKeys();

    if (forceLive || useAllOperators || targetOprId) {
      const configured = await this.listConfiguredOperators();
      if (configured.length === 0) {
        throw new Error("LEON credentials are not configured.");
      }

      const operators = useAllOperators
        ? configured
        : configured.filter((operator) => operator.oprId === targetOprId);
      if (operators.length === 0) {
        throw new Error(`Operator ${targetOprId} is not configured.`);
      }

      if (forceLive) {
        await this.runSyncCycle();
      }

      const operatorById = new Map(operators.map((operator) => [operator.oprId, operator]));
      const records = [];
      for (const [nid, flight] of this.flightsByNid.entries()) {
        const aircraft = this.aircraftByFlightNid.get(nid) ?? {
          oprId: flight.oprId ?? this.operatorId,
          aircraftNid: null,
          registration: flight.aircraftRegistration ?? "UNKNOWN",
        };
        const activeOprId = aircraft.oprId ?? flight.oprId;
        if (!operatorById.has(activeOprId)) continue;
        if (!overlapsRange(flight, from, to)) continue;
        const registration = aircraft.registration ?? flight.aircraftRegistration ?? "UNKNOWN";
        if (hiddenKeys.has(this.aircraftHideKey(activeOprId, registration))) continue;
        const operator = operatorById.get(activeOprId);
        const operatorName = flight.operatorName ?? operator.name ?? activeOprId;
        records.push({
          oprId: activeOprId,
          operatorName,
          aircraftNid: aircraft.aircraftNid ?? null,
          registration,
          flight: this.decorateFlightWithLimitations(flight, {
            oprId: activeOprId,
            operatorName,
            registration,
          }),
        });
      }

      const grouped = groupFlights(records);
      return {
        source: operators.length > 1 ? "leon-live-multi" : "leon-live",
        syncedAt: new Date().toISOString(),
        lastSyncTimestamp: null,
        totalFlights: records.length,
        totalAircraft: grouped.length,
        aircraft: grouped,
        oprId: useAllOperators ? null : targetOprId,
        operators: operators.map((operator) => operator.oprId),
      };
    }

    const records = [];
    for (const [nid, flight] of this.flightsByNid.entries()) {
      if (!overlapsRange(flight, from, to)) {
        continue;
      }
      const aircraft = this.aircraftByFlightNid.get(nid) ?? {
        oprId: flight.oprId ?? this.operatorId,
        aircraftNid: null,
        registration: "UNKNOWN",
      };
      const hideKey = this.aircraftHideKey(aircraft.oprId ?? this.operatorId, aircraft.registration);
      if (hiddenKeys.has(hideKey)) continue;
      const fallbackOprId = aircraft.oprId ?? this.operatorId;
      records.push({
        oprId: fallbackOprId,
        operatorName: flight.operatorName ?? fallbackOprId,
        aircraftNid: aircraft.aircraftNid,
        registration: aircraft.registration,
        flight: this.decorateFlightWithLimitations(flight, {
          oprId: fallbackOprId,
          operatorName: flight.operatorName ?? fallbackOprId,
          registration: aircraft.registration,
        }),
      });
    }
    const grouped = groupFlights(records);
    return {
      source: this.state.source,
      syncedAt: this.state.lastRunAt,
      lastSyncTimestamp: null,
      totalFlights: records.length,
      totalAircraft: grouped.length,
      aircraft: grouped,
      oprId: this.operatorId,
      operators: [...new Set(records.map((row) => row.oprId).filter(Boolean))],
    };
  }

  async getAircraftSchedule({ days = 7, refresh = true } = {}) {
    const now = new Date();
    const fromIso = now.toISOString();
    const toIso = addDays(now, Number(days) || 7).toISOString();
    const hiddenKeys = await this.listHiddenAircraftKeys();
    const result = await this.getFlights({
      from: fromIso,
      to: toIso,
      refresh,
      allOperators: true,
    });

    const byKey = new Map();
    for (const aircraftGroup of result.aircraft) {
      const registration = aircraftGroup.registration || "UNKNOWN";
      const oprId = aircraftGroup.oprId ?? aircraftGroup.flights?.[0]?.oprId ?? "unknown";
      const key = this.aircraftHideKey(oprId, registration);
      byKey.set(key, {
        oprId,
        operatorName: aircraftGroup.flights?.[0]?.operatorName ?? oprId,
        registration,
        flightCount: aircraftGroup.flights?.length ?? 0,
        isHidden: hiddenKeys.has(key),
        nextFlightStart: aircraftGroup.flights?.[0]?.startTimeUTC ?? null,
      });
    }

    return {
      source: result.source,
      days: Number(days) || 7,
      from: fromIso,
      to: toIso,
      totalAircraft: byKey.size,
      aircraft: [...byKey.values()].sort((a, b) => a.registration.localeCompare(b.registration)),
    };
  }

  async getLegacyFlightsData({ from, to } = {}) {
    const hiddenKeys = await this.listHiddenAircraftKeys();
    const result = await this.getFlights({ from, to });
    const byKey = new Map();
    for (const aircraft of result.aircraft) {
      const hideKey = this.aircraftHideKey(aircraft.oprId ?? "unknown", aircraft.registration);
      if (hiddenKeys.has(hideKey)) continue;
      byKey.set(`${aircraft.oprId ?? "unknown"}:${aircraft.aircraftNid ?? "none"}:${aircraft.registration}`, aircraft);
    }

    const allAircraft = new Map();
    for (const aircraft of this.aircraftByFlightNid.values()) {
      const registration = aircraft.registration || "UNKNOWN";
      const oprId = aircraft.oprId ?? this.operatorId ?? "unknown";
      const hideKey = this.aircraftHideKey(oprId, registration);
      if (hiddenKeys.has(hideKey)) continue;
      const key = `${oprId}:${aircraft.aircraftNid ?? "none"}:${registration}`;
      if (!allAircraft.has(key)) {
        allAircraft.set(key, {
          oprId,
          aircraftNid: aircraft.aircraftNid ?? null,
          registration,
        });
      }
    }

    const sortedAircraft = [...allAircraft.values()].sort((a, b) =>
      a.registration.localeCompare(b.registration)
    );

    return sortedAircraft.map((aircraftEntry) => {
      const match = byKey.get(`${aircraftEntry.oprId}:${aircraftEntry.aircraftNid ?? "none"}:${aircraftEntry.registration}`);
      const dedupMap = new Map();
      for (const flight of match?.flights ?? []) {
        const key = flightDedupKey(flight, aircraftEntry.registration);
        const existing = dedupMap.get(key);
        if (!existing) {
          dedupMap.set(key, flight);
          continue;
        }

        // Prefer non-cancelled flights when duplicate flight blocks exist.
        if (existing.isCnl && !flight.isCnl) {
          dedupMap.set(key, flight);
          continue;
        }
        if (existing.isCnl === flight.isCnl) {
          const existingModified = parseDate(existing.flightLastModificationTime)?.getTime() ?? 0;
          const candidateModified = parseDate(flight.flightLastModificationTime)?.getTime() ?? 0;
          if (candidateModified > existingModified) {
            dedupMap.set(key, flight);
          }
        }
      }

      const mappedFlights = [...dedupMap.values()]
        .sort((a, b) => {
          const at = parseDate(a.startTimeUTC)?.getTime() ?? 0;
          const bt = parseDate(b.startTimeUTC)?.getTime() ?? 0;
          return at - bt;
        })
        .map((flight) => ({
          id: String(flight.flightNid),
          flightNid: flight.flightNid,
          flightNo: flight.flightNo,
          tripNo: flight.tripNo,
          tripStatus: flight.status ?? "confirmed",
          acft: aircraftEntry.registration,
          acftNid: aircraftEntry.aircraftNid,
          adep: {
            id: `${flight.adep?.icao ?? "UNK"}-ADEP`,
            code: flight.adep?.icao ?? "UNK",
            name: flight.adep?.name ?? "Unknown",
            city: flight.adep?.city ?? "",
            weather: flight.adep?.weather ?? "UNDEFINED",
            limitations: { limitations: [] },
            country: {
              id: "unknown-country",
              name: "UNKNOWN",
              limitations: { limitations: [] },
            },
          },
          ades: {
            id: `${flight.ades?.icao ?? "UNK"}-ADES`,
            code: flight.ades?.icao ?? "UNK",
            name: flight.ades?.name ?? "Unknown",
            city: flight.ades?.city ?? "",
            weather: flight.ades?.weather ?? "UNDEFINED",
            limitations: { limitations: [] },
            country: {
              id: "unknown-country",
              name: "UNKNOWN",
              limitations: { limitations: [] },
            },
          },
          startTimeUTC: flight.startTimeUTC,
          endTimeUTC: flight.endTimeUTC,
          flightWatch: {
            etd: flight.etd ?? flight.startTimeUTC ?? null,
            atd: flight.atd ?? flight.delayedDepartureUTC ?? null,
            eta: flight.eta ?? flight.endTimeUTC ?? null,
            ata: flight.ata ?? flight.delayedArrivalUTC ?? null,
            eet: null,
            ctot: null,
          },
          adep_services: "NEGATIVE",
          ades_services: "NEGATIVE",
          cwy_services: "NEGATIVE",
          wx_dep: flight.adep?.weather ?? "UNDEFINED",
          wx_arr: flight.ades?.weather ?? "UNDEFINED",
          limitations: { limitations: [] },
        }));

      return {
        acftNid: aircraftEntry.aircraftNid,
        flights: mappedFlights,
      };
    });
  }

  async getAircraft({ oprId, refresh, allOperators } = {}) {
    if (allOperators || !oprId) {
      const schedule = await this.getAircraftSchedule({ days: 7, refresh: refresh === true });
      return {
        source: schedule.source,
        oprId: null,
        totalAircraft: schedule.totalAircraft,
        aircraft: schedule.aircraft.map((row) => ({
          id: `${row.oprId}:${row.registration}`,
          oprId: row.oprId,
          operatorName: row.operatorName,
          registration: row.registration,
          flightCount: row.flightCount,
          isHidden: row.isHidden,
          paxCapacity: null,
          acftTypeId: null,
          acftTypeIcao: null,
          acftTypeShortName: null,
          acftTypeIata: null,
        })),
      };
    }

    const targetOprId = String(oprId || this.operatorId || "").trim();
    const cacheKey = targetOprId || "static-seed";
    const isSecondary = Boolean(targetOprId && targetOprId !== this.operatorId);

    if (isSecondary && !(await this.isAnyOperatorConfigured())) {
      throw new Error("LEON credentials are not configured.");
    }

    if (refresh && targetOprId && (await this.isAnyOperatorConfigured())) {
      await this.fetchAircraftForOperator(targetOprId);
    }

    let aircraft = this.aircraftCacheByOperator.get(cacheKey) || [];
    if (aircraft.length === 0) {
      const grouped = groupFlights(
        [...this.flightsByNid.entries()].map(([nid, flight]) => {
          const ac = this.aircraftByFlightNid.get(nid) ?? { aircraftNid: null, registration: "UNKNOWN" };
          return { aircraftNid: ac.aircraftNid, registration: ac.registration, flight };
        })
      );
      aircraft = grouped.map((group, index) => ({
        id: group.aircraftNid ?? `${cacheKey}-${group.registration}-${index}`,
        registration: group.registration,
        paxCapacity: null,
        acftTypeId: null,
        acftTypeIcao: null,
        acftTypeShortName: null,
        acftTypeIata: null,
      }));
      this.aircraftCacheByOperator.set(cacheKey, aircraft);
    }

    return {
      source: isSecondary && this.isLeonConfigured ? "leon-live" : this.state.source,
      oprId: targetOprId || null,
      totalAircraft: aircraft.length,
      aircraft,
    };
  }

  getLimitations() {
    const nowMs = Date.now();
    const active = this.customLimitations.filter(
      (item) => item.isActive !== false && limitationInWindow(item, nowMs)
    );
    return {
      source: this.state.source,
      syncedAt: this.state.lastRunAt,
      count: active.length,
      limitations: active,
    };
  }

  getLegacyLimitationsPayload() {
    if (Array.isArray(this.rawLimitations) && this.rawLimitations.length > 0) {
      return { limitations: this.rawLimitations };
    }
    return {
      limitations: this.limitations.map((item, index) => ({
        id: item.id,
        index,
        title: item.title,
        description: item.description,
        isPermanent: item.isPermanent,
        startDate: item.startDate,
        endDate: item.endDate,
        type: item.type,
        airports: { airports: [] },
        countries: { countries: [] },
        flights: [],
      })),
    };
  }

  getStatus() {
    return {
      ...this.state,
      pollMs: this.pollMs,
      flightsCached: this.flightsByNid.size,
      limitationsCached: this.limitations.length,
      operatorsSynced: this.syncStateByOperator.size,
      storage: this.operatorsStore?.storageMode?.() ?? "unknown",
      cacheStats: this.state.cacheStats ?? { updated: 0, skipped: 0, deleted: 0 },
    };
  }

  getFlightCountryByIcao(icao) {
    const key = normalizeIcao(icao);
    if (!key) return "";
    return this.airportDirectoryByIcao.get(key)?.country || "";
  }

  getMatchedLimitationIds(flight) {
    const nowMs = Date.now();
    const active = this.customLimitations.filter(
      (item) => item.isActive !== false && limitationInWindow(item, nowMs)
    );
    if (active.length === 0) return [];
    const depIcao = normalizeIcao(flight?.adep?.icao);
    const arrIcao = normalizeIcao(flight?.ades?.icao);
    const depCountry = this.getFlightCountryByIcao(depIcao);
    const arrCountry = this.getFlightCountryByIcao(arrIcao);
    const flightNid = String(flight?.flightNid ?? "");

    const matched = [];
    for (const item of active) {
      const match = item.match || {};
      // OR semantics across every selected target: a flight matches when it
      // IS one of the picked flights, or touches a picked airport, or
      // touches a picked country.
      const flightSet = new Set((match.flights || []).map((f) => String(f?.nid ?? f)).filter(Boolean));
      const airportSet = new Set((match.airportIcaos || []).map(normalizeIcao).filter(Boolean));
      const countrySet = new Set((match.countries || []).map(normalizeCountry).filter(Boolean));
      const flightMatch = flightSet.size > 0 && flightNid && flightSet.has(flightNid);
      const airportMatch =
        airportSet.size > 0 && (airportSet.has(depIcao) || airportSet.has(arrIcao));
      const countryMatch =
        countrySet.size > 0 && (countrySet.has(depCountry) || countrySet.has(arrCountry));
      if (flightMatch || airportMatch || countryMatch) {
        matched.push(item.id);
      }
    }
    return matched;
  }

  buildFlightMatchContext(flight, context = {}) {
    return {
      depIcao: flight?.adep?.icao ?? "",
      arrIcao: flight?.ades?.icao ?? "",
      depCountry: this.getFlightCountryByIcao(flight?.adep?.icao),
      arrCountry: this.getFlightCountryByIcao(flight?.ades?.icao),
      oprId: context.oprId ?? flight?.oprId ?? "",
      operatorName: context.operatorName ?? "",
      registration: context.registration ?? flight?.aircraftRegistration ?? "",
      startTimeUTC: flight?.startTimeUTC ?? null,
      flightNid: flight?.flightNid ?? null,
    };
  }

  decorateFlightWithLimitations(flight, context = {}) {
    const limitationIds = this.getMatchedLimitationIds(flight);
    const limitationMap = new Map(this.customLimitations.map((item) => [item.id, item]));
    const limitations = limitationIds
      .map((id) => limitationMap.get(id))
      .filter(Boolean)
      .map((item) => ({
        id: item.id,
        title: item.title,
        description: item.description,
        type: "LIM", // the type taxonomy is gone (Item 9)
        source: "custom",
      }));

    const matchCtx = this.buildFlightMatchContext(flight, context);

    if (this.importantStore?.loaded) {
      for (const entry of this.importantStore.matchFlight(matchCtx)) {
        limitations.push({
          id: entry.id,
          title: entry.title,
          description: entry.body,
          type: "IMP",
          source: "important",
        });
      }
    }

    if (this.alertsStore) {
      for (const finding of this.alertsStore.matchFlight(matchCtx)) {
        // NTM/WX markers mean "UNREVIEWED NOTAM/weather item": once the
        // finding's airport has today's CHECKED ack on the NOTAM Check page,
        // its marker disappears (per-airport granularity — the flight keeps
        // markers from its other airport until that one is acked too).
        if (
          typeof this.notamCheckedLookup === "function" &&
          finding.icao &&
          this.notamCheckedLookup(finding.icao)
        ) {
          continue;
        }
        limitations.push({
          id: finding.id,
          title: finding.title,
          description: finding.description,
          type: finding.badge,
          source: "alert",
          icao: finding.icao ?? null,
        });
      }
    }

    // CheckWX flight categories for the pill's per-airport WX markers
    // (acknowledgment-only; null = no data). Injected by server.mjs.
    const wxDep = typeof this.weatherLookup === "function" ? this.weatherLookup(flight.adep?.icao) : null;
    const wxArr = typeof this.weatherLookup === "function" ? this.weatherLookup(flight.ades?.icao) : null;

    if (limitations.length === 0) {
      return { ...flight, limitationIds: [], limitations: [], lim: null, wxDep, wxArr };
    }
    const allIds = limitations.map((item) => item.id);
    const primary = limitations[0] || null;
    const lim =
      primary
        ? {
            type: primary.type,
            msg: primary.description || primary.title,
          }
        : null;
    return { ...flight, limitationIds: allIds, limitations, lim, wxDep, wxArr };
  }

  /**
   * Count, per custom limitation and per Important entry, how many cached
   * flights in the given window currently match — used by the Console to
   * show "affects N flights".
   */
  computeMatchCounts({ from, to } = {}) {
    const limitationCounts = {};
    const importantCounts = {};
    for (const [nid, flight] of this.flightsByNid.entries()) {
      if (!overlapsRange(flight, from, to)) continue;
      const aircraft = this.aircraftByFlightNid.get(nid) ?? {};
      for (const id of this.getMatchedLimitationIds(flight)) {
        limitationCounts[id] = (limitationCounts[id] || 0) + 1;
      }
      if (this.importantStore?.loaded) {
        const ctx = this.buildFlightMatchContext(flight, {
          oprId: aircraft.oprId,
          registration: aircraft.registration,
        });
        for (const entry of this.importantStore.matchFlight(ctx)) {
          importantCounts[entry.id] = (importantCounts[entry.id] || 0) + 1;
        }
      }
    }
    return { limitations: limitationCounts, important: importantCounts };
  }

  /**
   * Find a cached flight by nid (and optionally operator). Returns
   * { key, flight, aircraft } or null.
   */
  getFlightByNid(flightNid, oprId = "") {
    const nid = String(flightNid ?? "").trim();
    if (!nid) return null;
    const candidates = oprId ? [`${oprId}:${nid}`, nid] : [nid];
    for (const key of candidates) {
      if (this.flightsByNid.has(key)) {
        return {
          key,
          flight: this.flightsByNid.get(key),
          aircraft: this.aircraftByFlightNid.get(key) ?? null,
        };
      }
    }
    for (const [key, flight] of this.flightsByNid.entries()) {
      if (String(flight.flightNid) === nid) {
        return { key, flight, aircraft: this.aircraftByFlightNid.get(key) ?? null };
      }
    }
    return null;
  }

  listAirportMatches(query = "", limit = 50) {
    const q = String(query || "").trim().toLowerCase();
    const max = Math.max(1, Math.min(200, Number(limit) || 50));
    const rows = [];
    const source =
      this.airportDirectoryByIcao.size > 0
        ? [...this.airportDirectoryByIcao.values()]
        : [...new Map(
            [...this.flightsByNid.values()].flatMap((flight) => {
              const dep = normalizeIcao(flight?.adep?.icao);
              const arr = normalizeIcao(flight?.ades?.icao);
              return [dep, arr]
                .filter(Boolean)
                .map((icao) => [icao, { icao, name: "", country: "" }]);
            })
          ).values()];

    for (const row of source) {
      if (!q) {
        rows.push(row);
      } else {
        const hay = `${row.icao} ${row.name} ${row.country}`.toLowerCase();
        if (hay.includes(q)) rows.push(row);
      }
      if (rows.length >= max) break;
    }
    return rows;
  }

  listCountries(query = "", limit = 200) {
    const q = String(query || "").trim().toLowerCase();
    const max = Math.max(1, Math.min(500, Number(limit) || 200));
    return this.countryOptions
      .filter((country) => !q || country.toLowerCase().includes(q))
      .slice(0, max);
  }

  listCustomLimitations({ includeInactive = true } = {}) {
    // includeInactive=false is the WALL's view: active AND inside the date
    // window (permanent = always). The console passes true so out-of-window
    // entries stay manageable.
    const nowMs = Date.now();
    const rows = includeInactive
      ? this.customLimitations
      : this.customLimitations.filter(
          (item) => item.isActive !== false && limitationInWindow(item, nowMs)
        );
    return rows
      .slice()
      .sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
  }

  async upsertCustomLimitation(input = {}) {
    const title = String(input.title || "").trim();
    if (!title) {
      throw new Error("Limitation title is required.");
    }
    const dateOrNull = (value, label) => {
      const v = String(value || "").trim();
      if (!v) return null;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || !Number.isFinite(Date.parse(`${v}T00:00:00Z`))) {
        throw new Error(`${label} must be a YYYY-MM-DD date.`);
      }
      return v;
    };
    const startDate = dateOrNull(input.startDate, "Start date");
    const endDate = dateOrNull(input.endDate, "End date");
    if (startDate && endDate && startDate > endDate) {
      throw new Error("End date must not be before the start date.");
    }
    const matchInput = input.match && typeof input.match === "object" ? input.match : input;
    const flights = (Array.isArray(matchInput.flights) ? matchInput.flights : [])
      .map((f) => ({ nid: String(f?.nid ?? f ?? "").trim(), label: String(f?.label ?? "").trim() }))
      .filter((f) => f.nid);
    const now = new Date().toISOString();
    const id = String(input.id || `LIM-${Date.now().toString(36).toUpperCase()}`).trim();
    const next = {
      id,
      title,
      description: String(input.description || "").trim(),
      isPermanent: input.isPermanent === true,
      startDate,
      endDate,
      match: {
        flights,
        airportIcaos: toUniqueSorted((matchInput.airportIcaos || []).map(normalizeIcao)),
        countries: toUniqueSorted((matchInput.countries || []).map(normalizeCountry)),
      },
      isActive: input.isActive !== false,
      createdAt: now,
      updatedAt: now,
    };

    const index = this.customLimitations.findIndex((item) => item.id === id);
    if (index >= 0) {
      next.createdAt = this.customLimitations[index].createdAt || now;
      this.customLimitations[index] = next;
    } else {
      this.customLimitations.push(next);
    }
    await this.persistLocalCache();
    return next;
  }

  async setCustomLimitationActive(id, isActive) {
    const index = this.customLimitations.findIndex((item) => item.id === id);
    if (index < 0) {
      throw new Error("Limitation not found.");
    }
    this.customLimitations[index] = {
      ...this.customLimitations[index],
      isActive: Boolean(isActive),
      updatedAt: new Date().toISOString(),
    };
    await this.persistLocalCache();
    return this.customLimitations[index];
  }

  async deleteCustomLimitation(id) {
    const existing = this.customLimitations.find((item) => item.id === id);
    if (!existing) {
      throw new Error("Limitation not found.");
    }
    if (existing.isPermanent) {
      throw new Error("This limitation is permanent and cannot be deleted — deactivate it instead.");
    }
    this.customLimitations = this.customLimitations.filter((item) => item.id !== id);
    await this.persistLocalCache();
  }
}
