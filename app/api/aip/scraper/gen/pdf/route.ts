import { NextRequest, NextResponse } from "next/server";
import { failure, upstreamFailure } from "@/lib/public-error";
import { GEN_PDF_FAILED } from "@/lib/aip-sync-failure";
import { buildPdfDownloadFilename } from "@/lib/pdf-download-filename";
import { readPdfFromStorage } from "@/lib/aip-storage";
import { requirePermission } from "@/lib/permissions/server";
import { hasInternalDebugAccess } from "@/lib/internal-debug-auth";

const GEN_PDF_PREFIX = "aip/scraper-gen-pdf";
const AIP_SYNC_URL = process.env.AIP_SYNC_URL?.replace(/\/$/, "");
const NOTAM_SYNC_SECRET = process.env.NOTAM_SYNC_SECRET ?? "";
const SYNC_TIMEOUT_MS = 600_000;

async function triggerGenSync(icao: string): Promise<void> {
  if (!AIP_SYNC_URL) return;
  const syncUrl = `${AIP_SYNC_URL}/sync/gen?icao=${encodeURIComponent(icao)}&scraper=1`;
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (NOTAM_SYNC_SECRET) headers["X-Sync-Secret"] = NOTAM_SYNC_SECRET;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SYNC_TIMEOUT_MS);
  try {
    const res = await fetch(syncUrl, { method: "GET", headers, signal: controller.signal });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string; detail?: string };
      throw new Error(data.detail || data.error || `GEN sync failed (${res.status})`);
    }
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET(request: NextRequest) {
  if (!hasInternalDebugAccess(request)) {
    const auth = await requirePermission("portal.aip.fetch");
    if ("error" in auth) return auth.error;
  }
  const icao = request.nextUrl.searchParams.get("icao")?.trim().toUpperCase() ?? "";
  if (!/^[A-Z0-9]{4}$/.test(icao)) {
    return NextResponse.json({ error: "Valid 4-letter ICAO required" }, { status: 400 });
  }

  const key = `${GEN_PDF_PREFIX}/${icao}-GEN-1.2.pdf`;
  const filename = buildPdfDownloadFilename("GEN12", icao);
  try {
    let bytes = await readPdfFromStorage(key);
    if (!bytes) {
      await triggerGenSync(icao);
      bytes = await readPdfFromStorage(key);
    }
    if (!bytes) return new NextResponse(null, { status: 404 });
    const copy = new Uint8Array(bytes.length);
    copy.set(bytes);
    return new NextResponse(copy, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (e: unknown) {
    return upstreamFailure(GEN_PDF_FAILED, "unknown", { tag: "AIP-SCRAPER-GEN-PDF", what: `Scraper GEN PDF for ${icao} failed (storage or the sync worker)`, detail: e });
  }
}
