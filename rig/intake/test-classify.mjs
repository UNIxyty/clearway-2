// The offline classifier: type by content, never by sender; two positive tests with "ask" between them.
// Pure code, no database, no model, no network.   node rig/intake/test-classify.mjs
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { classifyAutomatic, calendarsFrom, notificationSignals, notificationChanges, decideType, parseIcs, isMailSystemSender, hashBlock, htmlToLines } from "../../agent/lib/intake/classify.mjs";
const { simpleParser } = createRequire(path.resolve("agent/package.json"))("mailparser");
let failures = 0; const ok = (c, what, detail = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${what}${detail ? `  · ${detail}` : ""}`); if (!c) failures += 1; };
const FX = "rig/fixtures/cnair/";
const BLOCK = "#Pax:      2/2\r\n#Cliente:  (Extracomunitario Pasaje)\r\n#1:        XXA\r\n#2:        XXB\r\n#TCP:\r\n#Fra:\r\n#Ref:      9914050\r\n#Otros:\r\n#DATE:     05/10/26\r\n#ETD:      17:00:00-LEBL 17:30:00-GMMN\r\n";
const mail = (from, subject, body, extraHeaders = "") => Buffer.from(`From: ${from}\r\nTo: handling@intake.rig.invalid\r\nSubject: ${subject}\r\nMIME-Version: 1.0\r\n${extraHeaders}Content-Type: text/plain; charset=utf-8\r\n\r\n${body}`);
const forwardAsAttachment = (inner, from) => { const B = "fwd_boundary"; return Buffer.from([`From: ${from}`, "To: handling@intake.rig.invalid", "Subject: FW: LEBL-GMMN-LEBL", "MIME-Version: 1.0", `Content-Type: multipart/mixed; boundary="${B}"`, "", `--${B}`, "Content-Type: text/plain", "", "FYI, see attached.", `--${B}`, "Content-Type: message/rfc822", "Content-Disposition: attachment; filename=\"invite.eml\"", "", inner.toString("latin1"), `--${B}--`, ""].join("\r\n"), "latin1"); };
/** What the pipeline does before classifying: open attached emails, collect texts and calendar parts. */
async function read(raw) {
  const p = await simpleParser(raw, { skipImageLinks: true }); const texts = [p.text ?? "", ...(p.html ? [htmlToLines(p.html)] : [])]; const atts = []; const subjects = [];
  for (const a of p.attachments ?? []) {
    atts.push({ name: a.filename ?? "(no name)", declaredType: a.contentType, content: a.content });
    if (a.contentType === "message/rfc822") { const q = await simpleParser(a.content, { skipImageLinks: true }); texts.push(q.text ?? ""); subjects.push(q.subject ?? ""); for (const c of q.attachments ?? []) atts.push({ name: c.filename ?? "(no name)", declaredType: c.contentType, content: c.content, parent: a.filename ?? "the attached email" }); }
  }
  const calendars = calendarsFrom(atts);
  return { parsed: p, calendars, signals: notificationSignals({ subject: p.subject, texts, calendars, fromAddr: p.from?.value?.[0]?.address ?? "", attachedSubjects: subjects }), texts };
}
const FIELD = (value) => ({ value, said: String(value), source: "Email", confidence: 1, state: "extracted" });
const leg = (withIds = true) => ({ std: { value: { date: "2026-10-08", utcTime: "14:00" } }, sta: { value: { date: "2026-10-08", utcTime: "16:00" } }, registration: withIds ? FIELD("9H-ZWX") : { value: null }, flightNumber: { value: null }, services: [{ name: "Handling", isNote: false }] });

// ── The #Key block in every real layout (LEBL-LPFR-LEBL, #Ref 2610228, 2026-10-08) ──────────────────────────────
{ const FFFD = "\uFFFD";
  const A = `#Pax:   0/4\r\n#Cliente:       (Intracomunitario Pasaje)\r\n#1${FFFD}:    AAA\r\n#2${FFFD}:    BBB\r\n#TCP:\r\n#Fra:\r\n#Ref:   2610228\r\n#Otros:\r\n#DATE:  17/10/26\r\n#ETD:   17:45:00-LEBL 19:00:00-LPFR\r\n`;
  const B = ["  #Pax: 0/4", "#Cliente:  (Intracomunitario Pasaje)", `#1${FFFD}: AAA`, `#2${FFFD}: BBB`, "#TCP: ", "#Fra: ", "#Ref: 2610228", "#Otros: ", "#DATE: 17/10/26", "#ETD: 17:45:00-LEBL 19:00:00-LPFR"].map((l) => l + " ".repeat(21)).join("\n");
  const T = ["#Pax:", "", "0/4", "", "#Cliente:", "", "(Intracomunitario Pasaje)", "", `#1${FFFD}:`, "", "AAA", "", `#2${FFFD}:`, "", "BBB", "", "#TCP:", "", "#Fra:", "", "#Ref:", "", "2610228", "", "#Otros:", "", "#DATE:", "", "17/10/26", "", "#ETD:", "", "17:45:00-LEBL 19:00:00-LPFR", "", "", "Kind regards"].join("\r\n");
  const W = `Where: #Pax: 0/4 #Cliente: (Intracomunitario Pasaje) #1${FFFD}: AAA #2${FFFD}: BBB #TCP: #Fra: #Ref: 2610228 #Otros`;
  const want = { pax: "0/4", cliente: "(Intracomunitario Pasaje)", 1: "AAA", 2: "BBB", tcp: "", fra: "", ref: "2610228", otros: "", date: "17/10/26", etd: "17:45:00-LEBL 19:00:00-LPFR" };
  const same = (b, keys = Object.keys(want)) => keys.every((k) => b.get(String(k)) === want[k]);
  const a = hashBlock(A), b = hashBlock(B), t = hashBlock(T), w = hashBlock(W);
  ok(same(a) && same(b), "copy A (a run of spaces after the colon) and copy B (one space + 21 spaces of padding, leading spaces) parse to the same ten values");
  ok(same(t), "the delivered layout (Outlook's table flattened: each value on a line below its key) parses to the same values; empty #TCP/#Fra/#Otros stay empty, the signature is not a value");
  ok(same(w, ["pax", "cliente", "1", "2", "tcp", "fra", "ref"]) && !w.has("otros") && !w.has("date"), "a run of keys on one line cut short (\"… #Ref: 2610228 #Otros\") gives the keys it holds, #Ref without the cut-off tail");
  const u = hashBlock(A.replace("#Ref:", "#Zona:   NORTE\r\n#Ref:"));
  ok(same(u) && u.get("zona") === "NORTE", "an unknown #Key in the middle is kept and ignored by the reader; nothing after it is lost");
  ok(same(hashBlock(A.split("\r\n").reverse().join("\r\n"))), "any key order (#Ref is not the anchor)");
  ok(same(hashBlock(A.replace(/\uFFFD/g, "º"))) && same(hashBlock(A.replace(/\uFFFD/g, ""))), "#1º / #1\uFFFD / #1 all read as crew line 1");
  const sigA = notificationSignals({ subject: "LEBL-LPFR-LEBL", texts: [A], calendars: [{ method: "REQUEST", uid: "u", description: B, location: T, where: "the message" }] });
  ok(sigA.reference === "2610228" && sigA.notification.crewNamed === 2 && sigA.notification.legs === 2, "three copies that agree → reference 2610228, crew 2, 2 legs");
  const sigC = notificationSignals({ subject: "LEBL-LPFR-LEBL", texts: [A], calendars: [{ method: "REQUEST", uid: "u", description: B.replace("2610228", "2610229"), where: "the message" }] });
  ok(sigC.reference === null && /different #Ref values \(2610228, 2610229\)/.test(sigC.searched.refProblem), "two copies that DISAGREE on #Ref → no reference (never a guess), and the screen is told why", sigC.searched.refProblem);
  const sigN = notificationSignals({ subject: "LEBL-LPFR-LEBL", texts: [T.replace("2610228", "")], calendars: [] });
  ok(sigN.reference === null && /#Ref is in the message but no value was found next to it/.test(sigN.searched.refProblem) && sigN.searched.lines.some((l) => l.startsWith("#Ref")) && sigN.searched.where.length >= 1, "no readable #Ref → the reason and the lines searched are kept for the screen", sigN.searched.refProblem);
  ok(!JSON.stringify(sigA.searched).includes("AAA") && !JSON.stringify(sigN.searched).includes("BBB"), "…with the crew initials masked in what is kept");
  let r = await read(readFileSync(FX + "forward-2610228.eml"));
  ok(r.signals.confident && r.signals.reference === "2610228" && r.signals.notification.crewNamed === 2 && r.signals.notification.pax === "0/4" && r.signals.notification.etd.map((e) => `${e.time}-${e.airport}`).join(" ") === "17:45-LEBL 19:00-LPFR" && r.signals.notification.client === "(Intracomunitario Pasaje)", "the DELIVERED copy (Outlook forward, as Resend gave it, redacted): reference 2610228, crew 2, pax 0/4, both ETDs", `confidence ${r.signals.confidence}`);
  ok(r.calendars[0]?.method === "REQUEST" && r.calendars[0].uid === "6b65d09f-e212-4884-985d-707dea56b4e2" && decideType({ signals: r.signals }).type === "scheduled", "…its calendar part (method REQUEST, CNAIR's UID): decided as a scheduled flight with no person choosing");
  r = await read(readFileSync(FX + "invite-request-2610228.eml"));
  ok(r.signals.confident && r.signals.reference === "2610228" && r.signals.notification.crewNamed === 2, "the .msg's own copies (A in the body, B in LOCATION): reference 2610228, crew 2"); }

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
