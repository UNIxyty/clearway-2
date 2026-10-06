// Passenger Manifest — Leon flight record → the typed model the renderer draws, plus the warnings a person must read
// before the document is sent. Pure: no I/O, no logging, no model (LLM) involvement anywhere.
//
// Rules (build brief + spec §3):
//   - a missing value is BLANK: never "N/A", "-", "TBC" or a placeholder;
//   - rows stay in Leon's order (never sorted);
//   - warnings identify a passenger by ROW and PAGE only — never by name or document number — because they are
//     shown in the chat, which must never carry passenger details.
import { PERSONS_ON_BOARD_INCLUDES_CREW, NATIONALITY_FORMAT, DOCUMENT_LEG } from "./config.mjs";
import { PASSENGERS_PER_PAGE } from "./layout.mjs";

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

const clean = (v) => String(v ?? "").replace(/\s+/g, " ").trim();
const icao = (v) => { const s = clean(v).toUpperCase(); return /^[A-Z0-9]{4}$/.test(s) ? s : ""; };
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
    number: clean(realNumber ?? (masked ? "" : travel?.number) ?? ""),
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
 *   checked read; options.operatorName overrides flight.operator.name (aggregator tenants, see leon.mjs).
 */
export function buildManifestModel(flight, { unmasked = {}, operatorName, operatorNote = null } = {}) {
  const warnings = [];
  const missing = []; // [{ row, where, fields: [label…] }]
  const fieldWarn = (code, message, extra = {}) => warnings.push({ code, message, ...extra });

  const header = {
    operatorName: clean(operatorName ?? flight?.operator?.name),
    registration: clean(flight?.acft?.registration).toUpperCase(),
    flightNumber: clean(flight?.flightNo),
    flightDate: formatDate(flight?.startTimeUTC),
    departureIcao: icao(flight?.startAirport?.code?.icao),
    arrivalIcao: icao(flight?.endAirport?.code?.icao),
  };
  if (operatorNote) fieldWarn("operator", operatorNote, { field: "operatorName" });
  // (An operator that is blank because of operatorNote is already explained by that note.)
  const headerMissing = Object.entries(header).filter(([k, v]) => !v && !(k === "operatorName" && operatorNote)).map(([k]) => FIELD_LABELS[k]);
  if (headerMissing.length) fieldWarn("header-missing", `Not in Leon, left blank in the header: ${headerMissing.join(", ")}.`, { fields: headerMissing });

  const list = flight?.passengerList ?? null;
  const contacts = Array.isArray(list?.passengerContactList) ? list.passengerContactList : [];
  if (list?.isDataSourceText && contacts.length === 0) {
    fieldWarn("pax-text-only", "Leon holds this flight's passenger list as free text, not as passenger records, so no passenger rows could be filled. Fill them by hand or enter the passengers in Leon.");
  }

  const other = DOCUMENT_LEG === "departure" ? "arrival" : "departure";
  const passengers = contacts.map((pc, i) => {
    const row = i + 1;
    const c = pc?.contact ?? {};
    const masked = c?.maskingStatus?.isProfileDataMasked ? unmasked?.[pc?.passengerContactNid]?.profile ?? null : null;
    const doc = documentOf(pc, DOCUMENT_LEG, unmasked);
    const alt = documentOf(pc, other, unmasked);
    const surname = clean(doc.surname || masked?.surname || c.surname).toUpperCase();
    const given = clean([...(doc.surname ? doc.givenNames : [masked?.name ?? c.name, masked?.middleName ?? c.middleName])].filter(Boolean).join(" "));
    const nationalityCountry = doc.nationality ?? c.nationality ?? null;
    const nationality = clean(NATIONALITY_FORMAT === "iso" ? nationalityCountry?.codeIso : nationalityCountry?.name);
    const sex = SEX[String(c.genderEnum ?? "").toUpperCase()] ?? "";
    const p = {
      name: clean([surname, given].filter(Boolean).join(" ")),
      sex,
      dateOfBirth: formatDate(c.dateOfBirth),
      placeOfBirth: clean(c.placeOfBirth),
      documentNumber: doc.number,
      documentExpiry: doc.expiry,
      nationality,
    };
    const gaps = Object.entries(p).filter(([, v]) => !v).map(([k]) => FIELD_LABELS[k]);
    if (gaps.length) missing.push({ row, where: where(row), fields: gaps });
    if (doc.masked) fieldWarn("document-masked", `Passenger ${where(row)}: Leon masks this passport for the operator's account, so the number is left blank.`, { row });
    if (c?.maskingStatus?.isProfileDataMasked && !masked) fieldWarn("profile-masked", `Passenger ${where(row)}: Leon masks this passenger's profile for the operator's account; masked fields are left blank.`, { row });
    if (doc.hasNationalIdOnly) fieldWarn("national-id-only", `Passenger ${where(row)}: only a national ID card is on file for the ${DOCUMENT_LEG}; it is not printed in the PASSPORT No. column.`, { row });
    if (doc.neverExpires) fieldWarn("never-expires", `Passenger ${where(row)}: the document is marked "never expires" in Leon; EXPIRES is left blank.`, { row });
    if (String(c.genderEnum ?? "").toUpperCase() === "UNKNOWN") fieldWarn("sex-unknown", `Passenger ${where(row)}: sex is "unknown" in Leon; left blank.`, { row });
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
  };
}
