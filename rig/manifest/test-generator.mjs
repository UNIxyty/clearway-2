// Passenger Manifest generator — rules from the spec and the build brief, checked on the generator's output.
// Fake data only (rig/manifest/fixtures.mjs). Needs PyMuPDF for text extraction (rig/.scratch/fontenv).
//   node rig/manifest/test-generator.mjs
import { writeFileSync, mkdtempSync } from "node:fs";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { generatePassengerManifest, generateBlankManifest, manifestFilename } from "../../agent/lib/manifest/index.mjs";
import { formatDate } from "../../agent/lib/manifest/model.mjs";
import { flight, stubLeon } from "./fixtures.mjs";

const PY = new URL("../.scratch/fontenv/bin/python", import.meta.url).pathname;
const dir = mkdtempSync(path.join(os.tmpdir(), "manifest-test-"));
let failures = 0;
const ok = (c, m) => { console.log(`${c ? "PASS" : "FAIL"}  ${m}`); if (!c) failures += 1; };
/** Text spans of every page: [{ page, text, x, y, size, font }]. */
function spans(pdf) {
  const f = path.join(dir, `t${Math.random().toString(36).slice(2)}.pdf`); writeFileSync(f, pdf);
  return JSON.parse(execFileSync(PY, ["-c", `
import json, sys, pymupdf as fitz
out = []
for i, p in enumerate(fitz.open(sys.argv[1])):
    for b in p.get_text("dict")["blocks"]:
        for l in b.get("lines", []):
            for s in l["spans"]: out.append({"page": i + 1, "text": s["text"], "x": s["origin"][0], "y": s["origin"][1], "size": s["size"], "font": s["font"]})
print(json.dumps(out))`, f]).toString());
}
const noFleet = async () => ({ holders: [], unchecked: [] });
const gen = (f, extra = {}) => generatePassengerManifest({ flightId: "rig:101", leon: stubLeon(f, extra), lookup: noFleet });

// Strings, verbatim (spec §4), on the blank form.
const blank = await generateBlankManifest();
const bt = spans(blank.pdf).map((s) => s.text);
const VERBATIM = ["Passenger Manifest", "Owner or Operator", "Marks of Nationality and Registration", "Flight No", "Date", "Departure from", "Arrival at", "SURNAME AND NAMES", "SEX", "DATE OF BIRTH", "PLACE OF BIRTH", "PASSPORT No.", "EXPIRES", "NATIONALITY", "Number of Crew", "Persons on Board", "Signature", ".".repeat(69), "Authorized Agent or pilot-in Command"];
ok(VERBATIM.every((s) => bt.includes(s)) && bt.length === VERBATIM.length, `blank form: exactly the ${VERBATIM.length} fixed strings, character for character (incl. "pilot-in Command", "PASSPORT No.", 69 full stops)`);
ok(!bt.some((t) => /^Page /.test(t)) && blank.result.pageCount === 1, "blank form: one page, no page number");

// Three passengers: Page 1 of 1, rows in Leon's order, 11 empty rows, blanks never filled.
const three = await gen(flight({ pax: 3, mutate: (c) => { c.reverse(); } }));
const t3 = spans(three.pdf);
// Leon returned the three contacts reversed (EXAMPLE, SAMPLE, SPECIMEN → SPECIMEN, SAMPLE, EXAMPLE): printed as returned.
const names = t3.filter((s) => s.y > 190 && s.y < 410 && s.x < 212).map((s) => s.text);
ok(names.join(" / ") === "Specimen Greta / Sample Dmitri / Example Alice", `rows in Leon's order, not sorted, names as stored (no upper-casing): ${names.join(" / ")}`);
ok(t3.some((s) => s.text === "Page 1 of 1"), "3 passengers: Page 1 of 1");
ok(!t3.some((s) => /^(N\/A|-|—|TBC)$/.test(s.text)), "no N/A, dash or TBC anywhere");

