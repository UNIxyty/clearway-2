// Passenger Manifest — Leon flight record → the typed model the renderer draws, plus the warnings a person must read
// before the document is sent. Pure: no I/O, no logging, no model (LLM) involvement anywhere.
//
// Rules (build brief + spec §3):
//   - a missing value is BLANK: never "N/A", "-", "TBC" or a placeholder;
//   - rows stay in Leon's order (never sorted);
//   - warnings identify a passenger by ROW and PAGE only — never by name or document number;
//   - every value goes to the page EXACTLY as Leon stores it. The only transformations are: dates → DD-Mon-YYYY (UTC);
//     Leon's gender enum (MALE / FEMALE) → the form's M / F; the name cell = surname, given name, middle name joined
//     with single spaces (three Leon fields, one cell). No upper-casing, no hyphens added or removed, no whitespace
//     tidying, no validation that rewrites a value. A value the pinned font cannot draw is left blank and reported.
import { PERSONS_ON_BOARD_INCLUDES_CREW, NATIONALITY_FORMAT, DOCUMENT_LEG } from "./config.mjs";
import { PASSENGERS_PER_PAGE } from "./layout.mjs";
import { loadManifestFonts, unprintable } from "./fonts.mjs";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-09-29" or an ISO timestamp → "29-Sep-2026" (UTC). Anything unparseable → "" (blank, and reported). */
export function formatDate(value) {
  const s = String(value ?? "").trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(s);
  if (!m) return "";
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return "";
  if (s.length > 10) {
    const t = new Date(s);
    if (Number.isNaN(t.getTime())) return "";
    return `${String(t.getUTCDate()).padStart(2, "0")}-${MONTHS[t.getUTCMonth()]}-${t.getUTCFullYear()}`;
  }
  return `${String(d).padStart(2, "0")}-${MONTHS[mo - 1]}-${y}`;
}

/** Leon's value, as stored. null / undefined → "" (blank). */
const asIs = (v) => (v == null ? "" : String(v));
const isBlank = (v) => !String(v ?? "").trim();
const joinNonBlank = (parts) => parts.map(asIs).filter((x) => !isBlank(x)).join(" ");
const SEX = { MALE: "M", FEMALE: "F" };

export const FIELD_LABELS = {
  name: "name", sex: "sex", dateOfBirth: "date of birth", placeOfBirth: "place of birth",
  documentNumber: "passport number", documentExpiry: "passport expiry", nationality: "nationality",
  operatorName: "Owner or Operator", registration: "registration", flightNumber: "flight number",
  flightDate: "date", departureIcao: "departure", arrivalIcao: "arrival", crew: "number of crew", pob: "persons on board",
};

export const where = (row) => `row ${((row - 1) % PASSENGERS_PER_PAGE) + 1} on page ${Math.floor((row - 1) / PASSENGERS_PER_PAGE) + 1}`;

function documentOf(pc, leg, unmasked) {
  const passport = pc?.[`${leg}Passport`];
  const travel = pc?.[`${leg}TravelDocument`];
  const masked = Boolean(passport?.isMasked);
  const realNumber = masked ? unmasked?.[pc?.passengerContactNid]?.[leg]?.number ?? null : passport?.number;
  return {
    number: asIs(realNumber ?? (masked ? "" : travel?.number) ?? ""),
    expiry: passport?.neverExpires ? "" : formatDate(passport?.expiresDate),
    neverExpires: Boolean(passport?.neverExpires),
    masked: masked && !realNumber,
    nationality: passport?.nationality ?? null,
    surname: masked ? unmasked?.[pc?.passengerContactNid]?.[leg]?.surname : passport?.surname,
    givenNames: masked ? [unmasked?.[pc?.passengerContactNid]?.[leg]?.name, unmasked?.[pc?.passengerContactNid]?.[leg]?.middleName] : [passport?.name, passport?.middleName],
    present: Boolean(passport || travel?.number),
    hasNationalIdOnly: !passport && !travel?.number && Boolean(pc?.[`${leg}NationalId`]?.number),
  };
}

/**
 * Leon flight (the shape leon.mjs queries) → { model, warnings, missing, counts }.
 *   options.unmasked: { [passengerContactNid]: { departure: {number,…}, arrival: {…} } } from the second, permission-
 *   checked read; options.operatorName / operatorNote / operatorSource come from leon.mjs resolveOperator.
 */
