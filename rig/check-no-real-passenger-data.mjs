// No real passenger data under rig/. The rule: a fixture's people are redacted or invented. This opens every email
// (.eml, Outlook .msg, forwards nested inside them), PDF and text file under rig/ and fails on passenger-shaped
// data that carries no redaction mark:
//   · an MRZ line (P<UTO…)
//   · a document number written right after a passport / document label
//   · a file with a passport or date-of-birth label that holds both a real-looking date of birth and a
//     document-shaped number (a GenDec or crew list in table form)
// Redaction marks: the rig's invented series (XX0000…, TEST…, TESTC…, RIG…, ZZ…), "REDACTED", █, the invented towns
// of rig/manifest/fixtures.mjs, and the fixtures' invented date of birth 01 Jan 1980. In source code the "number after
// a passport label" test is skipped (variables like nextPassport); the MRZ and date-of-birth tests still apply.
// Images are not read (no OCR).
// Prints file names and counts only, never a value.
//   node rig/check-no-real-passenger-data.mjs [dir …]        default: rig/      (exit 1 on any finding)
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { unpackEmail } from "../agent/lib/intake/unpack.mjs";

const require = createRequire(new URL("../agent/package.json", import.meta.url));
const { PDFParse } = require("pdf-parse");

const SKIP_DIRS = /^(node_modules|fontenv|icu-tz|upstream-fonts|shots|manifest-shots|ext-shots|\.venv|.*-profile.*|tb-profile.*)$/;
const TEXT_EXT = /\.(json|txt|csv|md|ics|html?|mjs|js|ts|ya?ml|py|sql|log)$/i;
const INVENTED = /^(XX0000|TEST|TESTC|RIG|ZZ)/;
const MARKED = /REDACTED|█|\b(?:Testville|Sampleton|Exampleburg|Mockford|Demotown|Fakesby)\b/;
const CODE = /\.(mjs|js|ts|py)$/i;
const MRZ = /P<[A-Z]{3}[A-Z<]{6,}/g;
const LABELLED = /(?:passport|pass\.?\s*(?:no|nr|number|#)|travel\s+doc\w*|doc(?:ument)?\.?\s*(?:no|nr|number|#)|P\/N)[^A-Za-z0-9\n]{0,40}([A-Z]{0,2}[0-9]{6,9})\b/gi;
const DOC = /\b[A-Z]{0,2}[0-9]{7,9}\b/g;
const DOB = /\b(?:0[1-9]|[12]\d|3[01])[./ -]?(?:0[1-9]|1[0-2]|JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[a-z]*[./ -]?(?:19[2-9]\d|200\d|201[0-2])\b/gi;
const FAKE_DOB = /^01[./ -]?(?:01|JAN)[a-z]*[./ -]?1980$/i;
const LABEL = /passport|date of birth|d\.o\.b|birth\s*date|nationality/i;

function judge(text, code) {
  const why = [];
  const mrz = (text.match(MRZ) ?? []).filter((m) => !/XX0000|TEST|RIG/.test(m));
  if (mrz.length) why.push(`${mrz.length} MRZ line(s)`);
  const labelled = code ? [] : [...text.matchAll(LABELLED)].map((m) => m[1]).filter((t) => !INVENTED.test(t));
  if (labelled.length) why.push(`${labelled.length} labelled document number(s)`);
  if (LABEL.test(text)) {
    const dobs = (text.match(DOB) ?? []).filter((d) => !FAKE_DOB.test(d));
    const docs = (text.match(DOC) ?? []).filter((t) => !INVENTED.test(t));
    if (dobs.length && docs.length) why.push(`${dobs.length} date(s) of birth with ${docs.length} document-shaped number(s)`);
  }
  return why.length && !MARKED.test(text) ? why : [];
}

async function pdfText(buf) {
  const p = new PDFParse({ data: new Uint8Array(buf) });
  try { return String((await p.getText()).text ?? ""); } catch { return ""; } finally { await p.destroy().catch(() => {}); }
}
const isOle = (b) => b.length > 8 && b.readUInt32BE(0) === 0xd0cf11e0;
const isEml = (name, b) => /\.eml$/i.test(name) || /^(Received|Return-Path|From|MIME-Version|Message-ID|Date|Subject|To|Delivered-To):/m.test(b.subarray(0, 2000).toString("latin1"));

// Every readable text in a file, with where it came from (an attachment inside a forward inside an email…).
async function* texts(name, buf, depth = 0) {
  if (depth > 4) return;
  if (/\.pdf$/i.test(name) || buf.subarray(0, 5).toString() === "%PDF-") { yield [name, await pdfText(buf)]; return; }
  if (isOle(buf) || (/\.(eml|msg)$/i.test(name) && isEml(name, buf))) {
    let u = null;
    try { u = await unpackEmail({ content: buf, name, sniffedType: isOle(buf) ? "application/x-ole-storage" : "message/rfc822" }); } catch { /* not an email after all */ }
    if (u) {
      yield [name, `${u.email.subject ?? ""}\n${u.email.text ?? ""}`];
      for (const c of u.children) yield* texts(`${name} › ${c.name}`, c.content, depth + 1);
      return;
    }
  }
  if (TEXT_EXT.test(name) || /\.(eml|msg)$/i.test(name)) yield [name, buf.toString("utf8")];
}

const roots = process.argv.slice(2).length ? process.argv.slice(2) : ["rig"];
const files = [];
const walk = (d) => { for (const f of readdirSync(d)) { const p = path.join(d, f); const s = statSync(p); if (s.isDirectory()) { if (!SKIP_DIRS.test(f)) walk(p); } else if (s.size < 60e6 && (/\.(eml|msg|pdf)$/i.test(f) || TEXT_EXT.test(f))) files.push(p); } };
for (const r of roots) walk(r);

let findings = 0, read = 0;
for (const f of files) {
  if (f === "rig/check-no-real-passenger-data.mjs") continue;   // its own patterns
  for await (const [where, text] of texts(f, readFileSync(f))) {
    read += 1;
    const why = judge(text, CODE.test(where));
    if (why.length) { findings += 1; console.log(`FAIL  ${where}: ${why.join("; ")}`); }
  }
}
console.log(findings ? `\n${findings} FAILED · passenger-shaped data without a redaction mark (${files.length} files, ${read} parts read)` : `PASS  no real passenger data under ${roots.join(", ")} (${files.length} files, ${read} parts read)\nALL PASSED`);
process.exit(findings ? 1 : 0);