// 68 passengers: five pages, footer on the last only, 12 rows on page 5.
const big = await gen(flight({ pax: 68 }));
const tb = spans(big.pdf);
ok(big.result.pageCount === 5 && [1, 2, 3, 4, 5].every((p) => tb.some((s) => s.page === p && s.text === `Page ${p} of 5`)), "68 passengers: Page N of 5 on each of five pages");
ok([1, 2, 3, 4].every((p) => !tb.some((s) => s.page === p && s.text === "Number of Crew")) && tb.some((s) => s.page === 5 && s.text === "Number of Crew"), "footer (crew, persons on board, signature) on the last page only");
ok(tb.filter((s) => s.page === 5 && /^TEST\d{5}$/.test(s.text)).length === 12, "page 5 has 12 filled rows");
ok([1, 2, 3, 4, 5].every((p) => tb.some((s) => s.page === p && s.text === "TST101") && tb.some((s) => s.page === p && s.text === "SURNAME AND NAMES")), "every page repeats the header values and the column headings");
ok(tb.some((s) => s.page === 5 && s.text === "71"), "persons on board = 68 passengers + 3 crew (PERSONS_ON_BOARD_INCLUDES_CREW)");

// Missing data: blank cells + the missing-field list.
const miss = await gen(flight({ pax: 2, mutate: (c) => { c[1].contact.placeOfBirth = null; c[1].departurePassport.expiresDate = null; c[1].contact.nationality = null; } }));
ok(JSON.stringify(miss.result.missing) === JSON.stringify([{ row: 2, where: "row 2 on page 1", fields: ["place of birth", "passport expiry", "nationality"] }]), "missing fields are returned per row: row 2 → place of birth, passport expiry, nationality");

// Dates: DD-Mon-YYYY, UTC.
ok(formatDate("2026-09-29") === "29-Sep-2026" && formatDate("2026-09-29T23:30:00Z") === "29-Sep-2026" && formatDate("2026-09-30T00:30:00+02:00") === "29-Sep-2026" && formatDate("") === "" && formatDate("29/09/2026") === "", "dates: DD-Mon-YYYY in UTC; anything else is blank, never guessed");
ok(manifestFilename("KLJ7350", "2026-09-29T06:00:00Z") === "PAX-Manifest_KLJ7350_29Sep2026.pdf", "filename: PAX-Manifest_KLJ7350_29Sep2026.pdf");

// Warnings.
const w = async (f, extra) => (await gen(f, extra)).result.warnings.map((x) => x.code);
ok((await w(flight({ pax: 3, leonCount: 5 }))).includes("pob-disagrees"), "Leon's passenger count ≠ rows → a Persons-on-Board warning, document still produced");
ok((await w(flight({ pax: 2, mutate: (c) => { c[0].arrivalPassport = { ...c[0].departurePassport, number: "TEST77777" }; } }))).includes("document-differs"), "arrival document differs → warning naming the row");
ok((await w(flight({ pax: 1, mutate: (c) => { c[0].departurePassport.isMasked = true; c[0].departurePassport.number = "*****"; } }))).includes("document-masked"), "a passport Leon masks for this account → blank + warning (the masked string is never printed)");
const masked = await gen(flight({ pax: 1, mutate: (c) => { c[0].departurePassport.isMasked = true; c[0].departurePassport.number = "*****"; } }));
ok(!spans(masked.pdf).some((s) => s.text.includes("*")), "no masked characters on the page");
ok((await w(flight({ pax: 0 }))).includes("no-passengers"), "zero passengers → still a document, and a plain 'no passengers' note");
const countOnly = flight({ pax: 0 }); countOnly.passengerList = { count: 4, isDataSourceText: true, passengerText: "", passengerContactList: null };
const co = await gen(countOnly);
ok(co.result.warnings.some((x) => x.code === "pax-count-only") && co.result.passengerCount === 0 && co.paxNote === null, "Leon has only a count → 'count only' warning, rows blank, no note");
const NOTE = "1. Fakename Alpha  P/N TEST11111\n2. Fakename Beta  P/N TEST22222";
const withNote = flight({ pax: 0 }); withNote.passengerList = { count: 2, isDataSourceText: true, passengerText: NOTE, passengerContactList: null };
const wn = await gen(withNote);
ok(wn.paxNote === NOTE && wn.result.hasPaxNote && wn.result.passengerCount === 0, "a free-text note → returned verbatim as paxNote, rows stay blank (never parsed)");
ok(!JSON.stringify(wn.result).includes("Fakename") && !spans(wn.pdf).some((x) => /Fakename|TEST11111/.test(x.text)), "the note is in neither the result (audited, seen by the model) nor the page");

