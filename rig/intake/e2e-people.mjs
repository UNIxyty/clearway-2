// Passengers and crew reach Leon — end to end on the RIG (local DB, mock Resend, mock Leon), with INVENTED people
// (rig/intake/make-people-fixture.mjs): 16 passengers and 4 crew on two legs.
//   node --env-file=.env.rig rig/intake/e2e-people.mjs
// Proves: every passenger with their documents in Leon's passenger list per leg, read back from (mock) Leon; the crew
// in OPS notes as the operator's crew, NOT assigned; the outcome on the page's data and in the email; a refused
// passenger write is visible (stage, status, page data, email); and no name, date of birth or document number in any
// log, audit row, send-log row, request row or email. Prints counts and states — never a person's value.
import { execSync } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import path from "node:path";
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
const PAX_DOCS = Array.from({ length: 16 }, (_, i) => `TEST${String(i + 1).padStart(5, "0")}`);
const CREW_DOCS = Array.from({ length: 4 }, (_, i) => `TESTC${String(i + 1).padStart(4, "0")}`);
const CREW_NAMES = ["CREWMAN", "CREWLY", "CABINSON", "STEWARDE"];
const MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const dobs = Array.from({ length: 16 }, (_, i) => `${String(1 + ((i * 7) % 28)).padStart(2, "0")}${MON[(i * 5) % 12]}${1961 + ((i * 3) % 20)}`);
// Words that are also ordinary English or our own labels are not proof of a leak; whole surnames + documents are.
const PII = [...SUR.filter((w) => !/^(EXAMPLE|SAMPLE|SPECIMEN|TESTER|DUMMY|PLACEHOLDER|PROTO)$/.test(w)), ...CREW_NAMES, ...PAX_DOCS, ...CREW_DOCS, ...dobs];
const leaks = (label, text) => { const t = String(text ?? ""); const hit = PII.filter((w) => new RegExp(`(?<![A-Z0-9])${w}(?![A-Z0-9])`, "i").test(t)); return hit.length ? `${label}: ${hit.length} personal value(s)` : null; };

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
execSync(`docker exec supabase_db_rig psql -U postgres -d postgres -qc "truncate public.intake_messages, public.intake_events cascade;"`);
rmSync(path.join(SCR, "intake"), { recursive: true, force: true }); rmSync(MOCKLOG, { force: true }); faults({});
execSync(`kill $(lsof -tiTCP:3995 -sTCP:LISTEN) || true; cd rig/intake && (env -i PATH="$PATH" HOME="$HOME" PORT=3995 RIG_SCRATCH="${SCR}" nohup node mock-leon.mjs > ../.scratch/mock-leon.out 2>&1 &)`, { shell: "/bin/bash" });
await sleep(1500);
execSync(`node rig/intake/make-people-fixture.mjs RIGPAX17 OELCB 7 ${path.join(SCR, "rigpax17-oelcb.eml")}`);

console.log("\n=== 1. 16 passengers and 4 crew on two legs ===");
const m1 = await deliver("rig/fixtures/intake/rigpax16-oelca.eml");
let d = await detail(m1.request_id);
console.log(`  ${d.request.reference} · ${d.request.route} · ${d.request.ui.label} · blockers ${JSON.stringify(d.blockers)}`);
ok(d.review.legs.length === 2 && [0, 1].every((i) => peopleOn(d, i).pax === 16 && peopleOn(d, i).crew === 4), "the request's people, read: 16 passengers and 4 crew on each leg", [0, 1].map((i) => `leg ${i + 1}: ${peopleOn(d, i).pax} pax, ${peopleOn(d, i).crew} crew`).join(" · "));
const s1 = await send(m1.request_id);
ok(s1.prepared.status === 200, "prepare issues a confirmation", s1.prepared.status === 200 ? "" : JSON.stringify(s1.prepared.json?.blockers ?? s1.prepared.json));
if (s1.prepared.status !== 200) { console.log(`\n${failures} FAILED (cannot continue)`); process.exit(1); }
ok(s1.prepared.json.legs.every((l) => l.people?.pax?.people === 16 && l.people?.pax?.count === 16 && l.people?.crew?.people === 4), "the confirmation shows, per leg: 16 passengers to Leon's passenger list, 4 crew to OPS notes (counts only)", JSON.stringify(s1.prepared.json.legs.map((l) => l.people)));
ok(!JSON.stringify(s1.prepared.json).match(new RegExp(PAX_DOCS[0])), "…and carries no passenger value");
const r1 = s1.result;
ok(r1?.legs?.every((l) => l.state === "in_leon"), "both flights created", r1?.legs?.map((l) => `leg ${l.index + 1} → ${l.flightNid}`).join(", "));
ok(r1?.legs?.every((l) => l.people?.find((p) => p.kind === "pax")?.state === "in_leon" && l.people?.find((p) => p.kind === "crew")?.state === "in_leon"), "both legs: passengers and crew written", JSON.stringify(r1?.legs?.map((l) => l.people?.map((p) => `${p.kind}:${p.state}:${p.people}`))));

