// The passenger viewer's two endpoints (mobile Stage 4, 2026-10-20) — one implementation behind the portal's phone
// page and the wall console's Flights panel:
//   GET  /api/flights/:oprId:nid/passengers            the masked list: row, surname, given names, nationality, sex.
//                                                       NO document field is in this payload — not masked, absent.
//   POST /api/flights/:oprId:nid/passengers/:id/reveal  ONE passenger's four document fields, fetched now from Leon,
//                                                       gated by intake.people.reveal (the route table), logged.
// Reads Leon with the flight's operator's own credentials (agent/lib/leon-operators.mjs, read-only), the same way
// the passenger manifest does, but asks for no more than it shows: no place of birth, no second document.
// Nothing of a passenger reaches a log row, an error message or a URL from here: the audit carries the flight, the
// row number and the counts; errors carry the row at most.
//
// Two rules keep a quiet harvest visible (decided 2026-10-20):
//   - a stop: 40 reveals per person per 10 minutes, across flights, answered 429 — well clear of a person checking
//     a whole manifest against a GenDec, which is the single most normal use;
//   - a signal: reveals on MORE THAN THREE DIFFERENT FLIGHTS within 10 minutes write one extra row,
//     intake.personal_reveal_burst, once per window, naming the flights and the count. A whole flight checked end to
//     end writes nothing extra — the individual rows already say what happened.
import { leonForOperator } from "../leon-operators.mjs";
import { audit } from "../store.mjs";
import { rest } from "../knowledge/retrieval.mjs";
import { can } from "../../../lib/permissions/grants.mjs";

const err = (status, message) => Object.assign(new Error(message), { status });
const WINDOW_MS = 10 * 60_000;
export const REVEAL_LIMIT = 40; // per person per window, across flights
export const BURST_FLIGHTS = 3; // more than this many different flights in a window is the unusual shape
export const SECONDS = 30; // the view closes itself after this; the same number on intake and in the mailbox

const SEX = { MALE: "M", FEMALE: "F" };
const clean = (v) => (v == null ? "" : String(v).trim());
const flightDate = (iso) => { const d = iso ? new Date(iso) : null; if (!d || Number.isNaN(d.getTime())) return ""; return `${String(d.getUTCDate()).padStart(2, "0")}-${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()]}-${d.getUTCFullYear()}`; };
const expiresSoon = (iso) => { const t = Date.parse(iso || ""); return Number.isFinite(t) && t - Date.now() < 183 * 86_400_000; };

/** "<oprId>:<nid>" → parts, or throws 400. */
function parseFlightId(id) {
  const m = /^([a-z0-9-]+):(\d{1,12})$/i.exec(String(id ?? "")); if (!m) throw err(400, "That is not a flight id.");
  return { oprId: m[1].toLowerCase(), nid: m[2] };
}

// The list: names, nationality and sex only. Leon may mask names on an operator account; then one more read asks for
// the unmasked names only (never a document), as the manifest does.
const LIST_QUERY = (nid) => `query {
  flight(flightNid: ${nid}) {
    flightNid flightNo isCnl startTimeUTC
    startAirport { code { icao } } endAirport { code { icao } }
    acft { registration } operator { name }
    crewMemberList { loginNid }
    passengerList {
      count realCount isDataSourceText passengerText
      passengerContactList { passengerContactNid contact { name surname middleName genderEnum nationality { name codeIso } maskingStatus { isProfileDataMasked } } }
    }
  }
}`;
const NAMES_QUERY = (nid) => `query { flight(flightNid: ${nid}) { passengerList { passengerContactList { passengerContactNid contact { unmaskedData { name surname middleName } } } } } }`;
// The reveal: ONE passenger's date of birth and departure document (number, country, expiry). Nothing else.
const DOC_QUERY = (nid) => `query {
  flight(flightNid: ${nid}) { passengerList { passengerContactList {
    passengerContactNid
    contact { dateOfBirth maskingStatus { isPassportMasked } }
    departurePassport { number expiresDate neverExpires isMasked nationality { name codeIso } }
    departureTravelDocument { number country { name } }
  } } }
}`;
const DOC_UNMASK_QUERY = (nid) => `query { flight(flightNid: ${nid}) { passengerList { passengerContactList { passengerContactNid departurePassport { unmaskedData { number } } } } } }`;

