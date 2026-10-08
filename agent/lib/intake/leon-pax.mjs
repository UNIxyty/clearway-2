// Passengers into Leon's passenger DATABASE (the PAX panel's DATABASE tab): each passenger a contact with a passport in
// cwy-cwy's address book (Clearway's own Leon; decided 2026-10-08), and the leg's passenger list set to those contacts.
//
// Settled by the probe on a real flight (agent/scripts/leon-pax-probe.mjs, 2026-10-08):
//   - phonebook.personCreate takes the contact and its passport in ONE call; every field stored as sent: countries ISO-3
//     (Country.code), dates YYYY-MM-DD, gender MALE / FEMALE / UNKNOWN, given name and surname separate.
//   - passengerList.addPassengersToList REPLACES the flight's list: every passenger of a leg goes in ONE call, never a loop.
//   - contacts and the TEXT tab do not coexist (contacts set isDataSourceText false and clear the text): the request's own
//     list is recorded in the flight's OPS notes instead (leon-people.mjs passengerBlockFor, part of the create).
//   - Leon's contact searches (contactByWildcardForDuplicationList, contactByWildcard, passengerByWildcard, contactsByFilter)
//     match NAMES — given, surname, either order — never a passport number or a contact id.
//
// Duplicates — match, never multiply:
//   1. our own mapping first (intake_leon_contacts): passport number + issuing country → the Leon contact and passport we
//      created or found. The passport number is never stored: the key is an HMAC with a server secret.
//   2. else Leon, by name (what its search can do): a contact holding the same passport (number and country) is the
//      person; without that, a contact with the same name AND the same date of birth is — one only, never a guess.
//   3. else a new contact. A reused contact is never edited; where it differs from the request, the difference is a
//      warning (field names only) for a person.
// Nothing invented: a value the request did not give is left out of the contact (never a placeholder). The request gives
// no passport issuing country: the passport's country is the passenger's nationality (stated in the warning count).
//
// Order and failure: every contact create is written to the send log (intake_leon_people_writes, kind 'contact') BEFORE
// the call, the leg's list write (kind 'pax') too. If any passenger cannot be resolved, the flight's list is NOT touched
// (a list of 12 of 16 looks right and is not); the failure names the passenger by its row. Contacts already created stay
// mapped, so a resend creates none of them again. Logs, audit rows and emails carry counts and row numbers only.
import { createHash, createHmac } from "node:crypto";
import { rest } from "../knowledge/retrieval.mjs";
import { audit } from "../store.mjs";
import { leonGraphql, leonOperator } from "./leon-client.mjs";
import { personalTokens, scrubString } from "./personal.mjs";

const sha = (s) => createHash("sha256").update(String(s)).digest("hex");
const timeout = () => ({ timeoutMs: Number(process.env.INTAKE_LEON_TIMEOUT_MS || 30000) });
const clean = (v) => (v == null ? "" : String(v).trim());
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

// ── the request's person → Leon's fields ─────────────────────────────────────────────────────────────────────────
/** "05 Mar 1981", "05MAR1981", "5-Mar-1981", "1981-03-05" → "1981-03-05". Anything else (two-digit years, all-number
 *  day/month orders) → null: left out, never guessed. */
