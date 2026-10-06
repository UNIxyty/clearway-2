// Passenger Manifest — the Leon read. READ-ONLY (queries only; leonForOperator refuses mutations), with the flight's
// operator's own credentials from the operator registry (agent/lib/leon-operators.mjs). Nothing read here is logged.
import { isGuestOperator, operatorsFlyingRegistration } from "../leon-operators.mjs";

const PASSPORT = "number expiresDate neverExpires isMasked unavailable surname name middleName nationality { name codeIso }";
const FLIGHT_QUERY = (nid) => `query {
  flight(flightNid: ${nid}) {
    flightNid flightNo isCnl startTimeUTC
    startAirport { code { icao } } endAirport { code { icao } }
    acft { registration }
    operator { name planMode isGuest }
    trip { quoteRealization { isSubcharter subcharter { operator } } }
    flightWatch { paxCount }
    journeyLog { paxCount }
    crewMemberList { loginNid }
    passengerList {
      count realCount isDataSourceText isDataSourceContact passengerText passengerListAsText fileList { __typename }
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
 * Reads the flight with its operator's Leon credentials. Returns { flight, unmasked, operatorName, operatorNote,
 * operatorSource }. `leon` is { oprId, graphql(query) } from leonForOperator and `lookup` the fleet lookup — both passed
 * in so tests and the rig can supply stubs.
 */
export async function readManifestFlight(leon, nid, { progress, lookup = operatorsFlyingRegistration } = {}) {
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

  const op = await resolveOperator(flight, { oprId: leon.oprId, progress, lookup });
  const operatorName = op.name;
  const operatorNote = op.note;
  const operatorSource = op.source;
  return { flight, unmasked, operatorName, operatorNote, operatorSource };
}


/**
 * Owner or Operator — one rule for every flight, no names:
 *   1. Leon's operator for the flight, when it is a real operator account.
 *   2. When Leon records the flight under a guest sub-operator account (Operator.planMode "sub_operator" / isGuest —
 *      Leon's marker for an account that is not the operator in its own right), that account is not the operator:
 *      a. the trip's subcharter record (QuoteRealization.subcharter.operator), as typed in Leon;
 *      b. otherwise the configured operator whose own Leon fleet flies this aircraft (same registration, recorded
 *         there under a real operator) — that operator's name as its Leon stores it;
 *      c. otherwise — none, or more than one — blank, with a warning that says why.
 * Returns { name, source, note }.
 */
export async function resolveOperator(flight, { oprId, progress, lookup = operatorsFlyingRegistration } = {}) {
  const own = flight?.operator ?? null;
  const ownName = own?.name == null ? "" : String(own.name);
  if (own && !isGuestOperator(own)) return { name: ownName, source: "the flight's operator in Leon", note: null };
  const sub = flight?.trip?.quoteRealization?.subcharter?.operator;
  if (sub != null && String(sub).trim()) return { name: String(sub), source: "the trip's subcharter record in Leon", note: null };
  const registration = flight?.acft?.registration ?? "";
  progress?.("Finding the aircraft's operator");
  const { holders, unchecked } = await lookup(registration, { excludeOprId: oprId });
  const names = [...new Set(holders.map((h) => h.name))];
  if (names.length === 1) return { name: names[0], source: `${names[0]}'s own fleet in Leon (aircraft ${registration})`, note: null };
  const why = `Leon records this flight under ${ownName ? `"${ownName}"` : "an account"}, a guest sub-operator account rather than the operator, and the trip has no subcharter record`;
  if (names.length > 1) return { name: "", source: null, note: `${why}; more than one configured operator flies ${registration} (${names.join(", ")}), so Owner or Operator is left blank — write it in by hand.` };
  return { name: "", source: null, note: `${why}; no configured operator's fleet holds ${registration || "this aircraft"}${unchecked.length ? ` (not checked: ${unchecked.join(", ")} — Leon unavailable)` : ""}. Owner or Operator is left blank — write it in by hand.` };
}
