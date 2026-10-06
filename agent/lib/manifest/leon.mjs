// Passenger Manifest — the Leon read. READ-ONLY (queries only; leonForOperator refuses mutations), with the flight's
// operator's own credentials from the operator registry (agent/lib/leon-operators.mjs). Nothing read here is logged.

/**
 * Operator names that are not an operator: the Clearway aggregator tenant stores every subchartered flight under its
 * own name ("CWY_CWY"), so for those flights Leon does not hold the operating carrier at all. Printing "CWY_CWY" on a
 * border document would be wrong; the field is left blank and the caller is told why.
 */
export const NOT_AN_OPERATOR = new Set(["CWY_CWY"]);

const PASSPORT = "number expiresDate neverExpires isMasked unavailable surname name middleName nationality { name codeIso }";
const FLIGHT_QUERY = (nid) => `query {
  flight(flightNid: ${nid}) {
    flightNid flightNo isCnl startTimeUTC
    startAirport { code { icao } } endAirport { code { icao } }
    acft { registration }
    operator { name }
    flightWatch { paxCount }
    journeyLog { paxCount }
    crewMemberList { loginNid }
    passengerList {
      count isDataSourceText isDataSourceContact
      passengerContactList {
        passengerContactNid
        contact { name surname middleName genderEnum dateOfBirth placeOfBirth nationality { name codeIso } maskingStatus { isPassportMasked isProfileDataMasked } }
        departurePassport { ${PASSPORT} }
        arrivalPassport { ${PASSPORT} }
        departureTravelDocument { number country { name } }
        arrivalTravelDocument { number country { name } }
        departureNationalId { number }
        arrivalNationalId { number }
      }
    }
  }
}`;
// Asked ONLY when the first read returned masked values: Leon decides from the operator account's permissions whether
// to answer. A refusal leaves the fields blank (with a warning), it never fails the document.
const UNMASK_QUERY = (nid) => `query {
  flight(flightNid: ${nid}) {
    passengerList { passengerContactList {
      passengerContactNid
      contact { unmaskedData { name surname middleName } }
      departurePassport { unmaskedData { number name surname middleName } }
      arrivalPassport { unmaskedData { number name surname middleName } }
    } }
  }
}`;

export class ManifestFlightError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

/** "<oprId>:<flightNid>" → parts, or throws. */
export function parseFlightId(flightId) {
  const m = /^([a-z0-9][a-z0-9-]{1,40}):(\d{1,12})$/i.exec(String(flightId ?? "").trim());
  if (!m) throw new ManifestFlightError("bad-flight-id", 'A flight is identified as "<operator>:<flight number in Leon>", e.g. "klj:74375326".');
  return { oprId: m[1].toLowerCase(), nid: Number(m[2]) };
}

/**
 * Reads the flight with its operator's Leon credentials. Returns { flight, unmasked, operatorName, operatorNote }.
 * `leon` is { graphql(query) } from leonForOperator — passed in so tests and the rig can supply a stub.
 */
export async function readManifestFlight(leon, nid, { progress } = {}) {
  progress?.("Reading the flight from Leon");
  const first = await leon.graphql(FLIGHT_QUERY(nid));
  if (first.errors?.length || !first.data) {
    const text = (first.errors ?? []).map((e) => String(e?.message ?? "")).join(" ").toLowerCase();
    if (/permission|access|denied|forbidden|not allowed/.test(text)) throw new ManifestFlightError("no-access", "Leon does not show this flight to the operator's account.");
    throw new ManifestFlightError("leon-error", "Leon could not return this flight.");
  }
  const flight = first.data.flight;
  if (!flight) throw new ManifestFlightError("no-access", "Leon has no such flight for this operator (it may have been deleted).");

  const contacts = flight.passengerList?.passengerContactList ?? [];
  const anyMasked = contacts.some((pc) => pc?.departurePassport?.isMasked || pc?.arrivalPassport?.isMasked || pc?.contact?.maskingStatus?.isProfileDataMasked);
  const unmasked = {};
  if (anyMasked) {
    progress?.("Asking Leon for masked passport details");
    const second = await leon.graphql(UNMASK_QUERY(nid)).catch(() => null);
    for (const pc of second?.data?.flight?.passengerList?.passengerContactList ?? []) {
      unmasked[pc.passengerContactNid] = {
        profile: pc.contact?.unmaskedData ?? null,
        departure: pc.departurePassport?.unmaskedData ?? null,
        arrival: pc.arrivalPassport?.unmaskedData ?? null,
      };
    }
  }

  const stored = String(flight.operator?.name ?? "").trim();
  const operatorName = NOT_AN_OPERATOR.has(stored) ? "" : stored;
  const operatorNote = NOT_AN_OPERATOR.has(stored)
    ? `Leon stores this flight under "${stored}" (the Clearway aggregator tenant), not under its operating carrier, so Owner or Operator is left blank — write the operator in by hand.`
    : null;
  return { flight, unmasked, operatorName, operatorNote };
}

