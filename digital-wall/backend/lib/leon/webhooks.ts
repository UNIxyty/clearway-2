import crypto from "node:crypto";
import { mapLeonAircraft, mapLeonFlight, parseWebhookEventType } from "@/lib/leon/mappers";
import {
  insertWebhookEvent,
  listActiveLeonOperators,
  updateWebhookEventStatus,
  upsertLeonAircraft,
  upsertLeonFlights,
} from "@/lib/leon/store";

type WebhookPayload = Record<string, unknown>;

function pickOprId(payload: WebhookPayload): string {
  return String(
    payload.oprId ??
      payload.operatorId ??
      payload.operator_id ??
      payload.opr_id ??
      ""
  ).trim();
}

function pickEventType(payload: WebhookPayload): string {
  return String(payload.type ?? payload.eventType ?? payload.event ?? "unknown").trim();
}

function pickIdempotencyKey(payload: WebhookPayload, rawBody: string, headerEventId?: string | null): string {
  const preferred = String(
    headerEventId || payload.eventId || payload.id || payload.messageId || ""
  ).trim();
  if (preferred) return preferred;
  return crypto.createHash("sha256").update(rawBody).digest("hex");
}

export async function processLeonWebhook(input: {
  rawBody: string;
  payload: WebhookPayload;
  headerEventId?: string | null;
}) {
  const eventTypeRaw = pickEventType(input.payload);
  const eventType = parseWebhookEventType(eventTypeRaw);
  const oprId = pickOprId(input.payload);
  if (!oprId) {
    throw new Error("Webhook payload does not contain oprId/operatorId.");
  }

  const operators = await listActiveLeonOperators();
  const operator = operators.find((x) => x.opr_id === oprId) || null;

  const idempotencyKey = pickIdempotencyKey(input.payload, input.rawBody, input.headerEventId);
  const inserted = await insertWebhookEvent({
    operatorId: operator?.id || null,
    oprId,
    eventType: eventTypeRaw || "unknown",
    idempotencyKey,
    payload: input.payload,
  });

  if (inserted.duplicate) {
    return { ok: true, duplicate: true, eventType, oprId };
  }

  try {
    if (!operator) {
      await updateWebhookEventStatus(idempotencyKey, "ignored", "Unknown operator.");
      return { ok: true, duplicate: false, eventType, oprId, ignored: true };
    }

    if (eventType === "new_aircraft") {
      const payloadAircraft =
        (input.payload.aircraft as Record<string, unknown> | undefined) ||
        (input.payload.data as Record<string, unknown> | undefined);
      if (payloadAircraft) {
        const aircraft = mapLeonAircraft(payloadAircraft);
        if (aircraft) {
          await upsertLeonAircraft(operator.id, [aircraft]);
          await updateWebhookEventStatus(idempotencyKey, "processed");
          return { ok: true, duplicate: false, eventType, oprId };
        }
      }
      await updateWebhookEventStatus(idempotencyKey, "ignored", "No aircraft payload.");
      return { ok: true, duplicate: false, eventType, oprId, ignored: true };
    }

    if (eventType === "new_flight" || eventType === "edited_flight") {
      const payloadFlight =
        (input.payload.flight as Record<string, unknown> | undefined) ||
        (input.payload.data as Record<string, unknown> | undefined);
      if (payloadFlight) {
        const flight = mapLeonFlight(payloadFlight);
        if (flight) {
          await upsertLeonFlights(operator.id, [flight]);
          await updateWebhookEventStatus(idempotencyKey, "processed");
          return { ok: true, duplicate: false, eventType, oprId };
        }
      }
      await updateWebhookEventStatus(idempotencyKey, "ignored", "No flight payload.");
      return { ok: true, duplicate: false, eventType, oprId, ignored: true };
    }

    if (eventType === "deleted_flight") {
      const flightNid = String(
        input.payload.flightNid ??
          (input.payload.flight as Record<string, unknown> | undefined)?.flightNid ??
          ""
      ).trim();
      if (flightNid) {
        await upsertLeonFlights(operator.id, [
          {
            flightNid,
            flightNo: null,
            dateTrip: new Date().toISOString().slice(0, 10),
            tripCode: null,
            departureIcao: null,
            arrivalIcao: null,
            estimatedDeparture: null,
            estimatedArrival: null,
            actualDeparture: null,
            actualArrival: null,
            delayMinutes: 0,
            aircraftRegistration: null,
            status: "deleted",
            flightLastModificationTime: new Date().toISOString(),
            isDeleted: true,
            rawPayload: input.payload,
          },
        ]);
        await updateWebhookEventStatus(idempotencyKey, "processed");
        return { ok: true, duplicate: false, eventType, oprId };
      }
      await updateWebhookEventStatus(idempotencyKey, "ignored", "No flightNid for delete event.");
      return { ok: true, duplicate: false, eventType, oprId, ignored: true };
    }

    await updateWebhookEventStatus(idempotencyKey, "ignored", "Unsupported event type.");
    return { ok: true, duplicate: false, eventType, oprId, ignored: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateWebhookEventStatus(idempotencyKey, "failed", message);
    throw error;
  }
}
