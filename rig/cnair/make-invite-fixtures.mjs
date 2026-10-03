// Calendar-invite fixtures RECONSTRUCTED from four real CNAIR messages (rig/fixtures/cnair/real-messages.json):
// the subjects, UIDs, message classes, blocks (crew initials replaced by placeholders), dates and the
// multipart/alternative shape are real; the exact layout of Zimbra's text/calendar part (property order,
// VTIMEZONE, DESCRIPTION escaping) is ASSUMED from Zimbra's conventions and from what the .msg files keep, and
// is unverified until one message has arrived through Resend. The "update" is FICTIONAL (no real update has
// been seen): the 2614050 invite re-sent with SEQUENCE 1 and a later first departure.
//   node rig/cnair/make-invite-fixtures.mjs  → rig/fixtures/cnair/invite-*.eml
import { readFileSync, writeFileSync } from "node:fs";
const facts = JSON.parse(readFileSync(new URL("../fixtures/cnair/real-messages.json", import.meta.url), "utf8"));
const CREW = { "1º": "AAA", "2º": "BBB", TCP: "CCC" };   // placeholders where the real lines are filled
const blockText = (b, { lead = "", pad = "" } = {}) => Object.entries(b).map(([k, v]) => `${lead}#${k}:${k.length < 4 ? "\t" : " "}${v === "filled" ? CREW[k] ?? "XXX" : v === "empty" ? "" : v}${pad}`).join("\r\n") + "\r\n";
const fold = (line) => { const out = []; let s = line; while (s.length > 75) { out.push(s.slice(0, 75)); s = " " + s.slice(75); } out.push(s); return out.join("\r\n"); };
const icsText = (s) => String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const dt = (iso) => iso.replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
function ics({ method, uid, seq, summary, start, end, description, status }) {
  return ["BEGIN:VCALENDAR", "PRODID:Zimbra-Calendar-Provider", "VERSION:2.0", `METHOD:${method}`,
    "BEGIN:VEVENT", `UID:${uid}`, fold(`SUMMARY:${summary}`), `ORGANIZER;CN=EC-NQS:mailto:redacted@cnair.es`, "ATTENDEE;CN=Ops;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:handling@intake.rig.invalid",
    `DTSTART:${dt(start)}`, `DTEND:${dt(end)}`, `STATUS:${status}`, "CLASS:PUBLIC", "TRANSP:OPAQUE", `SEQUENCE:${seq}`, `DTSTAMP:${dt(start)}`, fold(`DESCRIPTION:${icsText(description)}`), "END:VEVENT", "END:VCALENDAR", ""].join("\r\n");
}
function eml({ name, subject, date, method, uid, seq, start, end, status, text, description, from }) {
  const B = `----=_Part_${Math.floor(Math.random() * 1e8)}_${Math.floor(Math.random() * 1e9)}.${Date.now()}`;
  const html = `<html><body><pre>${text.replace(/\r\n/g, "<br>")}</pre></body></html>`;
  const raw = [
    `From: ${from}`, `To: handling@intake.rig.invalid, crew-a@cnair.example, crew-b@cnair.example`, `Subject: ${subject}`, `Date: ${date}`,
    `Message-ID: <${Date.now()}.${Math.floor(Math.random() * 1e6)}.JavaMail.zimbra@cnair.es>`, `MIME-Version: 1.0`, `Content-Type: multipart/alternative; boundary="${B}"`, ``,
    `--${B}`, `Content-Type: text/plain; charset=utf-8`, `Content-Transfer-Encoding: 8bit`, ``, text,
    `--${B}`, `Content-Type: text/html; charset=utf-8`, `Content-Transfer-Encoding: 8bit`, ``, html, ``,
    `--${B}`, `Content-Type: text/calendar; charset=utf-8; method=${method}`, `Content-Transfer-Encoding: base64`, ``, Buffer.from(ics({ method, uid, seq, summary: subject.replace(/^Cancelado:\s*/, ""), start, end, description, status })).toString("base64").replace(/(.{76})/g, "$1\r\n"),
    `--${B}--`, ``].join("\r\n");
  writeFileSync(new URL(`../fixtures/cnair/invite-${name}.eml`, import.meta.url), raw); console.log("wrote", name, raw.length);
}
const by = Object.fromEntries(facts.messages.map((m) => [m.block.Ref, m]));
const FROM = "redacted@cnair.es";
// Three real invites (the block in the text body and in DESCRIPTION).
for (const [name, ref] of [["request", "2614050"], ["request-2613767", "2613767"], ["request-2614162", "2614162"]]) {
  const m = by[ref]; const text = blockText(m.block);
  eml({ name, subject: m.subject, date: m.date, method: "REQUEST", uid: m.uid, seq: 0, start: m.apptStartUtc, end: m.apptEndUtc, status: "CONFIRMED", text, description: text, from: FROM });
}
// The real cancellation: the text body is one line; the block (padded, as the appointment keeps it) is only in DESCRIPTION.
{ const m = by["2613766"]; const padded = blockText(m.block, { lead: "  ", pad: "                     " });
  eml({ name: "cancel", subject: m.subject, date: m.date, method: "CANCEL", uid: m.uid, seq: 1, start: m.apptStartUtc, end: m.apptEndUtc, status: "CANCELLED", text: `\r\n${m.textBody}\r\n\r\n`, description: padded, from: `${m.senderDisplayName} <${FROM}>` }); }
// FICTIONAL: an update of 2614050 (same UID, SEQUENCE 1, first ETD an hour later).
{ const m = by["2614050"]; const block = { ...m.block, ETD: "18:00:00-LEBL 17:30:00-GMMN" }; const text = blockText(block);
  eml({ name: "update", subject: m.subject, date: "Thu, 1 Oct 2026 18:40:00 +0200", method: "REQUEST", uid: m.uid, seq: 1, start: "2026-10-05T16:00:00Z", end: m.apptEndUtc, status: "CONFIRMED", text, description: text, from: FROM }); }
// FICTIONAL: a cancellation of 2614050 in the real cancellation's shape (same UID as its invite).
{ const m = by["2614050"]; const padded = blockText(m.block, { lead: "  ", pad: "                     " });
  eml({ name: "cancel-2614050", subject: `Cancelado: ${m.subject}`, date: "Fri, 2 Oct 2026 09:00:00 +0200", method: "CANCEL", uid: m.uid, seq: 2, start: m.apptStartUtc, end: m.apptEndUtc, status: "CANCELLED", text: `\r\nLa siguiente reunión ha sido cancelada:\r\n\r\n`, description: padded, from: `EC-NQS <${FROM}>` }); }