export function isoDate(s) {
  const t = clean(s);
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (m) return valid(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})[\s.\-/]?([A-Za-z]{3,9})[\s.\-/]?(\d{4})$/.exec(t);
  if (m) { const mo = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()); return mo < 0 ? null : valid(Number(m[3]), mo + 1, Number(m[1])); }
  return null;
}
function valid(y, mo, d) { if (mo < 1 || mo > 12 || d < 1 || d > new Date(Date.UTC(y, mo, 0)).getUTCDate()) return null; return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`; }

/**
 * Surname and given names. A person's edit wins; then a comma ("SURNAME, Given"); then the order the request DECLARES
 * for its list (personal.nameOrder: "First, Middle, Last Name" → the last word is the surname; "Surname, Names" → the
 * first). With no declared order the same last-word split is made but marked undeclared, so the review screen asks a
 * person to look. Never reordered, never inferred from capitals. → { given, surname, how, said }
 */
export function nameSplit(p, nameOrder = null) {
  if (p.split && (clean(p.split.given) || clean(p.split.surname))) return { given: clean(p.split.given), surname: clean(p.split.surname), how: "edited", by: p.split.by ?? null };
  const name = clean(p.name).replace(/\s+/g, " ");
  if (name.includes(",")) { const i = name.indexOf(","); return { surname: name.slice(0, i).trim(), given: name.slice(i + 1).trim(), how: "comma" }; }
  const t = name.split(" ").filter(Boolean);
  if (t.length < 2) return { surname: t[0] ?? "", given: "", how: "single" };
  if (nameOrder?.order === "surname_first") return { surname: t[0], given: t.slice(1).join(" "), how: "declared", said: nameOrder.said ?? null };
  return { surname: t[t.length - 1], given: t.slice(0, -1).join(" "), how: nameOrder?.order === "given_first" ? "declared" : "undeclared", said: nameOrder?.said ?? null };
}
/** The request's Gender column → Leon's enum. UNKNOWN only when the request genuinely gave nothing; a value we cannot
 *  read (or a request read before the column was captured) is left out. → { value, note } */
export function genderFor(p) {
  if (!Object.prototype.hasOwnProperty.call(p, "sex")) return { value: null, note: "not read (the request was read before the Gender column was captured)" };
  const s = clean(p.sex).toLowerCase();
  if (!s) return { value: "UNKNOWN", note: null };
  if (s === "m" || s === "male") return { value: "MALE", note: null };
  if (s === "f" || s === "female") return { value: "FEMALE", note: null };
  return { value: null, note: "not M or F in the request" };
}
const countryCache = new Map();
/** A nationality as the request wrote it → Leon's ISO-3 code, only on an exact match of Leon's country name or code. */
export async function countryFor(v) {
  const s = clean(v); if (!s) return null;
  const k = s.toUpperCase(); if (countryCache.has(k)) return countryCache.get(k);
  const r = await leonGraphql(`query($w:String){ countriesByWildcard(wildcard:$w){ code codeIso name } }`, { w: s }, timeout());
  const list = r.data?.countriesByWildcard ?? [];
  const hit = list.find((c) => c.code.toUpperCase() === k || c.codeIso.toUpperCase() === k || c.name.toUpperCase() === k) ?? null;
  const code = hit?.code ?? null; if (!r.errors?.length) countryCache.set(k, code); return code;
}

/** What goes to Leon for one passenger (no Leon calls): split, gender, dates. Countries are resolved at send time. */
export function contactPlan(p, nameOrder) {
  const split = nameSplit(p, nameOrder); const g = genderFor(p);
  return { given: split.given, surname: split.surname, splitHow: split.how, gender: g.value, genderNote: g.note, dob: isoDate(p.dob), dobGiven: !!clean(p.dob), passport: clean(p.passport).replace(/\s+/g, "") || null, expiry: isoDate(p.expiry), expiryGiven: !!clean(p.expiry), nationality: clean(p.nationality) || null };
}
/** One hash per leg over exactly what would be sent for its passengers, for binding a confirmation. */
export const paxPlanHash = (plans) => sha(JSON.stringify(plans.map((x) => [x.given, x.surname, x.gender, x.dob, x.passport, x.expiry, x.nationality])));

// ── the mapping: passport (HMAC) + country → Leon contact ───────────────────────────────────────────────────────────
function mapKey() {
  const secret = process.env.INTAKE_PEOPLE_KEY || process.env.LEON_REFRESH_TOKEN_ENCRYPTION_KEY;
  if (!secret) throw new Error("no key for the passenger mapping (INTAKE_PEOPLE_KEY or LEON_REFRESH_TOKEN_ENCRYPTION_KEY)");
  return createHash("sha256").update(`intake-passport-map:${secret}`).digest();
}
export const passportHmac = (number, country) => createHmac("sha256", mapKey()).update(`${String(number).toUpperCase().replace(/[\s-]+/g, "")}|${country}`).digest("hex");
async function mapped(hmac, country) { return (await rest(`intake_leon_contacts?select=contact_nid,passport_nid&opr_id=eq.${encodeURIComponent(leonOperator())}&passport_hmac=eq.${hmac}&issuing_country=eq.${country}`))?.[0] ?? null; }
async function remember(row) { await rest("intake_leon_contacts?on_conflict=opr_id,passport_hmac,issuing_country", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify([{ opr_id: leonOperator(), ...row }]) }); }
async function forget(hmac, country) { await rest(`intake_leon_contacts?opr_id=eq.${encodeURIComponent(leonOperator())}&passport_hmac=eq.${hmac}&issuing_country=eq.${country}`, { method: "DELETE" }).catch(() => {}); }

// ── Leon ──────────────────────────────────────────────────────────────────────────────────────────────────────────
const PASSPORT_FIELDS = "passportNid number countryCode expiresDate";
const CONTACT_FIELDS = `contactNid name surname genderEnum dateOfBirth isDeleted nationality { code } passportList { ${PASSPORT_FIELDS} }`;
const Q = {
  byName: `query($f:ContactDuplicationFilter!){ contactByWildcardForDuplicationList(filter:$f){ contactNid name surname passportList { passportNid countryCode number } } }`,
  byNids: `query($l:[ContactNid!]!){ contact { contactsByNids(contactsNids:$l){ ${CONTACT_FIELDS} } } }`,
  create: `mutation($p:PhonebookPersonCreateInput!){ phonebook { personCreate(person:$p){ ... on NonNullContactValue { value { ${CONTACT_FIELDS} } } ... on ErrorList { errorList { message category } } } } }`,
  list: `mutation($f:FlightNid!,$l:[PassengerContactInput!]){ passengerList { addPassengersToList(flightNid:$f, passengerContactList:$l){ count realCount isDataSourceContact passengerContactList { contact { contactNid } } } } }`,
};
export const LEON_PAX_DOCUMENTS = Q;
async function contactsByNids(nids) { if (!nids.length) return []; const r = await leonGraphql(Q.byNids, { l: nids.map(Number) }, timeout()); if (r.errors?.length) throw new Error(String(r.errors[0].message).slice(0, 120)); return (r.data?.contact?.contactsByNids ?? []).filter((c) => !c.isDeleted); }
/** Fields of a reused contact that differ from the request — names of fields only, never values. */
function differences(c, plan, natCode, passport) {
  const d = [];
  if (plan.given && clean(c.name).toUpperCase() !== plan.given.toUpperCase()) d.push("given name");
  if (plan.surname && clean(c.surname).toUpperCase() !== plan.surname.toUpperCase()) d.push("surname");
  if (plan.gender && plan.gender !== "UNKNOWN" && c.genderEnum !== plan.gender) d.push("gender");
  if (plan.dob && c.dateOfBirth !== plan.dob) d.push("date of birth");
  if (natCode && c.nationality?.code !== natCode) d.push("nationality");
  if (passport && plan.expiry && passport.expiresDate !== plan.expiry) d.push("passport expiry");
  return d;
}

/** One send-log row before a call (kind 'contact' or 'pax'); insert-or-take like every other attempt. */
async function attempt(row) {
  const ins = await rest("intake_leon_people_writes?on_conflict=request_id,leg_index,kind,content_sha256", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=representation" }, body: JSON.stringify([row]) });
  if (Array.isArray(ins) && ins.length) return { row: ins[0], fresh: true };
  const prior = (await rest(`intake_leon_people_writes?select=*&request_id=eq.${row.request_id}&leg_index=eq.${row.leg_index}&kind=eq.${row.kind}&content_sha256=eq.${row.content_sha256}`))?.[0];
  if (prior && prior.state !== "sending" && prior.state !== "in_leon") { // refused, or unknown and now re-checked by the caller: take it again
    const taken = await rest(`intake_leon_people_writes?id=eq.${prior.id}&state=eq.${prior.state}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ state: "sending", leon_error: null, leon_flight_nid: row.leon_flight_nid, sent_by_email: row.sent_by_email, detail: row.detail ?? null, updated_at: new Date().toISOString() }) });
    if (Array.isArray(taken) && taken.length) return { row: taken[0], fresh: true };
  }
  return { row: prior, fresh: false };
}
const settle = (id, patch) => rest(`intake_leon_people_writes?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }) }).catch(() => {});

/**
 * One passenger → { contactNid, passportNid, how: 'mapped'|'found'|'created', differs: [field…], notes: [..] } or
 * { failed: reason }. `row` is the passenger's position in the leg's list (1-based), the only way it is named.
 */
async function resolve(plan, { requestId, leg, flightNid, row, user, tokens }) {
  if (!plan.given || !plan.surname) return { failed: `Leon needs a given name and a surname, and the name splits into ${plan.surname ? "a surname only" : "nothing"} — correct the split on the review screen` };
  const notes = [];
  const nat = plan.nationality ? await countryFor(plan.nationality) : null;
  if (plan.nationality && !nat) notes.push("nationality not a Leon country name or code: left out");
  const issuing = nat; // the request gives no issuing country: the passport's country is the nationality
  if (plan.passport && !issuing) notes.push("passport left out: no country for it");
  if (plan.dobGiven && !plan.dob) notes.push("date of birth not a full date: left out");
  if (plan.expiryGiven && !plan.expiry) notes.push("expiry not a full date: left out");
  if (plan.genderNote) notes.push(`gender ${plan.genderNote}: left out`);
  const withPassport = !!(plan.passport && issuing);
  const hmac = withPassport ? passportHmac(plan.passport, issuing) : null;

  // 1. Our mapping.
  if (hmac) {
    const m = await mapped(hmac, issuing);
    if (m) {
      const [c] = await contactsByNids([m.contact_nid]);
      if (c) { const pp = c.passportList.find((x) => String(x.passportNid) === String(m.passport_nid)) ?? null; return { contactNid: c.contactNid, passportNid: pp?.passportNid ?? null, how: "mapped", differs: differences(c, plan, nat, pp), notes }; }
      await forget(hmac, issuing); // the contact is gone from Leon: the mapping no longer holds
    }
  }
  // 2. Leon, by name (its search matches names only); the person is confirmed by passport, else by date of birth.
  const sr = await leonGraphql(Q.byName, { f: { wildcard: `${plan.given} ${plan.surname}`, limit: 50 } }, timeout());
  if (sr.errors?.length) return { failed: `Leon's contact search failed (${scrubString(String(sr.errors[0].message), tokens).slice(0, 100)})` };
  const cands = sr.data?.contactByWildcardForDuplicationList ?? [];
  if (withPassport) {
    const byPassport = cands.filter((c) => c.passportList.some((p) => p.countryCode === issuing && p.number.toUpperCase().replace(/[\s-]+/g, "") === plan.passport.toUpperCase()));
    if (byPassport.length > 1) return { failed: `${byPassport.length} contacts in Leon already hold this passport — a person decides which is the passenger` };
    if (byPassport.length === 1) {
      const [c] = await contactsByNids([byPassport[0].contactNid]);
      const pp = c?.passportList.find((p) => p.countryCode === issuing && p.number.toUpperCase().replace(/[\s-]+/g, "") === plan.passport.toUpperCase()) ?? null;
      await remember({ passport_hmac: hmac, issuing_country: issuing, contact_nid: String(c.contactNid), passport_nid: pp ? String(pp.passportNid) : null, source: "found_in_leon", request_id: requestId, leg_index: leg.index, flight_nid: String(flightNid) });
      return { contactNid: c.contactNid, passportNid: pp?.passportNid ?? null, how: "found", differs: differences(c, plan, nat, pp), notes };
    }
  }
  if (plan.dob) {
    const named = cands.filter((c) => clean(c.name).toUpperCase() === plan.given.toUpperCase() && clean(c.surname).toUpperCase() === plan.surname.toUpperCase());
    const full = (await contactsByNids(named.map((c) => c.contactNid))).filter((c) => c.dateOfBirth === plan.dob);
    if (full.length > 1) return { failed: `${full.length} contacts in Leon have this name and date of birth — a person decides which is the passenger` };
    if (full.length === 1) {
      const c = full[0];
      const pp = withPassport ? c.passportList.find((p) => p.countryCode === issuing && p.number.toUpperCase().replace(/[\s-]+/g, "") === plan.passport.toUpperCase()) ?? null : c.passportList[0] ?? null;
      if (withPassport && !pp) notes.push("the existing contact holds no passport with this number: none attached (the contact was not edited)");
      return { contactNid: c.contactNid, passportNid: pp?.passportNid ?? null, how: "found", differs: differences(c, plan, nat, pp), notes };
    }
  }
  // 3. A new contact, recorded before the call.
  const person = {
    name: plan.given, surname: plan.surname, knownAs: `${plan.given} ${plan.surname}`,
    ...(plan.gender ? { gender: plan.gender } : {}), ...(nat ? { nationality: nat } : {}), ...(plan.dob ? { dateOfBirth: plan.dob } : {}),
    ...(withPassport ? { documents: { passportList: [{ country: issuing, ...(nat ? { nationality: nat } : {}), number: plan.passport, name: plan.given, middleName: "", surname: plan.surname, ...(plan.expiry ? { dateOfExpiry: plan.expiry } : {}), isDefault: true, deleted: false }] } } : {}),
  };
  const key = hmac ?? sha(JSON.stringify(person));
  const { row: att, fresh } = await attempt({ request_id: requestId, leg_index: leg.index, kind: "contact", leon_flight_nid: String(flightNid), content_sha256: key, people_count: 1, state: "sending", sent_by_email: user.email, detail: { row } });
  if (!fresh) return att?.state === "in_leon" && att.leon_contact_nid ? { contactNid: Number(att.leon_contact_nid), passportNid: att.detail?.passportNid ?? null, how: "mapped", differs: [], notes } : { failed: "an earlier create of this contact is still unfinished — check Leon's address book" };
  const t0 = Date.now(); let r = null, thrown = null;
  try { r = await leonGraphql(Q.create, { p: person }, timeout()); } catch (e) { thrown = e; }
  const ms = Date.now() - t0;
  const c = r?.data?.phonebook?.personCreate?.value ?? null;
  if (c?.contactNid) {
    const pp = withPassport ? c.passportList.find((p) => p.number.toUpperCase().replace(/[\s-]+/g, "") === plan.passport.toUpperCase()) ?? c.passportList[0] ?? null : null;
    if (hmac) await remember({ passport_hmac: hmac, issuing_country: issuing, contact_nid: String(c.contactNid), passport_nid: pp ? String(pp.passportNid) : null, source: "created", request_id: requestId, leg_index: leg.index, flight_nid: String(flightNid) }).catch(() => {});
    await settle(att.id, { state: "in_leon", leon_contact_nid: String(c.contactNid), http_status: r.httpStatus, answered_ms: ms, detail: { row, passportNid: pp?.passportNid ?? null } });
    await audit({ kind: "intake.leon_contact_created", userId: user.userId, userEmail: user.email, toolName: "intake.leon_send", toolArgs: { requestId, leg: leg.index, row }, toolResult: { contactNid: c.contactNid, withPassport }, success: true, confirmationStatus: "confirmed", latencyMs: ms }).catch(() => {});
    return { contactNid: c.contactNid, passportNid: pp?.passportNid ?? null, how: "created", differs: [], notes };
  }
  const refused = !thrown && r && r.httpStatus < 500 && (r.errors?.length || r.data?.phonebook?.personCreate?.errorList);
  const msg = scrubString(String(r?.errors?.[0]?.message ?? r?.data?.phonebook?.personCreate?.errorList?.[0]?.message ?? thrown?.message ?? `HTTP ${r?.httpStatus}`), tokens).replace(/got invalid value "[^"]*"/g, "got an invalid value").slice(0, 160);
  await settle(att.id, { state: refused ? "not_in_leon" : "unknown", leon_error: `Leon: ${msg}`, http_status: r?.httpStatus ?? null, answered_ms: ms });
  await audit({ kind: refused ? "intake.leon_contact_refused" : "intake.leon_contact_unknown", userId: user.userId, userEmail: user.email, toolName: "intake.leon_send", toolArgs: { requestId, leg: leg.index, row }, success: false, error: `Leon: ${msg}`, confirmationStatus: "confirmed", latencyMs: ms }).catch(() => {});
  return { failed: refused ? `Leon refused the contact (${msg})` : `Leon did not confirm the contact (${msg}); check its address book before sending again` };
}

