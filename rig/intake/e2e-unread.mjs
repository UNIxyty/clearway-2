// An email the agent could not read still reaches Flight intake (2026-10-25). Before, it went to the Mailbox as Failed —
// which most dispatchers cannot open — and nowhere else, while the Intake mailbox label said "Reachable": a lost flight
// request with no sign of it. Now: a request on Flight intake, Needs you, with what is known and a plain statement; the
// mailbox label counts the emails that could not be read. On the RIG (local DB, mock Resend, the agent on :5175).
//   node --env-file=.env.rig rig/intake/e2e-unread.mjs
// Truncates the intake tables like every intake e2e.
import { execSync } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import { existsSync, renameSync } from "node:fs";
import path from "node:path";
if (!/127\.0\.0\.1|localhost/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "")) { console.error("rig only (local DB)"); process.exit(78); }
const AGENT = process.env.RIG_AGENT_URL || "http://127.0.0.1:5175";
const SCR = path.resolve("rig/.scratch");
let failures = 0;
const ok = (cond, what, detail = "") => { console.log(`${cond ? "PASS" : "FAIL"}  ${what}${detail ? `  · ${String(detail).slice(0, 300)}` : ""}`); if (!cond) failures += 1; };
const db = async (p) => (await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${p}`, { headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` } })).json();
const api = async (p, body, method = body ? "POST" : "GET") => { const r = await fetch(`${AGENT}${p}`, { method, headers: body ? { "content-type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, json: await r.json().catch(() => null) }; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The webhook for an email the mock Resend holds under `file` (a path that does not exist = the raw copy cannot be fetched).
async function webhook(file, subject) {
  const emailId = randomUUID();
  await fetch(`${process.env.RESEND_API_BASE}/_rig/register`, { method: "POST", body: JSON.stringify({ id: emailId, file: path.resolve(file) }) });
  const body = JSON.stringify({ type: "email.received", created_at: new Date().toISOString(), data: { email_id: emailId, created_at: new Date().toISOString(), from: "dispatch@example.invalid", to: ["handling@intake.rig.invalid"], subject } });
  const svixId = `msg_${randomUUID()}`, ts = String(Math.floor(Date.now() / 1000));
  const sig = createHmac("sha256", Buffer.from(process.env.RESEND_WEBHOOK_SECRET.replace(/^whsec_/, ""), "base64")).update(`${svixId}.${ts}.${body}`).digest("base64");
  const r = await fetch(`${AGENT}/api/intake/resend-webhook`, { method: "POST", headers: { "content-type": "application/json", "svix-id": svixId, "svix-timestamp": ts, "svix-signature": `v1,${sig}` }, body });
  return { emailId, outcome: (await r.json()).outcome };
}
const settled = async (emailId, ms = 240000) => { for (const t0 = Date.now(); ;) { const m = (await db(`intake_messages?select=id,status,status_reason,request_id,fetch_status,raw_key&provider_message_id=eq.${emailId}`))[0]; if (m && m.status !== "waiting") return m; if (Date.now() - t0 > ms) throw new Error("message still waiting"); await sleep(3000); } };
const request = async (id) => (await db(`intake_requests?select=id,status,status_reason,request_type,stages,sender_name,closed_reason&id=eq.${id}`))[0];
const reading = (r) => (r?.stages ?? []).find((s) => s.name === "Reading request");

execSync(`docker exec supabase_db_rig psql -U postgres -d postgres -qc "truncate public.intake_messages, public.intake_events, public.intake_leon_contacts cascade;"`);

console.log("\n=== 1. The mail provider has the email, but its copy cannot be fetched: only the envelope arrived ===");
{ const { emailId, outcome } = await webhook("rig/.scratch/no-such-file.eml", "Handling request — EXAMPLE CHARTER — 3 legs");
  const m = await settled(emailId, 30000);
  ok(outcome === "stored_metadata_only" && m.status === "failed" && m.fetch_status === "failed", "the message is Failed in the Mailbox, as before", `${outcome} · ${m.status} / ${m.fetch_status}`);
  ok(!!m.request_id, "…and NOW it has a request", m.request_id ?? "none");
  const r = m.request_id ? await request(m.request_id) : null;
  ok(r?.status === "needs_you" && /^Could not be read · a person must read the email$/.test(r.status_reason) && r.request_type === "handling", "the request is Needs you: \"Could not be read · a person must read the email\"", `${r?.status} · ${r?.status_reason}`);
  const st = reading(r);
  ok(st?.state === "fail" && /could not be fetched from the mail provider/.test(st.note) && /Nothing has been sent to Leon/.test(st.note) && /ask the sender to send it again/.test(st.note), "the reading stage says plainly what happened and what to do", st?.note);
  ok((r?.stages ?? []).find((s) => s.name === "Request received")?.state === "done" && r.sender_name === "dispatch@example.invalid", "what is known is kept: the sender and the time", r?.sender_name);
  const list = (await api("/api/intake/requests?tab=needs")).json;
  const row = list?.rows?.find((x) => x.id === m.request_id);
  ok(!!row && row.statusKey === "needs_you" && /Could not be read/.test(row.stage) && row.from === "dispatch@example.invalid", "it is on Flight intake under Needs attention, with the sender and the plain reason", row ? `${row.statusLabel} · ${row.stage}` : "not listed");
  const detail = (await api(`/api/intake/requests/${m.request_id}`)).json;
  ok(detail?.request?.ui?.key === "needs_you" && detail.review === null && reading({ stages: detail.stages })?.state === "fail", "the request page's data: Needs you, no reading, the failed stage (the page shows \"Could not read the request\" with the stage's words)");
  const h = (await api("/api/intake/overview")).json?.health?.mailbox;
  ok(h && h.ok === true && h.failed === 1 && h.unread === 1 && /1 email in the last 7 days could not be read\. 1 waits on this page as Needs you\./.test(h.note ?? ""), "the Intake mailbox health counts it: 1 not read, 1 waiting — the label no longer says \"Reachable\"", JSON.stringify(h));
  ok(!(reading(r)?.note ?? "").includes("EXAMPLE CHARTER"), "the stage note carries no subject line (a subject may hold names; the page shows it in its header as always)");
  // A person closes it: the normal close, as for any request.
  const closed = await api(`/api/intake/requests/${m.request_id}/edit`, { op: "close", reason: "handled_manually", note: "asked the client to resend" });
  const r2 = await request(m.request_id);
  ok(closed.status === 200 && r2.status === "closed" && r2.closed_reason === "handled_manually", "a person can close it (handled manually) like any request", `${closed.status} · ${r2.status}`);
  const h2 = (await api("/api/intake/overview")).json?.health?.mailbox;
  ok(h2?.failed === 1 && h2?.unread === 0 && /Each was dealt with by a person/.test(h2?.note ?? ""), "…after which the label still counts the failure this week, and says a person dealt with it", h2?.note); }

console.log("\n=== 2. A read request whose stored copy later cannot be opened: Re-extract turns it Needs you, not silent ===");
{ const { emailId } = await webhook("rig/fixtures/intake/yulsa-cimog1.eml", "yulsa-cimog1.eml");
  const m = await settled(emailId);
  ok(m.status === "processed" && !!m.request_id && !!m.raw_key, "the fixture is read as a handling request (control)", `${m.status} · ${m.status_reason}`);
  // The agent's intake root depends on how it was started (rig/start.sh: INTAKE_ROOT of .env.rig; rig/manifest/start.sh:
  // rig/.scratch/manifest-intake), so the copy is looked for under each.
  const roots = [process.env.INTAKE_ROOT, path.join(SCR, "intake"), path.join(SCR, "manifest-intake")].filter(Boolean).map((r) => path.resolve(r));
  const root = roots.find((r) => existsSync(path.join(r, m.raw_key))) ?? roots[0];
  const rawFile = path.join(root, m.raw_key);
  ok(existsSync(rawFile), "its raw copy is on disk under the agent's intake root", rawFile.replace(root, "<root>"));
  renameSync(rawFile, `${rawFile}.aside`); // moved, not deleted: put back below so later suites (the mailbox browser check) still find it
  const re = await api(`/api/intake/requests/${m.request_id}/reprocess`, { attachmentId: null });
  await sleep(1500);
  const r = await request(m.request_id); const m2 = (await db(`intake_messages?select=status,status_reason&id=eq.${m.id}`))[0];
  ok(r.status === "needs_you" && /^Could not be read/.test(r.status_reason) && reading(r)?.state === "fail" && /stored copy of the email could not be opened/.test(reading(r)?.note ?? ""), "Re-extract on a copy that cannot be opened: the request turns Needs you with the plain reason (it used to fail silently in the Mailbox)", `${re.status} · ${r.status} · ${reading(r)?.note?.slice(0, 80)}`);
  ok(m2.status === "failed" && /Could not read the stored message/.test(m2.status_reason), "…and the Mailbox row is Failed, as before", m2.status_reason);
  ok(/Re-extract/.test(reading(r)?.note ?? "") && /enter the details by hand/.test(reading(r)?.note ?? ""), "the note names both ways on: Re-extract, or enter the details by hand");
  renameSync(`${rawFile}.aside`, rawFile);
  const re2 = await api(`/api/intake/requests/${m.request_id}/reprocess`, { attachmentId: null }); await sleep(1500);
  const r3 = await request(m.request_id);
  ok(re2.status === 200 && !/^Could not be read/.test(r3.status_reason ?? "") && reading(r3)?.state !== "fail", "with the copy back, Re-extract reads it again and the request moves on", `${r3.status} · ${r3.status_reason}`); }

console.log("\n=== 3. Nothing personal in what was written ===");
{ const rows = await db("intake_requests?select=status_reason,stages,sender_name");
  const text = JSON.stringify(rows);
  ok(!/\b(19[5-9]\d)-\d\d-\d\d\b|passport/i.test(text), "no date of birth or passport word in the request rows written by this run", `${text.length} chars`); }

console.log(`\n${failures ? `${failures} FAILED` : "ALL PASSED"}`);
process.exit(failures ? 1 : 0);
