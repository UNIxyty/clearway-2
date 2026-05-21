import { createSupabaseServiceRoleClient } from "@/lib/supabase-admin";
import type { LeonAircraftRecord, LeonFlightRecord, LeonOperatorRow } from "@/lib/leon/types";

function service() {
  const supabase = createSupabaseServiceRoleClient();
  if (!supabase) {
    throw new Error("Supabase service role client is not configured.");
  }
  return supabase;
}

export async function listActiveLeonOperators(): Promise<LeonOperatorRow[]> {
  const supabase = service();
  const { data, error } = await supabase
    .from("leon_operators")
    .select("id, opr_id, name, notes, is_active, last_sync_at, last_sync_status, last_sync_error")
    .eq("is_active", true)
    .order("opr_id", { ascending: true });
  if (error) throw new Error(`Failed to read leon operators: ${error.message}`);
  return (data || []) as LeonOperatorRow[];
}

export async function upsertLeonOperator(input: {
  oprId: string;
  name?: string | null;
  notes?: string | null;
  isActive?: boolean;
}) {
  const supabase = service();
  const { data, error } = await supabase
    .from("leon_operators")
    .upsert(
      {
        opr_id: input.oprId,
        name: input.name ?? null,
        notes: input.notes ?? "",
        is_active: input.isActive ?? true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "opr_id" }
    )
    .select("id, opr_id, name, notes, is_active, last_sync_at, last_sync_status, last_sync_error")
    .single();
  if (error) throw new Error(`Failed to upsert leon operator: ${error.message}`);
  return data as LeonOperatorRow;
}

export async function upsertLeonAircraft(operatorId: string, rows: LeonAircraftRecord[]): Promise<number> {
  if (rows.length === 0) return 0;
  const supabase = service();
  const now = new Date().toISOString();
  const payload = rows.map((row) => ({
    operator_id: operatorId,
    registration: row.registration,
    acft_type_id: row.acftTypeId,
    acft_type_icao: row.acftTypeIcao,
    acft_type_short_name: row.acftTypeShortName,
    acft_type_iata: row.acftTypeIata,
    pax_capacity: row.paxCapacity,
    raw_payload: row.rawPayload,
    synced_at: now,
    updated_at: now,
  }));
  const { error } = await supabase
    .from("leon_aircraft")
    .upsert(payload, { onConflict: "operator_id,registration" });
  if (error) throw new Error(`Failed to upsert leon aircraft: ${error.message}`);
  return payload.length;
}

export async function upsertLeonFlights(operatorId: string, rows: LeonFlightRecord[]): Promise<number> {
  if (rows.length === 0) return 0;
  const supabase = service();
  const now = new Date().toISOString();
  const payload = rows.map((row) => ({
    operator_id: operatorId,
    flight_nid: row.flightNid,
    flight_no: row.flightNo,
    date_trip: row.dateTrip,
    trip_code: row.tripCode,
    departure_icao: row.departureIcao,
    arrival_icao: row.arrivalIcao,
    estimated_departure: row.estimatedDeparture,
    estimated_arrival: row.estimatedArrival,
    actual_departure: row.actualDeparture,
    actual_arrival: row.actualArrival,
    delay_minutes: row.delayMinutes,
    aircraft_registration: row.aircraftRegistration,
    status: row.status,
    is_deleted: row.isDeleted,
    flight_last_modification_time: row.flightLastModificationTime,
    raw_payload: row.rawPayload,
    synced_at: now,
    updated_at: now,
  }));
  const { error } = await supabase
    .from("leon_flights")
    .upsert(payload, { onConflict: "operator_id,flight_nid" });
  if (error) throw new Error(`Failed to upsert leon flights: ${error.message}`);
  return payload.length;
}

export async function markLeonFlightsMissingAsDeleted(operatorId: string, visibleFlightNids: string[]): Promise<void> {
  const supabase = service();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  let query = supabase
    .from("leon_flights")
    .update({
      is_deleted: true,
      updated_at: new Date().toISOString(),
      synced_at: new Date().toISOString(),
    })
    .eq("operator_id", operatorId)
    .gte("estimated_departure", since);

  if (visibleFlightNids.length > 0) {
    query = query.not("flight_nid", "in", `(${visibleFlightNids.map((x) => `"${x}"`).join(",")})`);
  }
  const { error } = await query;
  if (error) throw new Error(`Failed to mark missing leon flights: ${error.message}`);
}

export async function updateOperatorSyncStatus(
  operatorId: string,
  status: "success" | "error",
  errorMessage?: string
): Promise<void> {
  const supabase = service();
  const { error } = await supabase
    .from("leon_operators")
    .update({
      last_sync_at: new Date().toISOString(),
      last_sync_status: status,
      last_sync_error: errorMessage || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", operatorId);
  if (error) throw new Error(`Failed to update leon operator sync status: ${error.message}`);
}

export async function insertWebhookEvent(input: {
  operatorId?: string | null;
  oprId: string;
  eventType: string;
  idempotencyKey: string;
  payload: Record<string, unknown>;
}) {
  const supabase = service();
  const { data, error } = await supabase
    .from("leon_webhook_events")
    .insert({
      operator_id: input.operatorId || null,
      opr_id: input.oprId,
      event_type: input.eventType,
      idempotency_key: input.idempotencyKey,
      payload: input.payload,
      status: "received",
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { duplicate: true, id: null };
    }
    throw new Error(`Failed to insert leon webhook event: ${error.message}`);
  }

  return { duplicate: false, id: String(data.id) };
}

export async function updateWebhookEventStatus(
  idempotencyKey: string,
  status: "processed" | "failed" | "ignored",
  errorMessage?: string
) {
  const supabase = service();
  const { error } = await supabase
    .from("leon_webhook_events")
    .update({
      status,
      processed_at: new Date().toISOString(),
      error: errorMessage || null,
    })
    .eq("idempotency_key", idempotencyKey);
  if (error) throw new Error(`Failed to update leon webhook event: ${error.message}`);
}
