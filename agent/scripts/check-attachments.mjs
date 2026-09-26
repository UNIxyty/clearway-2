// Attachment read check (design spec §4.18): builds a sample of every
// attachable kind, runs each through the SAME code the chat uses
// (storeAttachment -> loadAttachment -> attachmentBlocks) and prints what the
// model would be sent — block types and the first characters.
//
//   node agent/scripts/check-attachments.mjs            # extraction only, no network
//   node --env-file=.env agent/scripts/check-attachments.mjs --bedrock
//                                                       # + ONE small Bedrock call proving
//                                                       #   the model reads a scanned PDF and an image
//
// Needs playwright's chromium (the agent image has it) to make the PDFs/PNGs.
// Writes only under a temp STORAGE_ROOT.

import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = await mkdtemp(path.join(os.tmpdir(), "cw-attach-"));
process.env.STORAGE_ROOT = root;

const { chromium } = await import("playwright");
const XLSX = (await import("xlsx")).default;
const { storeAttachment, loadAttachment } = await import("../lib/views.mjs");
const { attachmentBlocks, ATTACHMENT_LIMITS, AttachmentRejected } = await import("../lib/attachments.mjs");
const { generateDocx, generatedPath } = await import("../lib/files/generate.mjs");
const { readFile } = await import("node:fs/promises");

const user = { userId: "check-script", email: "check@local" };
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 500 } });

const notice = `<div style="font:28px Arial;padding:40px;line-height:1.5"><h1 style="font-size:40px">NOTAM A1234/26 EVRA</h1><p>RWY 18/36 CLOSED DUE TO WIP 0600-1400 UTC. TWY B AVBL.</p><p>Stand 14 flap damage reported, inspection 1430Z.</p></div>`;
await page.setContent(notice);
const png = await page.screenshot({ type: "png" });
// Text-layer PDF: real text rendered by chromium.
await page.setContent(`${notice}<div style="page-break-before:always;font:16px Arial;padding:40px">Page two: fuel uplift 12.4 t, ZFW 61.2 t, captain J. Ozols.</div>`);
const textPdf = await page.pdf({ format: "A4" });
// Image-only PDF: the same notice as a picture, so the PDF has no text layer (a "scan").
await page.setContent(`<img src="data:image/png;base64,${png.toString("base64")}" style="width:100%">`);
const scannedPdf = await page.pdf({ format: "A4" });
// Mixed: a text page followed by a scanned page.
await page.setContent(`<div style="font:16px Arial;padding:40px">Cover page: EVRA station bulletin, issued 26 SEP 2026 by the duty manager.</div><div style="break-before:page"><img src="data:image/png;base64,${png.toString("base64")}" style="width:100%"></div>`);
const mixedPdf = await page.pdf({ format: "A4" });
await browser.close();

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Flight", "Reg", "STD", "Fuel t"], ["BT301", "YL-ABC", "06:40", 12.4], ["BT655", "YL-ABD", "07:15", 9.8]]), "Roster");
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Crew", "Role"], ["J. Ozols", "CPT"]]), "Crew");
const xlsx = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
const docxFile = await generateDocx({ filename: "brief", title: "Crew briefing EVRA", blocks: [{ type: "paragraph", text: "De-icing expected from 0500Z. Use stand 14 only after inspection." }] });
const docx = await readFile(generatedPath(docxFile.storageKey));
const longText = Array.from({ length: 4000 }, (_, i) => `Line ${i + 1}: METAR EVRA 261250Z 24012KT 9999 FEW030 12/06 Q1012 NOSIG`).join("\n");

const samples = [
  ["notice-text.pdf", textPdf],
  ["notice-scanned.pdf", scannedPdf],
  ["bulletin-mixed.pdf", mixedPdf],
  ["brief.docx", docx],
  ["roster.xlsx", xlsx],
  ["roster.csv", Buffer.from("Flight,Reg,STD\nBT301,YL-ABC,06:40\nBT655,YL-ABD,07:15\n")],
  ["stand14.png", png],
  ["note.txt", Buffer.from("Handover: GPU at stand 14 unserviceable, use stand 16.")],
  ["metar-dump.txt", Buffer.from(longText)],
  // Failure paths: each must SAY it could not be read (or be refused at upload).
  ["broken.docx", Buffer.from("this is not a zip")],
  ["fake.png", Buffer.from("definitely not an image")],
  ["huge.png", Buffer.concat([png, Buffer.alloc(ATTACHMENT_LIMITS.kinds.image.maxBytes)])],
  ["macro.exe", Buffer.from("MZ")],
];

