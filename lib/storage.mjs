import { mkdir, readFile as fsReadFile, rename, rm, stat, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

export const STORAGE_ROOT = process.env.STORAGE_ROOT || "/storage";
export const CACHE_ROOT = process.env.CACHE_ROOT || "/cache";
const ALLOWED_ROOTS = new Set(["aip", "notam", "weather"]);

function normalizeKey(key) {
  return String(key || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .trim();
}

export function assertSafeStorageKey(key) {
  const normalized = normalizeKey(key);
  if (!normalized) throw new Error("Storage key cannot be empty");
  if (path.isAbsolute(normalized) || normalized.includes("..")) {
    throw new Error("Unsafe storage key");
  }
  const root = normalized.split("/")[0]?.toLowerCase() || "";
  if (!ALLOWED_ROOTS.has(root)) {
    throw new Error(`Storage key must start with one of: ${Array.from(ALLOWED_ROOTS).join(", ")}`);
  }
  return normalized;
}

export function storagePathForKey(key) {
  const safeKey = assertSafeStorageKey(key);
  const target = path.resolve(STORAGE_ROOT, safeKey);
  const root = path.resolve(STORAGE_ROOT);
  if (!target.startsWith(root + path.sep) && target !== root) {
    throw new Error("Path traversal detected");
  }
  return target;
}

export async function ensureDir(dirPath) {
  await mkdir(dirPath, { recursive: true });
}

export async function fileExists(key) {
  try {
    await stat(storagePathForKey(key));
    return true;
  } catch {
    return false;
  }
}

export async function readFile(key) {
  try {
    return await fsReadFile(storagePathForKey(key));
  } catch {
    return null;
  }
}

export async function deleteFile(key) {
  await rm(storagePathForKey(key), { force: true });
}

export async function saveFile(key, buffer) {
  const finalPath = storagePathForKey(key);
  const finalDir = path.dirname(finalPath);
  await ensureDir(finalDir);
  const stagingDir = path.join(CACHE_ROOT, ".staging");
  await ensureDir(stagingDir);
  const tempPath = path.join(stagingDir, `${randomUUID()}.tmp`);
  await writeFile(tempPath, buffer);
  try {
    await rename(tempPath, finalPath);
  } catch (error) {
    // Cross-device rename can fail when /cache and /storage are different mounts.
    if (error?.code !== "EXDEV") throw error;
    const bytes = await fsReadFile(tempPath);
    await writeFile(finalPath, bytes);
    await rm(tempPath, { force: true });
  }
}