// Values exactly as Leon stores them — no upper-casing, hyphens, stripping or tidying.
const verb = async (patch) => { const f = flight({ pax: 1 }); patch(f); return spans((await gen(f)).pdf).map((x) => x.text); };
ok((await verb((f) => { f.acft.registration = "N-868AV"; })).includes("N-868AV"), "registration \"N-868AV\" (as Leon stores it) prints as N-868AV");
ok((await verb((f) => { f.acft.registration = "N868AV"; })).includes("N868AV"), "registration \"N868AV\" prints as N868AV — nothing inserted");
ok((await verb((f) => { f.acft.registration = "ly-bgs"; })).includes("ly-bgs"), "a lower-case registration is not upper-cased");
ok((await verb((f) => { f.startAirport.code.icao = "ksfo"; f.flightNo = "abc 12"; })).filter((t) => t === "ksfo" || t === "abc 12").length === 2, "ICAO and flight number pass through untouched");
ok((await verb((f) => { f.passengerList.passengerContactList[0].contact.placeOfBirth = "São Paulo"; })).includes("São Paulo"), "accents pass through");
const cjk = flight({ pax: 1, mutate: (c) => { c[0].contact.placeOfBirth = "北京"; } });
const cj = await gen(cjk);
ok(cj.result.warnings.some((x) => x.code === "unprintable" && x.row === 1) && !spans(cj.pdf).some((x) => x.text.includes("北")), "characters the font cannot draw → cell blank + warning (no empty boxes on the page)");

