import { mkdir, readFile as fsReadFile, rename, rm, stat, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { resolveSafePath } from "@/lib/utils/path-safety";

export const STORAGE_ROOT = process.env.STORAGE_ROOT || "/storage";
export const CACHE_ROOT = process.env.CACHE_ROOT || "/cache";

export async function ensureDir(dirPath: string): Promise<void> {
  await mkdir(dirPath, { recursive: true });
}

export function storagePathForKey(key: string): string {
  return resolveSafePath(STORAGE_ROOT, key);
}

export async function fileExists(key: string): Promise<boolean> {
  try {
    await stat(storagePathForKey(key));
    return true;
  } catch {
    return false;
  }
}

export async function readFile(key: string): Promise<Buffer | null> {
  try {
    return await fsReadFile(storagePathForKey(key));
  } catch {
    return null;
  }
}

export async function deleteFile(key: string): Promise<void> {
  await rm(storagePathForKey(key), { force: true });
}

export async function saveFile(key: string, buffer: Uint8Array | Buffer | string): Promise<void> {
  const finalPath = storagePathForKey(key);
  const finalDir = path.dirname(finalPath);
  await ensureDir(finalDir);

  // Always stage writes in cache, then atomically move into storage.
  const stagingDir = path.join(CACHE_ROOT, ".staging");
  await ensureDir(stagingDir);
  const tempPath = path.join(stagingDir, `${randomUUID()}.tmp`);
  await writeFile(tempPath, buffer);
  await rename(tempPath, finalPath);
}
