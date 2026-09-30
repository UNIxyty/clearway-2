// Intake file storage: raw MIME and attachments on the large disk, access-controlled, deduplicated.
//
//   <root>/raw/YYYY/MM/DD/<message-uuid>.eml     the message exactly as it arrived (reader, raw view, .eml download)
//   <root>/files/ab/cd/<sha256>                  attachment content, stored ONCE per content hash
//
// Paths are built only from UUIDs, dates and hashes — never a filename, a sender or anything personal.
// Directories are 0700 and files 0600 (owner only); nothing here is served except through the agent's
// authenticated routes. Retention deletes files (see retention.mjs); the DB keeps the row with purged_at.
import { createHash } from "node:crypto";
import { mkdir, writeFile, readFile, stat, rename, unlink, chmod } from "node:fs/promises";
import path from "node:path";

export const intakeRoot = () => path.resolve(String(process.env.INTAKE_ROOT || path.join(process.env.STORAGE_ROOT || "/storage", "intake")));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA = /^[0-9a-f]{64}$/;

export const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

async function ensureDir(dir) { await mkdir(dir, { recursive: true, mode: 0o700 }); }
/** Atomic, owner-only write: temp file then rename, so a crash never leaves half a file under the real key. */
async function writeOwnerOnly(file, buf) {
  await ensureDir(path.dirname(file));
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, buf, { mode: 0o600 });
  await chmod(tmp, 0o600);
  await rename(tmp, file);
}
function inside(key) {
  const root = intakeRoot(); const full = path.resolve(root, key);
  if (!full.startsWith(root + path.sep)) throw new Error("storage key escapes the intake root");
  return full;
}

/** Stores the raw .eml under its message id and receive date. Returns { key, sha256, bytes }. */
export async function putRaw(messageId, receivedAt, buf) {
  if (!UUID.test(messageId)) throw new Error("raw MIME is keyed by the message uuid");
  const d = new Date(receivedAt); if (Number.isNaN(d.getTime())) throw new Error("bad receive date");
  const key = path.posix.join("raw", String(d.getUTCFullYear()), String(d.getUTCMonth() + 1).padStart(2, "0"), String(d.getUTCDate()).padStart(2, "0"), `${messageId}.eml`);
  await writeOwnerOnly(inside(key), buf);
  return { key, sha256: sha256(buf), bytes: buf.length };
}

/** Stores attachment content once per hash. Returns { key, sha256, bytes, deduplicated }. */
export async function putContent(buf) {
  const h = sha256(buf);
  const key = path.posix.join("files", h.slice(0, 2), h.slice(2, 4), h);
  const full = inside(key);
  try { const s = await stat(full); if (s.size === buf.length) return { key, sha256: h, bytes: buf.length, deduplicated: true }; } catch { /* not stored yet */ }
  await writeOwnerOnly(full, buf);
  return { key, sha256: h, bytes: buf.length, deduplicated: false };
}

export async function readKey(key) { return readFile(inside(key)); }
export async function deleteKey(key) { try { await unlink(inside(key)); return true; } catch (e) { if (e.code === "ENOENT") return false; throw e; } }
export const isContentKey = (key) => /^files\/[0-9a-f]{2}\/[0-9a-f]{2}\/[0-9a-f]{64}$/.test(key) && SHA.test(key.slice(-64));

/**
 * The real type, from the bytes. The declared name and Content-Type are the sender's claims and are only shown,
 * never trusted — a GenDec called "invoice.pdf" that is really an Outlook .msg is stored and opened as a .msg.
 */
export function sniff(buf) {
  const b = buf.subarray(0, 16); const hex = b.toString("hex"); const head = buf.subarray(0, 512).toString("latin1");
  if (hex.startsWith("25504446")) return "application/pdf";
  if (hex.startsWith("89504e470d0a1a0a")) return "image/png";
  if (hex.startsWith("ffd8ff")) return "image/jpeg";
  if (hex.startsWith("474946383")) return "image/gif";
  if (hex.startsWith("49492a00") || hex.startsWith("4d4d002a")) return "image/tiff";
  if (hex.startsWith("52494646") && buf.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  if (hex.startsWith("d0cf11e0a1b11ae1")) return "application/x-ole-storage";   // .msg, .doc, .xls
  if (hex.startsWith("504b0304")) {
    const s = buf.subarray(0, Math.min(buf.length, 4096)).toString("latin1");
    if (s.includes("word/")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    if (s.includes("xl/")) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    return "application/zip";
  }
  if (head.startsWith("{\\rtf")) return "application/rtf";
  if (/^(Received|Return-Path|From|MIME-Version|Delivered-To|Message-ID|Date|Subject|X-[\w-]+):/im.test(head.slice(0, 200))) return "message/rfc822";
  // Text if the first 512 bytes are printable UTF-8.
  const sample = buf.subarray(0, 512); let bad = 0; for (const c of sample) if (c < 9 || (c > 13 && c < 32)) bad += 1;
  return bad === 0 ? "text/plain" : "application/octet-stream";
}