async function readFlight(client, nid, query) {
  const r = await client.graphql(query);
  if (r.errors?.length && !r.data?.flight) throw err(503, "Leon did not answer for this flight. Try again in a moment.");
  const f = r.data?.flight; if (!f) throw err(404, "Leon has no flight with that id for this operator.");
  return f;
}

export async function listPassengers(flightId) {
  const { oprId, nid } = parseFlightId(flightId);
  const client = await leonForOperator(oprId);
  const f = await readFlight(client, nid, LIST_QUERY(nid));
  const contacts = f.passengerList?.passengerContactList ?? [];
  let unmasked = {};
  if (contacts.some((c) => c.contact?.maskingStatus?.isProfileDataMasked)) {
    const r = await client.graphql(NAMES_QUERY(nid)).catch(() => null);
    for (const c of r?.data?.flight?.passengerList?.passengerContactList ?? []) if (c.contact?.unmaskedData) unmasked[c.passengerContactNid] = c.contact.unmaskedData;
  }
  const passengers = contacts.map((c, i) => {
    const u = unmasked[c.passengerContactNid] ?? {};
    const surname = clean(u.surname || c.contact?.surname), given = [u.name || c.contact?.name, u.middleName || c.contact?.middleName].map(clean).filter(Boolean).join(" ");
    return { id: String(c.passengerContactNid), row: i + 1, surname: surname.toUpperCase(), given, nationality: clean(c.contact?.nationality?.codeIso || c.contact?.nationality?.name) || null, sex: SEX[c.contact?.genderEnum] ?? null };
  });
  const textOnly = Boolean(f.passengerList?.isDataSourceText) && passengers.length === 0 && Number(f.passengerList?.count ?? 0) > 0;
  return {
    flight: { flightId: `${oprId}:${nid}`, callsign: clean(f.flightNo), route: [f.startAirport?.code?.icao, f.endAirport?.code?.icao].filter(Boolean).join(" → "), date: flightDate(f.startTimeUTC), registration: clean(f.acft?.registration), operator: clean(f.operator?.name), cancelled: Boolean(f.isCnl) },
    passengers, count: passengers.length || Number(f.passengerList?.count ?? 0), crewCount: (f.crewMemberList ?? []).length,
    source: passengers.length ? "leon" : textOnly ? "text" : "none",
    note: textOnly ? `Leon holds ${f.passengerList.count} passenger${Number(f.passengerList.count) === 1 ? "" : "s"} as the operator's note, not as records; the manifest shows the note on a desk.` : null,
    fetchedAt: new Date().toISOString(),
  };
}

export async function revealPassenger(flightId, id) {
  const { oprId, nid } = parseFlightId(flightId);
  const client = await leonForOperator(oprId);
  const f = await readFlight(client, nid, DOC_QUERY(nid));
  const contacts = f.passengerList?.passengerContactList ?? [];
  const i = contacts.findIndex((c) => String(c.passengerContactNid) === String(id)); if (i < 0) throw err(404, "That passenger is not on this flight any more.");
  const c = contacts[i];
  let number = clean(c.departurePassport?.number);
  if (c.departurePassport?.isMasked) {
    const r = await client.graphql(DOC_UNMASK_QUERY(nid)).catch(() => null);
    const u = (r?.data?.flight?.passengerList?.passengerContactList ?? []).find((x) => String(x.passengerContactNid) === String(id));
    number = clean(u?.departurePassport?.unmaskedData?.number) || number;
  }
  const travel = c.departureTravelDocument;
  const passport = c.departurePassport;
  return {
    row: i + 1,
    dateOfBirth: flightDate(c.contact?.dateOfBirth) || null,
    documentCountry: clean(passport?.nationality?.codeIso || passport?.nationality?.name || travel?.country?.name) || null,
    documentNumber: number || clean(travel?.number) || null,
    documentExpiry: passport?.neverExpires ? "Never" : flightDate(passport?.expiresDate) || null,
    expiresSoon: !passport?.neverExpires && expiresSoon(passport?.expiresDate),
    masked: Boolean(passport?.isMasked) && !number,
  };
}

