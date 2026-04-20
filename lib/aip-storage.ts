import { readFile, saveFile, fileExists, deleteFile } from "@/lib/storage";

export async function readJsonFromStorage<T>(key: string): Promise<T | null> {
  try {
    const bytes = await readFile(key);
    if (!bytes) return null;
    return JSON.parse(bytes.toString("utf8")) as T;
  } catch {
    return null;
  }
}

export async function writeJsonToStorage(key: string, value: unknown): Promise<void> {
  await saveFile(key, Buffer.from(JSON.stringify(value), "utf8"));
}

export async function readPdfFromStorage(key: string): Promise<Uint8Array | null> {
  const bytes = await readFile(key);
  if (!bytes) return null;
  return new Uint8Array(bytes);
}

export async function storageObjectExists(key: string): Promise<boolean> {
  return fileExists(key);
}

export async function removeFromStorage(key: string): Promise<void> {
  await deleteFile(key);
}