/**
 * A created leg's passengers into its passenger database: every passenger resolved to a contact, then the WHOLE list in
 * one call. → { kind: 'pax', state: 'in_leon'|'not_in_leon'|'unknown'|'none', people, created, reused, differs: [{row, fields}],
 *   notes: [{row, notes}], failed: [{row, reason}], error? }
 */
export async function writeLegPax({ requestId, leg, flightNid, pax, nameOrder, user, people }) {
  if (!pax.length) return { kind: "pax", state: "none", people: 0 };
  const tokens = personalTokens(people ?? pax);
  const plans = pax.map((p) => contactPlan(p, nameOrder));
  const resolved = [];
  for (const [i, plan] of plans.entries()) {
    let r; try { r = await resolve(plan, { requestId, leg, flightNid, row: i + 1, user, tokens }); } catch (e) { r = { failed: `stopped: ${scrubString(String(e.message), tokens).slice(0, 120)}` }; }
    resolved.push({ row: i + 1, ...r });
  }
  const failed = resolved.filter((x) => x.failed).map((x) => ({ row: x.row, reason: x.failed }));
  const summary = { people: pax.length, created: resolved.filter((x) => x.how === "created").length, reused: resolved.filter((x) => x.how === "mapped" || x.how === "found").length,
    differs: resolved.filter((x) => x.differs?.length).map((x) => ({ row: x.row, fields: x.differs })), notes: resolved.filter((x) => x.notes?.length).map((x) => ({ row: x.row, notes: x.notes })), failed };
  const listKey = sha(`list:${resolved.map((x) => `${x.contactNid ?? "-"}/${x.passportNid ?? "-"}`).join(",")}`);
  if (failed.length) {
    // Nothing goes to the flight: a partial list looks right and is not.
    const error = `${failed.map((f) => `passenger ${f.row} of ${pax.length}: ${f.reason}`).join("; ")}. Nothing was written to the flight's passenger list.`;
    await attempt({ request_id: requestId, leg_index: leg.index, kind: "pax", leon_flight_nid: String(flightNid), content_sha256: listKey, people_count: pax.length, state: "not_in_leon", sent_by_email: user.email, detail: summary }).then(({ row, fresh }) => (fresh ? settle(row.id, { state: "not_in_leon", leon_error: error, detail: summary }) : null)).catch(() => {});
    await audit({ kind: "intake.leon_pax_not_sent", userId: user.userId, userEmail: user.email, toolName: "intake.leon_send", toolArgs: { requestId, leg: leg.index }, toolResult: { people: pax.length, failedRows: failed.map((f) => f.row), created: summary.created, reused: summary.reused }, success: false, error: `${failed.length} passenger(s) could not be resolved`, confirmationStatus: "confirmed" }).catch(() => {});
    return { kind: "pax", state: "not_in_leon", ...summary, error };
  }
  // The leg's whole list, in one call (it replaces whatever the flight held).
  const list = resolved.map((x) => ({ contactNid: Number(x.contactNid), ...(x.passportNid ? { departurePassportNid: Number(x.passportNid), arrivalPassportNid: Number(x.passportNid) } : {}) }));
  const { row: att, fresh } = await attempt({ request_id: requestId, leg_index: leg.index, kind: "pax", leon_flight_nid: String(flightNid), content_sha256: listKey, people_count: pax.length, state: "sending", sent_by_email: user.email, detail: summary });
  if (!fresh) return att?.state === "in_leon" ? { kind: "pax", state: "in_leon", ...summary, already: true } : { kind: "pax", state: "unknown", ...summary, error: "An earlier write of this exact list is unfinished or its result is unknown. Nothing was sent again; check the flight in Leon." };
  const t0 = Date.now(); let r = null, thrown = null;
  try { r = await leonGraphql(Q.list, { f: Number(flightNid), l: list }, timeout()); } catch (e) { thrown = e; }
  const ms = Date.now() - t0;
  const got = r?.data?.passengerList?.addPassengersToList;
  let o;
  if (got && !r.errors?.length && (got.passengerContactList ?? []).length === list.length) o = { kind: "pax", state: "in_leon", ...summary };
  else if (got && !r.errors?.length) o = { kind: "pax", state: "not_in_leon", ...summary, error: `Leon answered with ${(got.passengerContactList ?? []).length} passengers on the flight, not ${list.length}. Check the flight in Leon.` };
  else if (!thrown && r && r.httpStatus < 500 && r.errors?.length) o = { kind: "pax", state: "not_in_leon", ...summary, error: `Leon: ${scrubString(String(r.errors[0].message), tokens).replace(/got invalid value "[^"]*"/g, "got an invalid value").slice(0, 200)}. Nothing was written to the flight's passenger list.` };
  else o = { kind: "pax", state: "unknown", ...summary, error: thrown ? `Leon did not answer (${/abort|timeout/i.test(String(thrown.message)) ? "timed out" : "no response"})` : `Leon answered HTTP ${r?.httpStatus} without confirming` };
  await settle(att.id, { state: o.state, leon_error: o.error ?? null, http_status: r?.httpStatus ?? null, answered_ms: ms, detail: summary });
  await audit({ kind: `intake.leon_pax_${o.state === "in_leon" ? "written" : o.state === "not_in_leon" ? "refused" : "unknown"}`, userId: user.userId, userEmail: user.email, toolName: "intake.leon_send", toolArgs: { requestId, leg: leg.index }, toolResult: { flightNid: String(flightNid), people: pax.length, created: summary.created, reused: summary.reused, differs: summary.differs.length }, success: o.state === "in_leon", error: o.error ?? null, confirmationStatus: "confirmed", latencyMs: ms }).catch(() => {});
  return o;
}
