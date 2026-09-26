// Chat attachments (design spec §4.18): what a file the user attached becomes
// in front of the model.
//
// Before this module an upload was STORED but, for every format except plain
// text, never READ: ingest.extractText returned null for PDF, XLSX, DOCX and
// images, and the chat handler put a one-line "(no text could be extracted)"
// into the system prompt instead of the file. The model answered as if the
// file were empty and the chip in the thread looked fine.
//
// Now each kind has one route to the model, chosen at upload time and recorded
// in the attachment's meta.json:
//   text      extracted text (TXT/MD/JSON, CSV, XLSX via `xlsx`, DOCX via
//             `mammoth`, PDFs whose pages all have a text layer) — a text block,
//             truncated with an explicit marker, never silently;
//   image     PNG/JPEG/GIF/WebP as a Bedrock image block — the model sees it;
//   pdf       a PDF with scanned (image-only) pages, sent as a Bedrock document
//             block with citations enabled, which is what makes Claude on
//             Bedrock read the PAGE IMAGES rather than only the text layer —
//             OCR by the answering model, no native OCR dependency;
//   unreadable  the file is kept and the model is told, in so many words,
//             "the attachment X could not be read: <reason>", and the client
//             is sent the same status so the chip shows it failed.
//
// Limits live in agent/config/attachments.json, which the composer imports too.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const ATTACHMENT_LIMITS = JSON.parse(readFileSync(path.resolve(here, "../config/attachments.json"), "utf8"));

const MB = (b) => `${Number((b / 1048576).toFixed(b >= 10 * 1048576 ? 0 : 2))} MB`;
const n = (x) => Number(x).toLocaleString("en-GB");

/** A rejection the upload endpoint turns into a clean 4xx with this message. */
export class AttachmentRejected extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

export function kindForName(name) {
  const ext = String(name).toLowerCase().split(".").pop();
  for (const [kind, spec] of Object.entries(ATTACHMENT_LIMITS.kinds)) if (spec.extensions.includes(ext)) return kind;
  return null;
}

/** Size check the composer mirrors: the limit for THIS file's kind. */
export function assertAcceptable(name, bytes) {
  const kind = kindForName(name);
  if (!kind) {
    const all = Object.values(ATTACHMENT_LIMITS.kinds).flatMap((k) => k.extensions).map((e) => e.toUpperCase()).join(", ");
    throw new AttachmentRejected("unsupported", `${name} can't be attached — the agent reads ${all}.`);
  }
  const spec = ATTACHMENT_LIMITS.kinds[kind];
  const max = Math.min(spec.maxBytes, ATTACHMENT_LIMITS.maxUploadBytes);
  if (bytes > max) throw new AttachmentRejected("too_large", `${name} is ${MB(bytes)} — ${spec.label.toLowerCase()} files can be up to ${MB(max)}${kind === "image" ? " (the most the model accepts for one image)" : ""}.`);
  if (bytes === 0) throw new AttachmentRejected("empty", `${name} is empty.`);
  return kind;
}

// ── Image sniffing: format and pixel size from the header bytes ─────────────
// The extension is not trusted: a .png that is really a JPEG is sent as JPEG,
// and a file that is not an image at all is reported as unreadable here rather
// than as an opaque Bedrock ValidationException mid-reply.
export function sniffImage(buf) {
  if (buf.length >= 24 && buf.readUInt32BE(0) === 0x89504e47) return { format: "png", width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  if (buf.length >= 10 && buf.toString("ascii", 0, 3) === "GIF") return { format: "gif", width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
  if (buf.length >= 30 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    const chunk = buf.toString("ascii", 12, 16);
    if (chunk === "VP8X") return { format: "webp", width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
    if (chunk === "VP8L") { const b = buf.readUInt32LE(21); return { format: "webp", width: 1 + (b & 0x3fff), height: 1 + ((b >> 14) & 0x3fff) }; }
    if (chunk === "VP8 ") return { format: "webp", width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
    return { format: "webp", width: null, height: null };
  }
  if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i += 1; continue; }
      const marker = buf[i + 1];
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { format: "jpeg", width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) };
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
      i += 2 + buf.readUInt16BE(i + 2);
    }
    return { format: "jpeg", width: null, height: null };
  }
  return null;
}

