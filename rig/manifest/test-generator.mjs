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
const gen = (f, extra = {}) => generatePassengerManifest({ flightId: "rig:101", user: null, leon: stubLeon(f, extra) });

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
ok(names.join(" / ") === "SPECIMEN Greta / SAMPLE Dmitri / EXAMPLE Alice", `rows in Leon's order, not sorted: ${names.join(" / ")}`);
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
const textOnly = flight({ pax: 0 }); textOnly.passengerList = { count: 4, isDataSourceText: true, passengerContactList: [] };
ok((await w(textOnly)).includes("pax-text-only"), "a free-text passenger list → warning, no invented rows");
ok((await w(flight({ pax: 1, operator: "CWY_CWY" }))).includes("operator"), "aggregator tenant (CWY_CWY) → Owner or Operator blank + warning");
const trunc = await gen(flight({ pax: 1, mutate: (c) => { c[0].contact.surname = "X".repeat(60); c[0].contact.name = "Y ".repeat(60); } }));
ok(trunc.result.warnings.some((x) => x.code === "truncated" && x.row === 1), "a name that must be cut → a truncation warning naming the row");
ok(!JSON.stringify(trunc.result).includes("XXXX") && !JSON.stringify(big.result).match(/TEST\d{5}|EXAMPLE|Testville/), "the result object carries no passenger field");

// Leon access: read-only, refuses mutations at the client.
const { leonForUser } = await import("../../agent/lib/leon-user.mjs");
let refused = false; try { await leonForUser({ userId: "nobody" }, "klj"); } catch (e) { refused = e.code === "not-linked"; }
ok(refused, "no linked Leon account → refused (no fallback credential exists)");

console.log(failures ? `\n${failures} FAILED` : "\nall passed");
process.exit(failures ? 1 : 0);
