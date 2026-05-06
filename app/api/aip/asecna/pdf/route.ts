import { NextRequest, NextResponse } from "next/server";
import { buildPdfDownloadFilename } from "@/lib/pdf-download-filename";
import { readPdfFromStorage, storageObjectExists } from "@/lib/aip-storage";

const LEGACY_PREFIX = "aip/asecna-pdf";
const EAD_PREFIX = "aip/ead-pdf";
const AIP_SYNC_URL = process.env.AIP_SYNC_URL?.replace(/\/$/, "");
const NOTAM_SYNC_SECRET = process.env.NOTAM_SYNC_SECRET ?? "";
const SYNC_TIMEOUT_MS = 600_000;

function contentDisposition(inline: boolean, icao: string) {
  const file = buildPdfDownloadFilename("AD2", icao);
  return inline ? `inline; filename="${file}"` : `attachment; filename="${file}"`;
}

function useInline(request: NextRequest): boolean {
  const p = request.nextUrl.searchParams;
  if (p.get("download") === "1" || p.get("attachment") === "1") return false;
  return p.get("inline") === "1" || p.get("inline") === "true";
}

export async function HEAD(request: NextRequest) {
  const icao = request.nextUrl.searchParams.get("icao")?.trim().toUpperCase() ?? "";
  if (!/^[A-Z0-9]{4}$/.test(icao)) return new NextResponse(null, { status: 400 });
  const [eadExists, legacyExists] = await Promise.all([
    storageObjectExists(`${EAD_PREFIX}/${icao}.pdf`),
    storageObjectExists(`${LEGACY_PREFIX}/${icao}.pdf`),
  ]);
  const exists = eadExists || legacyExists;
  return new NextResponse(null, { status: exists ? 200 : 404 });
}

function isValidPdfBytes(bytes: Uint8Array | null): bytes is Uint8Array {
  if (!bytes || bytes.length < 32) return false;
  return (
    bytes[0] === 0x25 && // %
    bytes[1] === 0x50 && // P
    bytes[2] === 0x44 && // D
    bytes[3] === 0x46 && // F
    bytes[4] === 0x2d // -
  );
}

async function triggerPdfOnlySync(icao: string): Promise<void> {
  if (!AIP_SYNC_URL) return;
  const syncUrl = `${AIP_SYNC_URL}/sync?icao=${encodeURIComponent(icao)}&extract=0`;
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (NOTAM_SYNC_SECRET) headers["X-Sync-Secret"] = NOTAM_SYNC_SECRET;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SYNC_TIMEOUT_MS);
  try {
    await fetch(syncUrl, { method: "GET", headers, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET(request: NextRequest) {
  const icao = request.nextUrl.searchParams.get("icao")?.trim().toUpperCase() ?? "";
  if (!/^[A-Z0-9]{4}$/.test(icao)) {
    return NextResponse.json({ error: "Valid 4-letter ICAO required" }, { status: 400 });
  }
  const inline = useInline(request);
  try {
    const primaryKey = `${EAD_PREFIX}/${icao}.pdf`;
    const legacyKey = `${LEGACY_PREFIX}/${icao}.pdf`;
    let bytes = await readPdfFromStorage(primaryKey);
    if (!isValidPdfBytes(bytes)) {
      const fallback = await readPdfFromStorage(legacyKey);
      bytes = isValidPdfBytes(fallback) ? fallback : null;
    }
    if (!bytes) {
      await triggerPdfOnlySync(icao);
      const synced = await readPdfFromStorage(primaryKey);
      if (isValidPdfBytes(synced)) {
        bytes = synced;
      } else {
        const fallback = await readPdfFromStorage(legacyKey);
        bytes = isValidPdfBytes(fallback) ? fallback : null;
      }
    }
    if (!bytes) return new NextResponse(null, { status: 404 });
    const copy = new Uint8Array(bytes.length);
    copy.set(bytes);
    return new NextResponse(copy, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": contentDisposition(inline, icao),
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (err: unknown) {
    return NextResponse.json({ error: "Failed to load PDF" }, { status: 502 });
  }
}
