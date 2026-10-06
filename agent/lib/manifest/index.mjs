// Passenger Manifest generator — the ONE boundary the agent command (and any script) calls.
//
//   generatePassengerManifest({ flightId, user, leon?, progress?, now? })
//     → { pdf: Buffer, filename, title, result }
//   generateBlankManifest({ now? }) → same shape, the empty hand-fill form (no page number)
//
// result = { flight: { flightId, callsign, date, route }, pageCount, passengerCount, crewCount, personsOnBoard,
//            warnings: [{ code, message, row? }], missing: [{ row, where, fields }], blank }
//
// It fetches from Leon itself (the caller passes an identifier, never data), as the signed-in user, read-only. No
// model output reaches the document. NOTHING here logs, and the result object carries no passenger field — rows
// are identified by number and page only — because it is shown in the chat and stored in the audit log.
import { renderManifest } from "./render.mjs";
import { buildManifestModel, FIELD_LABELS, where } from "./model.mjs";
import { parseFlightId, readManifestFlight, ManifestFlightError } from "./leon.mjs";
import { leonForUser, LeonAccessError } from "../leon-user.mjs";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** PAX-Manifest_KLJ7350_29Sep2026.pdf — the flight number and date only; never a person. */
export function manifestFilename(flightNumber, startTimeUTC) {
  const fn = String(flightNumber ?? "").replace(/[^A-Za-z0-9-]/g, "").slice(0, 16) || "flight";
  const t = new Date(startTimeUTC ?? "");
  const date = Number.isNaN(t.getTime()) ? "undated" : `${String(t.getUTCDate()).padStart(2, "0")}${MONTHS[t.getUTCMonth()]}${t.getUTCFullYear()}`;
  return `PAX-Manifest_${fn}_${date}.pdf`;
}

export async function generatePassengerManifest({ flightId, user, leon = null, progress = null, now = new Date() }) {
  const { oprId, nid } = parseFlightId(flightId);
  progress?.("Checking your Leon access");
  const client = leon ?? await leonForUser(user, oprId);
  const { flight, unmasked, operatorName, operatorNote } = await readManifestFlight(client, nid, { progress });
  if (flight.isCnl) throw new ManifestFlightError("cancelled", "This flight is cancelled in Leon.");

  progress?.("Filling the form");
  const built = buildManifestModel(flight, { unmasked, operatorName, operatorNote });
  const callsign = built.model.flight.flightNumber;
  const title = `Passenger Manifest ${callsign} ${built.model.flight.flightDate}`.trim();
  progress?.(`Laying out ${Math.max(1, Math.ceil(built.counts.passengers / 14))} page${built.counts.passengers > 14 ? "s" : ""}`);
  const rendered = await renderManifest(built.model, { title, creationDate: now });

  const warnings = [...built.warnings];
  for (const t of rendered.truncations) {
    warnings.push(t.row
      ? { code: "truncated", row: t.row, message: `Passenger ${where(t.row)}: the ${FIELD_LABELS[t.field]} is too long for its cell and was cut short with "…". Check it against the document before sending.` }
      : { code: "truncated", message: `The ${FIELD_LABELS[t.field]} is too long for its line and was cut short with "…".` });
  }
  if (built.counts.passengers === 0 && !warnings.some((w) => w.code === "pax-text-only")) {
    warnings.unshift({ code: "no-passengers", message: "Leon lists no passengers on this flight, so the manifest has no passenger rows (crew and Persons on Board are filled)." });
  }
  return {
    pdf: Buffer.from(rendered.bytes),
    filename: manifestFilename(callsign, flight.startTimeUTC),
    title,
    result: {
      flight: { flightId: `${oprId}:${nid}`, callsign, date: built.model.flight.flightDate, route: [built.model.flight.departureIcao, built.model.flight.arrivalIcao].filter(Boolean).join(" → ") },
      pageCount: rendered.pageCount,
      passengerCount: built.counts.passengers,
      crewCount: built.counts.crew,
      personsOnBoard: built.counts.personsOnBoard,
      warnings,
      missing: built.missing,
      blank: false,
    },
  };
}

export async function generateBlankManifest({ now = new Date() } = {}) {
  const rendered = await renderManifest(null, { blank: true, title: "Passenger Manifest", creationDate: now });
  return {
    pdf: Buffer.from(rendered.bytes),
    filename: "PAX-Manifest_blank.pdf",
    title: "Passenger Manifest (blank)",
    result: { flight: null, pageCount: rendered.pageCount, passengerCount: 0, crewCount: null, personsOnBoard: null, warnings: [], missing: [], blank: true },
  };
}

export { ManifestFlightError, LeonAccessError };