// ── Extraction ───────────────────────────────────────────────────────────────

function looksBinary(text) { return /[\u0000-\u0008\u000E-\u001F]/.test(text.slice(0, 4000)); }

async function pdfText(buffer) {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    const pages = (result.pages ?? []).map((p) => ({ num: p.num, text: String(p.text ?? "") }));
    return { pages, total: result.total ?? pages.length };
  } finally {
    await parser.destroy().catch(() => {});
  }
}

/** A page "has a text layer" when it carries at least this many non-space characters. */
const PAGE_TEXT_MIN = 25;

function pageRanges(nums) {
  const out = []; let start = null; let prev = null;
  for (const x of nums) { if (start === null) { start = prev = x; continue; } if (x === prev + 1) { prev = x; continue; } out.push(start === prev ? `${start}` : `${start}–${prev}`); start = prev = x; }
  if (start !== null) out.push(start === prev ? `${start}` : `${start}–${prev}`);
  return out.join(", ");
}

/**
 * Decide how an uploaded file reaches the model, and extract what can be
 * extracted. Never throws for a file that is merely unreadable: that is a
 * result (`status: "unreadable"`) so the model and the user can be told.
 * Throws AttachmentRejected only for what the upload must refuse outright.
 *
 * Returns { kind, mode: "text"|"image"|"pdf"|"none", status: "read"|"partial"|"unreadable",
 *           reason, note, text, format, pages, width, height }.
 */
