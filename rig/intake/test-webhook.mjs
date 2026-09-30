// Rig test for the Resend inbound path: signature verification, idempotency, attachment storage and dedupe.
// Runs against the rig's LOCAL database (.env.rig) and a scratch storage root. Nothing reaches Resend or prod.
import fs from "node:fs"; import path from "node:path"; import { createHmac, randomBytes } from "node:crypto";
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
for (const l of fs.readFileSync(path.join(root, ".env.rig"), "utf8").split("\n")) { const m = /^([A-Z_]+)=(.*)$/.exec(l); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]; }
if (!/127\.0\.0\.1|localhost/.test(process.env.NEXT_PUBLIC_SUPABASE_URL)) { console.error("not the rig database"); process.exit(78); }
process.env.INTAKE_ROOT = path.join(root, "rig/.scratch/intake-unit"); process.env.INTAKE_PIPELINE = "off"; process.env.RESEND_API_BASE = "http://127.0.0.1:9"; /* unreachable on purpose */ fs.rmSync(process.env.INTAKE_ROOT, { recursive: true, force: true });
process.env.RESEND_API_KEY = "re_rig_no_network";
const { verifySvix, handleEvent, storeAttachmentsFromRaw } = await import(path.join(root, "agent/lib/intake/resend.mjs"));
const { rest } = await import(path.join(root, "agent/lib/knowledge/retrieval.mjs"));
const secret = "whsec_" + randomBytes(24).toString("base64");
const sign = (id, ts, body) => "v1," + createHmac("sha256", Buffer.from(secret.slice(6), "base64")).update(`${id}.${ts}.${body}`).digest("base64");
const ok = (label, cond) => console.log(`${cond ? "PASS" : "FAIL"} · ${label}`);
// 1. Signatures
const body = JSON.stringify({ type: "email.received", created_at: new Date().toISOString(), data: { email_id: "11111111-2222-4333-8444-555555555555", from: "ops@handler.example", to: ["intake@agent.verxyl.com"], subject: "Handling request", created_at: new Date().toISOString() } });
const ts = String(Math.floor(Date.now() / 1000));
ok("valid signature accepted", verifySvix({ id: "msg_1", timestamp: ts, signature: sign("msg_1", ts, body), body, secret }).ok);
ok("tampered body rejected", !verifySvix({ id: "msg_1", timestamp: ts, signature: sign("msg_1", ts, body), body: body.replace("Handling", "Handlin9"), secret }).ok);
ok("old timestamp rejected", !verifySvix({ id: "msg_1", timestamp: String(Number(ts) - 3600), signature: sign("msg_1", String(Number(ts) - 3600), body), body, secret }).ok);
ok("no secret configured rejected", !verifySvix({ id: "msg_1", timestamp: ts, signature: sign("msg_1", ts, body), body, secret: "" }).ok);
// 2. Idempotency (Resend is not reachable in the rig: the raw fetch fails, the metadata row and request still land once)
const ev = JSON.parse(body);
const a = await handleEvent({ svixId: "msg_1", event: ev }); const b = await handleEvent({ svixId: "msg_1", event: ev }); const c = await handleEvent({ svixId: "msg_2", event: ev });
console.log("  first:", a.outcome, "| same delivery again:", b.outcome, "| new delivery, same email:", c.outcome);
const msgs = await rest("intake_messages?select=id,fetch_status&provider_message_id=eq.11111111-2222-4333-8444-555555555555");
const reqs = await rest(`intake_requests?select=id,status&message_id=eq.${msgs[0].id}`);
ok("one message row after three deliveries", msgs.length === 1); ok("the webhook creates no request itself (the pipeline reads it off the response path)", reqs.length === 0); ok("retry outcomes are duplicates", b.outcome === "duplicate_delivery" && c.outcome === "duplicate_message");
// 3. Attachments from raw MIME: stored once per content, real type sniffed, owner-only permissions
const pdf = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
const eml = [`From: ops@handler.example`, `To: intake@agent.verxyl.com`, `Subject: t`, `MIME-Version: 1.0`, `Content-Type: multipart/mixed; boundary="b"`, ``, `--b`, `Content-Type: text/plain`, ``, `body`, `--b`, `Content-Type: image/png; name="gendec.png"`, `Content-Disposition: attachment; filename="gendec.png"`, `Content-Transfer-Encoding: base64`, ``, pdf.toString("base64"), `--b`, `Content-Type: application/pdf; name="copy.pdf"`, `Content-Disposition: attachment; filename="copy.pdf"`, `Content-Transfer-Encoding: base64`, ``, pdf.toString("base64"), `--b--`, ``].join("\r\n");
const n = await storeAttachmentsFromRaw(msgs[0].id, Buffer.from(eml));
const atts = await rest(`intake_attachments?select=sha256,sniffed_type,declared_type,storage_key&message_id=eq.${msgs[0].id}`);
ok(`two attachment parts, same content → ${atts.length} row, ${new Set(atts.map((x) => x.storage_key)).size} file`, n === 2 && atts.length === 1);
ok(`declared image/png, sniffed ${atts[0]?.sniffed_type}`, atts[0]?.sniffed_type === "application/pdf");
const f = path.join(process.env.INTAKE_ROOT, atts[0].storage_key); const st = fs.statSync(f); const dst = fs.statSync(path.dirname(f));
ok(`file mode ${(st.mode & 0o777).toString(8)}, dir mode ${(dst.mode & 0o777).toString(8)}, path ${atts[0].storage_key.replace(/[0-9a-f]{64}$/, "<sha256>")}`, (st.mode & 0o777) === 0o600 && (dst.mode & 0o777) === 0o700);
