// End-to-end check of the intake against the RIG (local DB, mock Resend, mock Leon from a read-only snapshot).
//   node --env-file=.env.rig rig/intake/e2e.mjs [--keep]
// Prints evidence; never prints personal values. Exits 1 on the first failed expectation.
import { execSync } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import path from "node:path";
if (!/127\.0\.0\.1|localhost/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "") || !/127\.0\.0\.1/.test(process.env.LEON_API_BASE ?? "")) { console.error("rig only (local DB and the mock Leon)"); process.exit(78); }
const AGENT = process.env.RIG_AGENT_URL || "http://127.0.0.1:5175";
const SCR = path.resolve("rig/.scratch"); mkdirSync(SCR, { recursive: true });
const FAULTS = path.join(SCR, "leon-mock-faults.json"), MOCKLOG = path.join(SCR, "leon-mock-log.jsonl");
let failures = 0;
const ok = (cond, what, detail = "") => { console.log(`${cond ? "PASS" : "FAIL"}  ${what}${detail ? `  · ${detail}` : ""}`); if (!cond) failures += 1; };
const db = async (p) => (await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${p}`, { headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` } })).json();
const api = async (p, body, method = body ? "POST" : "GET") => { const r = await fetch(`${AGENT}${p}`, { method, headers: body ? { "content-type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, json: await r.json().catch(() => null) }; };
const faults = (f) => writeFileSync(FAULTS, JSON.stringify(f));
const mockLog = () => (existsSync(MOCKLOG) ? readFileSync(MOCKLOG, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
const creates = () => mockLog().filter((e) => /createTrip|flightCreate/.test(e.q));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function deliver(file, { times = 1 } = {}) {
  const emailId = randomUUID();
  await fetch(`${process.env.RESEND_API_BASE}/_rig/register`, { method: "POST", body: JSON.stringify({ id: emailId, file: path.resolve(file) }) });
  const body = JSON.stringify({ type: "email.received", created_at: new Date().toISOString(), data: { email_id: emailId, created_at: new Date().toISOString(), from: "dispatch@example.invalid", to: ["handling@intake.rig.invalid"], subject: path.basename(file) } });
  const svixId = `msg_${randomUUID()}`; const outcomes = [];
  for (let i = 0; i < times; i += 1) {
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = createHmac("sha256", Buffer.from(process.env.RESEND_WEBHOOK_SECRET.replace(/^whsec_/, ""), "base64")).update(`${svixId}.${ts}.${body}`).digest("base64");
    const r = await fetch(`${AGENT}/api/intake/resend-webhook`, { method: "POST", headers: { "content-type": "application/json", "svix-id": svixId, "svix-timestamp": ts, "svix-signature": `v1,${sig}` }, body });
    outcomes.push((await r.json()).outcome);
  }
  return { emailId, outcomes };
}
async function processed(emailId, timeoutMs = 240000) {
  const t0 = Date.now();
  for (;;) {
    const m = (await db(`intake_messages?select=id,status,request_id&provider_message_id=eq.${emailId}`))[0];
    if (m && m.status !== "waiting") return m;
    if (Date.now() - t0 > timeoutMs) throw new Error(`message ${emailId} still waiting after ${timeoutMs} ms`);
    await sleep(3000);
  }
}
const detail = async (id) => (await api(`/api/intake/requests/${id}`)).json;
function fieldTable(d, title) {
  console.log(`\n── ${title} · ${d.request.reference} · ${d.request.route} · ${d.request.ui.label} ──`);
  for (const l of d.review.legs) {
    console.log(`  LEG ${l.index + 1} ${l.direction ?? ""}`);
    for (const f of l.fields) console.log(`    ${f.label.padEnd(13)} ${String(f.value || "—").padEnd(8)} ${f.kind === "time" && f.utc ? `(${f.utc})` : ""} ${f.state.toUpperCase().padEnd(15)} said=${JSON.stringify(f.said)}${f.note ? `  · ${f.note}` : ""}${f.conflict ? `  · CONFLICT email=${JSON.stringify(f.conflict.body)} ${f.conflict.attachmentName}=${JSON.stringify(f.conflict.attachment)}` : ""}`);
    for (const e of l.extra) console.log(`    ${e.label.padEnd(13)} ${e.value}  (not sent: ${e.note})`);
    for (const s of l.services) console.log(`    · ${s.decision.padEnd(10)} ${s.name}${s.conditional ? ` [${s.condition}]` : ""} → ${s.checklistLabel ?? "no checklist item"}`);
  }
  console.log(`  attachments: ${d.attachments.map((a) => `${a.name} = ${a.role} (${a.why})`).join(" | ") || "none"}`);
  console.log(`  request source: ${d.requestSource?.attachment ?? "the email body"} · ${d.requestSource?.why}`);
  console.log(`  people: ${d.people.count ?? 0} (masked) · blockers: ${JSON.stringify(d.blockers)} · warnings: ${JSON.stringify(d.warnings)}`);
}
async function sendAll(id, { twice = false } = {}) {
  const p = await api(`/api/intake/requests/${id}/prepare`, {});
  if (p.status !== 200) return { prepared: p };
  const token = p.json.confirmation.token;
  const runs = twice ? await Promise.all([api(`/api/intake/send/${token}/confirm`, {}), api(`/api/intake/send/${token}/confirm`, {})]) : [await api(`/api/intake/send/${token}/confirm`, {})];
  return { prepared: p, runs };
}

// ── reset ──
execSync(`docker exec supabase_db_rig psql -U postgres -d postgres -qc "truncate public.intake_messages, public.intake_events cascade;"`);
rmSync(path.join(SCR, "intake"), { recursive: true, force: true }); rmSync(MOCKLOG, { force: true }); faults({});
execSync(`kill $(lsof -tiTCP:3995 -sTCP:LISTEN) || true; cd rig/intake && (env -i PATH="$PATH" HOME="$HOME" PORT=3995 RIG_SCRATCH="${SCR}" nohup node mock-leon.mjs > ../.scratch/mock-leon.out 2>&1 &)`, { shell: "/bin/bash" });
await sleep(1500);
// Variants built from the redacted fixtures (test inputs, not templates): no timezone; another week + callsign.
const amq = readFileSync("rig/fixtures/intake/amq5v-lybe-plus364.eml", "latin1");
const b64 = (s) => Buffer.from(s, "latin1").toString("base64").replace(/.{76}/g, "$&\r\n");
function variant(src, name, edit) {
  // Edit inside the base64 text parts: decode each, edit, re-encode.
  const out = src.replace(/(Content-Type: text\/(?:plain|html); charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\n)([A-Za-z0-9+/=\r\n]+?)(\r\n--)/g, (a, h, body, tail) => h + b64(edit(Buffer.from(body.replace(/\r\n/g, ""), "base64").toString("latin1"))) + tail)
    .replace(/^Message-ID: .*$/m, `Message-ID: <${name}@clearway-rig.invalid>`).replace(/^Subject: (.*)$/m, (a, s) => `Subject: ${edit(s)}`);
  const f = path.join(SCR, `${name}.eml`); writeFileSync(f, out, "latin1"); return f;
}
const noTz = variant(amq, "amq8t-notz", (s) => s.replace(/Schedule \(all UTC times\):/g, "Schedule:").replace(/AMQ5V/g, "AMQ8T").replace(/29SEP2027/g, "13OCT2027").replace(/29SEP/g, "13OCT"));
const restartCase = variant(amq, "amq7r-restart", (s) => s.replace(/AMQ5V/g, "AMQ7R").replace(/29SEP2027/g, "06OCT2027").replace(/29SEP/g, "06OCT"));

console.log("\n=== 1. Webhook: three deliveries of one Resend event ===");
const c = await deliver("rig/fixtures/intake/yulsa-cimog1-plus364.eml", { times: 3 });
ok(c.outcomes.join(",") === "received,duplicate_delivery,duplicate_delivery", "a retried webhook stores once", c.outcomes.join(", "));
const cm = await processed(c.emailId);
ok((await db(`intake_messages?select=id&provider_message_id=eq.${c.emailId}`)).length === 1, "one message row");
ok((await db(`intake_requests?select=id&message_id=eq.${cm.id}`)).length === 1, "one request row");

console.log("\n=== 2. Samples as received (real dates): the flights already exist in Leon ===");
for (const f of ["rig/fixtures/intake/yulsa-cimog1.eml", "rig/fixtures/intake/amq5v-lybe.eml"]) {
  const d0 = await deliver(f); const m = await processed(d0.emailId); const d = await detail(m.request_id);
  fieldTable(d, path.basename(f));
  ok(!!d.request.duplicate && !d.request.duplicate.error, `${path.basename(f)}: stopped as a possible duplicate`, `Leon ${d.request.duplicate?.leonIds?.join(", ")}`);
  const stage = d.stages.find((s) => s.name === "Awaiting review");
  ok(stage.state === "hold", "pipeline stage Awaiting review = STOPPED", stage.note);
  const before = creates().length; const p = await api(`/api/intake/requests/${m.request_id}/prepare`, {});
  ok(p.status === 409 && p.json.blockers.includes("Resolve the possible duplicate above first."), "confirm refused while the duplicate is unresolved", p.json?.blockers?.[0]);
  ok(creates().length === before, "nothing sent to Leon");
}

console.log("\n=== 3. YU-LSA (+364 d): conflicts, TBA, send, checklist, double-fire ===");
let d = await detail(cm.request_id); fieldTable(d, "yulsa-cimog1-plus364");
const crew2 = d.review.legs[1].fields.find((f) => f.key === "crewCount"), pax2 = d.review.legs[1].fields.find((f) => f.key === "paxTotal");
ok(crew2.value === "" && (crew2.state === "unknown" || crew2.state === "conflict") && crew2.said?.includes("TBA"), "CREW TBA is Unknown, never 0", `${crew2.state} value=${JSON.stringify(crew2.value)}`);
ok(pax2.state === "conflict", "body (PAX 2) vs GenDec (0) surfaced as a conflict", pax2.note);
ok(d.blockers.some((b) => /Pax differs/.test(b)), "the pax conflict blocks confirm", d.blockers.join(" | "));
d = (await api(`/api/intake/requests/${cm.request_id}/edit`, { op: "conflict", leg: 1, key: "paxTotal", use: "body" })).json;
ok(d.blockers.length === 0, "choosing the email's value clears the blocker", JSON.stringify(d.blockers));
const r3 = await sendAll(cm.request_id, { twice: true });
ok(r3.prepared.status === 200, "prepare issues a confirmation", r3.prepared.json?.confirmation?.expiresAt);
ok(r3.runs.every((r) => r.status === 200) && JSON.stringify(r3.runs[0].json.result.legs) === JSON.stringify(r3.runs[1].json.result.legs), "double-fire: both confirms get the same single result");
ok(creates().length === 2, "double-fire: Leon received exactly one create per leg", `${creates().length} create calls`);
if (!r3.runs.every((r) => r.status === 200)) console.log("confirm answered:", JSON.stringify(r3.runs.map((r) => r.json)).slice(0, 400));
const res3 = r3.runs[0].json.result;
ok(res3.legs.every((l) => l.state === "in_leon"), "both legs In Leon with flight ids", res3.legs.map((l) => `leg ${l.index + 1} → ${l.flightNid}`).join(", "));
ok(res3.checklist.total > 0 && res3.checklist.filled === res3.checklist.total, "checklist filled", `${res3.checklist.filled}/${res3.checklist.total} · e.g. ${res3.checklist.items.slice(0, 3).map((i) => `${i.label}=${i.statusCaption}${i.wasOnFlight ? " (was auto-added)" : ""}`).join(", ")}`);
ok(res3.email.ok && /Loaded/.test(res3.email.kind), "Loaded email captured", res3.email.kind);
const writes3 = await db(`intake_leon_writes?select=leg_index,state,payload_sha256,payload,leon_flight_nid&request_id=eq.${cm.request_id}`);
ok(writes3.length === 2 && writes3.every((w) => w.payload && w.payload_sha256), "send log: one row per leg, payload + hash stored");
const again = await api(`/api/intake/requests/${cm.request_id}/prepare`, {});
ok(again.status === 409 && again.json.blockers.includes("No legs left to create."), "a loaded request has nothing left to send");

console.log("\n=== 4. SP-OVO (+364 d): partial success (Leon refuses leg 2) ===");
faults({ refuseFlightNo: ["AMQ5V"], refuseLegOnAdes: ["LFMN"] });
const dm = await deliver("rig/fixtures/intake/amq5v-lybe-plus364.eml"); const mm = await processed(dm.emailId);
d = await detail(mm.request_id); fieldTable(d, "amq5v-lybe-plus364");
ok(d.review.legs[0].fields.find((f) => f.key === "std").state !== "tz_unknown", "\"Schedule (all UTC times)\" is read as UTC");
ok(d.review.legs[0].fields.find((f) => f.key === "paxTotal").state === "zero", "PAX 0 / FERRY is a stated zero");
ok(d.attachments.filter((a) => a.role === "noise").length === 3, "three signature images classified as noise, with a reason", d.attachments[0]?.why);
const before4 = creates().length; const r4 = await sendAll(mm.request_id); const res4 = r4.runs[0].json.result;
ok(res4.legs[0].state === "in_leon" && res4.legs[1].state === "not_in_leon", "leg 1 In Leon, leg 2 NOT in Leon", `leg 2: ${res4.legs[1].error}`);
d = await detail(mm.request_id);
ok(d.request.ui.key === "needs_you" && /NOT in Leon/.test(d.request.statusReason), "row status Needs you", d.request.statusReason);
ok(d.stages.find((s) => s.name === "Sent to Leon").state === "part", "pipeline: Sent to Leon = PARTLY FAILED", d.stages.find((s) => s.name === "Sent to Leon").note);
ok(/Needs you/.test(res4.email.kind), "Needs you email captured", res4.email.kind);
const outbound = (await db(`intake_messages?select=subject&request_id=eq.${mm.request_id}&direction=eq.outbound&order=received_at.desc&limit=1`))[0];
ok(/1 of 2 legs in Leon, leg 2 is not/.test(outbound.subject), "email subject says what is in Leon", outbound.subject);
ok(d.review.legs[1].fields.find((f) => f.key === "registration")?.state === "leon_refused", "the refused value is marked LEON REFUSED on the page");
ok(creates().length - before4 === 2, "two create calls (one refused)");
faults({});
await api(`/api/intake/requests/${mm.request_id}/edit`, { op: "ack_refusal", leg: 1, key: "registration" });
const r4b = await sendAll(mm.request_id); const res4b = r4b.runs[0].json.result;
ok(res4b.legs.length === 1 && res4b.legs[0].index === 1 && res4b.legs[0].state === "in_leon", "resend sends ONLY leg 2, now In Leon", res4b.legs.map((l) => `leg ${l.index + 1} ${l.state}`).join(", "));

console.log("\n=== 5. No timezone anywhere: blocks until a person sets it ===");
const dz = await deliver(noTz); const mz = await processed(dz.emailId); d = await detail(mz.request_id);
const std = d.review.legs[0].fields.find((f) => f.key === "std");
ok(std.state === "tz_unknown", "STD is TIMEZONE UNKNOWN (not guessed)", std.note);
ok(d.request.ui.key === "needs_you", "row is Needs you (red)", d.request.statusReason);
const pz = await api(`/api/intake/requests/${mz.request_id}/prepare`, {});
ok(pz.status === 409 && pz.json.blockers.some((b) => /timezone of STD and STA unknown/.test(b)), "confirm is blocked", pz.json.blockers.join(" | "));
ok(!!d.review.legs[0].tz?.utc?.std && !!d.review.legs[0].tz?.local?.std, "both readings offered", `UTC ${d.review.legs[0].tz.utc.std} · local ${d.review.legs[0].tz.local.std}`);
d = (await api(`/api/intake/requests/${mz.request_id}/edit`, { op: "tz", leg: 0, choice: "local" })).json;
ok(d.review.legs[0].fields.find((f) => f.key === "std").state === "edited" && !d.blockers.some((b) => /^Leg 1: .*(timezone|tz)/.test(b)) && d.blockers.some((b) => /^Leg 2: timezone/.test(b)), "choosing local time sets both times as EDITED and unblocks leg 1 (leg 2 still blocked)", `STD now ${d.review.legs[0].fields.find((f) => f.key === "std").utc}`);

console.log("\n=== 6. Leon does not answer; then the service restarts mid-send ===");
d = (await api(`/api/intake/requests/${mz.request_id}/edit`, { op: "tz", leg: 1, choice: "utc" })).json;
faults({ hangFlightNo: ["AMQ8T"], hangMs: 15000 });
const before6 = creates().length; const r6 = await sendAll(mz.request_id); const res6 = r6.runs?.[0]?.json?.result;
ok(!!res6 && res6.legs[0].state === "unknown" && res6.legs[1].state === "not_sent", "timeout → leg 1 UNKNOWN, later legs not sent", res6 ? res6.legs.map((l) => `${l.index + 1}:${l.state}`).join(" ") : JSON.stringify(r6.prepared?.json ?? r6.runs?.[0]?.json));
const blocked6 = await api(`/api/intake/requests/${mz.request_id}/prepare`, {});
ok(blocked6.status === 409, "nothing can be resent while a leg is unknown", blocked6.json?.message);
await sleep(9000); faults({});
const chk = await api(`/api/intake/requests/${mz.request_id}/legs/0/check`, {});
ok(chk.json?.outcome?.found === true, "a person's 'Check Leon' finds the flight by its marker (a read, not a resend)", `flight ${chk.json?.outcome?.flightNid}`);
ok(creates().length - before6 === 1, "Leon received that leg once — no automatic retry");
const dr = await deliver(restartCase); const mr = await processed(dr.emailId);
await api(`/api/intake/requests/${mr.request_id}/edit`, { op: "duplicate", action: "not_duplicate" }).catch(() => {});
faults({ hangFlightNo: ["AMQ7R"], hangMs: 60000 });
const pr = await api(`/api/intake/requests/${mr.request_id}/prepare`, {});
if (pr.status !== 200) { ok(false, "restart case prepared", JSON.stringify(pr.json?.blockers)); }
else {
  void api(`/api/intake/send/${pr.json.confirmation.token}/confirm`, {}).catch(() => null);
  await sleep(2500);
  const mid = await db(`intake_leon_writes?select=state&request_id=eq.${mr.request_id}`);
  ok(mid.length === 1 && mid[0].state === "sending", "the attempt row exists BEFORE Leon answers", mid.map((w) => w.state).join(","));
  const creates7 = creates().length;
  execSync(`kill $(lsof -tiTCP:5175 -sTCP:LISTEN)`); await sleep(1000);
  execSync(`cd agent && (env -i PATH="$PATH" HOME="$HOME" PORT=5175 AGENT_LOG_RANGES=true nohup node --env-file=../.env.rig server.mjs >> ../rig/.scratch/agent.out 2>&1 &)`, { shell: "/bin/bash" });
  for (let i = 0; i < 20; i += 1) { await sleep(1000); try { if ((await fetch(`${AGENT}/api/health`)).ok) break; } catch { /* starting */ } }
  await sleep(1500);
  const after = await db(`intake_leon_writes?select=state,leon_error&request_id=eq.${mr.request_id}`);
  ok(after.length === 1 && after[0].state === "unknown", "after restart the attempt is UNKNOWN", after[0]?.leon_error);
  const rq = (await db(`intake_requests?select=status,status_reason&id=eq.${mr.request_id}`))[0];
  ok(rq.status === "needs_you" && /check Leon/.test(rq.status_reason), "request asks a person to check Leon", rq.status_reason);
  await sleep(4000);
  ok(creates().length === creates7, "no automatic retry after the restart");
  faults({});
}

console.log(`\n${failures ? `${failures} FAILED` : "ALL PASSED"} · Leon mock create calls: ${creates().length}`);
process.exit(failures ? 1 : 0);
