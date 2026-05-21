import { leonGraphqlRequest } from "@/lib/leon/client";
import { mapLeonAircraft, mapLeonFlight } from "@/lib/leon/mappers";
import {
  listActiveLeonOperators,
  markLeonFlightsMissingAsDeleted,
  updateOperatorSyncStatus,
  upsertLeonAircraft,
  upsertLeonFlights,
} from "@/lib/leon/store";
import { refreshLeonAccessTokensForOperators } from "@/lib/leon/token-manager";
import type { LeonSyncOperatorResult, LeonSyncRunResult } from "@/lib/leon/types";

type AircraftListResponse = {
  aircraftList?: Array<Record<string, unknown>>;
};

type FlightListResponse = {
  flightList?: Array<Record<string, unknown>>;
};

const WINDOW_BACK_DAYS = 1;
const WINDOW_FORWARD_DAYS = 2;

function isoDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function buildWindowDates(now = new Date()) {
  const start = new Date(now.getTime());
  start.setUTCDate(start.getUTCDate() - WINDOW_BACK_DAYS);
  const end = new Date(now.getTime());
  end.setUTCDate(end.getUTCDate() + WINDOW_FORWARD_DAYS);
  return {
    startDate: isoDateOnly(start),
    endDate: isoDateOnly(end),
  };
}

async function fetchOperatorAircraft(oprId: string) {
  const data = await leonGraphqlRequest<AircraftListResponse>(
    oprId,
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
    `
  );
  const rows = (data.aircraftList || [])
    .map((row) => mapLeonAircraft(row))
    .filter((x): x is NonNullable<typeof x> => Boolean(x));
  return rows;
}

async function fetchOperatorFlights(oprId: string, startDate: string, endDate: string) {
  const data = await leonGraphqlRequest<FlightListResponse>(
    oprId,
    `
      query FlightListWindow($filter: FlightFilter!) {
        flightList(filter: $filter) {
          flightNid
          flightNo
          status
          isCnl
          startTimeUTC
          endTimeUTC
          flightLastModificationTime
          startAirport {
            code { icao iata }
            name
            city
          }
          endAirport {
            code { icao iata }
            name
            city
          }
          acft {
            registration
            acftType {
              iCAO
            }
          }
          trip {
            tripNid
            flightOrderNoFull
          }
          journeyLog {
            atd
            ata
          }
        }
      }
    `,
    {
      filter: {
        timeInterval: {
          start: startDate,
          end: endDate,
        },
      },
    }
  );

  const rows = (data.flightList || [])
    .map((row) => mapLeonFlight(row))
    .filter((x): x is NonNullable<typeof x> => Boolean(x));
  return rows;
}

async function syncSingleOperator(input: {
  operatorId: string;
  oprId: string;
  startDate: string;
  endDate: string;
}): Promise<LeonSyncOperatorResult> {
  const base: LeonSyncOperatorResult = {
    operatorId: input.operatorId,
    oprId: input.oprId,
    ok: false,
    syncedAircraftCount: 0,
    syncedFlightCount: 0,
  };

  try {
    const [aircraftRows, flightRows] = await Promise.all([
      fetchOperatorAircraft(input.oprId),
      fetchOperatorFlights(input.oprId, input.startDate, input.endDate),
    ]);

    const [aircraftCount, flightCount] = await Promise.all([
      upsertLeonAircraft(input.operatorId, aircraftRows),
      upsertLeonFlights(input.operatorId, flightRows),
    ]);

    await markLeonFlightsMissingAsDeleted(
      input.operatorId,
      flightRows.map((x) => x.flightNid)
    );
    await updateOperatorSyncStatus(input.operatorId, "success");

    return {
      ...base,
      ok: true,
      syncedAircraftCount: aircraftCount,
      syncedFlightCount: flightCount,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateOperatorSyncStatus(input.operatorId, "error", message);
    return {
      ...base,
      ok: false,
      error: message,
    };
  }
}

export async function runLeonSync(source: "manual" | "scheduled" | "webhook"): Promise<LeonSyncRunResult> {
  const startedAt = new Date().toISOString();
  const operators = await listActiveLeonOperators();

  if (operators.length === 0) {
    const finishedAt = new Date().toISOString();
    return {
      ok: true,
      source,
      startedAt,
      finishedAt,
      operatorsTotal: 0,
      operatorsSucceeded: 0,
      operatorsFailed: 0,
      tokenRefreshedFor: [],
      results: [],
    };
  }

  const tokenRefreshedFor = await refreshLeonAccessTokensForOperators(operators.map((x) => x.opr_id));
  const { startDate, endDate } = buildWindowDates();

  const results: LeonSyncOperatorResult[] = [];
  for (const operator of operators) {
    const result = await syncSingleOperator({
      operatorId: operator.id,
      oprId: operator.opr_id,
      startDate,
      endDate,
    });
    results.push(result);
  }

  const operatorsSucceeded = results.filter((x) => x.ok).length;
  const operatorsFailed = results.length - operatorsSucceeded;
  const finishedAt = new Date().toISOString();
  return {
    ok: operatorsFailed === 0,
    source,
    startedAt,
    finishedAt,
    operatorsTotal: results.length,
    operatorsSucceeded,
    operatorsFailed,
    tokenRefreshedFor,
    results,
  };
}
