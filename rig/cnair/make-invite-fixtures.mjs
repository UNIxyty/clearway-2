// A FICTIONAL calendar invite in the shape of the provider's notification (an Exchange meeting request):
// multipart/alternative with text/plain, text/html and text/calendar; method=REQUEST. Invented registration,
// reference, crew initials and addresses. Variants: request (SEQUENCE 0), update (same UID, SEQUENCE 1, new
// times), cancel (METHOD:CANCEL).   node make-invite.mjs  → invite-request.eml, invite-update.eml, invite-cancel.eml
import { writeFileSync } from "node:fs";
const UID = "040000008200E00074C5B7101A82E00800000000F1C7A0AA11F4DC01000000000000000010000000AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const body = (etd1) => `#Pax:      2/2\r\n#Cliente:  (Extracomunitario Pasaje)\r\n#1:        XXA\r\n#2:        XXB\r\n#TCP:\r\n#Fra:\r\n#Ref:      9914050\r\n#Otros:\r\n#DATE:     05/10/26\r\n#ETD:      ${etd1}-LEBL 17:30:00-GMMN\r\n`;
const ics = ({ method, seq, start, end, status }) => [
  "BEGIN:VCALENDAR", `METHOD:${method}`, "PRODID:Microsoft Exchange Server 2010", "VERSION:2.0",
  "BEGIN:VTIMEZONE", "TZID:Romance Standard Time", "BEGIN:STANDARD", "DTSTART:16010101T030000", "TZOFFSETFROM:+0200", "TZOFFSETTO:+0100", "RRULE:FREQ=YEARLY;INTERVAL=1;BYDAY=-1SU;BYMONTH=10", "END:STANDARD",
  "BEGIN:DAYLIGHT", "DTSTART:16010101T020000", "TZOFFSETFROM:+0100", "TZOFFSETTO:+0200", "RRULE:FREQ=YEARLY;INTERVAL=1;BYDAY=-1SU;BYMONTH=3", "END:DAYLIGHT", "END:VTIMEZONE",
  "BEGIN:VEVENT", "ORGANIZER;CN=EC-ZZZ:mailto:ec-zzz@provider.example",
  "ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE;CN=Ops:mailto:handling@intake.rig.invalid",
  "SUMMARY;LANGUAGE=es-ES:LEBL-GMMN-LEBL", `DTSTART;TZID=Romance Standard Time:${start}`, `DTEND;TZID=Romance Standard Time:${end}`,
  `UID:${UID}`, "CLASS:PUBLIC", "PRIORITY:5", "DTSTAMP:20261001T101500Z", "TRANSP:OPAQUE", `STATUS:${status}`, `SEQUENCE:${seq}`,
  "X-MICROSOFT-CDO-BUSYSTATUS:TENTATIVE", "X-MICROSOFT-DISALLOW-COUNTER:FALSE", "END:VEVENT", "END:VCALENDAR", ""].join("\r\n");
function eml({ name, subject, method, seq, start, end, status, etd1, date }) {
  const B = "_000_guideinvite_";
  const text = body(etd1);
  const html = `<html><body><pre>${text.replace(/\r\n/g, "<br>")}</pre></body></html>`;
  const raw = [
    `From: EC-ZZZ <ec-zzz@provider.example>`, `To: Ops Department <handling@intake.rig.invalid>, crew-a@provider.example, crew-b@provider.example`,
    `Subject: ${subject}`, `Date: ${date}`, `Message-ID: <invite-${name}-${Date.now()}@provider.example>`,
    `Thread-Topic: LEBL-GMMN-LEBL`, `Content-Language: es-ES`, `MIME-Version: 1.0`, `Content-Type: multipart/alternative; boundary="${B}"`, ``,
    `--${B}`, `Content-Type: text/plain; charset="utf-8"`, `Content-Transfer-Encoding: 8bit`, ``, text,
    `--${B}`, `Content-Type: text/html; charset="utf-8"`, `Content-Transfer-Encoding: 8bit`, ``, html, ``,
    `--${B}`, `Content-Type: text/calendar; charset="utf-8"; method=${method}`, `Content-Transfer-Encoding: base64`, ``, Buffer.from(ics({ method, seq, start, end, status })).toString("base64").replace(/.{76}/g, "$&\r\n"), ``,
    `--${B}--`, ``].join("\r\n");
  writeFileSync(new URL(`../fixtures/cnair/invite-${name}.eml`, import.meta.url), raw); console.log("wrote", name, raw.length);
}
eml({ name: "request", subject: "LEBL-GMMN-LEBL", method: "REQUEST", seq: 0, start: "20261005T170000", end: "20261006T193000", status: "CONFIRMED", etd1: "17:00:00", date: "Thu, 01 Oct 2026 10:15:00 +0000" });
eml({ name: "update", subject: "LEBL-GMMN-LEBL", method: "REQUEST", seq: 1, start: "20261005T180000", end: "20261006T193000", status: "CONFIRMED", etd1: "18:00:00", date: "Thu, 01 Oct 2026 14:40:00 +0000" });
eml({ name: "cancel", subject: "Cancelada: LEBL-GMMN-LEBL", method: "CANCEL", seq: 2, start: "20261005T180000", end: "20261006T193000", status: "CANCELLED", etd1: "18:00:00", date: "Fri, 02 Oct 2026 08:05:00 +0000" });
