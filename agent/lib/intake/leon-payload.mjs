// THE LINE. Everything above it is the model: it fills our extraction schema (schema.mjs). Everything below
// it is this file — typed, deterministic code that turns a REVIEWED extraction into Leon's `FlightCreate`.
// The model never produces, sees or edits a Leon payload; it cannot add a field Leon would accept, because
// the only fields that exist are the ones written here.
//
// Leon's FlightCreate (live schema, cwy-cwy, 2026-09-30):
//   required: flightNo: FlightNo!  startTimeUTC: DateTime!  endTimeUTC: DateTime!
//             adepCode: AirportCodeScalar!  adesCode: AirportCodeScalar!  isEmptyLeg: Boolean!
//   optional used here: aircraftNid (Leon's own id — resolved from the registration by lookup, never guessed),
//             paxNumber: Int (ONE total — Leon has no adult/child/infant split), opsNotes: String
//   not on FlightCreate: crew (assigned separately in Leon) — the crew count is shown for review, not sent.
//
// A leg builds only when every value Leon needs is a real value. `unknown` (TBA / -----), `not_given`,
// `tz_unknown`, `invalid`, `conflict` and `leon_refused` all refuse to build — they never become 0, "" or a
// default. Each refusal names the field and the reason, for the review screen.
import { BLOCKING } from "./schema.mjs";

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?Z$/;
const ICAO = /^[A-Z]{4}$/;
const FLIGHT_NO = /^[A-Z0-9]{2,4}\s?\d{1,5}[A-Z]?$|^[A-Z0-9-]{3,10}$/;

/** Why a field cannot be sent, or null when it can. */
function blocked(field, label, { required = true } = {}) {
  if (!field) return required ? `${label}: not given` : null;
  if (BLOCKING.has(field.state)) return `${label}: ${field.state.replace(/_/g, " ")}${field.said ? ` (source: "${field.said}")` : ""}`;
  if (required && (field.value === null || field.value === undefined || field.value === "")) return `${label}: not given`;
  return null;
}

/**
 * @param leg       one reviewed leg (schema shape, after code-side conversion: airports as ICAO, times with utc)
 * @param lookups   { aircraftNidByRegistration: Map<string, number> } — from Leon's aircraftList, not the model
 * @param marker    our idempotency marker for this leg, written into opsNotes: "CWY-INTAKE <requestId>/<legIndex>"
 * @returns { ok: true, payload } | { ok: false, reasons: string[] }
 */
export function buildFlightCreate(leg, { aircraftNidByRegistration = new Map() } = {}, marker) {
  const reasons = [];
  for (const [f, label] of [[leg.departure, "Departure"], [leg.arrival, "Arrival"], [leg.flightNumber, "Flight number"]]) { const r = blocked(f, label); if (r) reasons.push(r); }
  for (const [f, label] of [[leg.std, "STD"], [leg.sta, "STA"]]) {
    const r = blocked(f, label); if (r) { reasons.push(r); continue; }
    if (!ISO_UTC.test(String(f.value?.utc ?? ""))) reasons.push(`${label}: no UTC time${f.value?.tzStated ? "" : " (time zone not stated)"}`);
  }
  const dep = String(leg.departure?.value ?? "").toUpperCase(), arr = String(leg.arrival?.value ?? "").toUpperCase();
  if (dep && !ICAO.test(dep)) reasons.push(`Departure: "${dep}" is not an ICAO code (convert with our airport lookup first)`);
  if (arr && !ICAO.test(arr)) reasons.push(`Arrival: "${arr}" is not an ICAO code (convert with our airport lookup first)`);
  const flightNo = String(leg.flightNumber?.value ?? "").toUpperCase().replace(/\s+/g, "");
  if (flightNo && !FLIGHT_NO.test(flightNo)) reasons.push(`Flight number: "${flightNo}" is not a flight number`);
  const std = Date.parse(leg.std?.value?.utc ?? ""), sta = Date.parse(leg.sta?.value?.utc ?? "");
  if (Number.isFinite(std) && Number.isFinite(sta) && sta <= std) reasons.push("STA is not after STD");
  if (Number.isFinite(std) && Number.isFinite(sta) && sta - std > 20 * 3600_000) reasons.push("STA is more than 20 hours after STD");

  // Aircraft: optional in Leon, but if a registration was given it must resolve; a TBA registration stays unsent.
  let aircraftNid = null;
  const reg = leg.registration;
  // Only "not given" may leave the aircraft out; TBA / conflict / invalid block even though they carry no value.
  if (reg && reg.state !== "not_given") {
    const r = blocked(reg, "Registration"); if (r) reasons.push(r);
    else { aircraftNid = aircraftNidByRegistration.get(String(reg.value).toUpperCase().replace(/[^A-Z0-9]/g, "")) ?? null; if (aircraftNid == null) reasons.push(`Registration: ${reg.value} is not an aircraft of this operator in Leon`); }
  }
  // Passengers: Leon takes ONE total. Unknown stays unknown (never 0); "0" only when the source said zero.
  let paxNumber;
  const pax = leg.pax?.total;
  if (pax && pax.state !== "not_given") {
    const r = blocked(pax, "Passengers"); if (r) reasons.push(r);
    else if (pax.state === "zero") paxNumber = 0;
    else if (Number.isInteger(pax.value) && pax.value >= 0) paxNumber = pax.value; else reasons.push(`Passengers: "${pax.said ?? pax.value}" is not a count`);
  }
  if (reasons.length) return { ok: false, reasons };
  const payload = {
    flightNo, startTimeUTC: new Date(std).toISOString().replace(/\.000Z$/, "Z"), endTimeUTC: new Date(sta).toISOString().replace(/\.000Z$/, "Z"),
    adepCode: dep, adesCode: arr, isEmptyLeg: /position|ferry|empty/i.test(String(leg.flightType?.value ?? "")),
    ...(aircraftNid != null ? { aircraftNid } : {}), ...(paxNumber !== undefined ? { paxNumber } : {}),
    opsNotes: marker,
  };
  return { ok: true, payload };
}
