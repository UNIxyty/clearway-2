// End to end on the RIG: a message's type is decided by its content, never by its sender and never by default.
// Local DB, mock Resend, the provider portal is a fixture file (rig/fixtures/cnair/portal-fixture.json).
//   node --env-file=.env.rig rig/intake/e2e-classify.mjs
// The calendar invites are FICTIONAL (rig/fixtures/cnair/invite-*.eml): this proves the code's handling of a
// calendar part, UID and METHOD, not that a real Exchange invite survives Resend.
import { execSync } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
if (!/127\.0\.0\.1|localhost/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "")) { console.error("rig only"); process.exit(78); }
const AGENT = process.env.RIG_AGENT_URL || "http://127.0.0.1:5175"; const SCR = path.resolve("rig/.scratch/classify"); mkdirSync(SCR, { recursive: true });
const FX = "rig/fixtures/cnair/"; const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0; const ok = (c, what, detail = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${what}${detail ? `  · ${String(detail).slice(0, 230)}` : ""}`); if (!c) failures += 1; };
const db = async (p) => (await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${p}`, { headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` } })).json();
const api = async (p, body) => { const r = await fetch(`${AGENT}${p}`, { method: body ? "POST" : "GET", headers: body ? { "content-type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, json: await r.json().catch(() => null) }; };
async function deliver(file) {
  const id = randomUUID(); await fetch(`${process.env.RESEND_API_BASE}/_rig/register`, { method: "POST", body: JSON.stringify({ id, file: path.resolve(file) }) });
  const body = JSON.stringify({ type: "email.received", created_at: new Date().toISOString(), data: { email_id: id, to: ["handling@intake.rig.invalid"], from: "x", subject: "x" } });
  const sid = `msg_${randomUUID()}`, ts = String(Math.floor(Date.now() / 1000));
  const sig = createHmac("sha256", Buffer.from(process.env.RESEND_WEBHOOK_SECRET.replace(/^whsec_/, ""), "base64")).update(`${sid}.${ts}.${body}`).digest("base64");
  await fetch(`${AGENT}/api/intake/resend-webhook`, { method: "POST", headers: { "content-type": "application/json", "svix-id": sid, "svix-timestamp": ts, "svix-signature": `v1,${sig}` }, body });
  for (let i = 0; i < 80; i += 1) { const m = (await db(`intake_messages?select=id,status,status_reason,request_id,understood&provider_message_id=eq.${id}`))[0]; if (m && m.status !== "waiting") return m; await sleep(2500); }
  throw new Error(`message from ${file} still waiting`);
}
const write = (name, text) => { const f = path.join(SCR, name); writeFileSync(f, text.replace(/\r?\n/g, "\r\n")); return f; };
const plain = (name, from, subject, body, extra = "") => write(name, `From: ${from}\nTo: handling@intake.rig.invalid\nSubject: ${subject}\nDate: Fri, 02 Oct 2026 09:00:00 +0000\nMessage-ID: <${name}-${Date.now()}@test.example>\nMIME-Version: 1.0\n${extra}Content-Type: text/plain; charset=utf-8\n\n${body}\n`);
const requestOf = async (id) => (await db(`intake_requests?select=*&id=eq.${id}`))[0];
const scheduledFor = async (ref) => db(`intake_requests?select=id,status,status_reason,request_type,closed_reason,review,stages&request_type=eq.scheduled&reference=eq.${ref}`);
const until = async (fn, ms = 120000) => { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) return null; await sleep(3000); } };
const BLOCK = (ref, etd1 = "17:00:00") => `#Pax:      2/2\n#Cliente:  (Extracomunitario Pasaje)\n#1:        XXA\n#2:        XXB\n#TCP:\n#Fra:\n#Ref:      ${ref}\n#Otros:\n#DATE:     05/10/26\n#ETD:      ${etd1}-LEBL 17:30:00-GMMN\n`;
const HANDLING = `Dear Handling Team,\n\nOn behalf of Northline Aviation Ltd please arrange handling at EYVI for the flight below.\n\nRegistration   9H-ZWX\nType           Cessna Citation XLS+ (C56X)\n\nFlight         NLX21\nFrom           EGKB (BQH) London Biggin Hill\nETD            Thu 08 Oct 2026 14:00Z\nTo             EYVI (VNO) Vilnius\nETA            Thu 08 Oct 2026 16:30Z\nCrew 2 / Pax 2\n\nSERVICES\n- Handling\n- Fuel Jet A-1\n\nKind regards,\nOps Desk, Northline Aviation Ltd`;

execSync(`docker exec supabase_db_rig psql -U postgres -d postgres -qc "truncate public.intake_messages, public.intake_events cascade;"`, { stdio: "ignore" });

// ── 1. A notification from an address the agent has never seen ───────────────────────────────────────────────
let m = await deliver(FX + "invite-request.eml");
let c = m.understood?.classification;
ok(m.status === "processed" && m.status_reason === "Flight notification", "invite → read as a flight notification", `${m.status} · ${m.status_reason}`);
ok(c?.type === "scheduled" && c.decidedBy === "content" && c.confidence >= 0.7 && c.evidence?.length >= 4, "classification, confidence and evidence are recorded", `confidence ${c?.confidence}, ${c?.evidence?.length} evidence rows`);
ok(c.evidence.find((e) => e.signal === "sender")?.found === false, "the sender (provider.example) did not decide it");
ok(m.understood?.calendar?.uid && m.understood.calendar.method === "REQUEST", "calendar UID and method stored with the message");
const first = await until(async () => { const r = await requestOf(m.request_id); return r.status !== "collecting" ? r : null; });
ok(first?.request_type === "scheduled" && first.reference === "9914050", "a type 1 request, keyed by the provider reference", `${first?.request_type} · ${first?.reference}`);
ok(first.status === "needs_you" && /Reference found/.test(first.status_reason) && first.review.lookup.found?.row?.aircraft === "EC-ZZZ", "the reference resolved in the (fixture) portal; the pipeline then stops and says collection is not built", first.status_reason);
ok(!(first.review.legs ?? []).length && (await db(`intake_extractions?select=id&request_id=eq.${first.id}`)).length === 0, "no legs were built from the invite's body and the model was not run");
ok(!JSON.stringify(first.review).includes("XXA") && !JSON.stringify(m.understood).includes("XXA"), "crew initials are not stored with the request or the classification");

// ── 2. Update, copy, cancellation: by calendar UID and method ────────────────────────────────────────────────
m = await deliver(FX + "invite-update.eml");
let all = await scheduledFor("9914050");
ok(all.length === 1 && m.request_id === first.id && /Update to 9914050/.test(m.status_reason), "an update (same UID, sequence 1) attaches to the SAME request", `${all.length} request(s) · ${m.status_reason}`);
ok(all[0].review.updates?.[0]?.changes?.join() === "ETD leg 1: 17:00-LEBL → 18:00-LEBL" && all[0].review.updates[0].matchedBy === "calendar UID", "the change is named and it was matched by calendar UID", all[0].review.updates?.[0]?.changes?.join("; "));
m = await deliver(FX + "invite-update.eml");
ok(/Another copy/.test(m.status_reason) && (await scheduledFor("9914050")).length === 1, "the same update again is 'another copy', not a third thing", m.status_reason);
await until(async () => ((await requestOf(first.id)).status !== "collecting"));
m = await deliver(FX + "invite-cancel.eml");
all = await scheduledFor("9914050");
ok(all.length === 1 && all[0].status === "closed" && all[0].closed_reason === "cancelled" && /Cancellation of 9914050/.test(m.status_reason), "a cancellation (METHOD:CANCEL, same UID) closes that request as cancelled by the provider", `${all[0].status}/${all[0].closed_reason} · ${m.status_reason}`);
const orphanFile = write("orphan-cancel.eml", ["From: EC-ZZZ <ec-zzz@provider.example>", "To: handling@intake.rig.invalid", "Subject: Cancelada: LEBL-GMMN-LEBL", `Message-ID: <orphan-${Date.now()}@provider.example>`, "MIME-Version: 1.0", 'Content-Type: multipart/alternative; boundary="ob"', "", "--ob", "Content-Type: text/plain; charset=utf-8", "", BLOCK("9914077"), "--ob", 'Content-Type: text/calendar; charset="utf-8"; method=CANCEL', "", "BEGIN:VCALENDAR", "METHOD:CANCEL", "VERSION:2.0", "BEGIN:VEVENT", "UID:ORPHAN-UID-0001", "SEQUENCE:3", "STATUS:CANCELLED", "SUMMARY:LEBL-GMMN-LEBL", "END:VEVENT", "END:VCALENDAR", "--ob--", ""].join("\n"));
m = await deliver(orphanFile);
ok(m.status === "not_recognised" && !m.request_id && /no request for it/.test(m.status_reason), "a cancellation for a flight the agent never saw asks a person; no request is created", m.status_reason);

// ── 3. Forwarded by ops; the record appears late ─────────────────────────────────────────────────────────────
const invite = (name, ref, uid, method = "REQUEST", seq = 0) => write(name, ["From: EC-ZZZ <ec-zzz@provider.example>", "To: Ops Department <ops@clearway.example>", "Subject: LEBL-GMMN-LEBL", `Message-ID: <${name}-${Date.now()}@provider.example>`, "MIME-Version: 1.0", 'Content-Type: multipart/alternative; boundary="ib"', "", "--ib", "Content-Type: text/plain; charset=utf-8", "", BLOCK(ref), "--ib", `Content-Type: text/calendar; charset="utf-8"; method=${method}`, "", "BEGIN:VCALENDAR", `METHOD:${method}`, "VERSION:2.0", "BEGIN:VEVENT", `UID:${uid}`, `SEQUENCE:${seq}`, "SUMMARY:LEBL-GMMN-LEBL", "END:VEVENT", "END:VCALENDAR", "--ib--", ""].join("\n"));
const late = invite("late.eml", "9914051", "LATE-UID-0001");
execSync(`node rig/intake/wrap-forward.mjs ${late} ${path.join(SCR, "late-fwd.eml")}`);
m = await deliver(path.join(SCR, "late-fwd.eml"));
ok(m.status_reason === "Flight notification" && m.understood.classification.type === "scheduled", "forwarded by ops as an attachment: still a flight notification", m.status_reason);
let r = await requestOf(m.request_id);
ok(r.status === "collecting" && /not in the portal yet/.test(r.status_reason) && r.review.lookup.nextAt, "reference not in the portal yet → it will look again (not a handling request, not a failure)", r.status_reason);
r = await until(async () => { const x = await requestOf(m.request_id); return x.review.lookup.found ? x : null; }, 150000);
ok(!!r && r.review.lookup.attempts.length === 3 && r.review.lookup.attempts.map((a) => a.state).join() === "not_found,not_found,found", "…and it is found on the third try", r?.review.lookup.attempts.map((a) => a.state).join(" → "));

// ── 4. Relayed as plain text by someone else; the reference never resolves ───────────────────────────────────
m = await deliver(plain("never.eml", "Someone Else <relay@elsewhere.example>", "FW: LEBL-GMMN-LEBL", `Forwarding.\n\n-----Original Message-----\n${BLOCK("9914052").split("\n").map((l) => `> ${l}`).join("\n")}`));
ok(m.understood.classification.type === "scheduled" && !m.understood.calendar, "quoted block, no calendar part, unknown sender: a notification by content");
r = await until(async () => { const x = await requestOf(m.request_id); return x.status === "needs_you" ? x : null; }, 150000);
ok(!!r && /not found/.test(r.status_reason) && r.request_type === "scheduled" && r.stages.find((s) => s.name === "Collecting data")?.state === "fail", "never found → after the retries a person is asked; it stays type 1", r?.status_reason);
ok((await db(`intake_requests?select=id&request_type=eq.handling`)).length === 0, "no handling request exists anywhere so far: nothing fell through to type 2");

m = await deliver(invite("sameuid.eml", "9914059", "LATE-UID-0001"));
ok((await requestOf(m.request_id)).reference === "9914059" && (await scheduledFor("9914051")).length === 1, "the same calendar UID with a DIFFERENT reference is not attached to the other flight: the reference is the key", m.status_reason);

// ── 5. Notification-shaped but not certain → ask; a person chooses ───────────────────────────────────────────
m = await deliver(plain("noref.eml", "x@y.example", "LEBL-GMMN-LEBL", BLOCK("").replace("#Ref:      \n", "#Ref:\n")));
ok(m.status === "not_recognised" && !m.request_id && /^Needs a decision/.test(m.understood.title) && m.understood.classification.type === "ask", "the block without a reference → needs a decision, nothing created", m.understood.title);
let p = await api(`/api/mailbox/messages/${m.id}/process-notification`, { reference: "" });
let q = await api(`/api/mailbox/messages/${m.id}/process-notification`, { reference: "", token: p.json?.confirmation?.token });
ok(q.json?.ok === false && /reference is needed/.test(q.json?.message ?? ""), "process as flight notification without a reference is refused", q.json?.message);
p = await api(`/api/mailbox/messages/${m.id}/process-notification`, { reference: "9914060" });
q = await api(`/api/mailbox/messages/${m.id}/process-notification`, { reference: "9914060", token: p.json?.confirmation?.token });
r = (await scheduledFor("9914060"))[0];
const mm = (await db(`intake_messages?select=understood,status&id=eq.${m.id}`))[0];
ok(q.json?.ok && r && mm.understood.classification.decidedBy === "person", "a person chooses 'flight notification' and gives the reference → type 1, recorded as decided by a person", mm.understood.classification.reason);

// ── 6. Not for us: routine, calm, not in needs attention ─────────────────────────────────────────────────────
m = await deliver(plain("bulletin.eml", "Skyline Fuel Services <news@skyline-fuel.example>", "Skyline Fuel - October price bulletin", "Our October Jet A-1 price bulletin is now available on the customer portal. No action needed."));
ok(m.status === "ignored" && m.understood.kind === "notforus" && !m.request_id, "a price bulletin → not for us: calm status, no request", `${m.status} · ${m.status_reason}`);
m = await deliver(plain("quote.eml", "Charter Desk <quotes@bluecrest-charter.example>", "Quote request: Riga - Nice, 6 pax, mid October", "Hello, could you send us a quote for a light jet Riga to Nice for 6 passengers around 14-16 October, return a week later? Thanks, Charter Desk"));
ok(["ignored", "not_recognised"].includes(m.status) && !m.request_id, "a charter quote request is not a handling request", `${m.status} · ${m.understood.title}`);
const quoteStatus = m.status;

// ── 7. Handling request: positive evidence ───────────────────────────────────────────────────────────────────
m = await deliver(plain("handling.eml", "Northline Ops <ops@northline-aviation.example>", "Handling request - 9H-ZWX - NLX21 - 08 Oct 2026 - EYVI", HANDLING));
c = m.understood.classification;
ok(m.status === "processed" && c.type === "handling" && c.evidence.find((e) => e.signal === "asks")?.found, "asks us to arrange handling and carries its schedule → handling request", c.evidence.find((e) => e.signal === "asks")?.detail);
ok((await requestOf(m.request_id)).request_type === "handling", "…and only now does a handling request row exist");
m = await deliver(plain("fyi.eml", "Northline Ops <ops@northline-aviation.example>", "Our schedule next week", "FYI, for your information only, our aircraft 9H-ZWX will operate NLX21 EGKB - EYVI on Thu 08 Oct 2026, 14:00Z - 16:30Z. No services are required from you.\n\nRegards"));
ok(m.status !== "processed" && !m.request_id, "flight details that ask for nothing do NOT become a handling request", `${m.status} · ${m.understood.title}`);
const fyi = m;
m = await deliver(plain("relayed.eml", "postmaster@relay.example", "Handling request - 9H-ZWX - NLX22 - 09 Oct 2026 - EYVI", HANDLING.replace("NLX21", "NLX22").replace(/08 Oct/g, "09 Oct")));
ok(m.status === "processed" && m.understood.classification.type === "handling", "a request relayed from postmaster@ is read, not ignored as a bounce", `${m.status} · ${m.status_reason}`);
m = await deliver(write("dsn.eml", ["From: MAILER-DAEMON@mx.example", "To: handling@intake.rig.invalid", "Subject: Undelivered Mail Returned to Sender", `Message-ID: <dsn-${Date.now()}@mx.example>`, "MIME-Version: 1.0", 'Content-Type: multipart/report; report-type=delivery-status; boundary="b"', "", "--b", "Content-Type: text/plain", "", "Could not deliver.", "--b", "Content-Type: message/delivery-status", "", "Action: failed", "--b--", ""].join("\n")));
ok(m.status === "ignored" && m.status_reason === "Bounce", "a delivery report is still ignored as a bounce (by structure)", m.status_reason);

// ── 8. The escape hatch, and the mailbox buckets ─────────────────────────────────────────────────────────────
if (fyi.status === "not_recognised") {
  p = await api(`/api/mailbox/messages/${fyi.id}/process-handling`, {}); q = await api(`/api/mailbox/messages/${fyi.id}/process-handling`, { token: p.json?.confirmation?.token });
  const f2 = (await db(`intake_messages?select=request_id,understood&id=eq.${fyi.id}`))[0];
  ok(q.json?.ok && f2.request_id && f2.understood.classification.decidedBy === "person", "a person chooses 'handling request' for the undecided message → type 2, recorded as decided by a person");
}
const rows = (await api("/api/mailbox/messages?box=received&view=needs&days=7")).json?.rows ?? [];
const needsSubjects = rows.map((x) => x.subject);
ok(!needsSubjects.some((s) => /price bulletin|Undelivered/.test(s)), "needs attention has no bulletin and no bounce in it", `${rows.length} row(s): ${needsSubjects.join(" | ").slice(0, 160)}`);
const allRows = (await api("/api/mailbox/messages?box=received&view=all&days=7")).json?.rows ?? [];
ok(allRows.find((x) => /price bulletin/.test(x.subject))?.label === "Not for us", "the bulletin's row is labelled 'Not for us'");
console.log(`(the charter quote was classified: ${quoteStatus === "ignored" ? "not for us" : "needs a decision"})`);
console.log(failures ? `\n${failures} FAILED` : "\nall passed"); process.exit(failures ? 1 : 0);
