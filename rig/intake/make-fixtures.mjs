// Turns the two sample .msg files into redacted .eml fixtures for the intake pipeline.
//
//   node rig/intake/make-fixtures.mjs "<path to YU-LSA .msg>" "<path to SP-OVO .msg>"
//
// Redaction (the fixtures are committed): every crew/pax name, date of birth, place of birth, passport
// number and expiry is replaced with an obviously synthetic value; person names in signatures, personal
// e-mail local parts and phone numbers are replaced too. The GenDec PDFs are REBUILT from their redacted
// text, so no original byte of them survives. The script then re-reads every output (all MIME parts and the
// PDF text) and fails if any original personal token is still present. It prints counts, never values.
//
// It also writes a "+364 days" copy of each (same weekdays, same DST season) for the end-to-end Leon send:
// the real sample flights already exist in cwy-cwy, so sending the originals would (correctly) stop as a
// duplicate. The shifted copies get their own Message-ID.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(path.resolve("agent/package.json"));
const MsgReaderMod = require("@kenjiuno/msgreader");
const MsgReader = MsgReaderMod.default ?? MsgReaderMod;
const { simpleParser } = require("mailparser");
const rootRequire = createRequire(path.resolve("package.json"));
const { PDFDocument, StandardFonts } = rootRequire("pdf-lib");
import { extractAttachment } from "../../agent/lib/attachments.mjs";
const pdfText = async (buf) => String((await extractAttachment(buf, "x.pdf")).text ?? "").replace(/^\[Page \d+\]$/gm, "");

const OUT = path.resolve("rig/fixtures/intake");
mkdirSync(OUT, { recursive: true });
const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const PSEUDO = [["Marko", "Petrovic"], ["Nikola", "Jovanovic"], ["Ana", "Markovic"], ["Luka", "Ilic"], ["Mila", "Stojanovic"]];

