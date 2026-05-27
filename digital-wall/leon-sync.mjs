import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_POLL_MS = 30 * 1000;
const ACCESS_TOKEN_TTL_MS = 25 * 60 * 1000;
const THREE_MONTHS_DAYS = 92;
const LOCAL_CACHE_FILE = path.resolve(process.cwd(), "data", "timeline-cache.json");

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

const LEON_FLIGHT_FIELDS = `
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
  flightWatch {
    atd
    ata
    toIso
    ldgIso
  }
  passengerList {
    count
  }
  crewMemberList {
    loginNid
  }
`;

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

  return {
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

function mapLeonFlight(rawFlight) {
  const fw = rawFlight.flightWatch ?? {};
  const jl = rawFlight.journeyLog ?? {};
  const plannedDeparture = normalizeDateLike(rawFlight.startTimeUTC ?? null);
  const plannedArrival = normalizeDateLike(rawFlight.endTimeUTC ?? null);
  const etd = normalizeDateLike(fw.etd ?? fw.etdIso ?? rawFlight.startTimeUTC ?? null);
  const eta = normalizeDateLike(fw.eta ?? fw.etaIso ?? rawFlight.endTimeUTC ?? null);
  const atd = normalizeDateLike(fw.atd ?? fw.toIso ?? jl.atd ?? jl.toTimeUTC ?? jl.bloffUTC ?? null);
  const ata = normalizeDateLike(fw.ata ?? fw.ldgIso ?? jl.ata ?? jl.ldgTimeUTC ?? jl.blonUTC ?? null);
  const departureDelayMin = diffMinutes(atd ?? etd, plannedDeparture);
  const arrivalDelayMin = diffMinutes(ata ?? eta, plannedArrival);
  const delayedDepartureUTC = addDelayIso(etd ?? plannedDeparture, departureDelayMin);
  const delayedArrivalUTC = addDelayIso(eta ?? plannedArrival, arrivalDelayMin);

  return {
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
  constructor({ staticRoot, operatorsStore = null }) {
    this.staticRoot = staticRoot;
    this.operatorsStore = operatorsStore;
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
    this.syncStateByOperator = new Map();
    this.limitations = [];
    this.rawLimitations = [];
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

  async loadLocalCache() {
    const payload = await readJsonIfExists(this.cacheFilePath);
    if (!payload || !Array.isArray(payload.flights)) return false;

    this.flightsByNid.clear();
    this.aircraftByFlightNid.clear();
    for (const entry of payload.flights) {
      if (!entry?.key || !entry?.flight) continue;
      this.flightsByNid.set(entry.key, entry.flight);
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
              ${LEON_FLIGHT_FIELDS}
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
              ${LEON_FLIGHT_FIELDS}
            }
          }
        `,
        undefined,
        oprId
      );

      for (const rawFlight of data.flightList ?? []) {
        const mapped = mapLeonFlight(rawFlight);
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
    const data = await this.graphqlRequest(
      `
        query {
          flights {
            getModifiedFlightList(dateTime: "${gqlString(dateTime)}") {
              timestamp
              created {
                ${LEON_FLIGHT_FIELDS}
              }
              changed {
                ${LEON_FLIGHT_FIELDS}
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
      const mapped = mapLeonFlight(row);
      mapped.oprId = oprId;
      const nid = this.flightCacheKey(oprId, mapped.flightNid);
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
        records.push({
          oprId: activeOprId,
          operatorName: flight.operatorName ?? operator.name ?? activeOprId,
          aircraftNid: aircraft.aircraftNid ?? null,
          registration,
          flight,
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
      records.push({
        oprId: aircraft.oprId ?? this.operatorId,
        operatorName: flight.operatorName ?? aircraft.oprId ?? this.operatorId,
        aircraftNid: aircraft.aircraftNid,
        registration: aircraft.registration,
        flight,
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
    return {
      source: this.state.source,
      syncedAt: this.state.lastRunAt,
      count: this.limitations.length,
      limitations: this.limitations,
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
}