console.log("\n  read back from Leon (the mock's own flight record, as flight(flightNid) answers it):");
const fl = (await mockFlights()).filter((f) => r1.legs.some((l) => String(l.flightNid) === String(f.flightNid)));
for (const f of fl) {
  const t = f.passengerList.passengerText;
  const rows = t.split("\n").filter((x) => /^\d+\. /.test(x));
  const full = rows.filter((x) => /DOB \S+/.test(x) && /Passport TEST\d{5}/.test(x) && /Expires \S+/.test(x) && / · [A-Z]+ · Passport/.test(x));
  console.log(`  flight ${f.flightNid} ${f.flightNo} ${f.startAirport.code.icao}→${f.endAirport.code.icao}: passengerList count ${f.passengerList.count}, realCount ${f.passengerList.realCount}, ${rows.length} passengers listed, ${full.length} with DOB + nationality + passport + expiry`);
  ok(f.passengerList.count === 16 && rows.length === 16 && full.length === 16 && PAX_DOCS.every((p) => t.includes(`Passport ${p}`)), `  flight ${f.flightNid}: all 16 passengers with their passport details, in the request's order`, `first line: ${t.split("\n")[0].slice(0, 90)}`);
  const ops = f.notes.ops;
  const crewAt = ops.indexOf("OPERATOR'S CREW per the handling request");
  ok(/^CWY-INTAKE /.test(ops) && crewAt > ops.indexOf("CLIENT'S REQUEST"), `  flight ${f.flightNid}: OPS notes keep our marker and the services note first, the crew block after`);
  const block = ops.slice(crewAt);
  ok(/NOT assigned in Leon/.test(block) && /Crew count per the request: 4/.test(block) && CREW_DOCS.every((c) => block.includes(`Passport ${c}`)) && /^1\. CPT · /m.test(block), `  flight ${f.flightNid}: the 4 crew in OPS notes, labelled the operator's crew per the request, NOT assigned, count 4`);
  ok((f.crewMemberList ?? []).length === 0, `  flight ${f.flightNid}: no crew assignment and no crew record created`);
}
ok(!readFileSync(MOCKLOG, "utf8").includes("savePassengerText") || !PII.some((w) => readFileSync(MOCKLOG, "utf8").includes(w)), "mock Leon's own request log holds a hash and a length for the texts, not the people");

d = await detail(m1.request_id);
const stage1 = d.stages.find((s) => s.name === "Passengers and crew");
ok(stage1?.state === "done" && /16 passengers written/.test(stage1.note) && /NOT assigned/.test(stage1.note), "pipeline stage Passengers and crew = DONE, with what was written", stage1?.note?.slice(0, 160));
ok(d.request.ui.key === "loaded", "request Loaded", d.request.statusReason);
ok((d.sent.people ?? []).length === 4 && d.sent.people.every((p) => p.state === "in_leon"), "page data: four people writes, all In Leon (counts only)", d.sent.people?.map((p) => `leg ${p.leg + 1} ${p.kind} ${p.people}`).join(", "));
const e1 = (await db(`intake_messages?select=subject,sent_kind,delivery_detail&request_id=eq.${m1.request_id}&direction=eq.outbound&order=received_at.desc&limit=1`))[0];
ok(/^Loaded:/.test(e1.subject) && /PASSENGERS AND CREW:/.test(e1.delivery_detail.text) && /16 passengers written/.test(e1.delivery_detail.text) && /Crew were recorded as a note[^.]*\. They are NOT assigned in Leon/.test(e1.delivery_detail.text), "completion email: says the passengers are in Leon and the crew are a note, NOT assigned", e1.subject);
console.log(`  email PASSENGERS AND CREW section:\n    ${e1.delivery_detail.text.split("PASSENGERS AND CREW:")[1].split("\n\n")[0].trim().split("\n").join("\n    ")}`);

