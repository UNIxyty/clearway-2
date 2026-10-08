// Passengers into Leon's passenger DATABASE and crew into the OPS notes — end to end on the RIG (local DB, mock Resend,
// mock Leon that behaves as the real one was seen to: names-only contact search, addPassengersToList REPLACES the list),
// with INVENTED people (rig/intake/make-people-fixture.mjs; a seed gives other passports and dates of birth).
//   node --env-file=.env.rig rig/intake/e2e-people.mjs
// Proves: 16 contacts with passports per leg, one call per leg, one contact per traveller across legs and requests, an
// ops-made contact reused with a warning (never edited), a person's name split reaching Leon, a failure on passenger 5
// writing nothing to the flight and a resend creating only the missing one, the provenance in OPS notes, a restart
// mid-write (unknown, no retry), the manifest filled from Leon, and no name, date of birth or document number in any
// log, audit row, send log, mapping row, request row or email. Prints counts and states — never a person's value.
import { execSync } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { generatePassengerManifest } from "../../agent/lib/manifest/index.mjs";
import { stubLeon } from "../manifest/fixtures.mjs";
if (!/127\.0\.0\.1|localhost/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "") || !/127\.0\.0\.1/.test(process.env.LEON_API_BASE ?? "")) { console.error("rig only (local DB and the mock Leon)"); process.exit(78); }
const AGENT = process.env.RIG_AGENT_URL || "http://127.0.0.1:5175";
const SCR = path.resolve("rig/.scratch"); mkdirSync(SCR, { recursive: true });
const FAULTS = path.join(SCR, "leon-mock-faults.json"), MOCKLOG = path.join(SCR, "leon-mock-log.jsonl");
const started = new Date().toISOString();
let failures = 0;
const ok = (cond, what, detail = "") => { console.log(`${cond ? "PASS" : "FAIL"}  ${what}${detail ? `  · ${detail}` : ""}`); if (!cond) failures += 1; };
const db = async (p) => (await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${p}`, { headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` } })).json();
const api = async (p, body, method = body ? "POST" : "GET") => { const r = await fetch(`${AGENT}${p}`, { method, headers: body ? { "content-type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, json: await r.json().catch(() => null) }; };
const faults = (f) => writeFileSync(FAULTS, JSON.stringify(f));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mockFlights = async () => (await fetch(`${process.env.LEON_API_BASE}/_rig/flights`)).json();

// The invented people, as the fixture writes them (the test's own copy, to look for them everywhere).
const SUR = ["EXAMPLE", "SAMPLE", "SPECIMEN", "TESTER", "DUMMY", "PLACEHOLDER", "FICTIVE", "NOTREAL", "DEMOSON", "MOCKLEY", "FAKEWELL", "TESTWOOD", "SAMPLETON", "PROTO", "MOCKFORD", "DEMOVA"];
const GIV = ["ALICE", "BRUNO", "CARLA", "DMITRI", "ELENA", "FELIX", "GRETA", "HUGO", "INES", "JONAS", "KIRA", "LUKAS", "MILA", "NILS", "OLGA", "PAVEL"];
const NAT = { FRANCE: "FRA", LATVIA: "LVA", GERMANY: "DEU", GREECE: "GRC", MALTA: "MLT", AUSTRIA: "AUT" }, NATS = Object.keys(NAT);
const MON3 = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const fxDate = (i, y) => `${y + ((i * 3) % 20)}-${String(((i * 5) % 12) + 1).padStart(2, "0")}-${String(1 + ((i * 7) % 28)).padStart(2, "0")}`; // the fixture's d(i, y), as ISO
const person = (i, seed = 0) => ({ given: GIV[i], surname: SUR[i], gender: i % 3 === 0 ? "MALE" : "FEMALE", dob: fxDate(i, 1961 + seed), nat: NAT[NATS[i % 6]], passport: `TEST${String(seed * 100 + i + 1).padStart(5, "0")}`, expiry: fxDate(i + 2, 2030) });
const PAX_DOCS = Array.from({ length: 16 }, (_, i) => `TEST${String(i + 1).padStart(5, "0")}`);
const CREW_DOCS = Array.from({ length: 4 }, (_, i) => `TESTC${String(i + 1).padStart(4, "0")}`);
const CREW_NAMES = ["CREWMAN", "CREWLY", "CABINSON", "STEWARDE"];
const MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const dobs = Array.from({ length: 16 }, (_, i) => `${String(1 + ((i * 7) % 28)).padStart(2, "0")}${MON[(i * 5) % 12]}${1961 + ((i * 3) % 20)}`);
// Words that are also ordinary English or our own labels are not proof of a leak; whole surnames + documents are.
const PII = [...SUR.filter((w) => !/^(EXAMPLE|SAMPLE|SPECIMEN|TESTER|DUMMY|PLACEHOLDER|PROTO)$/.test(w)), ...CREW_NAMES, ...PAX_DOCS, ...CREW_DOCS, ...dobs];
const leaks = (label, text) => { const t = String(text ?? ""); const hit = [...PII.filter((w) => new RegExp(`(?<![A-Z0-9])${w}(?![A-Z0-9])`, "i").test(t)), ...(t.match(/TEST\d{5}|TESTC\d{4}|\b(19[5-9]\d)-\d\d-\d\d\b/g) ?? [])]; return hit.length ? `${label}: ${hit.length} personal value(s)` : null; };

async function deliver(file) {
  const emailId = randomUUID();
  await fetch(`${process.env.RESEND_API_BASE}/_rig/register`, { method: "POST", body: JSON.stringify({ id: emailId, file: path.resolve(file) }) });
  const body = JSON.stringify({ type: "email.received", created_at: new Date().toISOString(), data: { email_id: emailId, created_at: new Date().toISOString(), from: "dispatch@example.invalid", to: ["handling@intake.rig.invalid"], subject: path.basename(file) } });
  const svixId = `msg_${randomUUID()}`, ts = String(Math.floor(Date.now() / 1000));
  const sig = createHmac("sha256", Buffer.from(process.env.RESEND_WEBHOOK_SECRET.replace(/^whsec_/, ""), "base64")).update(`${svixId}.${ts}.${body}`).digest("base64");
  await fetch(`${AGENT}/api/intake/resend-webhook`, { method: "POST", headers: { "content-type": "application/json", "svix-id": svixId, "svix-timestamp": ts, "svix-signature": `v1,${sig}` }, body });
  for (const t0 = Date.now(); ;) {
    const m = (await db(`intake_messages?select=id,status,request_id&provider_message_id=eq.${emailId}`))[0];
    if (m && m.status !== "waiting") return m;
    if (Date.now() - t0 > 240000) throw new Error("message still waiting");
    await sleep(3000);
  }
}
const detail = async (id) => (await api(`/api/intake/requests/${id}`)).json;
async function send(id) {
  const p = await api(`/api/intake/requests/${id}/prepare`, {});
  if (p.status !== 200) return { prepared: p };
  await api(`/api/intake/send/${p.json.confirmation.token}/confirm`, {});
  let st = null; for (let i = 0; i < 240; i += 1) { st = (await api(`/api/intake/send/${p.json.confirmation.token}`)).json; if (st?.status === "done") break; await sleep(500); }
  return { prepared: p, result: st?.result ?? null };
}
const peopleOn = (d, leg) => { const l = d.people.legs?.[String(leg)] ?? { crew: 0, pax: 0 }, a = d.people.legs?.all ?? { crew: 0, pax: 0 }; return { pax: l.pax + a.pax, crew: l.crew + a.crew }; };

// ── reset (rig DB intake tables, mock Leon) ──
execSync(`docker exec supabase_db_rig psql -U postgres -d postgres -qc "truncate public.intake_messages, public.intake_events, public.intake_leon_contacts cascade;"`);
rmSync(path.join(SCR, "intake"), { recursive: true, force: true }); rmSync(MOCKLOG, { force: true }); faults({});
execSync(`kill $(lsof -tiTCP:3995 -sTCP:LISTEN) || true; cd rig/intake && (env -i PATH="$PATH" HOME="$HOME" PORT=3995 RIG_SCRATCH="${SCR}" nohup node mock-leon.mjs > ../.scratch/mock-leon.out 2>&1 &)`, { shell: "/bin/bash" });
await sleep(1500);
const fixture = (ref, call, days, seed) => { const f = path.join(SCR, `${ref.toLowerCase()}.eml`); execSync(`node rig/intake/make-people-fixture.mjs ${ref} ${call} ${days} ${f} ${seed}`); return f; };
const contactsInLeon = async () => (await fetch(`${process.env.LEON_API_BASE}/_rig/contacts`)).json();
const mockLog = () => (existsSync(MOCKLOG) ? readFileSync(MOCKLOG, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
const calls = (re) => mockLog().filter((e) => re.test(e.q));
const paxWrite = (r, leg) => r.legs.find((l) => l.index === leg)?.people?.find((p) => p.kind === "pax");
const flightOf = async (nid) => (await mockFlights()).find((f) => String(f.flightNid) === String(nid));
/** Every passenger row of a flight against the fixture's people, field by field. → count of rows that match entirely */
const rowsMatching = (f, seed, edits = {}) => (f.passengerList.passengerContactList ?? []).filter((x, i) => { const p = { ...person(i, seed), ...(edits[i] ?? {}) }; const c = x.contact, pp = x.departurePassport;
  return c.name === p.given && c.surname === p.surname && c.genderEnum === p.gender && c.dateOfBirth === p.dob && c.nationality?.code === p.nat && pp?.number === p.passport && pp?.countryCode === p.nat && pp?.expiresDate === p.expiry; }).length;
async function peopleSend(requestId, leg) {
  const p = await api(`/api/intake/requests/${requestId}/legs/${leg}/people/prepare`, {});
  if (p.status !== 200) return { prepared: p };
  return { prepared: p, confirmed: await api(`/api/intake/people/${p.json.confirmation.token}/confirm`, {}) };
}

console.log("\n=== 1. 16 passengers on two legs: contacts with passports, one call per leg ===");
const m1 = await deliver("rig/fixtures/intake/rigpax16-oelca.eml");
let d = await detail(m1.request_id);
const ppl = (await api(`/api/intake/requests/${m1.request_id}/people`)).json;
ok(ppl.nameOrder?.order === "given_first" && /First, Middle, Last/i.test(ppl.nameOrder?.said ?? ""), "the request's declared name order is read (\"First, Middle, Last Name\")", JSON.stringify(ppl.nameOrder));
ok(ppl.legs[0].pax.length === 16 && ppl.legs[0].pax.every((r, i) => r.surname === SUR[i] && r.given === GIV[i] && r.splitHow === "declared"), "the review screen's data shows each passenger's surname and given names, split by that order");
const s1 = await send(m1.request_id);
ok(s1.prepared.status === 200 && s1.prepared.json.legs.every((l) => l.people?.pax?.people === 16), "the confirmation counts 16 passengers per leg", JSON.stringify(s1.prepared.json?.legs?.map((l) => l.people?.pax) ?? s1.prepared.json?.blockers));
if (s1.prepared.status !== 200) { console.log(`\n${failures} FAILED (cannot continue)`); process.exit(1); }
const r1 = s1.result;
const [p0, p1] = [paxWrite(r1, 0), paxWrite(r1, 1)];
ok(r1.legs.every((l) => l.state === "in_leon") && p0?.state === "in_leon" && p1?.state === "in_leon", "both flights created, both legs' passengers in Leon's database", JSON.stringify([p0, p1].map((p) => p && `${p.state} created ${p.created} reused ${p.reused}`)));
ok(p0.created === 16 && p0.reused === 0 && p1.created === 0 && p1.reused === 16 && (await contactsInLeon()).length === 16, "leg 1 created 16 contacts; leg 2 reused all 16: one contact per traveller (16 in Leon's address book)", `contacts ${(await contactsInLeon()).length}`);
const lists = calls(/addPassengersToList/);
ok(lists.length === 2 && lists.every((e) => e.variables.l.length === 16) && calls(/savePassengerText/).length === 0, "exactly ONE addPassengersToList call per leg, each with all 16 (it replaces the list); no text-list call", `${lists.length} list calls`);
const fl = await Promise.all(r1.legs.map((l) => flightOf(l.flightNid)));
for (const f of fl) {
  ok(f.passengerList.isDataSourceContact && f.passengerList.passengerContactList.length === 16 && rowsMatching(f, 0) === 16, `flight ${f.flightNid} read back: 16 passengers, each with given name, surname, gender, date of birth, nationality, passport number, passport country and expiry as the request gave them`, `${rowsMatching(f, 0)} of 16 rows match`);
  const ops = f.notes.ops;
  ok(ops.indexOf("PASSENGERS per the handling request") > ops.indexOf("OPERATOR'S CREW per the handling request") && (ops.match(/^\d+\. /gm) ?? []).length === 20, `flight ${f.flightNid}: the request's own passenger list is in the OPS notes (provenance), after the crew block`);
}
ok(fl[0].passengerList.passengerContactList.length === 16, "writing leg 2's list left leg 1's list whole (16)");
const log1 = await db(`intake_leon_writes?select=payload&request_id=eq.${m1.request_id}`);
ok(log1.every((w) => /PASSENGERS per the handling request/.test(w.payload.opsNotes) && /16 passengers as the request gave them · sent to Leon in these notes; names and documents are not kept in the send log/.test(w.payload.opsNotes)), "the send log keeps the passenger block's heading and a count, not the names");
d = await detail(m1.request_id);
ok(d.request.ui.key === "loaded" && /16 passengers in the flight's passenger database in Leon/.test(d.stages.find((s) => s.name === "Passengers and crew")?.note ?? ""), "request Loaded; the stage says the passengers are in Leon's passenger database", d.stages.find((s) => s.name === "Passengers and crew")?.note?.slice(0, 140));
let e1 = (await db(`intake_messages?select=subject,delivery_detail&request_id=eq.${m1.request_id}&direction=eq.outbound&order=received_at.desc&limit=1`))[0];
ok(/^Loaded:/.test(e1.subject) && /16 passengers in the flight's passenger database in Leon \(PAX → DATABASE\): 16 new contacts, 0 existing contacts reused/.test(e1.delivery_detail.text) && /0 new contacts, 16 existing contacts reused/.test(e1.delivery_detail.text), "completion email: per leg, passengers in the passenger database with created/reused counts", e1.subject);

console.log("\n=== 2. The same 16 travellers on another request: one contact each, nothing created ===");
const before2 = calls(/personCreate/).length;
const m2 = await deliver(fixture("RIGPAX18", "OELCC", 14, 0));
const r2 = (await send(m2.request_id)).result;
ok(r2.legs.every((l) => paxWrite(r2, l.index)?.state === "in_leon" && paxWrite(r2, l.index).created === 0 && paxWrite(r2, l.index).reused === 16) && calls(/personCreate/).length === before2 && (await contactsInLeon()).length === 16, "sent again: every passenger matched by passport through our own mapping — 0 contacts created, still 16 in Leon", `${calls(/personCreate/).length - before2} creates`);

console.log("\n=== 3. The manifest of a flight our pipeline created fills its rows from Leon ===");
{ const f = fl[0];
  const g = await generatePassengerManifest({ flightId: `cwy-cwy:${f.flightNid}`, leon: stubLeon({ ...f, isCnl: false, operator: { name: "SAMPLE CHARTER (RIG)", planMode: "pro", isGuest: false }, flightWatch: { paxCount: null }, journeyLog: { paxCount: null } }), lookup: async () => ({ holders: [], unchecked: [] }) });
  console.log(`  manifest: ${g.result.pageCount} pages, ${g.result.passengerCount} rows, source ${JSON.stringify(g.result.passengerSource)}, warnings: ${g.result.warnings.map((w) => w.code).join(", ") || "none"}`);
  ok(g.result.passengerSource.kind === "leon" && g.result.passengerCount === 16 && g.result.pageCount === 2 && !g.result.missing.some((m) => m.fields.some((x) => /sex|passport|date of birth|nationality/.test(x))), "rows from LEON's passenger records (the source says so): 16 across both pages, sex, date of birth, passport, expiry and nationality filled — no change to the manifest code"); }

console.log("\n=== 4. A contact ops made by hand (reused with a warning, never edited) and a person's name split ===");
{ const f4 = fixture("RIGPAX19", "OELCD", 21, 2);
  const p3 = person(2, 2); // passenger 3 of that request
  const seeded = await (await fetch(`${process.env.LEON_API_BASE}/_rig/seed-contact`, { method: "POST", body: JSON.stringify({ name: p3.given, surname: p3.surname, gender: p3.gender, dateOfBirth: "1950-01-01", nationality: p3.nat, documents: { passportList: [{ country: p3.nat, number: p3.passport, name: p3.given, surname: p3.surname, dateOfExpiry: p3.expiry }] } }) })).json();
  const m4 = await deliver(f4);
  const pp4 = (await api(`/api/intake/requests/${m4.request_id}/people`)).json;
  const idx2 = pp4.legs[0].pax[1].idx;
  const ed = await api(`/api/intake/requests/${m4.request_id}/people/edit`, { op: "split", idx: idx2, surname: `${SUR[1]} DOUBLE`, given: GIV[1] });
  const shown = ed.json.legs[0].pax[1];
  ok(ed.status === 200 && shown.surname === `${SUR[1]} DOUBLE` && shown.splitHow === "edited" && !!shown.splitBy, "a person corrects passenger 2's split on the review screen: kept, marked edited and by whom", `${shown.splitHow} by ${shown.splitBy}`);
  const r4 = (await send(m4.request_id)).result; const w4 = paxWrite(r4, 0);
  const f = await flightOf(r4.legs[0].flightNid);
  const row2 = f.passengerList.passengerContactList[1].contact, row3 = f.passengerList.passengerContactList[2].contact;
  ok(row2.surname === `${SUR[1]} DOUBLE` && row2.name === GIV[1], "the edited split reached Leon: the contact's surname and given name are the person's");
  const after = (await contactsInLeon()).find((c) => c.contactNid === seeded.contactNid);
  ok(row3.contactNid === seeded.contactNid && after.dateOfBirth === "1950-01-01" && w4.differs.some((x) => x.row === 3 && x.fields.join() === "date of birth"), "passenger 3: the contact ops made (same passport) is reused, NOT edited, and the difference is a warning (passenger 3: date of birth)", JSON.stringify(w4.differs));
  const d4 = await detail(m4.request_id);
  ok(d4.sent.people.some((p) => p.kind === "pax" && p.detail?.differs?.some((x) => x.row === 3)), "…the warning is on the page's data"); }

console.log("\n=== 5. Passenger 5 of 16 fails: nothing written to the flight; a resend creates only the missing one ===");
faults({ refuseContactPassport: ["TEST00105"] });
const m5 = await deliver(fixture("RIGPAX17", "OELCB", 7, 1));
const r5 = (await send(m5.request_id)).result;
faults({});
const w5 = [paxWrite(r5, 0), paxWrite(r5, 1)];
const legsLists = calls(/addPassengersToList/).filter((e) => r5.legs.some((l) => Number(l.flightNid) === e.variables.f));
ok(r5.legs.every((l) => l.state === "in_leon") && w5.every((w) => w.state === "not_in_leon" && /passenger 5 of 16: Leon refused the contact/.test(w.error) && /Nothing was written to the flight's passenger list/.test(w.error)), "both flights exist; passengers NOT written: the failure names passenger 5 of 16 and says nothing was written to the flight", w5[0]?.error?.slice(0, 160));
ok(legsLists.length === 0 && (await Promise.all(r5.legs.map((l) => flightOf(l.flightNid)))).every((f) => !f.passengerList.passengerContactList), "no list call was made: the flights hold no partial list");
ok(!leaks("", w5[0].error), "…and Leon's echo of the passport number is removed from the reason");
d = await detail(m5.request_id);
ok(d.request.ui.key === "needs_you" && /passengers NOT in Leon for leg 1, 2/.test(d.request.statusReason) && d.stages.find((s) => s.name === "Passengers and crew")?.state === "part", "request red (Needs you), the stage partly failed", d.request.statusReason);
let e5 = (await db(`intake_messages?select=subject,delivery_detail&request_id=eq.${m5.request_id}&direction=eq.outbound&order=received_at.desc&limit=1`))[0];
ok(/passengers NOT in Leon for leg 1, 2/.test(e5.subject) && /passenger 5 of 16/.test(e5.delivery_detail.text), "the email says passengers are not in Leon and names passenger 5 of 16", e5.subject);
const creates5 = calls(/personCreate/).length;
const rs = await peopleSend(m5.request_id, 0);
const after5 = (await detail(m5.request_id)).sent.people.filter((p) => p.kind === "pax" && p.leg === 0).sort((a, b) => Date.parse(a.updatedAt) - Date.parse(b.updatedAt)).pop();
ok(rs.confirmed?.status === 200 && after5.state === "in_leon" && after5.detail.created === 1 && after5.detail.reused === 15 && calls(/personCreate/).length === creates5 + 1, "\"Send passengers to Leon\" (leg 1, confirmed by a person): only passenger 5 is created; the other 15 are reused, not written again", `${after5.state} · created ${after5.detail?.created} reused ${after5.detail?.reused}`);
const f5 = await Promise.all(r5.legs.map((l) => flightOf(l.flightNid)));
ok(rowsMatching(f5[0], 1) === 16 && !f5[1].passengerList.passengerContactList, "leg 1 now holds all 16, as the request gave them; leg 2's list was not touched by leg 1's write");
await peopleSend(m5.request_id, 1);
d = await detail(m5.request_id);
ok((await flightOf(r5.legs[1].flightNid)).passengerList.passengerContactList.length === 16 && d.request.ui.key === "loaded", "leg 2 sent too: request back to Loaded", d.request.statusReason);

console.log("\n=== 6. The service restarts during a list write: unknown, a person decides, nothing retried ===");
{ const m6 = await deliver(fixture("RIGPAX20", "OELCE", 28, 0));
  faults({ hangPassengerList: ["OELCE"], hangMs: 60000 });
  const p6 = await api(`/api/intake/requests/${m6.request_id}/prepare`, {});
  void api(`/api/intake/send/${p6.json.confirmation.token}/confirm`, {}).catch(() => null);
  let mid = []; for (let i = 0; i < 60 && !mid.some((w) => w.kind === "pax" && w.state === "sending"); i += 1) { await sleep(500); mid = await db(`intake_leon_people_writes?select=kind,state&request_id=eq.${m6.request_id}`); }
  ok(mid.some((w) => w.kind === "pax" && w.state === "sending"), "the list write's attempt row exists before Leon answers", mid.map((w) => `${w.kind}:${w.state}`).join(","));
  const listsBefore = calls(/addPassengersToList/).length;
  execSync(`kill $(lsof -tiTCP:5175 -sTCP:LISTEN)`); await sleep(1000);
  execSync(`cd agent && (env -i PATH="$PATH" HOME="$HOME" PORT=5175 AGENT_LOG_RANGES=true ICU_TIMEZONE_FILES_DIR="${SCR}/icu-tz" TZDATA_LATEST_CHECK=off CNAIR_PORTAL_BASE=http://127.0.0.1:3994 CNAIR_USER=mock CNAIR_PASSWORD=mock INTAKE_LOOKUP_SCHEDULE_MIN="0,0.02,0.04" nohup node --env-file=../.env.rig server.mjs >> ../rig/.scratch/agent.out 2>&1 &)`, { shell: "/bin/bash" });
  for (let i = 0; i < 20; i += 1) { await sleep(1000); try { if ((await fetch(`${AGENT}/api/health`)).ok) break; } catch { /* starting */ } }
  await sleep(2000);
  const after = await db(`intake_leon_people_writes?select=state&request_id=eq.${m6.request_id}&kind=eq.pax`);
  const rq = (await db(`intake_requests?select=status,status_reason&id=eq.${m6.request_id}`))[0];
  ok(after.some((w) => w.state === "unknown") && rq.status === "needs_you" && /passengers unknown · check Leon/.test(rq.status_reason), "after the restart the list write is UNKNOWN and the request asks a person", rq.status_reason);
  await sleep(3000); faults({});
  ok(calls(/addPassengersToList/).length === listsBefore, "nothing was retried"); }

console.log("\n=== 7. No name, date of birth or document number anywhere it must not be ===");
const out = [];
out.push(leaks("agent log", readFileSync(path.join(SCR, "agent.out"), "utf8").split("\n").filter((l) => l >= "").slice(-4000).join("\n")));
out.push(leaks("mock Leon request log", readFileSync(MOCKLOG, "utf8")));
out.push(leaks("audit rows", JSON.stringify(await db(`agent_audit_log?select=*&created_at=gte.${started}`))));
out.push(leaks("people send log", JSON.stringify(await db(`intake_leon_people_writes?select=*`))));
out.push(leaks("passport mapping", JSON.stringify(await db(`intake_leon_contacts?select=*`))));
out.push(leaks("flight send log", JSON.stringify(await db(`intake_leon_writes?select=*`))));
out.push(leaks("request rows", JSON.stringify(await db(`intake_requests?select=review,stages,status_reason`))));
out.push(leaks("emails", JSON.stringify(await db(`intake_messages?select=subject,sent_html,delivery_detail,search_text,understood&direction=eq.outbound`))));
out.push(leaks("request API", JSON.stringify([await detail(m1.request_id), await detail(m5.request_id)])));
const maps = await db("intake_leon_contacts?select=passport_hmac,issuing_country,source");
console.log(`  checked: agent log, mock Leon log, audit rows, send logs, ${maps.length} mapping rows (passport as HMAC only), request rows, emails, API`);
ok(out.every((x) => !x), "none found", out.filter(Boolean).join(" · "));
ok(maps.length >= 32 && maps.every((m) => /^[0-9a-f]{64}$/.test(m.passport_hmac)), "the mapping holds HMACs, never a passport number");

console.log(`\n${failures ? `${failures} FAILED` : "ALL PASSED"}`);
process.exit(failures ? 1 : 0);
