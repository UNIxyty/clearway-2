import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { STORAGE_ROOT } from "@/lib/storage";
import { rm, readdir, stat } from "fs/promises";
import path from "path";

// Directories to wipe. All are auto-synced and will re-populate on next sync.
// Intentionally excludes aip/usa-pdf and aip/usa-gen-pdf (manually uploaded static files)
// and aip/ead-aip-extracted.json (global EAD index, not per-airport).
const CACHE_DIRS = [
  // PDFs
  "aip/ead-pdf",
  "aip/scraper-pdf",
  "aip/gen-pdf",
  "aip/scraper-gen-pdf",
  "aip/non-ead-gen-pdf",
  // Extracted JSON data (per-airport, auto-re-synced)
  "aip/ead",
  "aip/scraper",
  "aip/non-ead-gen",
  // aip/usa intentionally excluded — USA JSON is AI-extracted on demand (costs API credits)
];

async function listFiles(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir);
    return entries.map((e) => path.join(dir, e));
  } catch {
    return [];
  }
}

export async function DELETE() {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const deleted: string[] = [];
  const errors: string[] = [];

  for (const relDir of CACHE_DIRS) {
    const absDir = path.join(STORAGE_ROOT, relDir);
    const files = await listFiles(absDir);
    for (const absPath of files) {
      try {
        const s = await stat(absPath);
        if (!s.isFile()) continue;
        await rm(absPath, { force: true });
        // Return the relative storage key, not the absolute path
        deleted.push(path.relative(STORAGE_ROOT, absPath));
      } catch (e) {
        errors.push(`${path.relative(STORAGE_ROOT, absPath)}: ${(e as Error)?.message ?? "unknown"}`);
      }
    }
  }

  return NextResponse.json({ deleted, errors, total: deleted.length });
}