export async function extractAttachment(buffer, name) {
  const kind = assertAcceptable(name, buffer.length);
  const ext = String(name).toLowerCase().split(".").pop();
  const unreadable = (reason) => ({ kind, mode: "none", status: "unreadable", reason, note: null, text: null });

  if (kind === "text") {
    const text = buffer.toString("utf8");
    if (looksBinary(text)) return unreadable("it is not a text file (binary content)");
    if (!text.trim()) return unreadable("the file has no text in it");
    return { kind, mode: "text", status: "read", text, format: ext };
  }

  if (kind === "sheet") {
    try {
      const XLSX = (await import("xlsx")).default;
      if (ext === "csv") {
        const text = buffer.toString("utf8");
        if (looksBinary(text)) return unreadable("it is not a CSV text file");
        if (!text.trim()) return unreadable("the file has no rows");
        return { kind, mode: "text", status: "read", text, format: "csv" };
      }
      const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
      const parts = [];
      for (const sheetName of wb.SheetNames) {
        const ws = wb.Sheets[sheetName];
        const ref = ws["!ref"];
        if (!ref) { parts.push(`## Sheet "${sheetName}" (empty)`); continue; }
        const range = XLSX.utils.decode_range(ref);
        const csv = XLSX.utils.sheet_to_csv(ws, { blankrows: false }).replace(/\n+$/, "");
        parts.push(`## Sheet "${sheetName}" (${n(range.e.r - range.s.r + 1)} rows × ${n(range.e.c - range.s.c + 1)} columns, as CSV)\n${csv}`);
      }
      const text = parts.join("\n\n");
      if (!text.replace(/## Sheet .*\n?/g, "").replace(/[,\s]/g, "")) return unreadable("the workbook has no cell values");
      return { kind, mode: "text", status: "read", text, format: "xlsx", note: wb.SheetNames.length > 1 ? `${wb.SheetNames.length} sheets` : null };
    } catch (error) {
      return unreadable(/password|encrypt/i.test(String(error?.message)) ? "the workbook is password-protected" : "it is not a valid Excel workbook");
    }
  }

  if (kind === "docx") {
    try {
      const mammoth = (await import("mammoth")).default;
      const result = await mammoth.extractRawText({ buffer });
      const text = String(result.value ?? "").replace(/\n{3,}/g, "\n\n").trim();
      if (!text) return unreadable("the document has no text (it may contain only images)");
      return { kind, mode: "text", status: "read", text, format: "docx", note: "text only — pictures inside the document are not included" };
    } catch {
      return unreadable("it is not a valid Word (.docx) document");
    }
  }

  if (kind === "image") {
    const img = sniffImage(buffer);
    if (!img) return unreadable("it is not a PNG, JPEG, GIF or WebP image");
    const maxPx = ATTACHMENT_LIMITS.kinds.image.maxPixels;
    if ((img.width ?? 0) > maxPx || (img.height ?? 0) > maxPx) {
      throw new AttachmentRejected("too_large", `${name} is ${img.width} × ${img.height} px — images can be at most ${n(maxPx)} px on each side.`);
    }
    return { kind, mode: "image", status: "read", text: null, format: img.format, width: img.width, height: img.height };
  }

  // PDF
  if (buffer.toString("latin1", 0, 1024).indexOf("%PDF-") === -1) return unreadable("it is not a valid PDF");
  let parsed;
  try { parsed = await pdfText(buffer); } catch (error) {
    const msg = String(error?.message ?? error);
    return unreadable(/password/i.test(msg) ? "the PDF is password-protected" : "the PDF is damaged or could not be parsed");
  }
  const { pages, total } = parsed;
  const text = pages.map((p) => `[Page ${p.num}]\n${p.text.trim()}`).join("\n\n");
  const imageOnly = pages.filter((p) => p.text.replace(/\s/g, "").length < PAGE_TEXT_MIN).map((p) => p.num);
  const spec = ATTACHMENT_LIMITS.kinds.pdf;
  if (imageOnly.length === 0) return { kind, mode: "text", status: "read", text, format: "pdf", pages: total, note: `${total} page${total === 1 ? "" : "s"}, text layer` };

  // Some or all pages are scans. The model reads them itself from the PDF.
  const fitsVisual = buffer.length <= spec.visualMaxBytes && total <= spec.visualMaxPages;
  if (fitsVisual) {
    return { kind, mode: "pdf", status: "read", text: imageOnly.length < total ? text : null, format: "pdf", pages: total,
      note: imageOnly.length === total ? `${total} scanned page${total === 1 ? "" : "s"}, read from the page images` : `${total} pages, ${imageOnly.length} scanned (page${imageOnly.length === 1 ? "" : "s"} ${pageRanges(imageOnly)}), read from the page images` };
  }
  const why = buffer.length > spec.visualMaxBytes ? `over ${MB(spec.visualMaxBytes)}` : `over ${spec.visualMaxPages} pages`;
  if (imageOnly.length === total) {
    // Nothing at all could be read: refuse at upload, where the user can act on it.
    throw new AttachmentRejected("too_large", `${name} is a scanned PDF with no text layer (${n(total)} page${total === 1 ? "" : "s"}, ${MB(buffer.length)}). Scanned PDFs can be read up to ${MB(spec.visualMaxBytes)} and ${spec.visualMaxPages} pages — split it or attach the pages you need.`);
  }
  return { kind, mode: "text", status: "partial", text, format: "pdf", pages: total,
    reason: `page${imageOnly.length === 1 ? "" : "s"} ${pageRanges(imageOnly)} ${imageOnly.length === 1 ? "is a scan" : "are scans"} with no text layer and could not be read (the PDF is ${why}, too big to read the page images)`,
    note: `${total} pages; text layer only` };
}

// ── What the model sees ─────────────────────────────────────────────────────

/** Bedrock document names: alphanumerics, single spaces, hyphens, parentheses, brackets. */
export function bedrockDocName(name, index) {
  const base = String(name).replace(/\.[^.]+$/, "").replace(/[^A-Za-z0-9\-()[\] ]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "attachment";
  return `${base} [${index}]`;
}

/** Cut text to `limit` characters with a marker that says how much was left out. */
export function truncateWithMarker(text, limit) {
  const s = String(text ?? "");
  if (s.length <= limit) return { text: s, omitted: 0 };
  const cut = s.lastIndexOf("\n", limit) > limit * 0.9 ? s.lastIndexOf("\n", limit) : limit;
  const omitted = s.length - cut;
  return {
    text: `${s.slice(0, cut)}\n\n[TRUNCATED: ${n(omitted)} of ${n(s.length)} characters (${Math.round((omitted / s.length) * 100)}%) of this attachment were omitted and are NOT in front of you. Say so if the answer may be in the omitted part, and ask the user which section or page they need.]`,
    omitted,
  };
}

/**
 * Status for the client's chip — added to the upload response and to the
 * message's blocks.attachments entries. Never contains raw errors.
 */
export function publicReadStatus(meta) {
  if (!meta) return { readStatus: "unreadable", readReason: "the file is no longer available" };
  return {
    readStatus: meta.readStatus ?? (meta.hasText ? "read" : "unreadable"),
    readMode: meta.readMode ?? (meta.hasText ? "text" : "none"),
    readReason: meta.readReason ?? null,
    readNote: meta.readNote ?? null,
  };
}

/**
 * Bedrock content blocks for one attachment. `att` is loadAttachment()'s result
 * plus `buffer` for image/pdf modes (or null when it is gone). `budget` tracks
 * per-request caps shared across the whole message list:
 *   { chars, documents, images }  — decremented as blocks are emitted.
 * Returns { blocks, status, reason, truncatedChars }.
 */
export function attachmentBlocks(att, { index, charLimit, budget, earlier = false }) {
  const label = `"${att?.name ?? "attachment"}"`;
  const tell = (reason) => ({
    blocks: [{ text: `ATTACHMENT ${index} — ${label}: the attachment ${label} could not be read: ${reason}. Tell the user plainly that you could not read it; do not guess what it contains.` }],
    status: "unreadable", reason, truncatedChars: 0,
  });
  if (!att || att.missing) return tell(att?.reason ?? "the file is no longer available");
  const status = publicReadStatus(att);
  if (status.readStatus === "unreadable") return tell(status.readReason ?? "no content could be extracted from it");

  const describe = [att.kindLabel ?? null, status.readNote].filter(Boolean).join(", ");
  const head = `ATTACHMENT ${index} — ${label}${describe ? ` (${describe})` : ""}${earlier ? ", attached earlier in this conversation" : ""}.`;
  const partial = status.readStatus === "partial" ? ` PARTLY READ: ${status.readReason}. Tell the user which part you could not read.` : "";

  if (status.readMode === "image" || status.readMode === "pdf") {
    const isImage = status.readMode === "image";
    if (!att.buffer) return tell("the stored file is missing");
    if (isImage ? budget.images <= 0 : budget.documents <= 0) {
      return { blocks: [{ text: `${head} Not re-sent on this turn: the request already carries the most ${isImage ? "images" : "PDF documents"} the model accepts at once. If the question needs it, ask the user to attach it again.` }], status: "omitted", reason: "request limit", truncatedChars: 0 };
    }
    if (isImage) {
      budget.images -= 1;
      return { blocks: [{ text: head + partial }, { image: { format: att.imageFormat ?? "png", source: { bytes: att.buffer } } }], status: status.readStatus, truncatedChars: 0 };
    }
    budget.documents -= 1;
    // Bedrock requires document names unique within one request; the same
    // file can appear on two turns, so the suffix is a per-request counter.
    budget.docSeq = (budget.docSeq ?? 0) + 1;
    return {
      blocks: [
        { text: `${head}${partial} The PDF follows as a document; its scanned pages are read from the page images, so treat anything read from a scan as OCR that may contain errors.` },
        // citations enabled is what makes Claude on Bedrock read the page images
        // of a PDF (visual PDF understanding), not only its text layer.
        { document: { format: "pdf", name: bedrockDocName(att.name, budget.docSeq), source: { bytes: att.buffer }, citations: { enabled: true } } },
      ],
      status: status.readStatus, truncatedChars: 0,
    };
  }

  // Text mode.
  const limit = Math.max(0, Math.min(charLimit, budget.chars));
  if (limit < 500) {
    return { blocks: [{ text: `${head} Not re-sent on this turn: the conversation's attachment text budget is used up. If the question needs it, ask the user to attach it again.` }], status: "omitted", reason: "context budget", truncatedChars: 0 };
  }
  const { text, omitted } = truncateWithMarker(att.text ?? "", limit);
  budget.chars -= text.length;
  return {
    blocks: [{ text: `${head}${partial}${att.textTruncatedAtStore ? ` NOTE: only the first ${n(att.text.length)} characters of this file were kept.` : ""}\n<attachment name=${label}>\n${text}\n</attachment>` }],
    status: status.readStatus, truncatedChars: omitted,
  };
}

export const KIND_LABELS = Object.fromEntries(Object.entries(ATTACHMENT_LIMITS.kinds).map(([k, v]) => [k, v.label]));
