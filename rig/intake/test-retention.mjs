// Rig test: retention purges old raw MIME + personal data, and keeps a shared attachment file that a newer
// message still references. Local rig database and scratch storage only.
import fs from "node:fs"; import path from "node:path"; import { randomUUID } from "node:crypto";
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
for (const l of fs.readFileSync(path.join(root, ".env.rig"), "utf8").split("\n")) { const m = /^([A-Z_]+)=(.*)$/.exec(l); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]; }
if (!/127\.0\.0\.1|localhost/.test(process.env.NEXT_PUBLIC_SUPABASE_URL)) process.exit(78);
process.env.INTAKE_ROOT = path.join(root, "rig/.scratch/intake-ret"); fs.rmSync(process.env.INTAKE_ROOT, { recursive: true, force: true });
const { rest } = await import(path.join(root, "agent/lib/knowledge/retrieval.mjs"));
const { putRaw, putContent } = await import(path.join(root, "agent/lib/intake/blobstore.mjs"));
const { sweep, setRetentionDays } = await import(path.join(root, "agent/lib/intake/retention.mjs"));
const ok = (l, c) => console.log(`${c ? "PASS" : "FAIL"} · ${l}`);
await setRetentionDays(90, { email: "rig-test@rig.invalid" });
const day = 86_400_000; const now = Date.now();
const mk = async (ageDays, flightDaysAgo = null) => { const id = randomUUID(); const at = new Date(now - ageDays * day).toISOString(); const raw = await putRaw(id, at, Buffer.from(`From: x\r\n\r\nbody ${id}`));
  await rest("intake_messages", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify([{ id, provider_message_id: `rig-${id}`, direction: "inbound", received_at: at, raw_key: raw.key, fetch_status: "stored" }]) });
  const reqId = randomUUID(); await rest("intake_requests", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify([{ id: reqId, message_id: id, request_type: "handling", ...(flightDaysAgo != null ? { review: { legs: [{ index: 0, fields: [{ key: "std", utc: new Date(now - flightDaysAgo * day).toISOString() }] }] } } : {}) }]) });
  await rest("intake_extractions", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify([{ request_id: reqId, version: 1, fields: { legs: [] }, personal: { crew: [{ name: "REDACTED" }] } }]) });
  return { id, rawKey: raw.key, reqId }; };
const shared = await putContent(Buffer.from("%PDF-1.4 shared gendec"));
const lone = await putContent(Buffer.from("%PDF-1.4 only on the old message"));
const old = await mk(120), recent = await mk(10);
// Received 120 days ago for a flight 20 days ago: kept until 90 days after the flight. Flight 100 days ago: goes.
const lateFlight = await mk(120, 20), pastFlight = await mk(120, 100);
const att = (m, c) => rest("intake_attachments", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify([{ message_id: m.id, sha256: c.sha256, bytes: c.bytes, sniffed_type: "application/pdf", storage_key: c.key }]) });
await att(old, shared); await att(recent, shared); await att(old, lone);
const flightFile = await putContent(Buffer.from("%PDF-1.4 shared with the message kept for its flight")); await att(pastFlight, flightFile); await att(lateFlight, flightFile);
const res = await sweep({ now });
console.log("  sweep:", JSON.stringify(res));
const exists = (k) => fs.existsSync(path.join(process.env.INTAKE_ROOT, k));
ok("old raw .eml deleted", !exists(old.rawKey)); ok("recent raw .eml kept", exists(recent.rawKey));
ok("shared attachment kept (the recent message still uses it)", exists(shared.key)); ok("attachment only the old message used, deleted", !exists(lone.key));
const ex = await rest(`intake_extractions?select=request_id,personal&request_id=in.(${old.reqId},${recent.reqId})`);
ok("old request's personal data cleared", ex.find((e) => e.request_id === old.reqId)?.personal === null); ok("recent request's personal data kept", ex.find((e) => e.request_id === recent.reqId)?.personal !== null);
ok("request received 120 d ago, flight 20 d ago: raw and personal data KEPT (90 d run from the flight)", exists(lateFlight.rawKey) && (await rest(`intake_extractions?select=personal&request_id=eq.${lateFlight.reqId}`))[0]?.personal !== null);
ok("request received 120 d ago, flight 100 d ago: deleted", !exists(pastFlight.rawKey) && (await rest(`intake_extractions?select=personal&request_id=eq.${pastFlight.reqId}`))[0]?.personal === null);
ok("a file shared with the message kept for its flight is kept", exists(flightFile.key));
