// ONE passenger into Leon's passenger DATABASE (a contact with a passport, added to one flight's passenger list), to
// settle the field questions before the full write is built: which field takes the passport, the country code form,
// the gender form, the date format, how the name lands. It writes exactly one passenger to the flight you name and
// stops. It is also the tool for the next field question: change a value, run again.
//
//   Dry run (no network writes; prints exactly what would be sent):
//     node --env-file=.env agent/scripts/leon-pax-probe.mjs --flight 75699881
//   Write (a PERSON types the phrase; the agent never does):
//     LEON_PAX_PROBE_CONFIRM="write one passenger to flight 75699881" node --env-file=.env agent/scripts/leon-pax-probe.mjs --flight 75699881 --write
//
// Values (all optional; the defaults are an INVENTED person, so no real data is needed for the check):
//   --given "Probe" --surname "Testperson" --gender MALE|FEMALE --dob 1980-01-01 --nationality LVA
//   --passport TEST00001 --passport-country LVA --expiry 2031-01-01 [--no-text]
// Leon's own data says: countries as ISO-3 (Country.code: LVA, CZE), dates YYYY-MM-DD, gender MALE / FEMALE / UNKNOWN —
// the probe sends those and shows what Leon stored, so ops can confirm each field in the DATABASE tab.
//
// What it does with --write, in order (each call printed with its variables and Leon's answer, values masked):
//   0. reads the flight's passenger list (before);
//   1. looks the passport up (contactByWildcardForDuplicationList): same number AND issuing country = the same person,
//      reused, never edited; any differing detail is printed as a difference;
//   2. if not found: phonebook.personCreate — the contact with its passport in ONE call;
//   3. passengerList.savePassengerText — a one-line text list (skip with --no-text), to see whether the TEXT tab and the
//      DATABASE tab coexist;
//   4. passengerList.addPassengersToList — the contact with its passport for departure and arrival;
//   5. reads the flight's passenger list and the contact back.
// Nothing here logs: it prints to the terminal for the person who ran it. Names, dates and document numbers are masked
// in the print (first character, bullets, length) with a same/different flag against what was sent.
import { leonGraphql, leonOperator } from "../lib/intake/leon-client.mjs";

const arg = (k, d = null) => { const i = process.argv.indexOf(`--${k}`); return i > 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : d; };
const flag = (k) => process.argv.includes(`--${k}`);
const flightNid = Number(arg("flight"));
if (!flag("print-documents") && (!Number.isInteger(flightNid) || flightNid <= 0)) { console.error("--flight <Leon flight nid> is required (a test flight)."); process.exit(2); }
const P = {
  given: arg("given", "Probe"), surname: arg("surname", "Testperson"), gender: arg("gender", "MALE"), dob: arg("dob", "1980-01-01"),
  nationality: arg("nationality", "LVA"), passport: arg("passport", "TEST00001"), passportCountry: arg("passport-country", arg("nationality", "LVA")), expiry: arg("expiry", "2031-01-01"),
};
const WRITE = flag("write");
const PHRASE = `write one passenger to flight ${flightNid}`;

// ── masking: a person's values never print in clear; formats (codes, enums, date shapes) do ───────────────────
const PERSONAL = new Set(["name", "surname", "middleName", "knownAs", "knownAsDefault", "number", "dateOfBirth", "dateOfExpiry", "expiresDate", "dateOfBirthString", "text", "passengerText", "passengerListAsText", "wildcard", "personCode", "given", "dob", "passport", "expiry"]);
const SENT = new Set([P.given, P.surname, P.passport, P.dob, P.expiry, `${P.given} ${P.surname}`].map(String));
const shapeOf = (v) => (/^\d{4}-\d{2}-\d{2}/.test(v) ? `${v.replace(/\d/g, "9")}` : null);
const m1 = (v) => { const s = String(v); if (s === "") return '""'; const shape = shapeOf(s); return `${shape ? `date ${shape}` : `${s[0]}${"•".repeat(Math.max(0, s.length - 1))}`} (${s.length})${SENT.has(s) ? " =sent" : ""}`; };
const mask = (v, key = null) => (v == null ? v : Array.isArray(v) ? v.map((x) => mask(x, key)) : typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, mask(x, k)])) : PERSONAL.has(key) && typeof v === "string" ? m1(v) : v);
const show = (label, o) => console.log(`\n## ${label}\n${JSON.stringify(mask(o), null, 2)}`);

