import { NextRequest, NextResponse } from "next/server";
import { buildPdfDownloadFilename } from "@/lib/pdf-download-filename";
import { readPdfFromStorage, storageObjectExists } from "@/lib/aip-storage";

const AIP_EAD_PDF_PREFIX = "aip/ead-pdf";
const AIP_SYNC_URL = process.env.AIP_SYNC_URL?.replace(/\/$/, "");
const NOTAM_SYNC_SECRET = process.env.NOTAM_SYNC_SECRET ?? "";
const SYNC_TIMEOUT_MS = 300_000;

function badIcaoResponse() {
  return NextResponse.json({ error: "Valid 4-letter ICAO required" }, { status: 400 });
}

function configErrorResponse() {
  return null;
}

/** True = inline (iframe), false = attachment (download). */
function useInlineDisposition(request: NextRequest): boolean {
  const p = request.nextUrl.searchParams;
  if (p.get("download") === "1" || p.get("attachment") === "1") return false;
  return p.get("inline") === "1" || p.get("inline") === "true";
}

async function triggerPdfOnlySync(icao: string): Promise<void> {
  if (!AIP_SYNC_URL) return;
  const syncUrl = `${AIP_SYNC_URL}/sync?icao=${encodeURIComponent(icao)}&extract=0`;
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (NOTAM_SYNC_SECRET) headers["X-Sync-Secret"] = NOTAM_SYNC_SECRET;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SYNC_TIMEOUT_MS);
  try {
    const res = await fetch(syncUrl, { method: "GET", headers, signal: controller.signal });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string; detail?: string };
      throw new Error(data.detail || data.error || `Sync failed (${res.status})`);
    }
  } finally {
    clearTimeout(timeout);
  }
}

export async function HEAD(request: NextRequest) {
  const icao = request.nextUrl.searchParams.get("icao")?.trim().toUpperCase() ?? "";
  if (!/^[A-Z0-9]{4}$/.test(icao)) {
    return new NextResponse(null, { status: 400 });
  }

  const cfg = configErrorResponse();
  if (cfg) {
    return new NextResponse(null, { status: 503 });
  }

  try {
    const key = `${AIP_EAD_PDF_PREFIX}/${icao}.pdf`;
    const exists = await storageObjectExists(key);
    if (!exists) return new NextResponse(null, { status: 404 });
    return new NextResponse(null, { status: 200 });
  } catch (e: unknown) {
    console.error("AIP PDF head failed:", e);
    return new NextResponse(null, { status: 502 });
  }
}

export async function GET(request: NextRequest) {
  const icao = request.nextUrl.searchParams.get("icao")?.trim().toUpperCase() ?? "";

  if (!/^[A-Z0-9]{4}$/.test(icao)) {
    return badIcaoResponse();
  }

  const cfg = configErrorResponse();
  if (cfg) return cfg;

  const inline = useInlineDisposition(request);
  const filename = buildPdfDownloadFilename("AD2", icao);

  try {
    const key = `${AIP_EAD_PDF_PREFIX}/${icao}.pdf`;
    let bytes = await readPdfFromStorage(key);
    if (!bytes) {
      // Auto-heal: missing PDF triggers PDF-only sync, then retry once.
      await triggerPdfOnlySync(icao);
      bytes = await readPdfFromStorage(key);
    }
    if (!bytes) return new NextResponse(null, { status: 404 });
    const copy = new Uint8Array(bytes.length);
    copy.set(bytes);
    const disposition = inline
      ? `inline; filename="${filename}"`
      : `attachment; filename="${filename}"`;
    return new NextResponse(copy, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": disposition,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("AIP PDF read failed:", e);
    return NextResponse.json(
      { error: "Failed to load PDF", detail: msg },
      { status: 502 }
    );
  }
}
