// File attachments for wall entries (Item 8 — Important). Bytes live in the
// Supabase Storage bucket (path important-attachments/{entryId}/{attId}/{name})
// when Supabase is configured, else under data/attachments/ — the entry keeps
// only a reference either way, and downloads always stream through the
// auth-gated backend (the bucket path is never handed to the browser).

import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const LOCAL_ROOT = path.resolve(process.cwd(), "data", "attachments");
const BUCKET = process.env.ATTACHMENTS_BUCKET || "storage";
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10 MB

// Ops documents only — the source PDFs/DOCX, sheets, mails, images.
const ALLOWED_EXTENSIONS = new Set([
  ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".csv", ".txt",
  ".png", ".jpg", ".jpeg", ".webp", ".msg", ".eml",
]);

function supabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return { url: url.replace(/\/$/, ""), key };
}

export function sanitizeFilename(name) {
  const base = path.basename(String(name || "file")).replace(/[^\w.\-() ]+/g, "_").slice(0, 120);
  return base || "file";
}

export function validateAttachment({ filename, size }) {
  const ext = path.extname(String(filename || "")).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new Error(`File type ${ext || "(none)"} is not allowed. Allowed: ${[...ALLOWED_EXTENSIONS].join(" ")}`);
  }
  if (!Number.isFinite(size) || size <= 0) throw new Error("Empty file.");
  if (size > MAX_ATTACHMENT_BYTES) {
    throw new Error(`File is ${(size / 1048576).toFixed(1)} MB — the limit is ${MAX_ATTACHMENT_BYTES / 1048576} MB.`);
  }
}

export function newAttachmentId() {
  return `ATT-${crypto.randomBytes(6).toString("hex").toUpperCase()}`;
}

/** Store bytes; returns { storagePath, backend }. */
export async function saveAttachmentBytes({ entryId, attachmentId, filename, contentType, buffer }) {
  const cleanName = sanitizeFilename(filename);
  const relPath = `important-attachments/${entryId}/${attachmentId}/${cleanName}`;
  const env = supabaseEnv();
  if (env) {
    const response = await fetch(`${env.url}/storage/v1/object/${BUCKET}/${relPath}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.key}`,
        apikey: env.key,
        "content-type": contentType || "application/octet-stream",
        "x-upsert": "true",
      },
      body: buffer,
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Attachment upload failed (${response.status}): ${detail.slice(0, 200)}`);
    }
    return { storagePath: relPath, backend: "supabase" };
  }
  const localPath = path.join(LOCAL_ROOT, relPath);
  await fs.mkdir(path.dirname(localPath), { recursive: true });
  await fs.writeFile(localPath, buffer);
  return { storagePath: relPath, backend: "local" };
}

/** Read bytes back; returns Buffer or null. */
export async function readAttachmentBytes(storagePath) {
  const rel = String(storagePath || "");
  if (!rel || rel.includes("..")) return null;
  const env = supabaseEnv();
  if (env) {
    const response = await fetch(`${env.url}/storage/v1/object/${BUCKET}/${rel}`, {
      headers: { authorization: `Bearer ${env.key}`, apikey: env.key },
    });
    if (response.ok) return Buffer.from(await response.arrayBuffer());
    // fall through to local (dev files uploaded before Supabase was set)
  }
  try {
    return await fs.readFile(path.join(LOCAL_ROOT, rel));
  } catch {
    return null;
  }
}

export async function deleteAttachmentBytes(storagePath) {
  const rel = String(storagePath || "");
  if (!rel || rel.includes("..")) return;
  const env = supabaseEnv();
  if (env) {
    await fetch(`${env.url}/storage/v1/object/${BUCKET}/${rel}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${env.key}`, apikey: env.key },
    }).catch(() => {});
  }
  await fs.rm(path.join(LOCAL_ROOT, rel), { force: true }).catch(() => {});
}
