// Passenger Manifest generator — the ONE boundary the agent command (and any script) calls.
//
//   generatePassengerManifest({ flightId, leon?, lookup?, progress?, now? })
//     → { pdf: Buffer, filename, title, result, paxNote }
//   generateBlankManifest({ now? }) → same shape, the empty hand-fill form (no page number)
//
// result = { flight: { flightId, callsign, date, route }, operator: { name, source }, pageCount, passengerCount,
//            crewCount, personsOnBoard, warnings: [{ code, message, row? }], missing: [{ row, where, fields }],
//            hasPaxNote, blank }
// paxNote = the operator's free-text passenger note, verbatim, or null. It is personal data and is kept OUT of
// `result` (which is audited and shown to the model): the caller stores it beside the file for the chat to fetch.
//
// It fetches from Leon itself (the caller passes an identifier, never data), read-only, with the credentials of the
// flight's operator (../leon-operators.mjs — the operator registry; nothing is asked of the user). No model output
// reaches the document. NOTHING here logs, and the result object carries no passenger field — rows
// are identified by number and page only — because it is shown in the chat and stored in the audit log.
import { renderManifest } from "./render.mjs";
import { buildManifestModel, FIELD_LABELS, where } from "./model.mjs";
import { parseFlightId, readManifestFlight, ManifestFlightError } from "./leon.mjs";
import { leonForOperator, OperatorUnavailable } from "../leon-operators.mjs";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** PAX-Manifest_<flight number>_<DDMonYYYY>.pdf (e.g. PAX-Manifest_TST101_14Oct2026.pdf) — never a person. */
export function manifestFilename(flightNumber, startTimeUTC) {
  const fn = String(flightNumber ?? "").replace(/[^A-Za-z0-9-]/g, "").slice(0, 16) || "flight";
  const t = new Date(startTimeUTC ?? "");
  const date = Number.isNaN(t.getTime()) ? "undated" : `${String(t.getUTCDate()).padStart(2, "0")}${MONTHS[t.getUTCMonth()]}${t.getUTCFullYear()}`;
  return `PAX-Manifest_${fn}_${date}.pdf`;
}

export async function generatePassengerManifest({ flightId, leon = null, lookup = undefined, progress = null, now = new Date() }) {
  const { oprId, nid } = parseFlightId(flightId);
  progress?.("Connecting to the operator's Leon");
  const client = leon ?? await leonForOperator(oprId);
  const { flight, unmasked, operatorName, operatorNote, operatorSource } = await readManifestFlight(client, nid, { progress, ...(lookup ? { lookup } : {}) });
  if (flight.isCnl) throw new ManifestFlightError("cancelled", "This flight is cancelled in Leon.");

  progress?.("Filling the form");
  const built = buildManifestModel(flight, { unmasked, operatorName, operatorNote, operatorSource });
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
  if (built.counts.passengers === 0 && !warnings.some((w) => w.code === "pax-note" || w.code === "pax-count-only")) {
    warnings.unshift({ code: "no-passengers", message: "Leon lists no passengers on this flight, so the manifest has no passenger rows (crew and Persons on Board are filled)." });
  }
  return {
    pdf: Buffer.from(rendered.bytes),
    filename: manifestFilename(callsign, flight.startTimeUTC),
    title,
    result: {
      flight: { flightId: `${oprId}:${nid}`, callsign, date: built.model.flight.flightDate, route: [built.model.flight.departureIcao, built.model.flight.arrivalIcao].filter(Boolean).join(" → ") },
      operator: { name: built.model.flight.operatorName || null, source: operatorSource ?? null },
      pageCount: rendered.pageCount,
      passengerCount: built.counts.passengers,
      crewCount: built.counts.crew,
      personsOnBoard: built.counts.personsOnBoard,
      warnings,
      missing: built.missing,
      hasPaxNote: Boolean(built.paxNote),
      blank: false,
    },
    paxNote: built.paxNote,
  };
}

export async function generateBlankManifest({ now = new Date() } = {}) {
  const rendered = await renderManifest(null, { blank: true, title: "Passenger Manifest", creationDate: now });
  return {
    pdf: Buffer.from(rendered.bytes),
    filename: "PAX-Manifest_blank.pdf",
    title: "Passenger Manifest (blank)",
    result: { flight: null, operator: null, pageCount: rendered.pageCount, passengerCount: 0, crewCount: null, personsOnBoard: null, warnings: [], missing: [], hasPaxNote: false, blank: true },
    paxNote: null,
  };
}

export { ManifestFlightError, OperatorUnavailable };
