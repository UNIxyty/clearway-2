import path from "path";

const ALLOWED_ROOTS = new Set(["aip", "notam", "weather"]);

function normalizeKey(key: string): string {
  return key.replace(/\\/g, "/").replace(/^\/+/, "").trim();
}

export function assertSafeStorageKey(key: string): string {
  const normalized = normalizeKey(key);
  if (!normalized) {
    throw new Error("Storage key cannot be empty");
  }
  if (path.isAbsolute(normalized) || normalized.includes("..")) {
    throw new Error("Unsafe storage key");
  }

  const root = normalized.split("/")[0]?.toLowerCase() ?? "";
  if (!ALLOWED_ROOTS.has(root)) {
    throw new Error(`Storage key must start with one of: ${Array.from(ALLOWED_ROOTS).join(", ")}`);
  }

  return normalized;
}

export function resolveSafePath(root: string, key: string): string {
  const safeKey = assertSafeStorageKey(key);
  const target = path.resolve(root, safeKey);
  const rootResolved = path.resolve(root);
  if (!target.startsWith(rootResolved + path.sep) && target !== rootResolved) {
    throw new Error("Path traversal detected");
  }
  return target;
}