export function buildManifestModel(flight, { unmasked = {}, operatorName, operatorNote = null, operatorSource = null } = {}) {
  const warnings = [];
  const missing = []; // [{ row, where, fields: [label…] }]
  const fieldWarn = (code, message, extra = {}) => warnings.push({ code, message, ...extra });

  const face = loadManifestFonts().regular.face;
  // A value the pinned font cannot draw would print as empty boxes on a border document: blank + warning instead.
  const printable = (value, label, row = null) => {
    if (isBlank(value) || unprintable(face, value).length === 0) return value;
    fieldWarn("unprintable", `${row ? `Passenger ${where(row)}: the` : "The"} ${label} contains characters the form's font cannot print; it is left blank — write it in by hand.`, row ? { row } : {});
    return "";
  };
  const header = {
    operatorName: asIs(operatorName ?? flight?.operator?.name),
    registration: asIs(flight?.acft?.registration),
    flightNumber: asIs(flight?.flightNo),
    flightDate: formatDate(flight?.startTimeUTC),
    departureIcao: asIs(flight?.startAirport?.code?.icao),
    arrivalIcao: asIs(flight?.endAirport?.code?.icao),
  };
  for (const k of Object.keys(header)) header[k] = printable(header[k], FIELD_LABELS[k]);
  if (operatorNote) fieldWarn("operator", operatorNote, { field: "operatorName" });
  // (An operator that is blank because of operatorNote is already explained by that note.)
  const headerMissing = Object.entries(header).filter(([k, v]) => isBlank(v) && !(k === "operatorName" && operatorNote)).map(([k]) => FIELD_LABELS[k]);
  if (headerMissing.length) fieldWarn("header-missing", `Not in Leon, left blank in the header: ${headerMissing.join(", ")}.`, { fields: headerMissing });

  // Where Leon can hold a flight's passengers: structured records (passengerContactList — read when the list's data
  // source is "contact"), the operator's free-text list (passengerText / passengerListAsText — data source "text"),
  // and bare counts (passengerList.count, flight-watch / journey-log paxCount). Only structured records become rows;
  // free text is NEVER parsed into rows (a guessed name looks authoritative and may be wrong). It is returned
  // separately as `paxNote`, verbatim, for the chat to show — never in the result, the audit log or the model.
  const list = flight?.passengerList ?? null;
  const contacts = Array.isArray(list?.passengerContactList) ? list.passengerContactList : [];
  const freeText = !isBlank(list?.passengerText) ? asIs(list.passengerText) : !isBlank(list?.passengerListAsText) ? asIs(list.passengerListAsText) : "";
  let paxNote = null;
  if (contacts.length === 0 && freeText) {
    paxNote = freeText;
    const lines = freeText.split(/\r?\n/).filter((l) => l.trim()).length;
    fieldWarn("pax-note", `Leon holds this flight's passengers only as the operator's free-text note (${lines} line${lines === 1 ? "" : "s"}), not as passenger records. The rows are left blank — the note is shown below, verbatim, to fill them by hand.`);
  } else if (contacts.length === 0 && Number.isInteger(list?.count) && list.count > 0) {
    fieldWarn("pax-count-only", `Leon has only a passenger count for this flight (${list.count}) — no passenger records and no free-text note. The rows are left blank: enter the passengers in Leon, or fill the rows by hand.`);
  }
  // Files attached to the passenger list (a scanned or e-mailed list) cannot be read into rows; say they are there.
  const files = Array.isArray(list?.fileList) ? list.fileList.length : 0;
  if (files > 0) fieldWarn("pax-files", `Leon has ${files} file${files === 1 ? "" : "s"} attached to this flight's passenger list. They are not read into the form — open them in Leon to check the passengers.`);

  const other = DOCUMENT_LEG === "departure" ? "arrival" : "departure";
  const passengers = contacts.map((pc, i) => {
    const row = i + 1;
    const c = pc?.contact ?? {};
    const masked = c?.maskingStatus?.isProfileDataMasked ? unmasked?.[pc?.passengerContactNid]?.profile ?? null : null;
    const doc = documentOf(pc, DOCUMENT_LEG, unmasked);
    const alt = documentOf(pc, other, unmasked);
    const fromDoc = !isBlank(doc.surname);
    const surname = fromDoc ? doc.surname : !isBlank(masked?.surname) ? masked.surname : c.surname;
    const given = fromDoc ? doc.givenNames : [masked?.name ?? c.name, masked?.middleName ?? c.middleName];
    const nationalityCountry = doc.nationality ?? c.nationality ?? null;
    const nationality = asIs(NATIONALITY_FORMAT === "iso" ? nationalityCountry?.codeIso : nationalityCountry?.name);
    const sex = SEX[String(c.genderEnum ?? "")] ?? "";
    const p = {
      name: joinNonBlank([surname, ...given]),
      sex,
      dateOfBirth: formatDate(c.dateOfBirth),
      placeOfBirth: asIs(c.placeOfBirth),
      documentNumber: doc.number,
      documentExpiry: doc.expiry,
      nationality,
    };
    for (const k of Object.keys(p)) p[k] = printable(p[k], FIELD_LABELS[k], row);
    const gaps = Object.entries(p).filter(([, v]) => isBlank(v)).map(([k]) => FIELD_LABELS[k]);
    if (gaps.length) missing.push({ row, where: where(row), fields: gaps });
    if (doc.masked) fieldWarn("document-masked", `Passenger ${where(row)}: Leon masks this passport for the operator's account, so the number is left blank.`, { row });
    if (c?.maskingStatus?.isProfileDataMasked && !masked) fieldWarn("profile-masked", `Passenger ${where(row)}: Leon masks this passenger's profile for the operator's account; masked fields are left blank.`, { row });
    if (doc.hasNationalIdOnly) fieldWarn("national-id-only", `Passenger ${where(row)}: only a national ID card is on file for the ${DOCUMENT_LEG}; it is not printed in the PASSPORT No. column.`, { row });
    if (doc.neverExpires) fieldWarn("never-expires", `Passenger ${where(row)}: the document is marked "never expires" in Leon; EXPIRES is left blank.`, { row });
    if (String(c.genderEnum ?? "") === "UNKNOWN") fieldWarn("sex-unknown", `Passenger ${where(row)}: sex is "unknown" in Leon; left blank.`, { row });
    if (alt.present && doc.present && (alt.number !== doc.number || alt.expiry !== doc.expiry)) {
      fieldWarn("document-differs", `Passenger ${where(row)}: the ${other} document differs from the ${DOCUMENT_LEG} one; the ${DOCUMENT_LEG} document is printed. Check which one the authorities on this route expect.`, { row });
    } else if (alt.present && !doc.present) {
      fieldWarn("document-other-leg-only", `Passenger ${where(row)}: Leon has a document only for the ${other}; PASSPORT No. is left blank.`, { row });
    }
    return p;
  });

  const crewCount = Array.isArray(flight?.crewMemberList) ? flight.crewMemberList.length : null;
  if (crewCount === 0) fieldWarn("no-crew", "No crew is assigned to this flight in Leon; Number of Crew reads 0.");
  const personsOnBoard = passengers.length + (PERSONS_ON_BOARD_INCLUDES_CREW ? crewCount ?? 0 : 0);

  // Leon's own figures (it has no Persons-on-Board field): the passenger-list count and the flight-watch / journey-log
  // passenger counts. Any that disagree with the rows printed is a warning — the document is still produced.
  const leonCounts = [
    ["Leon passenger list count", list?.count],
    ["Leon flight watch passenger count", flight?.flightWatch?.paxCount],
    ["Leon journey log passenger count", flight?.journeyLog?.paxCount],
  ].filter(([, v]) => Number.isInteger(v) && v > 0);
  for (const [label, v] of leonCounts) {
    if (v !== passengers.length) {
      const leonPob = v + (PERSONS_ON_BOARD_INCLUDES_CREW ? crewCount ?? 0 : 0);
      fieldWarn("pob-disagrees", `Persons on Board: ${label} is ${v}, but ${passengers.length} passenger row${passengers.length === 1 ? "" : "s"} came from Leon (printed ${personsOnBoard}; Leon's figure would make it ${leonPob}).`);
    }
  }

  return {
    model: { flight: header, passengers, crewCount, personsOnBoard },
    warnings,
    missing,
    counts: { passengers: passengers.length, crew: crewCount, personsOnBoard },
    operatorSource,
    paxNote, // verbatim operator note (personal data) — NOT part of the result; stored and shown separately
  };
}