const PASSPORT_FIELDS = "passportNid number countryCode country { code codeIso name } nationality { code codeIso } expiresDate neverExpires name middleName surname isMasked";
const CONTACT_FIELDS = `contactNid name surname middleName knownAs genderEnum dateOfBirth nationality { code codeIso name } passportList { ${PASSPORT_FIELDS} }`;
const LIST_FIELDS = `count realCount isDataSourceContact isDataSourceText passengerText passengerListAsText passengerContactList { passengerContactNid contact { contactNid name surname genderEnum dateOfBirth nationality { code codeIso } } departurePassport { ${PASSPORT_FIELDS} } arrivalPassport { passportNid } }`;
const Q = {
  read: `query($n:FlightNid!){ flight(flightNid:$n){ flightNid flightNo startTimeUTC notes { ops } passengerList { ${LIST_FIELDS} } } }`,
  lookup: `query($f:ContactDuplicationFilter!){ contactByWildcardForDuplicationList(filter:$f){ contactNid name surname passportList { passportNid countryCode number } } }`,
  contact: `query($c:ContactNid){ contact { single(contactNid:$c){ ${CONTACT_FIELDS} } } }`,
  create: `mutation($p:PhonebookPersonCreateInput!){ phonebook { personCreate(person:$p){ ... on NonNullContactValue { value { ${CONTACT_FIELDS} } } ... on ErrorList { errorList { message category path } } } } }`,
  text: `mutation($f:FlightNid!,$t:PassengerTextInput!){ passengerList { savePassengerText(flightNid:$f, passengerText:$t){ count isDataSourceText isDataSourceContact } } }`,
  add: `mutation($f:FlightNid!,$l:[PassengerContactInput!]){ passengerList { addPassengersToList(flightNid:$f, passengerContactList:$l){ ${LIST_FIELDS} } } }`,
};
if (flag("print-documents")) { console.log(JSON.stringify(Q)); process.exit(0); } // to validate against Leon's schema offline

// The contact exactly as the full write will build it: request values only, nothing invented (absent → left out).
const person = {
  name: P.given, surname: P.surname, knownAs: `${P.given} ${P.surname}`,
  ...(P.gender ? { gender: P.gender } : {}), ...(P.nationality ? { nationality: P.nationality } : {}), ...(P.dob ? { dateOfBirth: P.dob } : {}),
  documents: { passportList: [{ country: P.passportCountry, ...(P.nationality ? { nationality: P.nationality } : {}), number: P.passport, name: P.given, middleName: "", surname: P.surname, ...(P.expiry ? { dateOfExpiry: P.expiry } : {}), isDefault: true, deleted: false }] },
};
const textLine = `Passengers as given in the request — LEON PAX PROBE (one test passenger)\n\n1. ${P.given} ${P.surname}`;

console.log(`Leon: ${leonOperator()}${process.env.LEON_API_BASE ? ` (LEON_API_BASE=${process.env.LEON_API_BASE})` : ""} · flight ${flightNid} · ${WRITE ? "WRITE" : "DRY RUN (nothing is written)"}`);
show("1. lookup — sent", { query: "contactByWildcardForDuplicationList", variables: { f: { wildcard: P.passport, limit: 20 } } });
show("2. create — would be sent (only when the lookup finds no contact with this passport number and country)", { mutation: "phonebook.personCreate", variables: { p: person } });
if (!flag("no-text")) show("3. text list — would be sent", { mutation: "passengerList.savePassengerText", variables: { f: flightNid, t: { count: 1, text: textLine } } });
show("4. add to the flight — would be sent", { mutation: "passengerList.addPassengersToList", variables: { f: flightNid, l: [{ contactNid: "<from step 1 or 2>", departurePassportNid: "<the passport's nid>", arrivalPassportNid: "<the passport's nid>" }] } });

if (!WRITE) { console.log("\nDry run: nothing was sent. Add --write and the phrase to write."); process.exit(0); }
if (process.env.LEON_PAX_PROBE_CONFIRM !== PHRASE) { console.error(`\nRefused: a person types LEON_PAX_PROBE_CONFIRM="${PHRASE}" to write.`); process.exit(3); }

const call = async (label, q, v) => { const r = await leonGraphql(q, v, { timeoutMs: 30000 }); show(`${label} — Leon answered (HTTP ${r.httpStatus}, ${r.ms} ms)`, { data: r.data, errors: r.errors }); return r; };
const before = await call("0. flight before", Q.read, { n: flightNid });
if (!before.data?.flight) { console.error("The flight could not be read; nothing was written."); process.exit(4); }

