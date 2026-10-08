// Removes test contacts from cwy-cwy's Leon address book (the probe's, or any made on purpose for a check): first takes
// each one off the passenger lists of the flights it is on, then deletes the contact. A contact is touched ONLY if its
// passports are exactly the one passport number you name (--expect-passport), so a real person cannot be removed by a
// mistyped id.
//
//   Dry run (reads only; prints what would happen, values masked):
//     node --env-file=.env agent/scripts/leon-contact-cleanup.mjs --contacts 6910667,6911374 --expect-passport TEST00001 --flights 75699881
// (--flights: flights to check as well — Leon's flightListAsPassenger does not list every flight a contact is on.)
//   Delete (a PERSON types the phrase):
//     LEON_CONTACT_CLEANUP_CONFIRM="delete contacts 6910667,6911374" node --env-file=.env agent/scripts/leon-contact-cleanup.mjs --contacts 6910667,6911374 --expect-passport TEST00001 --flights 75699881 --write
import { leonGraphql, leonOperator } from "../lib/intake/leon-client.mjs";

const arg = (k) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] ?? null : null; };
const ids = String(arg("contacts") ?? "").split(",").map((x) => Number(x.trim())).filter((n) => Number.isInteger(n) && n > 0);
const expect = String(arg("expect-passport") ?? "").trim().toUpperCase();
const extraFlights = String(arg("flights") ?? "").split(",").map((x) => Number(x.trim())).filter((n) => Number.isInteger(n) && n > 0);
const WRITE = process.argv.includes("--write");
if (!ids.length || !expect) { console.error("--contacts <nid,nid> and --expect-passport <number> are required."); process.exit(2); }
const PHRASE = `delete contacts ${ids.join(",")}`;
const m = (s) => { const t = String(s ?? ""); return t ? `${t[0]}${"•".repeat(Math.max(0, t.length - 1))} (${t.length})` : '""'; };
const call = async (q, v) => { const r = await leonGraphql(q, v, { timeoutMs: 30000 }); if (r.errors?.length) throw new Error(String(r.errors[0].message).slice(0, 200)); return r.data; };

console.log(`Leon: ${leonOperator()} · ${WRITE ? "DELETE" : "DRY RUN (reads only)"}`);
const plan = [];
for (const nid of ids) {
  const d = await call(`query($c:ContactNid){ contact { single(contactNid:$c){ contactNid isDeleted name surname passportList { passportNid number } } } }`, { c: nid });
  const c = d.contact.single;
  const listed = (await call(`query($c:ContactNid!){ contact { flightListAsPassenger(contactNid:$c, offset:0, limit:50){ flightNid } } }`, { c: nid })).contact.flightListAsPassenger.map((f) => f.flightNid);
  const onExtra = [];
  for (const f of extraFlights) { const d2 = await call(`query($n:FlightNid!){ flight(flightNid:$n){ passengerList { passengerContactList { contact { contactNid } } } } }`, { n: f }); if ((d2.flight?.passengerList?.passengerContactList ?? []).some((x) => x.contact?.contactNid === nid)) onExtra.push(f); }
  const flights = [...new Set([...listed, ...onExtra])];
  const numbers = c.passportList.map((p) => String(p.number).toUpperCase());
  const safe = !c.isDeleted && numbers.length > 0 && numbers.every((n) => n === expect);
  console.log(`contact ${nid}: ${m(c.name)} ${m(c.surname)} · passports ${numbers.map(m).join(", ") || "none"} · deleted ${c.isDeleted} · on flights ${flights.join(", ") || "none"} · ${safe ? "will be removed" : "NOT TOUCHED (its passports are not exactly the expected number, or it is already deleted)"}`);
  if (safe) plan.push({ nid, flights });
}
if (!WRITE) { console.log("\nDry run: nothing was changed. Add --write and the phrase."); process.exit(0); }
if (process.env.LEON_CONTACT_CLEANUP_CONFIRM !== PHRASE) { console.error(`Refused: a person types LEON_CONTACT_CLEANUP_CONFIRM="${PHRASE}".`); process.exit(3); }
for (const { nid, flights } of plan) {
  for (const f of flights) { await call(`mutation($f:FlightNid!,$l:[ContactNid]){ passengerList { removePassengersFromList(flightNid:$f, passengerContactList:$l){ count } } }`, { f, l: [nid] }); console.log(`  contact ${nid} taken off flight ${f}'s passenger list`); }
  const r = await leonGraphql(`mutation($c:ContactNid!){ phonebook { deleteContact(contactNid:$c){ ... on NonNullBooleanValue { value } ... on ErrorList { errorList { message } } } } }`, { c: nid }, { timeoutMs: 30000 });
  console.log(`  contact ${nid}: ${r.data?.phonebook?.deleteContact?.value === true ? "deleted" : `NOT deleted — ${JSON.stringify(r.errors ?? r.data?.phonebook?.deleteContact?.errorList).slice(0, 200)}`}`);
}
