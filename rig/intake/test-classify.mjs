// The offline classifier: type by content, never by sender; two positive tests with "ask" between them.
// Pure code, no database, no model, no network.   node rig/intake/test-classify.mjs
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { classifyAutomatic, calendarsFrom, notificationSignals, notificationChanges, decideType, parseIcs, isMailSystemSender } from "../../agent/lib/intake/classify.mjs";
const { simpleParser } = createRequire(path.resolve("agent/package.json"))("mailparser");
let failures = 0; const ok = (c, what, detail = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${what}${detail ? `  · ${detail}` : ""}`); if (!c) failures += 1; };
const FX = "rig/fixtures/cnair/";
const BLOCK = "#Pax:      2/2\r\n#Cliente:  (Extracomunitario Pasaje)\r\n#1:        XXA\r\n#2:        XXB\r\n#TCP:\r\n#Fra:\r\n#Ref:      9914050\r\n#Otros:\r\n#DATE:     05/10/26\r\n#ETD:      17:00:00-LEBL 17:30:00-GMMN\r\n";
const mail = (from, subject, body, extraHeaders = "") => Buffer.from(`From: ${from}\r\nTo: handling@intake.rig.invalid\r\nSubject: ${subject}\r\nMIME-Version: 1.0\r\n${extraHeaders}Content-Type: text/plain; charset=utf-8\r\n\r\n${body}`);
const forwardAsAttachment = (inner, from) => { const B = "fwd_boundary"; return Buffer.from([`From: ${from}`, "To: handling@intake.rig.invalid", "Subject: FW: LEBL-GMMN-LEBL", "MIME-Version: 1.0", `Content-Type: multipart/mixed; boundary="${B}"`, "", `--${B}`, "Content-Type: text/plain", "", "FYI, see attached.", `--${B}`, "Content-Type: message/rfc822", "Content-Disposition: attachment; filename=\"invite.eml\"", "", inner.toString("latin1"), `--${B}--`, ""].join("\r\n"), "latin1"); };
/** What the pipeline does before classifying: open attached emails, collect texts and calendar parts. */
async function read(raw) {
  const p = await simpleParser(raw, { skipImageLinks: true }); const texts = [p.text ?? ""]; const atts = []; const subjects = [];
  for (const a of p.attachments ?? []) {
    atts.push({ name: a.filename ?? "(no name)", declaredType: a.contentType, content: a.content });
    if (a.contentType === "message/rfc822") { const q = await simpleParser(a.content, { skipImageLinks: true }); texts.push(q.text ?? ""); subjects.push(q.subject ?? ""); for (const c of q.attachments ?? []) atts.push({ name: c.filename ?? "(no name)", declaredType: c.contentType, content: c.content, parent: a.filename ?? "the attached email" }); }
  }
  const calendars = calendarsFrom(atts);
  return { parsed: p, calendars, signals: notificationSignals({ subject: p.subject, texts, calendars, fromAddr: p.from?.value?.[0]?.address ?? "", attachedSubjects: subjects }), texts };
}
const FIELD = (value) => ({ value, said: String(value), source: "Email", confidence: 1, state: "extracted" });
const leg = (withIds = true) => ({ std: { value: { date: "2026-10-08", utcTime: "14:00" } }, sta: { value: { date: "2026-10-08", utcTime: "16:00" } }, registration: withIds ? FIELD("9H-ZWX") : { value: null }, flightNumber: { value: null }, services: [{ name: "Handling", isNote: false }] });

// ── Notification, whoever sends it ───────────────────────────────────────────────────────────────────────────
let r = await read(readFileSync(FX + "invite-request.eml"));
ok(r.signals.confident && r.signals.reference === "2614050", "a real invite (reconstructed from the .msg) is a notification", `confidence ${r.signals.confidence}`);
ok(r.signals.evidence.filter((e) => !e.hint && e.found).reduce((n, e) => n + e.weight, 0) >= 0.7 && r.signals.evidence.find((e) => e.signal === "sender").hint, "…confident without the sender, which is only a hint");
ok(r.signals.notification.crewNamed === 2 && r.signals.notification.paxPerLeg?.join("/") === "2/2" && r.signals.notification.legs === 2, "the real crew keys (#1º: / #2º:) are read; #Pax is one count per leg", `crew ${r.signals.notification.crewNamed}, pax ${JSON.stringify(r.signals.notification.paxPerLeg)}`);
ok(decideType({ signals: r.signals }).type === "scheduled", "decided as a scheduled flight without running the model");
ok(r.calendars[0]?.method === "REQUEST" && r.calendars[0].uid === "dcbf2633-b798-4e2d-8c7c-b6a4f2c29e16" && r.calendars[0].sequence === 0, "calendar part read: method, the real UID (a plain UUID), sequence");
r = await read(forwardAsAttachment(readFileSync(FX + "invite-request.eml"), "Ops Desk <ops@clearway.example>"));
ok(r.signals.confident && r.signals.reference === "2614050" && r.calendars.length === 1, "forwarded by ops as an attachment: still a notification, calendar part found inside");
r = await read(mail("Someone Else <relay@elsewhere.example>", "FW: LEBL-GMMN-LEBL", `Forwarding this.\r\n\r\n-----Original Message-----\r\n${BLOCK.split("\r\n").map((l) => `> ${l}`).join("\r\n")}`));
ok(r.signals.confident && !r.calendars.length, "forwarded inline (quoted block, no calendar part, another sender): still a notification");
r = await read(mail("ec-zzz@cnair.es", "LEBL-GMMN-LEBL", BLOCK));
ok(r.signals.evidence.find((e) => e.signal === "sender").found && r.signals.confident, "a known sender adds confidence", `confidence ${r.signals.confidence}`);
r = await read(mail("ec-zzz@cnair.es", "Invoice 2026-10", "Please find attached the invoice for September.\r\nKind regards"));
ok(!r.signals.confident && !r.signals.shaped, "a known sender ALONE decides nothing");

// ── Notification-shaped but not certain: ask, never type 2 ───────────────────────────────────────────────────
r = await read(mail("x@y.example", "LEBL-GMMN-LEBL", BLOCK.replace(/#Ref:.*\r\n/, "#Ref:\r\n")));
ok(!r.signals.confident && r.signals.shaped, "the block without a reference is notification-shaped, not confident");
let d = decideType({ signals: r.signals, model: { requestType: "handling", typeConfidence: 0.95, ask: { said: "please arrange handling" }, legs: [leg()], whyType: "x" }, sourceTexts: ["please arrange handling"] });
ok(d.type === "ask", "…and stays 'ask' even when the model is sure it is a handling request", d.reason);
r = await read(mail("x@y.example", "Team lunch", "See you there.")); 
ok(!r.signals.shaped && !r.signals.confident, "an ordinary message is not notification-shaped");
ok(parseIcs("BEGIN:VCALENDAR\r\nMETHOD:REQUEST\r\nBEGIN:VEVENT\r\nUID:abc\r\nSEQUENCE:2\r\nEND:VEVENT\r\nEND:VCALENDAR").sequence === 2, "iCalendar parser reads SEQUENCE");
const lunch = notificationSignals({ subject: "Team lunch", texts: ["See you there."], calendars: [{ method: "REQUEST", uid: "u1", where: "the message" }] });
ok(!lunch.shaped && !lunch.confident, "a calendar invite alone (any meeting) is not a notification");

// ── Handling request: positive evidence required ─────────────────────────────────────────────────────────────
const none = notificationSignals({ subject: "Handling request - 9H-ZWX", texts: ["Please arrange handling at EYVI"], calendars: [] });
const src = ["Dear team, please arrange handling at EYVI for the flights below. Handling, fuel."];
d = decideType({ signals: none, model: { requestType: "handling", typeConfidence: 0.9, ask: { said: "please arrange handling at EYVI" }, legs: [leg()], whyType: "asks for handling" }, sourceTexts: src });
ok(d.type === "handling", "asks for a service + carries its schedule + confident → handling", d.reason);
d = decideType({ signals: none, model: { requestType: "handling", typeConfidence: 0.9, ask: { said: null }, legs: [leg()], whyType: "has a schedule" }, sourceTexts: src });
ok(d.type === "ask", "flight details but no words asking for anything → ask (not handling by default)", d.reason);
d = decideType({ signals: none, model: { requestType: "handling", typeConfidence: 0.9, ask: { said: "kindly provide de-icing and a hangar" }, legs: [leg()], whyType: "x" }, sourceTexts: src });
ok(d.type === "ask", "a quoted request that is not in the message → ask", d.reason);
d = decideType({ signals: none, model: { requestType: "handling", typeConfidence: 0.55, ask: { said: "please arrange handling at EYVI" }, legs: [leg()], whyType: "x" }, sourceTexts: src });
ok(d.type === "ask" && /not sure/.test(d.reason), "low confidence → ask, with the reason", d.reason);
d = decideType({ signals: none, model: { requestType: "handling", ask: { said: "please arrange handling at EYVI" }, legs: [leg()], whyType: "x" }, sourceTexts: src });
ok(d.type === "ask", "no confidence given → ask");
d = decideType({ signals: none, model: { requestType: "scheduled", typeConfidence: 0.9, ask: { said: null }, legs: [leg()], whyType: "tells us a flight exists" }, sourceTexts: src });
ok(d.type === "ask", "model says 'scheduled' but there is no reference to look up → ask", d.reason);

// ── Not for us: routine ───────────────────────────────────────────────────────────────────────────────────────
d = decideType({ signals: none, model: { requestType: "other", typeConfidence: 0.95, ask: { said: null }, legs: [], whyType: "A fuel price bulletin." }, sourceTexts: ["October price bulletin"] });
ok(d.type === "not_for_us", "a price bulletin → not for us", d.reason);
d = decideType({ signals: none, model: { requestType: "other", typeConfidence: 0.95, ask: { said: null }, legs: [leg()], whyType: "A slot confirmation." }, sourceTexts: ["slot confirmed"] });
ok(d.type === "ask", "'other', but it has a dated schedule and a registration (looks like work) → ask", d.reason);
d = decideType({ signals: none, model: { requestType: "other", typeConfidence: 0.4, ask: { said: null }, legs: [], whyType: "?" }, sourceTexts: ["?"] });
ok(d.type === "ask", "'other' with low confidence → ask");
ok(d.evidence.length >= 6 && d.evidence.every((e) => e.signal && typeof e.found === "boolean" && e.detail), "every decision carries its evidence");

// ── Bounces by structure, sender as a hint ───────────────────────────────────────────────────────────────────
const dsn = Buffer.from(["From: MAILER-DAEMON@mx.example", "To: handling@intake.rig.invalid", "Subject: Undelivered Mail Returned to Sender", "MIME-Version: 1.0", 'Content-Type: multipart/report; report-type=delivery-status; boundary="b"', "", "--b", "Content-Type: text/plain", "", "Could not deliver.", "--b", "Content-Type: message/delivery-status", "", "Action: failed", "--b--", ""].join("\r\n"));
ok(classifyAutomatic(await simpleParser(dsn))?.kind === "bounce", "a delivery report (multipart/report, delivery-status) is a bounce");
const relayed = mail("postmaster@relay.example", "Handling request 9H-ZWX", "Please arrange handling at EYVI on 08 Oct.");
ok(classifyAutomatic(await simpleParser(relayed)) === null && isMailSystemSender("postmaster@relay.example"), "a request relayed from postmaster@ is NOT ignored; the address is only a hint");
ok(classifyAutomatic(await simpleParser(mail("a@b.example", "Automatic reply: away", "back monday")))?.kind === "auto", "auto-replies are still ignored");

// ── Updates ───────────────────────────────────────────────────────────────────────────────────────────────────
const a = (await read(readFileSync(FX + "invite-request.eml"))).signals.notification, b = (await read(readFileSync(FX + "invite-update.eml"))).signals.notification, c = (await read(readFileSync(FX + "invite-cancel-2614050.eml")));
ok(a.calendar.uid === b.calendar.uid && b.calendar.sequence === 1 && notificationChanges(a, b).join() === "ETD leg 1: 17:00-LEBL → 18:00-LEBL", "an update (FICTIONAL: no real one seen) has the same UID, a higher sequence, and the change is named", notificationChanges(a, b).join("; "));
ok(c.signals.confident && c.signals.notification.calendar.method === "CANCEL" && c.signals.notification.calendar.uid === a.calendar.uid && c.signals.reference === "2614050", "a cancellation in the real shape (block only in the calendar DESCRIPTION) is recognised by its method, with the reference and the same UID", `${c.signals.reference} · ${c.signals.notification.calendar?.method}`);
// The real three-leg cancellation: the block read from DESCRIPTION with its padding, #Ref 2613766, three ETDs, pax 0/5/5.
const rc = (await read(readFileSync(FX + "invite-cancel.eml"))).signals;
ok(rc.confident && rc.reference === "2613766" && rc.notification.calendar.method === "CANCEL" && rc.notification.calendar.uid === "45526411-0af3-4308-8264-cd75268732d8", "the real cancellation: reference and UID read although the text body is one line", `${rc.reference} · ${rc.notification.calendar?.uid}`);
ok(rc.notification.etd.map((e) => `${e.time}-${e.airport}`).join(" ") === "10:00-LEBL 12:00-GMAZ 13:30-GMMZ" && rc.notification.paxPerLeg?.join("/") === "0/5/5" && rc.notification.legs === 3 && rc.notification.paxLegsAgree === true, "…three ETDs in leg order, three pax counts in leg order", `${JSON.stringify(rc.notification.etd)} pax ${JSON.stringify(rc.notification.paxPerLeg)}`);
ok(rc.notification.route.join("-") === "LEBL-GMAZ-GMMZ-LEBL" && rc.notification.crewNamed === 2, "…route from the subject (prefix Cancelado: stripped), two crew lines filled");
ok(!("crew" in a) && a.crewNamed === 2 && !JSON.stringify(a).includes("AAA") && !JSON.stringify(rc).includes("AAA"), "the parsed notification keeps a crew COUNT, not the initials");
console.log(failures ? `\n${failures} FAILED` : "\nall passed"); process.exit(failures ? 1 : 0);