const look = await call("1. lookup", Q.lookup, { f: { wildcard: P.passport, limit: 20 } });
const same = (look.data?.contactByWildcardForDuplicationList ?? []).filter((c) => c.passportList.some((p) => p.number === P.passport && p.countryCode === P.passportCountry));
let contact = null;
if (same.length > 1) { console.error(`\n${same.length} contacts already hold this passport number and country. Nothing written: a person decides which is the passenger.`); process.exit(5); }
if (same.length === 1) {
  contact = (await call("1b. the existing contact (reused, NOT edited)", Q.contact, { c: same[0].contactNid })).data?.contact?.single;
  const diffs = [["given name", contact?.name, P.given], ["surname", contact?.surname, P.surname], ["gender", contact?.genderEnum, P.gender], ["date of birth", contact?.dateOfBirth, P.dob], ["nationality", contact?.nationality?.code, P.nationality]].filter(([, a, b]) => b && String(a ?? "") !== String(b));
  console.log(`\nREUSED contact ${contact?.contactNid}. ${diffs.length ? `Differs from the request in: ${diffs.map(([k]) => k).join(", ")} (a person decides which is right; the contact was not changed).` : "Matches the request."}`);
} else {
  const c = await call("2. create (phonebook.personCreate)", Q.create, { p: person });
  contact = c.data?.phonebook?.personCreate?.value ?? null;
  if (!contact) { console.error("\nLeon did not create the contact (above). Nothing else was written."); process.exit(6); }
}
const passport = contact.passportList?.find((p) => p.number === P.passport) ?? contact.passportList?.[0];
if (!passport) { console.error("\nThe contact has no passport to attach. Stopping before the passenger list."); process.exit(7); }
if (!flag("no-text")) await call("3. text list (savePassengerText)", Q.text, { f: flightNid, t: { count: 1, text: textLine } });
await call("4. add to the flight (addPassengersToList)", Q.add, { f: flightNid, l: [{ contactNid: contact.contactNid, departurePassportNid: passport.passportNid, arrivalPassportNid: passport.passportNid }] });
const after = await call("5. flight after", Q.read, { n: flightNid });

// ── the field check, one line each: what was sent → what Leon holds ─────────────────────────────────────────────
const pl = after.data?.flight?.passengerList ?? {};
const row = (pl.passengerContactList ?? []).find((x) => x.contact?.contactNid === contact.contactNid);
const pp = row?.departurePassport ?? passport;
const lines = [
  ["given name → contact.name", P.given, row?.contact?.name], ["surname → contact.surname", P.surname, row?.contact?.surname],
  ["gender → contact.genderEnum", P.gender, row?.contact?.genderEnum], ["date of birth → contact.dateOfBirth", P.dob, row?.contact?.dateOfBirth],
  ["nationality → contact.nationality.code", P.nationality, row?.contact?.nationality?.code],
  ["passport number → departurePassport.number", P.passport, pp?.number], ["passport country → departurePassport.countryCode", P.passportCountry, pp?.countryCode],
  ["passport expiry → departurePassport.expiresDate", P.expiry, pp?.expiresDate], ["passport nationality → departurePassport.nationality.code", P.nationality, pp?.nationality?.code],
  ["name on the passport → passport.name / surname", `${P.given} ${P.surname}`, `${pp?.name ?? ""} ${pp?.surname ?? ""}`.trim()],
];
console.log("\n## FIELD CHECK (sent → stored)");
for (const [k, a, b] of lines) console.log(`  ${String(a) === String(b ?? "") ? "same     " : "DIFFERENT"}  ${k}: ${["gender", "nationality", "country"].some((w) => k.includes(w)) ? `${a} → ${b ?? "(empty)"}` : `${m1(a)} → ${b == null ? "(empty)" : m1(b)}`}`);
console.log(`\n  passenger list: data source contact=${pl.isDataSourceContact} text=${pl.isDataSourceText} · count ${pl.count} · realCount ${pl.realCount} · records ${(pl.passengerContactList ?? []).length} · text list ${pl.passengerText ? `present (${pl.passengerText.length} chars)` : "EMPTY"}`);
console.log(`\nStopped after one passenger (contact ${contact.contactNid} on flight ${flightNid}). Ops: open the flight's PAX → DATABASE tab and confirm each field.`);
