// File generation: PDF, DOCX, XLSX/CSV.
//
// PDF reuses the platform's established approach — HTML laid out with CSS, then
// chromium.pdf() — the same route as scripts/generate-airport-sheets.mjs. No
// new PDF library: the team already knows how to style these, print CSS handles
// page breaks and headers properly, and a second engine would render the same
// document differently from the sheets people already recognise.
//
// One browser is launched per request and closed in a finally. A long-lived
// browser would be faster, but a leaked chromium in an ops container is a slow
// memory problem nobody attributes to the agent for weeks.

import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const STORAGE_ROOT = process.env.STORAGE_ROOT || "/storage";
const OUT_PREFIX = "agent-generated";
const PDF_TIMEOUT_MS = Number(process.env.AGENT_PDF_TIMEOUT_MS || 45_000);

export function generatedPath(storageKey) {
  return path.resolve(STORAGE_ROOT, storageKey);
}

async function persist({ filename, buffer, mime }) {
  const id = randomUUID();
  const safeName = String(filename).replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 120);
  const storageKey = `${OUT_PREFIX}/${id}/${safeName}`;
  const target = generatedPath(storageKey);
  try {
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, buffer);
  } catch (error) {
    throw new Error(
      `Could not write the generated file to ${target}: ${error.code ?? error.message}. ` +
      `STORAGE_ROOT is "${STORAGE_ROOT}" — it must exist and be writable.`
    );
  }
  return {
    id,
    filename: safeName,
    storageKey,
    mime,
    bytes: buffer.length,
    sha256: createHash("sha256").update(buffer).digest("hex"),
    downloadPath: `/agent/api/files/${id}`,
  };
}

// ── PDF ────────────────────────────────────────────────────────────────────

const PDF_CSS = `
  @page { size: A4; margin: 18mm 16mm 20mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Public Sans', -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif; color: #17181c; font-size: 11pt; line-height: 1.5; margin: 0; }
  h1 { font-size: 20pt; font-weight: 800; letter-spacing: -0.02em; margin: 0 0 4pt; }
  h2 { font-size: 10pt; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #9aa0a8; margin: 16pt 0 6pt; }
  p { margin: 0 0 8pt; }
  .meta { font-size: 9.5pt; color: #6c7079; margin-bottom: 14pt; }
  table { width: 100%; border-collapse: collapse; margin: 0 0 10pt; }
  td, th { border: 1px solid #e6e7ea; padding: 5pt 8pt; font-size: 10pt; text-align: left; vertical-align: top; }
  th { background: #fbfbfc; font-weight: 600; color: #6c7079; }
  .mono, pre { font-family: 'IBM Plex Mono', Consolas, monospace; font-size: 9.5pt; background: #f5f6f7; padding: 8pt 10pt; border-radius: 4pt; white-space: pre-wrap; }
  /* The verbatim frame, carried into print. Same rule as everywhere else:
     approved text is quoted exactly and must not resemble the agent's prose. */
  .verbatim { border: 1.5pt solid #17181c; border-radius: 4pt; margin: 0 0 10pt; page-break-inside: avoid; }
  .verbatim .head { background: #17181c; color: #fff; padding: 4pt 8pt; font-size: 8.5pt; font-weight: 800; letter-spacing: 0.1em; }
  .verbatim .body { padding: 7pt 9pt; font-size: 10.5pt; font-weight: 500; white-space: pre-wrap; }
  .verbatim .foot { padding: 0 9pt 6pt; font-size: 8.5pt; color: #6c7079; }
  .callout { background: #fef3e2; border: 1px solid #f6ddb0; color: #92400e; padding: 7pt 9pt; border-radius: 4pt; font-size: 10pt; margin: 0 0 10pt; }
  .footer { position: fixed; bottom: -12mm; left: 0; right: 0; font-size: 8pt; color: #9aa0a8; border-top: 1px solid #e6e7ea; padding-top: 4pt; }
`;