function collectPersonal(plain, senderName) {
  const map = new Map(); const originals = new Set(); let i = 0;
  // Crew / pax rows in the body: n <TAB> title <TAB> name <TAB> M/F <TAB> DOB (age) <TAB> nationality <TAB> passport, country <TAB> expiry
  for (const line of plain.split(/\r?\n/)) {
    const m = /^\s*\d+\s+(Mr\.|Mrs\.|Ms\.|Miss)\s+([^\t]+?)\s+\t?([MF])\s+(\d{2} [A-Z][a-z]{2} \d{4}) \((\d+)\)\s+([^\t]+?)\s+([A-Z0-9]{5,14}), ([^\t]+?)\s+(\d{2} [A-Z][a-z]{2} \d{4})/.exec(line);
    if (!m) continue;
    const [first, last] = PSEUDO[i % PSEUDO.length]; i += 1;
    const full = m[2].trim(); const parts = full.split(/\s+/);
    map.set(full, `${first} ${last}`); originals.add(full);
    map.set(`${parts[parts.length - 1]}, ${parts.slice(0, -1).join(" ")}`, `${last}, ${first}`); originals.add(`${parts[parts.length - 1]}, ${parts.slice(0, -1).join(" ")}`);
    for (const p of parts) if (p.length > 2) originals.add(p);
    map.set(`${m[4]} (${m[5]})`, `01 Jan 1980 (46)`); originals.add(m[4]);
    map.set(m[7], `XX000000${i}`); originals.add(m[7]);
    map.set(m[9], `01 Jan 2030`); originals.add(m[9]);
  }
  if (senderName) { map.set(senderName, "A. Dispatcher"); originals.add(senderName); }
  return { map, originals };
}
function applyMap(s, map) { let out = String(s ?? ""); for (const [a, b] of [...map.entries()].sort((x, y) => y[0].length - x[0].length)) out = out.split(a).join(b); return out; }
function scrubContacts(s) {
  const seen = new Map(); const generic = ["dispatch", "ops", "occ", "billing", "info"];
  return String(s)
    .replace(/([A-Za-z0-9._%+-]+)@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g, (all, local, dom) => {
      if (/^(ops|dispatch|handling|info|occ|billing|operations)$/i.test(local)) return all;
      const k = `${local}@${dom}`.toLowerCase(); if (!seen.has(k)) seen.set(k, `${generic[seen.size % generic.length]}${seen.size >= generic.length ? seen.size : ""}@${dom}`);
      return seen.get(k);
    })
    .replace(/(?:\+|&#43;|&#x2b;|%2B)\s?\d[\d\s().-]{6,}\d/gi, "+000 00 000 0000")
    .replace(/(tel:)\s*\d[\d\s().-]{6,}\d/gi, "$1+000000000000")
    .replace(/(Phone|Fax|Tel|OCC \(24\/7\):)(\s*)\d[\d\s().-]{6,}\d/gi, "$1$2+000 00 000 0000");
}
function shiftDates(s) {
  const add = (y, mo, d) => { const t = new Date(Date.UTC(y, mo, d) + 364 * 86400000); return t; };
  return String(s)
    .replace(/\b(\d{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) 2026\b/g, (a, d, m) => { const t = add(2026, MON.indexOf(m), +d); return `${String(t.getUTCDate()).padStart(d.length, "0")} ${MON[t.getUTCMonth()]} ${t.getUTCFullYear()}`; })
    .replace(/\b(\d{2})(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)2026\b/g, (a, d, m) => { const t = add(2026, MON.map((x) => x.toUpperCase()).indexOf(m), +d); return `${String(t.getUTCDate()).padStart(2, "0")}${MON[t.getUTCMonth()].toUpperCase()}${t.getUTCFullYear()}`; })
    .replace(/(\/\/ )(\d{2})(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)( \/\/)/g, (a, p, d, m, q) => { const t = add(2026, MON.map((x) => x.toUpperCase()).indexOf(m), +d); return `${p}${String(t.getUTCDate()).padStart(2, "0")}${MON[t.getUTCMonth()].toUpperCase()}${q}`; })
    .replace(/\b2026(\d{2})(\d{2})\b/g, (a, mo, d) => { const t = add(2026, +mo - 1, +d); return `${t.getUTCFullYear()}${String(t.getUTCMonth() + 1).padStart(2, "0")}${String(t.getUTCDate()).padStart(2, "0")}`; })
    .replace(/\b(\d{2})\.(\d{2})\.2026\b/g, (a, d, mo) => { const t = add(2026, +mo - 1, +d); return `${String(t.getUTCDate()).padStart(2, "0")}.${String(t.getUTCMonth() + 1).padStart(2, "0")}.${t.getUTCFullYear()}`; });
}

async function rebuildPdf(buf, map, shift) {
  const text = await pdfText(buf);
  let lines = text.split(/\r?\n/).map((l) => applyMap(l, map));
  // Rows that still carry a DOB / place of birth / passport in the GenDec's own layout.
  lines = lines.map((l) => /^\d+\s+[^,]+,\s+\S/.test(l) && /\d/.test(l)
    ? l.replace(/\b\d{1,2}[ .\/-](?:\d{1,2}|[A-Za-z]{3})[ .\/-]\d{2,4}\b/g, (d, off) => (off < l.length / 2 ? "01 Jan 1980" : "01 Jan 2030")).replace(/\b(?=[A-Z0-9]*\d{4})[A-Z0-9]{6,14}\b/g, "XX0000000").replace(/(PIC|SIC|Cabin Attendant|[MF])\s+(01 Jan 1980)\s+([A-Z][a-zA-Z-]+)\s/, "$1 $2 [place removed] ")
    : l);
  if (shift) lines = lines.map(shiftDates);
  const doc = await PDFDocument.create(); const font = await doc.embedFont(StandardFonts.Helvetica);
  let page = doc.addPage([595, 842]); let y = 800;
  for (const raw of lines) {
    const l = raw.replace(/[^\x20-\x7E°—–]/g, " ").replace(/[—–]/g, "-").replace(/°/g, " deg");
    for (let i = 0; i < Math.max(1, Math.ceil(l.length / 110)); i += 1) {
      if (y < 40) { page = doc.addPage([595, 842]); y = 800; }
      page.drawText(l.slice(i * 110, (i + 1) * 110), { x: 36, y, size: 8, font }); y -= 11;
    }
  }
  doc.setTitle("General Declaration (redacted fixture)"); doc.setProducer("clearway rig fixtures"); doc.setCreator("clearway rig fixtures");
  return Buffer.from(await doc.save());
}

const b64 = (buf) => Buffer.from(buf).toString("base64").replace(/.{76}/g, "$&\r\n");
const encWord = (s) => (/^[\x20-\x7E]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s).toString("base64")}?=`);
function buildEml({ headers, subject, text, html, attachments, messageId }) {
  const B1 = "=_mixed_" + Math.abs(hash(subject)).toString(36), B2 = "=_alt_" + Math.abs(hash(text)).toString(36);
  const keep = headers.filter((h) => !/^(content-type|content-transfer-encoding|mime-version|subject|message-id|x-ms-|thread-|content-language|dkim-signature|arc-)/i.test(h.name));
  let out = keep.map((h) => `${h.name}: ${h.value}`).join("\r\n") + "\r\n";
  out += `Subject: ${encWord(subject)}\r\nMessage-ID: ${messageId}\r\nMIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary="${B1}"\r\n\r\n`;
  out += `--${B1}\r\nContent-Type: multipart/alternative; boundary="${B2}"\r\n\r\n`;
  out += `--${B2}\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${b64(Buffer.from(text))}\r\n`;
  if (html) out += `--${B2}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${b64(Buffer.from(html))}\r\n`;
  out += `--${B2}--\r\n`;
  for (const a of attachments) {
    out += `--${B1}\r\nContent-Type: ${a.type}; name="${a.name}"\r\nContent-Disposition: ${a.inline ? "inline" : "attachment"}; filename="${a.name}"\r\n${a.cid ? `Content-ID: <${a.cid}>\r\n` : ""}Content-Transfer-Encoding: base64\r\n\r\n${b64(a.content)}\r\n`;
  }
  return out + `--${B1}--\r\n`;
}
function hash(s) { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0; return h; }

async function convert(file, slug) {
  const r = new MsgReader(readFileSync(file)); const d = r.getFileData();
  const html0 = d.bodyHtml ?? (d.html ? Buffer.from(d.html).toString("utf8") : "");
  const { map, originals } = collectPersonal(d.body ?? "", d.senderName);
  const headers = String(d.headers ?? "").replace(/\r?\n[ \t]+/g, " ").split(/\r?\n/).map((l) => { const i = l.indexOf(":"); return i > 0 ? { name: l.slice(0, i), value: l.slice(i + 1).trim() } : null; }).filter(Boolean);
  const origEmails = new Set([...(String(d.headers) + (d.body ?? "") + html0).matchAll(/([A-Za-z0-9._%+-]+)@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g)].map((m) => m[1]).filter((l) => !/^(ops|dispatch|handling|info|occ|billing|operations)$/i.test(l) && l.length > 3 && !/^[0-9A-F]{16,}$/i.test(l) && !/^part\d/.test(l)));
  const origPhones = new Set([...((d.body ?? "") + html0).matchAll(/\+\s?\d[\d\s().-]{6,}\d/g)].map((m) => m[0].replace(/\D/g, "")).filter((p) => p.length >= 8));
  const red = (s) => scrubContacts(applyMap(s, map));
  const atts = [];
  for (const a of d.attachments ?? []) {
    const x = r.getAttachment(a); let content = Buffer.from(x.content);
    const isPdf = content.subarray(0, 4).toString("latin1") === "%PDF";
    atts.push({ name: a.fileName, type: a.attachMimeTag || (isPdf ? "application/pdf" : "application/octet-stream"), inline: !!a.attachmentHidden, cid: a.pidContentId || null, content, isPdf });
  }
  const results = [];
  for (const shift of [false, true]) {
    const S = (s) => (shift ? shiftDates(s) : s);
    const hdrs = headers.map((h) => ({ name: h.name, value: h.name.toLowerCase() === "date" && shift ? new Date(Date.parse(h.value) + 364 * 86400000).toUTCString().replace("GMT", "+0000") : S(red(h.value)) }));
    const outAtts = [];
    for (const a of atts) outAtts.push({ ...a, name: S(a.name), content: a.isPdf ? await rebuildPdf(a.content, map, shift) : a.content });
    const mid = `<fixture-${slug}${shift ? "-plus364" : ""}@clearway-rig.invalid>`;
    const eml = buildEml({ headers: hdrs, subject: S(red(d.subject)), text: S(red(d.body)), html: S(red(html0)), attachments: outAtts, messageId: mid });
    const name = `${slug}${shift ? "-plus364" : ""}.eml`; writeFileSync(path.join(OUT, name), eml);
    // Verify: re-parse and look for any original personal token in every part, including PDF text.
    const parsed = await simpleParser(Buffer.from(eml));
    let hay = [eml, parsed.text, parsed.html, parsed.subject].join("\n");
    for (const p of parsed.attachments) if (p.content.subarray(0, 4).toString("latin1") === "%PDF") hay += "\n" + (await pdfText(p.content));
    const leftTokens = [...originals].filter((t) => t.length > 2 && hay.includes(t)).length;
    const leftEmails = [...origEmails].filter((l) => hay.includes(l + "@")).length;
    const digits = hay.replace(/\D/g, "");
    const leftPhones = [...origPhones].filter((p) => digits.includes(p)).length;
    results.push({ file: name, bytes: eml.length, attachments: outAtts.length, personalTokens: originals.size, leftTokens, leftEmails, leftPhones });
  }
  return results;
}

const [a, b] = process.argv.slice(2);
const res = [...(await convert(a, "yulsa-cimog1")), ...(await convert(b, "amq5v-lybe"))];
console.table(res);
if (res.some((x) => x.leftTokens || x.leftEmails || x.leftPhones)) { console.error("REDACTION FAILED: an original personal token survived"); process.exit(1); }
