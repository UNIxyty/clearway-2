export type LeonOperatorRow = {
  id: string;
  opr_id: string;
  name: string | null;
  notes: string;
  is_active: boolean;
  last_sync_at: string | null;
  last_sync_status: "idle" | "success" | "error";
  last_sync_error: string | null;
};

export type LeonAircraftRecord = {
  registration: string;
  acftTypeId: string | null;
  acftTypeIcao: string | null;
  acftTypeShortName: string | null;
  acftTypeIata: string | null;
  paxCapacity: number | null;
  rawPayload: Record<string, unknown>;
};

export type LeonFlightRecord = {
  flightNid: string;
  flightNo: string | null;
  dateTrip: string;
  tripCode: string | null;
  departureIcao: string | null;
  arrivalIcao: string | null;
  estimatedDeparture: string | null;
  estimatedArrival: string | null;
  actualDeparture: string | null;
  actualArrival: string | null;
  delayMinutes: number;
  aircraftRegistration: string | null;
  status: string | null;
  flightLastModificationTime: string | null;
  isDeleted: boolean;
  rawPayload: Record<string, unknown>;
};

export type LeonWebhookEventType =
  | "edited_flight"
  | "new_flight"
  | "deleted_flight"
  | "new_aircraft"
  | "unknown";

export type LeonSyncOperatorResult = {
  operatorId: string;
  oprId: string;
  ok: boolean;
  syncedAircraftCount: number;
  syncedFlightCount: number;
  error?: string;
};

export type LeonSyncRunResult = {
  ok: boolean;
  source: "manual" | "scheduled" | "webhook";
  startedAt: string;
  finishedAt: string;
  operatorsTotal: number;
  operatorsSucceeded: number;
  operatorsFailed: number;
  tokenRefreshedFor: string[];
  results: LeonSyncOperatorResult[];
};
