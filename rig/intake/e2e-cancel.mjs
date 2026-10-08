// End to end on the RIG: a provider's cancellation of a schedule we loaded (type 1, agent/lib/intake/cancel.mjs).
// Local DB, mock Resend (emails captured, never sent), the mock CNAIR portal (:3994), mock Leon (:3995).
//   node --env-file=.env.rig rig/intake/e2e-cancel.mjs
// Shows: approved → every leg cancelled in Leon (attempt row before the call); declined → nothing touched; unanswered →
// nothing cancelled, the stage waits; and the six cases that are not a simple cancel. The invites and cancellations are
// FICTIONAL in content (the provider's shape: a calendar METHOD:CANCEL, the block only in the DESCRIPTION).
import { execSync } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import path from "node:path";
if (!/127\.0\.0\.1|localhost/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "") || !/127\.0\.0\.1/.test(process.env.LEON_API_BASE ?? "")) { console.error("rig only"); process.exit(78); }
const AGENT = process.env.RIG_AGENT_URL || "http://127.0.0.1:5175"; const SCR = path.resolve("rig/.scratch/cancel"); mkdirSync(SCR, { recursive: true });
const FAULTS = path.resolve("rig/.scratch/leon-mock-faults.json"), LEONLOG = path.resolve("rig/.scratch/leon-mock-log.jsonl");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0; const ok = (c, what, detail = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${what}${detail ? `  · ${String(detail).slice(0, 240)}` : ""}`); if (!c) failures += 1; };
const H = { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` };
const db = async (p) => (await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${p}`, { headers: H })).json();
const dbWrite = async (p, method, body) => fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${p}`, { method, headers: { ...H, "content-type": "application/json", Prefer: "return=representation" }, body: JSON.stringify(body) }).then((r) => r.json());
const api = async (p, body, method) => { const r = await fetch(`${AGENT}${p}`, { method: method ?? (body ? "POST" : "GET"), headers: body ? { "content-type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, json: await r.json().catch(() => null) }; };
const faults = (f) => writeFileSync(FAULTS, JSON.stringify(f));
const leonFlights = async () => (await fetch(`${process.env.LEON_API_BASE}/_rig/flights`)).json();
const setFlight = (body) => fetch(`${process.env.LEON_API_BASE}/_rig/set-flight`, { method: "POST", body: JSON.stringify(body) });
const deletes = () => (existsSync(LEONLOG) ? readFileSync(LEONLOG, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []).filter((e) => /flightDelete/.test(e.q));
async function deliver(file) {
  const id = randomUUID(); await fetch(`${process.env.RESEND_API_BASE}/_rig/register`, { method: "POST", body: JSON.stringify({ id, file: path.resolve(file) }) });
  const body = JSON.stringify({ type: "email.received", created_at: new Date().toISOString(), data: { email_id: id, to: ["handling@intake.rig.invalid"], from: "x", subject: "x" } });
  const sid = `msg_${randomUUID()}`, ts = String(Math.floor(Date.now() / 1000));
  const sig = createHmac("sha256", Buffer.from(process.env.RESEND_WEBHOOK_SECRET.replace(/^whsec_/, ""), "base64")).update(`${sid}.${ts}.${body}`).digest("base64");
  await fetch(`${AGENT}/api/intake/resend-webhook`, { method: "POST", headers: { "content-type": "application/json", "svix-id": sid, "svix-timestamp": ts, "svix-signature": `v1,${sig}` }, body });
  for (let i = 0; i < 90; i += 1) { const m = (await db(`intake_messages?select=id,status,status_reason,request_id,understood&provider_message_id=eq.${id}`))[0]; if (m && m.status !== "waiting") return m; await sleep(2000); }
  throw new Error(`message from ${file} still waiting`);
}
const write = (name, text) => { const f = path.join(SCR, name); writeFileSync(f, text.replace(/\r?\n/g, "\r\n")); return f; };
const BLOCK = (ref) => `#Pax:      2/2\n#Cliente:  (Extracomunitario Pasaje)\n#1º:       XXA\n#2º:       XXB\n#TCP:\n#Fra:\n#Ref:      ${ref}\n#Otros:\n#DATE:     05/10/26\n#ETD:      17:00:00-LEBL 17:30:00-GMMN\n`;
const invite = (ref, route) => write(`invite-${ref}.eml`, ["From: EC-ZZZ <ec-zzz@provider.example>", "To: handling@intake.rig.invalid", `Subject: ${route}`, `Message-ID: <inv-${ref}-${Date.now()}@provider.example>`, "Date: Fri, 02 Oct 2026 09:00:00 +0000", "MIME-Version: 1.0", 'Content-Type: multipart/alternative; boundary="b"', "", "--b", "Content-Type: text/plain; charset=utf-8", "", BLOCK(ref), "--b", 'Content-Type: text/calendar; charset="utf-8"; method=REQUEST', "", "BEGIN:VCALENDAR", "METHOD:REQUEST", "VERSION:2.0", "BEGIN:VEVENT", `UID:RIG-UID-${ref}`, "SEQUENCE:0", `SUMMARY:${route}`, "END:VEVENT", "END:VCALENDAR", "--b--", ""].join("\n"));
// The provider's cancellation shape: the text body is one line; the block is only in the calendar DESCRIPTION.
const cancelMail = (ref, route, { uid = `RIG-UID-${ref}`, seq = 1, subject = `Cancelado: ${route}` } = {}) => write(`cancel-${ref}-${seq}-${Date.now()}.eml`, ["From: EC-ZZZ <ec-zzz@provider.example>", "To: handling@intake.rig.invalid", `Subject: ${subject}`, `Message-ID: <cnl-${ref}-${seq}-${Date.now()}@provider.example>`, "Date: Mon, 05 Oct 2026 09:00:00 +0000", "MIME-Version: 1.0", 'Content-Type: multipart/alternative; boundary="b"', "", "--b", "Content-Type: text/plain; charset=utf-8", "", "La siguiente reunión ha sido cancelada:", "", "--b", 'Content-Type: text/calendar; charset="utf-8"; method=CANCEL', "", "BEGIN:VCALENDAR", "METHOD:CANCEL", "VERSION:2.0", "BEGIN:VEVENT", `UID:${uid}`, `SEQUENCE:${seq}`, "STATUS:CANCELLED", `SUMMARY:${route}`, `DESCRIPTION:${BLOCK(ref).replace(/\n/g, "\\n")}`, "END:VEVENT", "END:VCALENDAR", "--b--", ""].join("\n"));
const NOTIFY = (process.env.INTAKE_NOTIFY_TO ?? "ops@intake.rig.invalid").split(",")[0].trim();
const reply = (ref, text) => write(`reply-${ref}-${Date.now()}.eml`, `From: Ops <${NOTIFY}>\nTo: handling@intake.rig.invalid\nSubject: Re: Cancel in Leon? ${ref} · LEBL → GMMN → LEBL · 05/10/26 · cancelled by CNAIR\nDate: Mon, 05 Oct 2026 10:00:00 +0000\nMessage-ID: <reply-${ref}-${Date.now()}@ops.example>\nMIME-Version: 1.0\nContent-Type: text/plain; charset=utf-8\n\n${text}\n\n> The provider cancelled this flight.\n`);
const requestOf = async (id) => (await db(`intake_requests?select=*&id=eq.${id}`))[0];
const until = async (fn, ms = 120000) => { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) return null; await sleep(1500); } };
const stage = (r, name) => r.stages.find((s) => s.name === name);
const emails = async (reqId) => db(`intake_messages?select=subject,sent_kind,delivery_detail,sent_html&request_id=eq.${reqId}&direction=eq.outbound&order=received_at.asc`);
const cancelLinks = (text) => ({ yes: /Yes, cancel in Leon: (\S+)/.exec(text ?? "")?.[1], no: /No, keep the flights: (\S+)/.exec(text ?? "")?.[1] });
const tokenOf = (url) => new URL(url).searchParams.get("t");
const cancelRows = (reqId) => db(`intake_leon_writes?select=leg_index,state,leon_flight_nid,leon_error,created_at,updated_at&request_id=eq.${reqId}&action=eq.cancel&order=created_at.asc`);

/**
 * A schedule loaded the normal way: invite → approve → portal → confirm (zero services) → Leon. → { r, nids }
 * The mock portal's records are real captures with real (mostly past) dates; unless `keepDates`, the flights are moved a
 * week ahead in the mock Leon afterwards, so "departed" is only tested where meant.
 */
async function load(ref, route, { keepDates = false } = {}) {
  const m = await deliver(invite(ref, route));
  await api(`/api/intake/requests/${m.request_id}/approve`, {});
  const r0 = await until(async () => { const x = await requestOf(m.request_id); return x.review?.legs?.length ? x : null; });
  if (!r0) throw new Error(`${ref}: record not read`);
  let p = await api(`/api/intake/requests/${r0.id}/prepare`, {});
  // The mock Leon's snapshot holds the real flights of some of these records: a person says "not a duplicate" (rig only).
  if (p.status === 409 && (p.json?.blockers ?? []).some((b) => /possible duplicate/.test(b))) { await api(`/api/intake/requests/${r0.id}/edit`, { op: "duplicate", action: "not_duplicate" }); p = await api(`/api/intake/requests/${r0.id}/prepare`, {}); }
  if (p.status !== 200) throw new Error(`${ref}: prepare ${p.status} ${JSON.stringify(p.json?.blockers)}`);
  await api(`/api/intake/send/${p.json.confirmation.token}/confirm`, {});
  const r = await until(async () => { const x = await requestOf(m.request_id); return x.status === "loaded" ? x : null; });
  const nids = (await db(`intake_leon_writes?select=leg_index,leon_flight_nid&request_id=eq.${m.request_id}&action=eq.create&state=eq.in_leon&order=leg_index.asc`)).map((w) => Number(w.leon_flight_nid));
  if (!keepDates) for (const [i, n] of nids.entries()) await setFlight({ flightNid: n, startTimeUTC: new Date(Date.now() + (7 + i) * 86400000).toISOString().replace(/\.\d+Z$/, "Z") });
  return { r, nids, messageId: m.id };
}
const cnl = async (nids) => { const all = await leonFlights(); return nids.map((n) => all.find((f) => f.flightNid === n)?.isCnl); };

// ── reset ──
execSync(`docker exec supabase_db_rig psql -U postgres -d postgres -qc "truncate public.intake_messages, public.intake_events cascade;"`, { stdio: "ignore" });
rmSync(LEONLOG, { force: true }); faults({});
execSync(`kill $(lsof -tiTCP:3995 -sTCP:LISTEN) || true; cd rig/intake && (env -i PATH="$PATH" HOME="$HOME" PORT=3995 RIG_SCRATCH="${path.resolve("rig/.scratch")}" nohup node mock-leon.mjs > ../.scratch/mock-leon.out 2>&1 &)`, { shell: "/bin/bash" });
await sleep(1500);

console.log("\n── 1. Approved: every leg cancelled in Leon; the attempt is written before the call ──");
const A = await load("2612398", "LEBL-LEIB-LEBL");
ok(A.r.status === "loaded" && A.nids.length === 2, "a schedule loaded with zero services, no manual step", `Leon ${A.nids.join(", ")}`);
let m = await deliver(cancelMail("2612398", "LEBL-LEIB-LEBL"));
let r = await requestOf(A.r.id);
ok(m.request_id === A.r.id && m.understood?.calendar?.method === "CANCEL" && /Matched by reference \(UID agrees\)/.test(m.understood?.body ?? ""), "classified by its calendar METHOD:CANCEL and matched to the request by reference (UID cross-checked)", m.understood?.body);
ok(r.status === "needs_you" && stage(r, "Cancellation")?.state === "wait" && /answer by \d\d:\d\dZ/.test(stage(r, "Cancellation").note), "the stage asks ops and waits, its deadline shown; nothing cancelled yet", stage(r, "Cancellation")?.note);
ok((await cancelRows(A.r.id)).length === 0 && (await cnl(A.nids)).every((x) => x === false), "no cancel row and no flight cancelled before an answer");
let e = (await emails(A.r.id)).find((x) => /Cancel in Leon\?/.test(x.sent_kind ?? ""));
let links = cancelLinks(e?.delivery_detail?.text);
ok(!!e && /^Cancel in Leon\? 2612398 · /.test(e.subject) && !!links.yes && !!links.no && /Or just reply yes or no/.test(e.delivery_detail.text) && /they are not removed/.test(e.delivery_detail.text), "the E1 email asks \"Cancel in Leon?\": both buttons as links, the reply line, \"not removed\"", e?.subject);
let peek = await api(`/api/intake/answer?t=${encodeURIComponent(tokenOf(links.yes))}`);
ok(peek.json?.state === "open" && peek.json.question === "cancel" && peek.json.cancelLegs?.length === 2, "the same answer page opens the cancel question (one tap to answer, a link alone answers nothing)", JSON.stringify(peek.json).slice(0, 160));
faults({ hangCancelFlightNid: [A.nids[0]], hangMs: 4000 });
const tapped = api("/api/intake/answer", { t: tokenOf(links.yes) });
const mid = await until(async () => { const rows = await cancelRows(A.r.id); return rows.find((w) => w.state === "sending") ? rows : null; }, 8000);
ok(!!mid && mid[0].state === "sending" && deletes().filter((d) => d.variables?.n === A.nids[0]).length <= 1 && (await cnl(A.nids))[0] === false, "the cancel attempt is in the send log ('sending') while Leon has not answered", JSON.stringify(mid?.map((w) => `${w.leg_index}:${w.state}`)));
ok((await tapped).json?.state === "recorded", "…the tap was recorded");
r = await until(async () => { const x = await requestOf(A.r.id); return x.review?.cancellation?.outcome ? x : null; });
faults({});
ok((await cnl(A.nids)).every((x) => x === true) && (await cancelRows(A.r.id)).every((w) => w.state === "cancelled"), "both legs cancelled in Leon (isCnl), the send log says cancelled", (await cancelRows(A.r.id)).map((w) => w.state).join(","));
ok(r.status === "closed" && r.closed_reason === "cancelled" && /kept as cancelled, not removed/.test(r.status_reason) && stage(r, "Cancellation")?.state === "done", "request closed: \"Cancelled in Leon (kept as cancelled, not removed)\"", r.status_reason);
e = (await emails(A.r.id)).find((x) => /Cancelled/.test(x.sent_kind ?? ""));
ok(!!e && /^Cancelled in Leon: 2612398 · 2 flights$/.test(e.subject) && /CANCELLED, NOT REMOVED/.test(e.delivery_detail.text), "completion email: which legs were cancelled, and that Leon keeps them (not removed)", e?.subject);

console.log("\n── 2. Unanswered: nothing cancelled, the stage waits with its deadline; then declined on the page ──");
const B = await load("2613613", "LEBL-EGJJ-LEBL");
m = await deliver(cancelMail("2613613", "LEBL-EGJJ-LEBL"));
r = await requestOf(B.r.id);
r.review.cancellation.approval.deadlineAt = new Date(Date.now() - 60000).toISOString();
await dbWrite(`intake_requests?id=eq.${B.r.id}`, "PATCH", { review: r.review });
r = await until(async () => { const x = await requestOf(B.r.id); return x.review.cancellation.approval.expiredNoted ? x : null; }, 60000);
ok(!!r && r.status === "needs_you" && /no answer by .* nothing cancelled/i.test(r.status_reason) && /nothing was cancelled in Leon/.test(stage(r, "Cancellation").note), "past the deadline: nothing cancelled, the request waits visibly", r?.status_reason);
ok((await cancelRows(B.r.id)).length === 0 && (await cnl(B.nids)).every((x) => x === false), "…no cancel row, the flights untouched");
const late = await api("/api/intake/answer", { t: tokenOf(cancelLinks((await emails(B.r.id)).find((x) => /Cancel in Leon\?/.test(x.sent_kind ?? ""))?.delivery_detail?.text).yes) });
ok(late.json?.state === "expired" && (await cnl(B.nids)).every((x) => x === false), "a late tap on Yes says the question expired and cancels nothing", late.json?.state);
const dec = await api(`/api/intake/requests/${B.r.id}/cancel-decline`, {});
r = await requestOf(B.r.id);
ok(dec.status === 200 && r.review.cancellation.approval.answer.value === "no" && r.review.cancellation.approval.answer.how === "intake page" && r.status === "loaded" && /declined by/.test(r.status_reason) && (await cnl(B.nids)).every((x) => x === false), "declined on the intake page: nothing touched in Leon, who and when recorded", r.status_reason);

console.log("\n── 3. Declined by email reply ──");
const C = await load("2613979", "LEBL-LDZA-LEBL");
await deliver(cancelMail("2613979", "LEBL-LDZA-LEBL"));
const rp = await deliver(reply("2613979", "No, keep them, the client is re-booking"));
r = await requestOf(C.r.id);
ok(rp.status === "reply" && /applied/.test(rp.status_reason) && r.review.cancellation.approval.answer.value === "no" && r.review.cancellation.approval.answer.how === "email reply", "a reply \"No …\" to \"Cancel in Leon?\" is applied", rp.status_reason);
ok((await cancelRows(C.r.id)).length === 0 && (await cnl(C.nids)).every((x) => x === false) && /Cancellation declined by/.test(r.status_reason), `nothing touched in Leon: all ${C.nids.length} flights still active`, r.status_reason);

console.log("\n── 4. Awkward case: no matching request ──");
m = await deliver(cancelMail("2699999", "LEBL-LFMN"));
ok(m.status === "not_recognised" && /Needs a decision: a cancellation for CNAIR reference 2699999/.test(m.understood?.title ?? "") && !m.request_id, "a cancellation for a flight we never loaded: shown as needing a decision, not discarded", m.understood?.title);

console.log("\n── 5. Awkward case: declined at the original approval gate ──");
m = await deliver(invite("2613417", "LEBL-LEMD"));
await api(`/api/intake/requests/${m.request_id}/decline`, {});
const mc = await deliver(cancelMail("2613417", "LEBL-LEMD"));
r = await requestOf(m.request_id);
ok(mc.request_id === m.request_id && r.status === "closed" && r.review.cancellation.case === "declined-at-gate" && /nothing ever reached Leon/.test(stage(r, "Cancellation").note), "the provider cancelled a flight ops had declined: nothing ever reached Leon, said so, closed", stage(r, "Cancellation")?.note);

console.log("\n── 6. Awkward case: already cancelled in Leon ──");
const F = await load("2614050", "LEBL-GMMN-LEBL");
for (const n of F.nids) await setFlight({ flightNid: n, isCnl: true });   // someone cancelled them in Leon by hand
const d0 = deletes().length;
await deliver(cancelMail("2614050", "LEBL-GMMN-LEBL"));
r = await requestOf(F.r.id);
ok(r.status === "closed" && r.review.cancellation.case === "already-cancelled" && /already cancelled in Leon .*no call was made/.test(stage(r, "Cancellation").note) && deletes().length === d0 && !(await emails(F.r.id)).some((x) => /Cancel in Leon\?/.test(x.sent_kind ?? "")), "Leon already has every leg cancelled: no question, no call, no error, said so", stage(r, "Cancellation")?.note);

console.log("\n── 7. Awkward case: more than one request with flights in Leon for the reference ──");
// A second request for 2613979 that also has a flight in Leon (as if loaded twice): the agent must not choose.
const dupMsg = (await dbWrite("intake_messages", "POST", [{ provider_message_id: `rig-dup-${Date.now()}`, direction: "inbound", received_at: new Date().toISOString(), fetch_status: "stored", status: "processed" }]))[0];
const second = (await dbWrite("intake_requests", "POST", [{ message_id: dupMsg.id, request_type: "scheduled", reference: "2613979", status: "loaded", status_reason: "Loaded", stages: [], review: { kind: "notification", legs: [], notification: { reference: "2613979" } } }]))[0];
await dbWrite("intake_leon_writes", "POST", [{ request_id: second.id, leg_index: 0, action: "create", payload_sha256: `rig-dup-${Date.now()}`, payload: {}, state: "in_leon", leon_flight_nid: String(C.nids[0]) }]);
const d1 = deletes().length;
await deliver(cancelMail("2613979", "LEBL-LDZA-LEBL", { seq: 2 }));
const both = [await requestOf(C.r.id), await requestOf(second.id)];
ok(both.every((x) => x.status === "needs_you" && /more than one request has flights in Leon · nothing cancelled/.test(x.status_reason)) && deletes().length === d1 && (await cnl(C.nids)).every((x) => x === false), "two requests match: stop and ask on both, nothing cancelled", both.map((x) => x.status_reason).join(" | "));

console.log("\n── 8. Awkward case: a leg that has departed ──");
const G = await load("2612472", "LEBL-GCLP", { keepDates: true });   // the portal record's flight was on 03/10: already flown
const d2 = deletes().length;
await deliver(cancelMail("2612472", "LEBL-GCLP"));
r = await requestOf(G.r.id);
e = (await emails(G.r.id)).find((x) => /Cancel in Leon\?/.test(x.sent_kind ?? ""));
ok(r.review.cancellation.legs[0].departed && /already departed: the agent will not cancel/.test(stage(r, "Cancellation").note) && /will NOT cancel a departed flight/.test(e?.delivery_detail?.text ?? ""), "shown and flagged: the stage and the question say the leg departed", stage(r, "Cancellation")?.note);
await api(`/api/intake/requests/${G.r.id}/cancel-approve`, {});
r = await until(async () => { const x = await requestOf(G.r.id); return x.review?.cancellation?.outcome ? x : null; });
ok(r.review.cancellation.outcome.legs[0].state === "departed" && deletes().length === d2 && (await cnl(G.nids))[0] === false && r.status === "needs_you", "even after a yes, the departed flight is NOT cancelled automatically: a person decides", r.status_reason);

console.log("\n── 9. Partial failure: one leg refused; the cancelled one is not retried ──");
// The provider sends the cancellation again for B (declined earlier): ops are asked again; this time yes, and Leon refuses leg 2.
await deliver(cancelMail("2613613", "LEBL-EGJJ-LEBL", { seq: 2 }));
faults({ refuseCancelFlightNid: [B.nids[1]] });
await api(`/api/intake/requests/${B.r.id}/cancel-approve`, {});
r = await until(async () => { const x = await requestOf(B.r.id); return x.review?.cancellation?.outcome ? x : null; });
faults({});
const st = r.review.cancellation.outcome.legs.map((o) => o.state);
e = (await emails(B.r.id)).find((x) => /Needs you/.test(x.sent_kind ?? "") && /cancelled in Leon/.test(x.subject));
ok(st[0] === "cancelled" && st[1] === "not_cancelled" && r.status === "needs_you" && stage(r, "Cancellation")?.state === "part", "leg 1 cancelled, leg 2 refused: the request goes red, the stage partly failed", `${st.join(",")} · ${r.status_reason}`);
ok(!!e && /leg 2 is NOT/.test(e.subject) && /Flight has a journey log/.test(e.delivery_detail.text), "the email names the leg Leon refused, with Leon's reason", e?.subject);
ok(deletes().filter((x) => x.variables?.n === B.nids[0]).length === 1 && (await cnl(B.nids)).join() === "true,false", "the leg that was cancelled got exactly one cancel call; leg 2 is still active in Leon");

console.log("\n── 11. The service restarts during a cancel: unknown, a person checks, nothing retried ──");
{ await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/intake_requests?id=eq.${second.id}`, { method: "DELETE", headers: H });   // only C has flights for 2613979 again
  await deliver(cancelMail("2613979", "LEBL-LDZA-LEBL", { seq: 3 }));
  faults({ hangCancelFlightNid: [C.nids[0]], hangMs: 60000 });
  await api(`/api/intake/requests/${C.r.id}/cancel-approve`, {});
  const sending = await until(async () => { const rows = await cancelRows(C.r.id); return rows.some((w) => w.state === "sending") ? rows : null; }, 15000);
  ok(!!sending, "the cancel attempt is written ('sending') before Leon answers", sending?.map((w) => `${w.leg_index}:${w.state}`).join(","));
  const before = deletes().length;
  execSync(`kill $(lsof -tiTCP:5175 -sTCP:LISTEN)`); await sleep(1000);
  const SCRATCH = path.resolve("rig/.scratch");
  execSync(`cd agent && (env -i PATH="$PATH" HOME="$HOME" PORT=5175 AGENT_LOG_RANGES=true ICU_TIMEZONE_FILES_DIR="${SCRATCH}/icu-tz" TZDATA_LATEST_CHECK=off CNAIR_PORTAL_BASE=http://127.0.0.1:3994 CNAIR_USER=mock CNAIR_PASSWORD=mock INTAKE_LOOKUP_SCHEDULE_MIN="0,0.02,0.04" nohup node --env-file=../.env.rig server.mjs >> ../rig/.scratch/agent.out 2>&1 &)`, { shell: "/bin/bash" });
  for (let i = 0; i < 20; i += 1) { await sleep(1000); try { if ((await fetch(`${AGENT}/api/health`)).ok) break; } catch { /* starting */ } }
  await sleep(2000);
  const rows = await cancelRows(C.r.id); r = await requestOf(C.r.id);
  ok(rows.some((w) => w.state === "unknown") && r.status === "needs_you" && /unknown · check Leon/.test(r.status_reason), "after the restart: that leg's cancel is UNKNOWN and the request asks a person to check Leon", r.status_reason);
  await sleep(4000); faults({});
  ok(deletes().length === before, "nothing was retried after the restart"); }

console.log("\n── 10. No calendar response, ever ──");
const out = await db("intake_messages?select=sent_kind,sent_html,delivery_detail&direction=eq.outbound");
const cal = out.filter((x) => /BEGIN:VCALENDAR|METHOD:(REPLY|COUNTER|REQUEST|CANCEL)|PARTSTAT=|text\/calendar/i.test(`${x.sent_html ?? ""}${JSON.stringify(x.delivery_detail ?? {})}`));
ok(out.length > 0 && cal.length === 0, `none of the ${out.length} emails the agent sent carries calendar content (no accept, decline, tentative)`, cal.map((x) => x.sent_kind).join(","));
const agentLog = readFileSync(path.resolve("rig/.scratch/agent.out"), "utf8");
ok(!/never sends calendar content/.test(agentLog), "the agent log has no refused calendar send (the mailer's guard was never even hit)");

console.log(`\n${failures ? `${failures} FAILED` : "ALL PASSED"} · flightDelete calls: ${deletes().length}`);
process.exit(failures ? 1 : 0);
