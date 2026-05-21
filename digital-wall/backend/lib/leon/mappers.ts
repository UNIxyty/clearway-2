import type { LeonAircraftRecord, LeonFlightRecord, LeonWebhookEventType } from "@/lib/leon/types";

function parseIsoOrNull(value: unknown): string | null {
  if (!value || typeof value !== "string") return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function toDelayMinutes(estimatedDeparture: string | null, actualDeparture: string | null): number {
  if (!estimatedDeparture || !actualDeparture) return 0;
  const etd = new Date(estimatedDeparture).getTime();
  const atd = new Date(actualDeparture).getTime();
  if (!Number.isFinite(etd) || !Number.isFinite(atd)) return 0;
  return Math.max(0, Math.round((atd - etd) / 60000));
}

type LeonGraphqlFlight = {
  flightNid?: string | number;
  flightNo?: string | null;
  status?: string | null;
  startTimeUTC?: string | null;
  endTimeUTC?: string | null;
  isCnl?: boolean;
  startAirport?: { code?: { icao?: string | null } | null } | null;
  endAirport?: { code?: { icao?: string | null } | null } | null;
  acft?: { registration?: string | null } | null;
  trip?: { flightOrderNoFull?: string | null; tripNid?: string | null } | null;
  journeyLog?: { atd?: string | null; ata?: string | null } | null;
  flightWatch?: { atd?: string | null; ata?: string | null; etd?: string | null; eta?: string | null } | null;
  flightLastModificationTime?: string | null;
  [key: string]: unknown;
};

export function mapLeonFlight(raw: LeonGraphqlFlight): LeonFlightRecord | null {
  const flightNid = raw.flightNid !== undefined && raw.flightNid !== null ? String(raw.flightNid) : "";
  if (!flightNid) return null;

  const estimatedDeparture = parseIsoOrNull(raw.flightWatch?.etd ?? raw.startTimeUTC ?? null);
  const estimatedArrival = parseIsoOrNull(raw.flightWatch?.eta ?? raw.endTimeUTC ?? null);
  const actualDeparture = parseIsoOrNull(raw.flightWatch?.atd ?? raw.journeyLog?.atd ?? null);
  const actualArrival = parseIsoOrNull(raw.flightWatch?.ata ?? raw.journeyLog?.ata ?? null);

  const dateTrip = estimatedDeparture ? estimatedDeparture.slice(0, 10) : new Date().toISOString().slice(0, 10);

  return {
    flightNid,
    flightNo: raw.flightNo ?? null,
    dateTrip,
    tripCode: raw.trip?.flightOrderNoFull ?? raw.trip?.tripNid ?? null,
    departureIcao: raw.startAirport?.code?.icao ?? null,
    arrivalIcao: raw.endAirport?.code?.icao ?? null,
    estimatedDeparture,
    estimatedArrival,
    actualDeparture,
    actualArrival,
    delayMinutes: toDelayMinutes(estimatedDeparture, actualDeparture),
    aircraftRegistration: raw.acft?.registration ?? null,
    status: raw.status ?? null,
    flightLastModificationTime: parseIsoOrNull(raw.flightLastModificationTime),
    isDeleted: Boolean(raw.isCnl),
    rawPayload: raw as Record<string, unknown>,
  };
}

type LeonGraphqlAircraft = {
  registration?: string | null;
  paxCapacity?: number | null;
  acftType?: {
    acftTypeId?: string | null;
    icao?: string | null;
    shortName?: string | null;
    iata?: string | null;
  } | null;
  [key: string]: unknown;
};

export function mapLeonAircraft(raw: LeonGraphqlAircraft): LeonAircraftRecord | null {
  const registration = (raw.registration || "").trim();
  if (!registration) return null;
  return {
    registration,
    acftTypeId: raw.acftType?.acftTypeId ?? null,
    acftTypeIcao: raw.acftType?.icao ?? null,
    acftTypeShortName: raw.acftType?.shortName ?? null,
    acftTypeIata: raw.acftType?.iata ?? null,
    paxCapacity: typeof raw.paxCapacity === "number" ? raw.paxCapacity : null,
    rawPayload: raw as Record<string, unknown>,
  };
}

export function parseWebhookEventType(rawType: unknown): LeonWebhookEventType {
  const value = String(rawType || "").toLowerCase().trim();
  if (value.includes("edited") && value.includes("flight")) return "edited_flight";
  if (value.includes("new") && value.includes("flight")) return "new_flight";
  if (value.includes("deleted") && value.includes("flight")) return "deleted_flight";
  if (value.includes("new") && value.includes("aircraft")) return "new_aircraft";
  return "unknown";
}