const show = (b) => {
  if (b.text != null) return `text      ${JSON.stringify(b.text.slice(0, 150))}${b.text.length > 150 ? ` … (${b.text.length} chars)` : ""}${/\[TRUNCATED:/.test(b.text) ? `\n              … ${JSON.stringify(b.text.slice(b.text.indexOf("[TRUNCATED:"), b.text.indexOf("[TRUNCATED:") + 120))}` : ""}`;
  if (b.image) return `image     format=${b.image.format} bytes=${b.image.source.bytes.length}`;
  if (b.document) return `document  format=${b.document.format} name=${JSON.stringify(b.document.name)} bytes=${b.document.source.bytes.length} citations=${b.document.citations?.enabled}`;
  return JSON.stringify(b).slice(0, 120);
};

const loaded = {};
for (const [name, buffer] of samples) {
  console.log(`\n=== ${name} (${buffer.length.toLocaleString("en-GB")} bytes)`);
  try {
    const meta = await storeAttachment({ name, buffer, mime: null, user });
    console.log(`  upload: ok  readStatus=${meta.readStatus} readMode=${meta.readMode}${meta.readNote ? ` note="${meta.readNote}"` : ""}${meta.readReason ? ` reason="${meta.readReason}"` : ""}`);
    const att = await loadAttachment(meta.id, user, { withBytes: true });
    loaded[name] = att;
    const budget = { chars: ATTACHMENT_LIMITS.modelChars * 3, documents: 5, images: 20 };
    const r = attachmentBlocks(att, { index: 1, charLimit: ATTACHMENT_LIMITS.modelChars, budget });
    console.log(`  model gets (${r.status}${r.truncatedChars ? `, ${r.truncatedChars} chars truncated` : ""}):`);
    for (const b of r.blocks) console.log(`    ${show(b)}`);
  } catch (error) {
    if (error instanceof AttachmentRejected) console.log(`  upload: REFUSED (${error.code}) — "${error.message}"`);
    else { console.log(`  upload: CRASH ${error?.stack || error}`); process.exitCode = 1; }
  }
}

// An attachment uploaded BEFORE files were read (meta.json without readStatus)
// must be read on first use, not reported unreadable for its age.
{
  const meta = await storeAttachment({ name: "legacy-scan.pdf", buffer: scannedPdf, mime: null, user });
  const dir = path.join(root, "attachments", meta.id);
  const { id, name, mime, bytes, sha256, userId, uploadedAt } = meta;
  await writeFile(path.join(dir, "meta.json"), JSON.stringify({ id, name, mime, bytes, sha256, userId, uploadedAt, hasText: false, chars: 0 }));
  const att = await loadAttachment(id, user, { withBytes: true });
  const r = attachmentBlocks(att, { index: 1, charLimit: 1000, budget: { chars: 1000, documents: 5, images: 20 } });
  console.log(`\n=== legacy meta (pre-change upload): readStatus=${att.readStatus} readMode=${att.readMode} -> ${r.blocks.map((b) => Object.keys(b)[0]).join(" + ")}`);
}

if (process.argv.includes("--bedrock")) {
  // One small call: the scanned PDF and the PNG, as the chat would send them.
  const { converseOnce } = await import("../lib/bedrock.mjs");
  const budget = { chars: 10_000, documents: 5, images: 20 };
  const content = [
    ...attachmentBlocks(loaded["notice-scanned.pdf"], { index: 1, charLimit: 10_000, budget }).blocks,
    ...attachmentBlocks(loaded["stand14.png"], { index: 2, charLimit: 10_000, budget }).blocks,
    { text: "For each attachment, quote the NOTAM number and the runway it closes, in one line each. Nothing else." },
  ];
  const started = Date.now();
  const r = await converseOnce({ tier: "fast", messages: [{ role: "user", content }], maxTokens: 120 });
  console.log(`\n=== Bedrock (${r.modelId ?? "fast tier"}, ${Date.now() - started} ms, in=${r.inputTokens} out=${r.outputTokens})\n${r.text}`);
}

await writeFile(path.join(root, "DONE"), "");
console.log(`\n(temp storage: ${root})`);