function esc(v) {
  return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Document blocks → print HTML. Deliberately the same vocabulary as the email. */
export function blocksToPrintHtml({ title, subtitle, blocks = [], footer }) {
  const body = blocks.map((b) => {
    switch (b.type) {
      case "heading": return `<h1>${esc(b.text)}</h1>`;
      case "section": return `<h2>${esc(b.title)}</h2><p>${esc(b.text)}</p>`;
      case "paragraph": return `<p>${esc(b.text)}</p>`;
      case "table": {
        const rows = (b.rows ?? []).map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join("");
        return `${b.title ? `<h2>${esc(b.title)}</h2>` : ""}<table>${rows}</table>`;
      }
      case "mono": return `${b.title ? `<h2>${esc(b.title)}</h2>` : ""}<pre class="mono">${esc(b.text)}</pre>`;
      case "verbatim":
        return `<div class="verbatim"><div class="head">VERBATIM · APPROVED TEXT${b.reference ? ` · ${esc(b.reference)}` : ""}</div>` +
          `<div class="body">${esc(b.text)}</div>${b.by ? `<div class="foot">${esc(b.by)}</div>` : ""}</div>`;
      case "callout": return `<div class="callout">${b.title ? `<strong>${esc(b.title)}</strong> ` : ""}${esc(b.text)}</div>`;
      default: return "";
    }
  }).join("\n");

  return `<!DOCTYPE html><html><head><meta charset="utf-8">` +
    `<link href="https://fonts.googleapis.com/css2?family=Public+Sans:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">` +
    `<style>${PDF_CSS}</style></head><body>` +
    `<h1>${esc(title)}</h1>` +
    (subtitle ? `<div class="meta">${esc(subtitle)}</div>` : "") +
    body +
    `<div class="footer">${esc(footer ?? "Generated by the Clearway Ops Agent. Check operational content against the source before use.")}</div>` +
    `</body></html>`;
}

export async function generatePdf({ filename, title, subtitle, blocks, footer }) {
  // Imported lazily so a container without chromium still starts and serves
  // every other route — a missing browser should break PDF generation, not the
  // whole agent.
  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch (error) {
    throw new Error(`PDF generation needs Playwright, which is not installed in this image: ${error.message}`);
  }

  const html = blocksToPrintHtml({ title, subtitle, blocks, footer });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    // 'load' not 'networkidle': the Google Fonts link must not hang generation
    // when the container has no egress. The fallback stack is deliberate.
    await page.setContent(html, { waitUntil: "load", timeout: PDF_TIMEOUT_MS });
    const pdf = await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true });
    return persist({ filename: filename.endsWith(".pdf") ? filename : `${filename}.pdf`, buffer: Buffer.from(pdf), mime: "application/pdf" });
  } finally {
    await browser.close();
  }
}

// ── CSV ────────────────────────────────────────────────────────────────────

export async function generateCsv({ filename, columns, rows }) {
  const cell = (v) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [columns.map(cell).join(","), ...rows.map((r) => r.map(cell).join(","))];
  // BOM so Excel opens UTF-8 correctly — without it, ICAO names with diacritics
  // arrive mangled and people assume the data is wrong.
  const buffer = Buffer.from("﻿" + lines.join("\r\n"), "utf8");
  return persist({ filename: filename.endsWith(".csv") ? filename : `${filename}.csv`, buffer, mime: "text/csv; charset=utf-8" });
}

// ── XLSX ───────────────────────────────────────────────────────────────────

/**
 * A minimal but genuine .xlsx — a zip of the handful of XML parts Excel needs.
 * Writing it directly avoids adding a spreadsheet dependency for what is, in
 * practice, one sheet of strings.
 */
