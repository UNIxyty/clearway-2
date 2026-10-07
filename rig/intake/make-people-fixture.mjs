// A synthetic handling request with a full passenger and crew list, for the passengers-and-crew-to-Leon test:
// 2 legs (LFPB → EVRA → LGAV, OE-LCA, 2028), 16 passengers and 4 crew on both legs, every person INVENTED
// (names from a fixed word list, TEST… document numbers). Shaped like a real request: a short email asking for
// handling, the schedule and the lists in a PDF.
//   node rig/intake/make-people-fixture.mjs   → rig/fixtures/intake/rigpax16-oelca.eml
//   node rig/intake/make-people-fixture.mjs <REF> <CALLSIGN> <+days> <out.eml>   (a variant: another request, callsign and dates)
import { writeFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const rootRequire = createRequire(path.resolve("package.json"));
const { PDFDocument, StandardFonts } = rootRequire("pdf-lib");

const [REF = "RIGPAX16", CALL = "OELCA", SHIFT = "0", OUT = "rig/fixtures/intake/rigpax16-oelca.eml"] = process.argv.slice(2);
const day = (n) => { const t = new Date(Date.UTC(2028, 2, 14 + n + Number(SHIFT))); return { d: `${String(t.getUTCDate()).padStart(2, "0")}${["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"][t.getUTCMonth()]}${t.getUTCFullYear()}`, words: `${t.getUTCDate()} ${t.toLocaleString("en", { month: "long", timeZone: "UTC" })} ${t.getUTCFullYear()}` }; };
const SUR = ["EXAMPLE", "SAMPLE", "SPECIMEN", "TESTER", "DUMMY", "PLACEHOLDER", "FICTIVE", "NOTREAL", "DEMOSON", "MOCKLEY", "FAKEWELL", "TESTWOOD", "SAMPLETON", "PROTO", "MOCKFORD", "DEMOVA"];
const GIV = ["ALICE", "BRUNO", "CARLA", "DMITRI", "ELENA", "FELIX", "GRETA", "HUGO", "INES", "JONAS", "KIRA", "LUKAS", "MILA", "NILS", "OLGA", "PAVEL"];
const NAT = ["FRANCE", "LATVIA", "GERMANY", "GREECE", "MALTA", "AUSTRIA"];
const MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const d = (i, y) => `${String(1 + ((i * 7) % 28)).padStart(2, "0")}${MON[(i * 5) % 12]}${y + ((i * 3) % 20)}`;
const pax = Array.from({ length: 16 }, (_, i) => ({ name: `${SUR[i]} ${GIV[i]}`, dob: d(i, 1961), nat: NAT[i % NAT.length], pp: `TEST${String(i + 1).padStart(5, "0")}`, exp: d(i + 2, 2030) }));
const crew = [["CPT", "CREWMAN ARTHUR"], ["FO", "CREWLY BEATRICE"], ["CC", "CABINSON CLARA"], ["CC", "STEWARDE DANIEL"]].map(([role, name], i) => ({ role, name, dob: d(i + 20, 1975), nat: NAT[(i + 2) % NAT.length], pp: `TESTC${String(i + 1).padStart(4, "0")}`, exp: d(i + 30, 2031) }));

const lines = [
  `HANDLING REQUEST  ${REF}`, "", `OPERATOR: SAMPLE CHARTER (RIG FIXTURE)   AIRCRAFT: GLEX  REG OE-LCA   FLIGHT # ${CALL}`, "",
  "SCHEDULE (ALL TIMES UTC)",
  `LEG 1  ${day(0).d}  LFPB 1320Z  ->  EVRA 1600Z   CREW 4  PAX 16`,
  `LEG 2  ${day(1).d}  EVRA 0840Z  ->  LGAV 1150Z   CREW 4  PAX 16`, "",
  "SERVICES REQUESTED: HANDLING, FUEL, CATERING FOR 16 PAX", "",
  "CREW (BOTH LEGS)", "NO  ROLE  NAME                    DOB         NATIONALITY  PASSPORT    EXPIRY",
  ...crew.map((c, i) => `${i + 1}   ${c.role.padEnd(4)}  ${c.name.padEnd(22)}  ${c.dob}   ${c.nat.padEnd(11)}  ${c.pp}   ${c.exp}`), "",
  "PASSENGERS (BOTH LEGS)", "NO  NAME                    DOB         NATIONALITY  PASSPORT    EXPIRY",
  ...pax.map((p, i) => `${String(i + 1).padEnd(3)} ${p.name.padEnd(22)}  ${p.dob}   ${p.nat.padEnd(11)}  ${p.pp}   ${p.exp}`),
];

const pdf = await PDFDocument.create(); pdf.setTitle(`Handling request ${REF}`); pdf.setProducer("rig"); pdf.setCreator("rig");
const font = await pdf.embedFont(StandardFonts.Courier);
let page = pdf.addPage([842, 595]); let y = 560;
for (const l of lines) { if (y < 30) { page = pdf.addPage([842, 595]); y = 560; } page.drawText(l, { x: 30, y, size: 9.5, font }); y -= 14; }
const pdfB64 = Buffer.from(await pdf.save()).toString("base64").replace(/.{76}/g, "$&\r\n");
const body = `Dear Clearway,\r\n\r\nPlease arrange handling for our flights ${CALL} (OE-LCA) LFPB-EVRA-LGAV on ${day(0).words} and ${day(1).words}.\r\nSchedule, crew and passenger list attached.\r\n\r\nBest regards,\r\nRig Dispatch (synthetic test request)\r\n`;
const B = "rigpax16-boundary";
const eml = [
  "From: Rig Dispatch <dispatch@example.invalid>", "To: handling@intake.rig.invalid", `Subject: Handling request ${REF} OE-LCA LFPB-EVRA-LGAV`,
  "Date: Tue, 07 Oct 2026 18:00:00 +0000", `Message-ID: <${REF.toLowerCase()}@clearway-rig.invalid>`, "MIME-Version: 1.0", `Content-Type: multipart/mixed; boundary="${B}"`, "",
  `--${B}`, "Content-Type: text/plain; charset=utf-8", "Content-Transfer-Encoding: 7bit", "", body,
  `--${B}`, `Content-Type: application/pdf; name="Handling-Request-${REF}-OE-LCA.pdf"`, `Content-Disposition: attachment; filename="Handling-Request-${REF}-OE-LCA.pdf"`, "Content-Transfer-Encoding: base64", "", pdfB64,
  `--${B}--`, "",
].join("\r\n");
const out = path.resolve(OUT);
writeFileSync(out, eml);
console.log(`${out} · ${pax.length} passengers · ${crew.length} crew · all invented`);