// Owner or Operator — one rule, no names.
const { resolveOperator } = await import("../../agent/lib/manifest/leon.mjs");
const none = async () => ({ holders: [], unchecked: [] });
ok((await resolveOperator({ operator: { name: "Any Air", planMode: "pro", isGuest: false } }, { lookup: none })).name === "Any Air", "a real operator account → Leon's operator name, as stored");
const guest = (extra = {}) => ({ operator: { name: "GUEST_ACCT", planMode: "sub_operator", isGuest: true }, acft: { registration: "EC-OMU" }, ...extra });
ok((await resolveOperator(guest({ trip: { quoteRealization: { subcharter: { operator: "Some Carrier S.A." } } } }), { lookup: none })).name === "Some Carrier S.A.", "guest sub-operator + a subcharter record → the subcharter's operator");
ok((await resolveOperator(guest(), { lookup: async () => ({ holders: [{ oprId: "x", name: "Fleet Owner Air" }], unchecked: [] }) })).name === "Fleet Owner Air", "guest sub-operator + exactly one configured operator flying the aircraft → that operator");
const two = await resolveOperator(guest(), { lookup: async () => ({ holders: [{ oprId: "a", name: "A Air" }, { oprId: "b", name: "B Air" }], unchecked: [] }) });
ok(two.name === "" && /more than one/.test(two.note), "two candidate operators → blank + warning naming both (no guess)");
const zero = await resolveOperator(guest(), { lookup: none });
ok(zero.name === "" && /no configured operator's fleet holds EC-OMU/.test(zero.note), "no source → blank + a warning that says why");
const trunc = await gen(flight({ pax: 1, mutate: (c) => { c[0].contact.surname = "X".repeat(60); c[0].contact.name = "Y ".repeat(60); } }));
ok(trunc.result.warnings.some((x) => x.code === "truncated" && x.row === 1), "a name that must be cut → a truncation warning naming the row");
ok(!JSON.stringify(trunc.result).includes("XXXX") && !JSON.stringify(big.result).match(/TEST\d{5}|Example |Testville/), "the result object carries no passenger field");

// ── Rows from our own flight intake record (a flight the intake created; Leon holds only its text list) ──
{ const { passengerTextFor, paxContentHash } = await import("../../agent/lib/intake/leon-people.mjs");
  const people = Array.from({ length: 16 }, (_, i) => ({ list: "pax", leg: null, salutation: i % 2 ? "Mrs." : "Mr.", sex: i % 2 ? "F" : "M", name: `INTAKE${String.fromCharCode(65 + i)} Person`, dob: "05 Mar 1981", nationality: "LATVIA", passport: `TEST${String(i + 1).padStart(5, "0")}`, expiry: "17MAR2031" }));
  const text = passengerTextFor(people, { reference: "RIGREF", paxNumber: 16 }).text;
  const record = (over = {}) => async () => ({ reference: "RIGREF", legIndex: 0, purged: false, passengers: people, crewCount: 4, written: { sha: paxContentHash(text, 16), at: "2026-10-07T00:00:00Z" }, ...over });
  const textFlight = (t = text) => { const f = flight({ pax: 0, crew: 0 }); f.passengerList = { count: 16, realCount: 16, isDataSourceText: true, isDataSourceContact: false, passengerText: t, passengerListAsText: t, passengerContactList: null, fileList: [] }; return f; };
  const genI = (f, intake) => generatePassengerManifest({ flightId: "rig:101", leon: stubLeon(f), lookup: noFleet, intake });
  const g = await genI(textFlight(), record());
  const sp = spans(g.pdf);
  const rows = (pg) => sp.filter((x) => x.page === pg && /^INTAKE[A-P] Person$/.test(x.text)).length;
  ok(g.result.passengerSource.kind === "intake" && g.result.passengerSource.reference === "RIGREF", "Leon has no passenger records → rows from the intake record; the result names it as the source");
  ok(g.result.pageCount === 2 && rows(1) === 14 && rows(2) === 2, "16 intake passengers → 14 rows on page 1, 2 on page 2", `${rows(1)} + ${rows(2)}`);
  ok(sp.filter((x) => x.text === "M").length >= 8 && sp.filter((x) => x.text === "F").length >= 8, "SEX filled from the request's Gender column (M / F)");
  ok(sp.some((x) => x.text === "05-Mar-1981") && sp.some((x) => x.text === "17-Mar-2031"), "request dates (\"05 Mar 1981\", \"17MAR2031\") → DD-Mon-YYYY; no other value changed");
  ok(!sp.some((x) => /^Mrs?\.$/.test(x.text)), "salutation not printed (and never used for sex)");
  ok(!g.result.warnings.some((w) => w.code === "intake-differs-from-leon") && g.paxNote === text, "Leon's list is what the intake wrote → no staleness warning; Leon's list still shown beside the file");
  ok(g.result.crewCount === 4 && g.result.crewSource === "intake" && g.result.personsOnBoard === 20, "no crew assigned in Leon → Number of Crew from the intake record (4), POB 20, with a warning");
  const edited = text.replace("INTAKEC Person", "INTAKEC Person-Renamed");
  const st = await genI(textFlight(edited), record());
  const stRows = spans(st.pdf).filter((x) => /^INTAKE/.test(x.text)).map((x) => x.text);
  ok(st.result.warnings.some((w) => w.code === "intake-differs-from-leon") && stRows.includes("INTAKEC Person") && !stRows.some((t) => /Renamed/.test(t)), "Leon's list edited after loading → a warning; the rows stay the intake record's (nothing merged)");
  const lf = flight({ pax: 3 });
  const pr = await genI(lf, record());
  ok(pr.result.passengerSource.kind === "leon" && pr.result.passengerCount === 3 && pr.result.warnings.some((w) => w.code === "intake-not-used"), "Leon holds structured records → they win over the intake record (which is named as not used)");
  const none = await genI(textFlight(), async () => null);
  ok(none.result.passengerSource.kind === "none" && none.result.passengerCount === 0 && none.result.warnings.some((w) => w.code === "pax-note"), "no Leon records, no intake record → blank rows and the existing warning");
  const purged = await genI(textFlight(), record({ purged: true, passengers: [] }));
  ok(purged.result.passengerCount === 0 && purged.result.warnings.some((w) => w.code === "intake-purged"), "intake record deleted by retention → blank rows, said so");
  ok(!JSON.stringify([g.result, st.result, pr.result]).match(/TEST\d{5}|INTAKE[A-P]|05-Mar-1981|LATVIA/), "the result object still carries no passenger field");
}

// The generator asks the user for nothing: its only input is the flight id (operator credentials come from the registry).
ok(generatePassengerManifest.length === 1 && !/user|token|credential/i.test(String(generatePassengerManifest).split(")")[0]), "generatePassengerManifest takes the flight id only — no user, token or credential parameter");

console.log(failures ? `\n${failures} FAILED` : "\nall passed");
process.exit(failures ? 1 : 0);