export async function generateXlsx({ filename, sheetName = "Sheet1", columns, rows }) {
  const { default: zlib } = await import("node:zlib");
  const all = [columns, ...rows];
  const escXml = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const colRef = (i) => {
    let s = "", n = i + 1;
    while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
    return s;
  };
  const sheetRows = all.map((row, r) =>
    `<row r="${r + 1}">` + row.map((cell, c) =>
      `<c r="${colRef(c)}${r + 1}" t="inlineStr"><is><t xml:space="preserve">${escXml(cell)}</t></is></c>`
    ).join("") + `</row>`
  ).join("");

  const parts = {
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${escXml(sheetName).slice(0, 31)}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
    "xl/worksheets/sheet1.xml": `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`,
  };

  const buffer = zipStore(parts, zlib);
  return persist({
    filename: filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`,
    buffer,
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

/** Minimal ZIP writer (deflate), enough for the OOXML parts above. */
function zipStore(files, zlib) {
  const entries = [];
  const chunks = [];
  let offset = 0;

  const crcTable = (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c;
    }
    return t;
  })();
  const crc32 = (buf) => {
    let c = -1;
    for (let i = 0; i < buf.length; i += 1) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  };

  for (const [name, content] of Object.entries(files)) {
    const data = Buffer.from(content, "utf8");
    const deflated = zlib.deflateRawSync(data);
    const nameBuf = Buffer.from(name, "utf8");
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0, 6);
    local.writeUInt16LE(8, 8); local.writeUInt16LE(0, 10); local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(deflated.length, 18);
    local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nameBuf.length, 26); local.writeUInt16LE(0, 28);

    chunks.push(local, nameBuf, deflated);
    entries.push({ name: nameBuf, crc, comp: deflated.length, raw: data.length, offset });
    offset += local.length + nameBuf.length + deflated.length;
  }

  const centralStart = offset;
  for (const e of entries) {
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8); central.writeUInt16LE(8, 10); central.writeUInt16LE(0, 12); central.writeUInt16LE(0, 14);
    central.writeUInt32LE(e.crc, 16); central.writeUInt32LE(e.comp, 20); central.writeUInt32LE(e.raw, 24);
    central.writeUInt16LE(e.name.length, 28); central.writeUInt16LE(0, 30); central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34); central.writeUInt16LE(0, 36); central.writeUInt32LE(0, 38);
    central.writeUInt32LE(e.offset, 42);
    chunks.push(central, e.name);
    offset += central.length + e.name.length;
  }

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(0, 4); end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(offset - centralStart, 12); end.writeUInt32LE(centralStart, 16); end.writeUInt16LE(0, 20);
  chunks.push(end);

  return Buffer.concat(chunks);
}

// ── DOCX ───────────────────────────────────────────────────────────────────

export async function generateDocx({ filename, title, blocks = [] }) {
  const { default: zlib } = await import("node:zlib");
  const escXml = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const para = (text, { bold = false, size = 22, mono = false } = {}) =>
    `<w:p><w:pPr><w:spacing w:after="120"/></w:pPr><w:r><w:rPr>${bold ? "<w:b/>" : ""}<w:sz w:val="${size}"/>${mono ? '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/>' : ""}</w:rPr><w:t xml:space="preserve">${escXml(text)}</w:t></w:r></w:p>`;

  const body = [para(title, { bold: true, size: 36 })];
  for (const b of blocks) {
    if (b.type === "heading") body.push(para(b.text, { bold: true, size: 30 }));
    else if (b.type === "section") { body.push(para(b.title, { bold: true, size: 22 })); body.push(para(b.text)); }
    else if (b.type === "paragraph") body.push(para(b.text));
    else if (b.type === "mono") { if (b.title) body.push(para(b.title, { bold: true })); body.push(para(b.text, { mono: true, size: 18 })); }
    else if (b.type === "table") { for (const [k, v] of b.rows ?? []) body.push(para(`${k}: ${v}`)); }
    else if (b.type === "verbatim") {
      body.push(para(`VERBATIM — APPROVED TEXT${b.reference ? ` (${b.reference})` : ""}`, { bold: true, size: 18 }));
      body.push(para(b.text, { size: 22 }));
      if (b.by) body.push(para(b.by, { size: 18 }));
    } else if (b.type === "callout") body.push(para(`! ${b.title ?? ""} ${b.text}`, { bold: true }));
  }

  const parts = {
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
    "word/document.xml": `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body.join("")}</w:body></w:document>`,
  };
  return persist({
    filename: filename.endsWith(".docx") ? filename : `${filename}.docx`,
    buffer: zipStore(parts, zlib),
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}
