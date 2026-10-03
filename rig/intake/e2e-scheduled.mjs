// End to end on the RIG: the scheduled-flight pipeline (type 1), invite → "Process?" → portal → review → Leon.
// Local DB, mock Resend (emails captured), the recorded-protocol mock of the CNAIR portal on :3994 (its log,
// rig/.scratch/cnair-mock-log.jsonl, is the proof of when logins happen), mock Leon on :3995.
//   node --env-file=.env.rig rig/intake/e2e-scheduled.mjs
// The invites are FICTIONAL (shape only). The references are the redacted fixtures' quote numbers and two
// synthetic ones from the mock (2619001: unknown aircraft name; 2619002: appears in the list on the third read).
import { execSync } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import path from "node:path";
if (!/127\.0\.0\.1|localhost/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "")) { console.error("rig only"); process.exit(78); }
const AGENT = process.env.RIG_AGENT_URL || "http://127.0.0.1:5175"; const SCR = path.resolve("rig/.scratch/scheduled"); mkdirSync(SCR, { recursive: true });
const MOCKLOG = path.resolve("rig/.scratch/cnair-mock-log.jsonl");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0; const ok = (c, what, detail = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${what}${detail ? `  · ${String(detail).slice(0, 260)}` : ""}`); if (!c) failures += 1; };
const db = async (p) => (await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${p}`, { headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` } })).json();
const api = async (p, body, method) => { const r = await fetch(`${AGENT}${p}`, { method: method ?? (body ? "POST" : "GET"), headers: body ? { "content-type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, json: await r.json().catch(() => null) }; };
async function deliver(file) {
  const id = randomUUID(); await fetch(`${process.env.RESEND_API_BASE}/_rig/register`, { method: "POST", body: JSON.stringify({ id, file: path.resolve(file) }) });
  const body = JSON.stringify({ type: "email.received", created_at: new Date().toISOString(), data: { email_id: id, to: ["handling@intake.rig.invalid"], from: "x", subject: "x" } });
  const sid = `msg_${randomUUID()}`, ts = String(Math.floor(Date.now() / 1000));
  const sig = createHmac("sha256", Buffer.from(process.env.RESEND_WEBHOOK_SECRET.replace(/^whsec_/, ""), "base64")).update(`${sid}.${ts}.${body}`).digest("base64");
  await fetch(`${AGENT}/api/intake/resend-webhook`, { method: "POST", headers: { "content-type": "application/json", "svix-id": sid, "svix-timestamp": ts, "svix-signature": `v1,${sig}` }, body });
  for (let i = 0; i < 80; i += 1) { const m = (await db(`intake_messages?select=id,status,status_reason,request_id,understood&provider_message_id=eq.${id}`))[0]; if (m && m.status !== "waiting") return m; await sleep(2000); }
  throw new Error(`message from ${file} still waiting`);
}
const write = (name, text) => { const f = path.join(SCR, name); writeFileSync(f, text.replace(/\r?\n/g, "\r\n")); return f; };
const requestOf = async (id) => (await db(`intake_requests?select=*&id=eq.${id}`))[0];
const until = async (fn, ms = 90000) => { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) return null; await sleep(1500); } };
const stage = (r, name) => r.stages.find((s) => s.name === name);
const logins = () => (existsSync(MOCKLOG) ? readFileSync(MOCKLOG, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []).filter((e) => e.event === "login");
const emails = async (reqId) => db(`intake_messages?select=subject,sent_kind,to_addrs,delivery_status,delivery_detail&request_id=eq.${reqId}&direction=eq.outbound&order=received_at.asc`);
const NOTIFY = (process.env.INTAKE_NOTIFY_TO ?? "ops@intake.rig.invalid").split(",")[0].trim();
/** A fictional invite (the provider's shape) for a reference. */
const invite = (ref, route = "LEBL-GMMN-LEBL", date = "05/10/26") => write(`invite-${ref}.eml`, ["From: EC-ZZZ <ec-zzz@provider.example>", "To: handling@intake.rig.invalid", `Subject: ${route}`, `Message-ID: <inv-${ref}-${Date.now()}@provider.example>`, "Date: Fri, 02 Oct 2026 09:00:00 +0000", "MIME-Version: 1.0", 'Content-Type: multipart/alternative; boundary="b"', "", "--b", "Content-Type: text/plain; charset=utf-8", "", `#Pax:      2/2\n#Cliente:  (Extracomunitario Pasaje)\n#1:        XXA\n#2:        XXB\n#TCP:\n#Fra:\n#Ref:      ${ref}\n#Otros:\n#DATE:     ${date}\n#ETD:      17:00:00-LEBL 17:30:00-GMMN\n`, "--b", 'Content-Type: text/calendar; charset="utf-8"; method=REQUEST', "", "BEGIN:VCALENDAR", "METHOD:REQUEST", "VERSION:2.0", "BEGIN:VEVENT", `UID:RIG-UID-${ref}`, "SEQUENCE:0", `SUMMARY:${route}`, "END:VEVENT", "END:VCALENDAR", "--b--", ""].join("\n"));
/** The reply path: a mail to the intake address answering E1. */
const reply = (ref, from, text) => write(`reply-${ref}-${Date.now()}.eml`, `From: ${from}\nTo: handling@intake.rig.invalid\nSubject: Re: Process? ${ref} · LEBL → GMMN → LEBL · 05/10/26 · 2 legs\nDate: Fri, 02 Oct 2026 09:10:00 +0000\nMessage-ID: <reply-${ref}-${Date.now()}@test.example>\nMIME-Version: 1.0\nContent-Type: text/plain; charset=utf-8\n\n${text}\n\n> On Fri, 02 Oct 2026 the Clearway Ops Agent wrote:\n> Does this scheduled flight need processing?\n`);
const linksFrom = (text) => ({ yes: /Yes, process it: (\S+)/.exec(text ?? "")?.[1], no: /No, skip it: (\S+)/.exec(text ?? "")?.[1] });
const tokenOf = (url) => new URL(url).searchParams.get("t");

// ── reset ────────────────────────────────────────────────────────────────────────────────────────────────────
execSync(`docker exec supabase_db_rig psql -U postgres -d postgres -qc "truncate public.intake_messages, public.intake_events cascade;"`, { stdio: "ignore" });
rmSync(MOCKLOG, { force: true }); rmSync(MOCKLOG + ".break", { force: true }); rmSync(MOCKLOG + ".hide", { force: true });
ok((await api("/api/health")).json?.ok, "agent up");
ok((await fetch("http://127.0.0.1:3994/").then((r) => r.status).catch(() => 0)) > 0, "mock CNAIR portal up on :3994");

// ── 1. Decline: the request closes, the portal is never touched ──────────────────────────────────────────────
console.log("\n── 1. Decline ──");
let m = await deliver(invite("2613613", "LEBL-EGJJ-LEBL"));
ok(m.status === "processed" && m.status_reason === "Flight notification", "invite → flight notification", `${m.status} · ${m.status_reason}`);
let r = await requestOf(m.request_id);
ok(r.status === "awaiting_approval" && stage(r, "Confirmation sent")?.state === "done" && stage(r, "Confirmation received")?.state === "wait", "request awaits approval: Confirmation sent done, Confirmation received waiting", `${r.status} · ${r.status_reason}`);
ok(r.review.lookup.attempts.length === 0 && logins().length === 0, "nothing was read from the portal: no look-up, no login");
let e1 = (await emails(r.id))[0];
ok(e1 && /^Process\? 2613613 · LEBL → EGJJ → LEBL · 05\/10\/26 · 2 legs$/.test(e1.subject) && e1.sent_kind === "E1 · Process?" && e1.to_addrs.join() === NOTIFY, "E1 captured with the designed subject, to the notify address", e1?.subject);
let links = linksFrom(e1?.delivery_detail?.text);
ok(!!links.yes && !!links.no && links.yes.includes("/intake/answer?t=") && links.yes !== links.no, "the plain-text part carries both answer URLs", `${links.yes?.slice(0, 60)}…`);
ok(/Or just reply yes or no/.test(e1?.delivery_detail?.text ?? "") && /No answer by \d\d:\d\dZ/.test(e1?.delivery_detail?.text ?? ""), "…the reply line and the deadline");
let peek = await api(`/api/intake/answer?t=${encodeURIComponent(tokenOf(links.no))}`);
ok(peek.status === 200 && peek.json.state === "open" && peek.json.answer === "no" && peek.json.reference === "2613613" && !JSON.stringify(peek.json).includes("XXA"), "L1: the No link peeks open, with the reference, without personal data", JSON.stringify(peek.json).slice(0, 160));
let ans = await api("/api/intake/answer", { t: tokenOf(links.no) });
ok(ans.json?.state === "recorded", "L2: one tap on No records the answer", ans.json?.state);
r = await requestOf(m.request_id);
ok(r.status === "closed" && r.closed_reason === "declined" && stage(r, "Collecting data")?.state === "skip", "decline → the request is closed on Flight intake, Collecting data skipped", `${r.status} · ${r.status_reason}`);
ok(logins().length === 0, "…and no portal login occurred");
ans = await api("/api/intake/answer", { t: tokenOf(links.yes) });
ok(ans.json?.state === "already" && ans.json?.answered?.value === "no", "L3: tapping Yes afterwards says it was already answered; nothing changes", ans.json?.state);
r = await requestOf(m.request_id); ok(r.status === "closed" && logins().length === 0, "…still closed, still no login");
let bad = await api("/api/intake/answer", { t: "bm90LWEtdG9rZW4" });
ok(bad.status === 404 && bad.json?.state === "invalid", "a made-up token is refused", bad.status);

// ── 2. No answer: the stage waits visibly with its deadline; expiry closes it; still processable ─────────────
console.log("\n── 2. No answer ──");
m = await deliver(invite("2612472", "LEBL-GCLP"));
r = await requestOf(m.request_id);
ok(r.status === "awaiting_approval" && /Waiting for ops to answer, by \d\d:\d\dZ/.test(stage(r, "Confirmation received")?.note ?? ""), "the stage waits visibly with its deadline", stage(r, "Confirmation received")?.note);
ok(logins().length === 0, "no login while nobody answers");
// Expire it now (the deadline is in the row; the ticker closes it within 30 s).
await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/intake_requests?id=eq.${r.id}`, { method: "PATCH", headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, "content-type": "application/json" }, body: JSON.stringify({ review: { ...r.review, approval: { ...r.review.approval, deadlineAt: new Date(Date.now() - 1000).toISOString() } } }) });
r = await until(async () => { const x = await requestOf(m.request_id); return x.status === "closed" ? x : null; }, 60000);
ok(!!r && r.closed_reason === "expired" && /No answer by/.test(stage(r, "Confirmation received")?.note ?? ""), "past the deadline: closed as expired, nothing created, the stage says so", r?.status_reason);
ok(logins().length === 0, "a notification nobody answered never caused a login");
e1 = (await emails(r.id))[0]; links = linksFrom(e1?.delivery_detail?.text);
ans = await api("/api/intake/answer", { t: tokenOf(links.yes) });
ok(ans.json?.state === "expired", "L4: a late tap says the request has expired", ans.json?.state);
ok(logins().length === 0, "…and did not cause a login");
// Anyone can still process it from the page: that is the approval.
let look = await api(`/api/intake/requests/${r.id}/lookup`, {});
ok(look.status === 200 && look.json.lookup?.approved, "“Process anyway” from the page counts as approval", JSON.stringify(look.json.lookup).slice(0, 120));
r = await until(async () => { const x = await requestOf(m.request_id); return x.review?.legs?.length ? x : null; });
ok(!!r && r.status === "needs_review" && logins().length === 1, "…then the record was read: exactly one login, request awaiting review", `${r?.status} · logins ${logins().length}`);
// The one-leg record that crosses midnight UTC: 03/10 23:30Z + 0,72 h → 00:13Z on 04/10.
let f = Object.fromEntries(r.review.legs[0].fields.map((x) => [x.key, x]));
ok(f.std.utc === "2026-10-03T23:30:00Z" && f.sta.utc === "2026-10-04T00:13:00Z" && f.sta.state === "converted", "arrival computed across midnight UTC: 23:30Z + 0,72 h = 00:13Z next day, marked converted", `${f.std.utc} → ${f.sta.utc} (${f.sta.state}) ${f.sta.note}`);
ok(f.std.state === "cross_checked", "the Z and LT columns were cross-checked against tz data", `${f.std.state} · ${f.std.note}`);
ok(f.aircraftType.value === "C25C" && f.aircraftType.state === "converted", "aircraft name → ICAO type (Citation CJ4 → C25C)", `${f.aircraftType.value} ${f.aircraftType.note}`);
ok(f.crewCount.state === "not_given" && f.crewCount.required, "crew count is a blocking gap");

// ── 3. Approve by the answer page: the DST-change record, review, Leon ───────────────────────────────────────
console.log("\n── 3. Approve → full path ──");
const before = logins().length;
m = await deliver(invite("2612398", "LEBL-LEIB-LEBL", "30/10/26"));
r = await requestOf(m.request_id);
e1 = (await emails(r.id))[0]; links = linksFrom(e1?.delivery_detail?.text);
ok(logins().length === before, "no login before the answer");
ans = await api("/api/intake/answer", { t: tokenOf(links.yes) });
ok(ans.json?.state === "recorded", "one tap on Yes", ans.json?.state);
r = await until(async () => { const x = await requestOf(m.request_id); return x.review?.legs?.length ? x : null; });
ok(!!r && logins().length === before + 1 && r.review.approval.answer.value === "yes" && r.review.approval.answer.how === "answer page", "approval recorded, exactly one login after it", `logins ${logins().length - before}`);
ok(["Request received", "Confirmation sent", "Confirmation received", "Collecting data", "Data collected", "Review requested"].every((n) => stage(r, n)?.state === "done") && stage(r, "Reviewed and confirmed")?.state === "wait", "stages 1–6 done, 7 waiting", r.stages.map((s) => `${s.name}:${s.state}`).join(" "));
ok(r.stages.length === 11, "eleven stages", r.stages.length);
let legs = r.review.legs.map((l) => Object.fromEntries(l.fields.map((x) => [x.key, x])));
// The record spans the DST change: 30/10 16:00Z + 3,12 h = 19:07Z; 01/11 13:00Z + 3,10 h = 16:06Z.
ok(legs[0].std.utc === "2026-10-30T16:00:00Z" && legs[0].sta.utc === "2026-10-30T19:07:00Z", "leg 1 arrival: 16:00Z + 3,12 h = 19:07Z", `${legs[0].std.utc} → ${legs[0].sta.utc}`);
ok(legs[1].std.utc === "2026-11-01T13:00:00Z" && legs[1].sta.utc === "2026-11-01T16:06:00Z", "leg 2 arrival (after the DST change): 13:00Z + 3,10 h = 16:06Z", `${legs[1].std.utc} → ${legs[1].sta.utc}`);
ok(legs.every((l) => l.std.state === "cross_checked"), "both legs' LT columns agree with tz data on each side of the change", legs.map((l) => `${l.std.state}: ${l.std.note}`).join(" | "));
ok(legs.every((l) => l.sta.state === "converted" && /Computed by code/.test(l.sta.note)), "arrivals stored as converted, never extracted");
let rev = (await emails(r.id)).find((e) => /Ready to confirm/.test(e.sent_kind ?? ""));
ok(!!rev && /^Review: 2612398 · /.test(rev.subject) && /Open Flight intake and confirm/.test(rev.delivery_detail?.text ?? ""), "step 5: the review-ready email tells ops to come and confirm", rev?.subject);
let d = (await api(`/api/intake/requests/${r.id}`)).json;
ok(d.blockers.some((b) => /Crew is not given/.test(b)) && d.blockers.some((b) => /services are not given/.test(b)), "the gaps block: crew count and services", d.blockers.join(" | "));
ok(!d.blockers.some((b) => /Aircraft type/.test(b)), "a mapped aircraft type does not block");
let p = await api(`/api/intake/requests/${r.id}/prepare`, {});
ok(p.status === 409, "confirm refused while the gaps are open", p.status);
// Ops fill the gaps on the page.
for (const i of [0, 1]) { await api(`/api/intake/requests/${r.id}/edit`, { op: "field", leg: i, key: "crewCount", value: "2" }); await api(`/api/intake/requests/${r.id}/edit`, { op: "service_add", leg: i, name: "Handling" }); }
d = (await api(`/api/intake/requests/${r.id}`)).json;
ok(d.blockers.length === 0, "after filling crew and a service, nothing blocks", d.blockers.join(" | "));
p = await api(`/api/intake/requests/${r.id}/prepare`, {});
ok(p.status === 200 && p.json.confirmation?.token && p.json.legs?.length === 2, "stage 7–8: the Leon payload is built through the type 2 path (same confirmation token)", JSON.stringify(p.json.legs?.[0]?.payload ?? p.json).slice(0, 200));
const pay = p.json.legs?.[0]?.payload ?? {};
ok(pay.startTimeUTC?.startsWith("2026-10-30T16:00") && pay.endTimeUTC?.startsWith("2026-10-30T19:07") && pay.adepCode === "LEBL", "payload carries the computed arrival", JSON.stringify(pay).slice(0, 200));
if (process.env.RIG_SEND_TO_MOCK_LEON !== "off") {
  const token = p.json.confirmation.token;
  const a = await api(`/api/intake/send/${token}/confirm`, {});
  let st = null; for (let i = 0; i < 120; i += 1) { st = (await api(`/api/intake/send/${token}`)).json; if (st?.status === "done") break; await sleep(500); }
  ok(a.status === 202 && st?.status === "done" && st.result?.legs?.every((l) => l.state === "in_leon"), "sent to the mock Leon: both legs in Leon", JSON.stringify(st?.result?.legs?.map((l) => l.state)));
  r = await requestOf(m.request_id);
  ok(stage(r, "Notification sent")?.state === "done" && r.status === "loaded", "stage 11 done, request loaded", `${r.status}`);
  const e3 = (await emails(r.id)).find((e) => /Loaded/.test(e.sent_kind ?? ""));
  ok(!!e3 && /Changes the provider makes to this flight after the import are not detected/.test(e3.delivery_detail?.text ?? ""), "step 9: the completion email says changes after import are not detected", e3?.subject);
}

// ── 4. Approve by email reply; the record appears on the third read ──────────────────────────────────────────
console.log("\n── 4. Reply path and a record that appears later ──");
const b4 = logins().length;
writeFileSync(MOCKLOG + ".hide", "2619002 2");   // not in the portal's list for the next two reads
m = await deliver(invite("2619002", "LEBL-LEPA", "14/10/26"));
r = await requestOf(m.request_id);
let rp = await deliver(reply("2619002", "Someone Else <stranger@elsewhere.example>", "yes"));
ok(rp.status === "reply" && !(await requestOf(m.request_id)).review.approval.answer && logins().length === b4, "a yes from an address that was not asked is not applied; no login", rp.status_reason);
rp = await deliver(reply("2619002", `Ops <${NOTIFY}>`, "Hmm, let me check with Pedro first"));
ok(rp.status === "reply" && /was that a yes or a no/.test(rp.status_reason), "an unclear reply → E1c asks again", rp.status_reason);
ok((await emails(r.id)).some((e) => /E1c/.test(e.sent_kind ?? "") && /was that a yes or a no\?/.test(e.subject)), "E1c captured", (await emails(r.id)).map((e) => e.sent_kind).join(", "));
rp = await deliver(reply("2619002", `Ops <${NOTIFY}>`, "Yes please"));
ok(rp.status === "reply" && /applied/.test(rp.status_reason), "a yes as the first line is applied", rp.status_reason);
r = await until(async () => { const x = await requestOf(m.request_id); return x.review?.legs?.length ? x : null; }, 150000);
ok(!!r && r.review.lookup.attempts.map((a) => a.state).join() === "not_found,not_found,found", "not in the portal on the first two reads, found on the third (retry schedule, never type 2)", r?.review.lookup.attempts.map((a) => a.state).join(" → "));
ok(logins().length === b4 + 3, "three logins for three reads, each signed out", `${logins().length - b4}`);
rp = await deliver(reply("2619002", `Ops <${NOTIFY}>`, "no"));
ok(/already answered/.test(rp.status_reason) && (await emails(r.id)).some((e) => /E1a/.test(e.sent_kind ?? "")), "a second answer → E1a, nothing changes", rp.status_reason);
ok((await db(`intake_requests?select=id&request_type=eq.handling`)).length === 0, "no reply became a handling request");

// ── 5. Unknown aircraft name blocks ──────────────────────────────────────────────────────────────────────────
console.log("\n── 5. Unknown aircraft ──");
m = await deliver(invite("2619001", "LEBL-LEPA", "12/10/26"));
r = await requestOf(m.request_id);
await api(`/api/intake/requests/${r.id}/approve`, {});
r = await until(async () => { const x = await requestOf(m.request_id); return x.review?.legs?.length ? x : null; });
f = Object.fromEntries(r.review.legs[0].fields.map((x) => [x.key, x]));
ok(f.aircraftType.state === "invalid" && !f.aircraftType.value && /Learjet 60XR/.test(f.aircraftType.note), "“Learjet 60XR” is not mapped: the type is invalid, not guessed", f.aircraftType.note);
d = (await api(`/api/intake/requests/${r.id}`)).json;
ok(d.blockers.some((b) => /Aircraft type is not valid/.test(b)), "…and blocks confirm", d.blockers.join(" | "));
ok(r.review.approval.answer.how === "intake page", "approval from the intake page is recorded as such");

// ── 6. Breakage detection: an altered structure is refused ───────────────────────────────────────────────────
console.log("\n── 6. Breakage ──");
writeFileSync(MOCKLOG + ".break", "columns");
m = await deliver(invite("2613979", "LEBL-LDZA-LEBL", "10/10/26"));
r = await requestOf(m.request_id);
await api(`/api/intake/requests/${r.id}/approve`, {});
r = await until(async () => { const x = await requestOf(m.request_id); return x.review?.lookup?.attempts?.length ? x : null; });
ok(!!r && r.review.lookup.attempts[0].state === "unavailable" && /not what this reader expects/.test(r.review.lookup.attempts[0].why) && !r.review.legs.length, "a renamed column: the import is refused, nothing read", r?.review.lookup.attempts[0].why);
ok((await emails(r.id)).some((e) => /portal screen changed/.test(e.subject)), "…and ops are alerted", (await emails(r.id)).map((e) => e.subject).join(" | "));
rmSync(MOCKLOG + ".break", { force: true });
r = await until(async () => { const x = await requestOf(m.request_id); return x.review?.legs?.length ? x : null; }, 150000);
ok(!!r && r.review.legs.length === 4, "with the structure back, the next scheduled try reads the four-leg record", r?.review.lookup.attempts.map((a) => a.state).join(" → "));

// ── 7. Portal down: an ordinary failure, retried, then a person ─────────────────────────────────────────────
console.log("\n── 7. Portal down ──");
writeFileSync(MOCKLOG + ".break", "down");
m = await deliver(invite("2614050", "LEBL-GMMN-LEBL", "16/10/26"));
r = await requestOf(m.request_id);
await api(`/api/intake/requests/${r.id}/approve`, {});
r = await until(async () => { const x = await requestOf(m.request_id); return x.status === "needs_you" ? x : null; }, 200000);
rmSync(MOCKLOG + ".break", { force: true });
ok(!!r && r.review.lookup.attempts.length === 3 && r.review.lookup.attempts.every((a) => a.state === "unavailable" && /refused to start the program/.test(a.why)) && stage(r, "Collecting data")?.state === "fail", "down for all three tries → stop, record, alert: a person decides", r?.status_reason);
ok((await emails(r.id)).some((e) => /portal not readable/.test(e.subject)), "alert email captured");

console.log(`\n${failures ? `${failures} FAILED` : "ALL PASSED"}`);
process.exit(failures ? 1 : 0);