/** This person's reveals in the window: how many, and on which flights (from the audit log, so restarts do not forget). */
async function recentReveals(user) {
  const since = new Date(Date.now() - WINDOW_MS).toISOString();
  const rows = await rest(`agent_audit_log?select=detail,created_at&kind=eq.intake.personal_revealed&actor_id=eq.${encodeURIComponent(user.userId)}&created_at=gt.${encodeURIComponent(since)}&order=created_at.desc&limit=200`).catch(() => []);
  const flights = new Set(); let count = 0;
  for (const r of rows ?? []) { if (!r.detail?.flightId) continue; count += 1; flights.add(r.detail.flightId); }
  return { count, flights: [...flights], since };
}
async function burstAlreadyNoted(user, since) {
  const rows = await rest(`agent_audit_log?select=id&kind=eq.intake.personal_reveal_burst&actor_id=eq.${encodeURIComponent(user.userId)}&created_at=gt.${encodeURIComponent(since)}&limit=1`).catch(() => []);
  return (rows ?? []).length > 0;
}

// ── Route table ────────────────────────────────────────────────────────────────────────────────────────
export async function handlePassengerRoutes({ req, res, pathname, user, sendJson }) {
  const send = (payload, status = 200) => { sendJson(res, payload, status); return true; };
  const fail = (e) => send({ ok: false, message: e.status ? e.message : "The passenger list could not be read. Try again in a few minutes. If it keeps failing, report it from Help & support." }, e.status ?? 500); // public-error-ok: an error with a status is one of this file's own sentences (err()); Leon's and the store's text never carries one
  let m;
  try {
    if ((m = /^\/api\/flights\/([^/]+)\/passengers$/.exec(pathname)) && req.method === "GET") {
      const flightId = decodeURIComponent(m[1]);
      const out = await listPassengers(flightId);
      return send({ ok: true, ...out, canReveal: await can(user.agentRole, "intake.people.reveal"), seconds: SECONDS });
    }
    if ((m = /^\/api\/flights\/([^/]+)\/passengers\/([^/]+)\/reveal$/.exec(pathname)) && req.method === "POST") {
      const flightId = decodeURIComponent(m[1]), id = decodeURIComponent(m[2]);
      parseFlightId(flightId);
      const recent = await recentReveals(user);
      if (recent.count >= REVEAL_LIMIT) {
        await audit({ kind: "intake.personal_reveal_limited", userId: user.userId, userEmail: user.email, actorId: user.userId, actorEmail: user.email, success: false, confirmationStatus: "not_required", detail: { flightId, count: recent.count, windowMin: WINDOW_MS / 60_000 } }).catch(() => {});
        return send({ ok: false, message: `That is ${recent.count} document views in 10 minutes. Wait a few minutes, then carry on; this stop is logged.` }, 429);
      }
      const p = await revealPassenger(flightId, id);
      const flights = new Set([...recent.flights, flightId]);
      await audit({ kind: "intake.personal_revealed", userId: user.userId, userEmail: user.email, actorId: user.userId, actorEmail: user.email, success: true, confirmationStatus: "not_required", detail: { flightId, row: p.row, seconds: SECONDS, viewsInWindow: recent.count + 1, flightsInWindow: flights.size } }).catch(() => {});
      if (flights.size > BURST_FLIGHTS && !(await burstAlreadyNoted(user, recent.since))) {
        await audit({ kind: "intake.personal_reveal_burst", userId: user.userId, userEmail: user.email, actorId: user.userId, actorEmail: user.email, success: true, confirmationStatus: "not_required", detail: { flights: [...flights], count: recent.count + 1, windowMin: WINDOW_MS / 60_000 } }).catch(() => {});
      }
      return send({ ok: true, passenger: p, shownAt: new Date().toISOString(), seconds: SECONDS });
    }
  } catch (e) { if (/^\/api\/flights\//.test(pathname)) return fail(e); throw e; }
  return false;
}