console.log("\n=== 2. The manifest of leg 1, from what Leon now holds ===");
{ const f = fl.find((x) => x.startAirport.code.icao === "LFPB");
  const leonFlight = { ...f, isCnl: false, operator: { name: "SAMPLE CHARTER (RIG)", planMode: "pro", isGuest: false }, flightWatch: { paxCount: null }, journeyLog: { paxCount: null } };
  const g = await generatePassengerManifest({ flightId: `cwy-cwy:${f.flightNid}`, leon: stubLeon(leonFlight), lookup: async () => ({ holders: [], unchecked: [] }) });
  console.log(`  manifest: ${g.result.pageCount} page(s), ${g.result.passengerCount} passenger rows, crew ${g.result.crewCount}, POB ${g.result.personsOnBoard}, operator's text list shown beside it: ${g.result.hasPaxNote}`);
  console.log(`  warnings: ${g.result.warnings.map((w) => w.code).join(", ")}`);
  ok(g.result.hasPaxNote && g.paxNote === f.passengerList.passengerText, "the manifest shows Leon's passenger list verbatim beside the file (text list: never parsed into rows)");
  console.log(`  NOT MET: ${g.result.passengerCount} manifest rows. Leon holds these passengers as its text list; manifest rows need Leon's structured passenger records, which need address-book contacts (a decision, not taken here).`); }

console.log("\n=== 3. A refused passenger write is visible ===");
faults({ refusePassengerText: ["OELCB"] });
const m2 = await deliver(path.join(SCR, "rigpax17-oelcb.eml"));
const s2 = await send(m2.request_id); const r2 = s2.result;
ok(r2?.legs?.every((l) => l.state === "in_leon"), "the flights are created", r2?.legs?.map((l) => l.state).join(","));
ok(r2?.legs?.every((l) => l.people.find((p) => p.kind === "pax").state === "not_in_leon" && l.people.find((p) => p.kind === "crew").state === "in_leon"), "passengers refused on both legs; crew written", JSON.stringify(r2?.legs?.map((l) => l.people.map((p) => `${p.kind}:${p.state}`))));
d = await detail(m2.request_id);
const pr = d.sent.people.filter((p) => p.kind === "pax");
ok(pr.every((p) => p.state === "not_in_leon" && /Passenger list is locked by another user/.test(p.error ?? "")), "page data: passengers NOT in Leon, with Leon's reason", pr[0]?.error);
ok(pr.every((p) => !leaks("", p.error)), "…and Leon's echo of the passenger text is removed from the reason");
ok(d.request.ui.key === "needs_you" && /passengers NOT in Leon for leg 1, 2/.test(d.request.statusReason), "request Needs you", d.request.statusReason);
const stage2 = d.stages.find((s) => s.name === "Passengers and crew");
ok(stage2?.state === "part" && /Passengers NOT written to Leon/.test(stage2.note), "pipeline stage Passengers and crew = PARTLY FAILED", stage2?.note?.slice(0, 160));
const e2 = (await db(`intake_messages?select=subject,delivery_detail&request_id=eq.${m2.request_id}&direction=eq.outbound&order=received_at.desc&limit=1`))[0];
ok(/^Needs you: .* · 2 flights in Leon · passengers NOT in Leon for leg 1, 2$/.test(e2.subject) && /WHAT WENT WRONG:\n.*Passengers NOT written to Leon: Leon: Passenger list is locked/.test(e2.delivery_detail.text), "email: Needs you, the subject says passengers are not in Leon, and why", e2.subject);
faults({});

