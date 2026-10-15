import { NextRequest, NextResponse } from "next/server";
import { resolveGenPrefix } from "@/lib/ead-gen-prefix";
import { storageObjectExists } from "@/lib/aip-storage";
import { readAipRevision } from "@/lib/aip-revision";
import { stat } from "node:fs/promises";
import { storagePathForKey } from "@/lib/storage";

const EAD_GEN_PDF_PREFIX = "aip/gen-pdf";
const NON_EAD_GEN_PDF_PREFIX = "aip/non-ead-gen-pdf";

export async function GET(request: NextRequest) {
  const icao = request.nextUrl.searchParams.get("icao")?.trim().toUpperCase() ?? "";
  const prefixParam = request.nextUrl.searchParams.get("prefix")?.trim().toUpperCase() ?? "";
  const prefix = resolveGenPrefix(icao, prefixParam);
  if (!/^[A-Z]{2}$/.test(prefix)) {
    return NextResponse.json({ error: "Valid 2-letter prefix required" }, { status: 400 });
  }
  const eadKey = `${EAD_GEN_PDF_PREFIX}/${prefix}-GEN-1.2.pdf`;
  const nonEadKey = `${NON_EAD_GEN_PDF_PREFIX}/${prefix}-GEN-1.2.pdf`;

  const [eadExists, nonEadExists] = await Promise.all([
    storageObjectExists(eadKey),
    storageObjectExists(nonEadKey),
  ]);
  const key = eadExists ? eadKey : nonEadExists ? nonEadKey : null;
  const revision = await readAipRevision(key);
  // When this copy was fetched: its revision record, or else the file's own date (see /api/aip/resolve).
  let copyFetchedAt: string | null = revision.fetchedAt ?? null;
  if (!copyFetchedAt && (eadExists || nonEadExists) && key) {
    try { copyFetchedAt = (await stat(storagePathForKey(key))).mtime.toISOString(); } catch { copyFetchedAt = null; }
  }
  return NextResponse.json({ exists: eadExists || nonEadExists, source: eadExists ? "ead" : nonEadExists ? "non-ead" : null, storageKey: key, revision, copyFetchedAt });
}
