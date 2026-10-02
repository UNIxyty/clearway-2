// The mailer must be unable to send a calendar response. Sends go to a local capture server (RESEND_BASE_URL),
// so nothing leaves the machine.   node rig/intake/test-no-calendar-response.mjs
import http from "node:http";
import { readFileSync, existsSync } from "node:fs";
const captured = [];
const server = http.createServer((req, res) => { let b = ""; req.on("data", (d) => { b += d; }); req.on("end", () => { captured.push(JSON.parse(b)); res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ id: `cap-${captured.length}` })); }); });
await new Promise((r) => server.listen(0, "127.0.0.1", r));
process.env.RESEND_BASE_URL = `http://127.0.0.1:${server.address().port}`; process.env.RESEND_API_KEY = "test-key";
const { sendEmail, calendarRefusal } = await import("../../digital-wall/lib/mailer.mjs");
let failures = 0; const ok = (c, what) => { console.log(`${c ? "PASS" : "FAIL"}  ${what}`); if (!c) failures += 1; };

const ics = (method) => `BEGIN:VCALENDAR\r\nMETHOD:${method}\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:x\r\nATTENDEE;PARTSTAT=ACCEPTED:mailto:a@example.test\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n`;
const eml = (method, b64) => `From: a@example.test\r\nTo: b@example.test\r\nSubject: s\r\nMIME-Version: 1.0\r\nContent-Type: multipart/alternative; boundary="B"\r\n\r\n--B\r\nContent-Type: text/plain\r\n\r\nhello\r\n--B\r\nContent-Type: text/calendar; charset="utf-8"; method=${method}${b64 ? "\r\nContent-Transfer-Encoding: base64" : ""}\r\n\r\n${b64 ? Buffer.from(ics(method)).toString("base64") : ics(method)}\r\n--B--\r\n`;
const base = { to: "ops@example.test", from: "Agent <agent@example.test>", subject: "Test", html: "<p>hello</p>" };
const refused = async (extra, what) => { const n = captured.length; const r = await sendEmail({ ...base, ...extra }); ok(r.ok === false && /never sends calendar content/.test(r.error ?? "") && captured.length === n, `refused, nothing sent: ${what}`); };
const allowed = async (extra, what) => { const n = captured.length; const r = await sendEmail({ ...base, ...extra }); ok(r.ok === true && captured.length === n + 1, `sent: ${what}`); };

await allowed({}, "plain HTML email");
await allowed({ attachments: [{ filename: "chart.pdf", content: Buffer.from("%PDF-1.7 fake") }] }, "PDF attachment");
await refused({ attachments: [{ filename: "invite.ics", content: Buffer.from("anything") }] }, ".ics by name");
await refused({ attachments: [{ filename: "reply.txt", content: Buffer.from(ics("REPLY")) }] }, "iCalendar REPLY by content (Buffer)");
await refused({ attachments: [{ filename: "doc.pdf", content: Buffer.from(ics("REQUEST")).toString("base64") }] }, "iCalendar by content (base64 string, PDF name)");
await refused({ attachments: [{ filename: "x.eml", content: Buffer.from(ics("REPLY")) }] }, "an .ics renamed .eml");
await refused({ attachments: [{ filename: "accepted.eml", content: Buffer.from(eml("REPLY", false)) }] }, "attached message carrying METHOD:REPLY");
await refused({ attachments: [{ filename: "accepted.eml", content: Buffer.from(eml("REPLY", true)) }] }, "attached message carrying a base64 REPLY part");
await refused({ attachments: [{ filename: "counter.eml", content: Buffer.from(eml("COUNTER", true)) }] }, "attached message carrying METHOD:COUNTER");
await refused({ html: `<pre>${ics("REPLY")}</pre>` }, "iCalendar text in the body");
await allowed({ attachments: [{ filename: "original-message.eml", content: Buffer.from(eml("REQUEST", true)) }] }, "forward of an invite as received (REQUEST inside the original message)");
const inv = "rig/.scratch/cnair-invite/invite-request.eml";
if (existsSync(inv)) await allowed({ attachments: [{ filename: "original-message.eml", content: readFileSync(inv) }] }, "forward of the fictional provider invite");
ok(captured.every((p) => Object.keys(p).every((k) => ["from", "to", "subject", "html", "attachments"].includes(k))), "provider payload has only from, to, subject, html, attachments (no headers, no text part)");
ok(captured.every((p) => (p.attachments ?? []).every((a) => Object.keys(a).every((k) => ["filename", "content"].includes(k)))), "attachments carry only filename and content (no content type override)");
ok(calendarRefusal({ html: "<p>x</p>", attachments: [] }) === null, "calendarRefusal is null for ordinary mail");
server.close();
console.log(failures ? `\n${failures} FAILED` : "\nall passed"); process.exit(failures ? 1 : 0);