console.log("\n=== 4. The service restarts during a passenger write ===");
{ execSync(`node rig/intake/make-people-fixture.mjs RIGPAX18 OELCC 14 ${path.join(SCR, "rigpax18-oelcc.eml")}`);
  const m3 = await deliver(path.join(SCR, "rigpax18-oelcc.eml"));
  faults({ hangPassengerText: ["OELCC"], hangMs: 60000 });
  const p3 = await api(`/api/intake/requests/${m3.request_id}/prepare`, {});
  void api(`/api/intake/send/${p3.json.confirmation.token}/confirm`, {}).catch(() => null);
  let mid = []; for (let i = 0; i < 40 && !mid.some((w) => w.kind === "pax" && w.state === "sending"); i += 1) { await sleep(500); mid = await db(`intake_leon_people_writes?select=kind,state&request_id=eq.${m3.request_id}`); }
  ok(mid.some((w) => w.kind === "pax" && w.state === "sending"), "the passenger write's attempt row exists BEFORE Leon answers", mid.map((w) => `${w.kind}:${w.state}`).join(","));
  const paxCalls = () => readFileSync(MOCKLOG, "utf8").split("\n").filter((l) => l.includes("savePassengerText") && l.includes('"f":' + String(mockFirst))).length;
  const mockFirst = (await db(`intake_leon_writes?select=leon_flight_nid&request_id=eq.${m3.request_id}&state=eq.in_leon`))[0]?.leon_flight_nid;
  const before = paxCalls();
  execSync(`kill $(lsof -tiTCP:5175 -sTCP:LISTEN)`); await sleep(1000);
  execSync(`cd agent && (env -i PATH="$PATH" HOME="$HOME" PORT=5175 AGENT_LOG_RANGES=true ICU_TIMEZONE_FILES_DIR="${SCR}/icu-tz" TZDATA_LATEST_CHECK=off CNAIR_PORTAL_BASE=http://127.0.0.1:3994 CNAIR_USER=mock CNAIR_PASSWORD=mock INTAKE_LOOKUP_SCHEDULE_MIN="0,0.02,0.04" nohup node --env-file=../.env.rig server.mjs >> ../rig/.scratch/agent.out 2>&1 &)`, { shell: "/bin/bash" });
  for (let i = 0; i < 20; i += 1) { await sleep(1000); try { if ((await fetch(`${AGENT}/api/health`)).ok) break; } catch { /* starting */ } }
  await sleep(1500);
  const after = await db(`intake_leon_people_writes?select=kind,state,leon_error&request_id=eq.${m3.request_id}&kind=eq.pax`);
  ok(after.length === 1 && after[0].state === "unknown", "after the restart the passenger write is UNKNOWN (a person checks Leon)", after[0]?.leon_error);
  const rq3 = (await db(`intake_requests?select=status,status_reason&id=eq.${m3.request_id}`))[0];
  ok(rq3.status === "needs_you" && /passengers unknown · check Leon/.test(rq3.status_reason), "the request asks a person to check Leon", rq3.status_reason);
  await sleep(3000);
  ok(paxCalls() === before, "no automatic retry: Leon received that passenger write once", `${paxCalls()} call(s) for that flight`);
  faults({}); }

console.log("\n=== 5. No name, date of birth or document number anywhere it must not be ===");
const out = [];
out.push(leaks("agent log", readFileSync(path.join(SCR, "agent.out"), "utf8")));
out.push(leaks("mock Leon request log", readFileSync(MOCKLOG, "utf8")));
out.push(leaks("audit rows", JSON.stringify(await db(`agent_audit_log?select=*&created_at=gte.${started}`))));
out.push(leaks("people send log", JSON.stringify(await db(`intake_leon_people_writes?select=*`))));
out.push(leaks("flight send log", JSON.stringify(await db(`intake_leon_writes?select=*`))));
out.push(leaks("request rows (review, stages, status)", JSON.stringify(await db(`intake_requests?select=review,stages,status_reason,route,duplicate`))));
out.push(leaks("emails (subject, html, text, search)", JSON.stringify(await db(`intake_messages?select=subject,sent_html,delivery_detail,search_text,understood&direction=eq.outbound`))));
out.push(leaks("inbound mailbox rows (status, search index)", JSON.stringify(await db(`intake_messages?select=status_reason,search_text,understood&direction=eq.inbound`))));
out.push(leaks("request API response", JSON.stringify([await detail(m1.request_id), await detail(m2.request_id)])));
const audits = await db(`agent_audit_log?select=kind&created_at=gte.${started}&kind=like.intake.leon_*`);
console.log(`  checked: agent log, mock Leon log, ${audits.length} intake.leon_* audit rows (${[...new Set(audits.map((a) => a.kind))].join(", ")}), send logs, request rows, emails, mailbox rows, API`);
ok(out.every((x) => !x), "none found", out.filter(Boolean).join(" · "));
ok(PII.some((w) => JSON.stringify(fl).includes(w)), "(control: the same check does find them in Leon's passenger list, where they belong)");

console.log(`\n${failures ? `${failures} FAILED` : "ALL PASSED"}`);
process.exit(failures ? 1 : 0);
