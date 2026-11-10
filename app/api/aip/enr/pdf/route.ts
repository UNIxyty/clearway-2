import { NextRequest, NextResponse } from "next/server";
import { upstreamFailure } from "@/lib/public-error";
import { buildPdfDownloadFilename } from "@/lib/pdf-download-filename";
import { resolveGenPrefix } from "@/lib/ead-gen-prefix";
import { readPdfFromStorage } from "@/lib/aip-storage";
import { requirePermission } from "@/lib/permissions/server";
import { hasInternalDebugAccess } from "@/lib/internal-debug-auth";

// ENR 1.1 (bug report 8 item 2.5, 2026-11-10): served the way GEN 1.2 is — the cached copy per prefix, fetched on demand
// through the aip-sync worker when there is none (the country's own source, else EAD), cached per AIRAC through the
// revision record. A prefix no source can give answers 404 with the worker's reason, never another document.
const ENR_PDF_PREFIX = "aip/enr-pdf";
const AIP_SYNC_URL = process.env.AIP_SYNC_URL?.replace(/\/$/, "");
const NOTAM_SYNC_SECRET = process.env.NOTAM_SYNC_SECRET ?? "";
const SYNC_TIMEOUT_MS = 600_000;

const isPdf = (b: Uint8Array | null): b is Uint8Array => Boolean(b && b.length > 32 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2d);

async function triggerEnrSync(prefix: string): Promise<{ ok: boolean; status: number; detail?: string; code?: string }> {
  if (!AIP_SYNC_URL) return { ok: false, status: 503, detail: "The AIP sync worker is not set up." };
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (NOTAM_SYNC_SECRET) headers["X-Sync-Secret"] = NOTAM_SYNC_SECRET;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SYNC_TIMEOUT_MS);
  try {
    const r = await fetch(`${AIP_SYNC_URL}/sync/enr?prefix=${encodeURIComponent(prefix)}`, { method: "GET", headers, signal: controller.signal });
    const body = (await r.json().catch(() => ({}))) as { detail?: string; code?: string };
    return { ok: r.ok, status: r.status, detail: body.detail, code: body.code };
  } catch { return { ok: false, status: 503, detail: "The AIP sync worker did not answer." }; }
  finally { clearTimeout(timeout); }
}

export async function GET(request: NextRequest) {
  if (!hasInternalDebugAccess(request)) {
    const auth = await requirePermission("portal.aip.fetch");
    if ("error" in auth) return auth.error;
  }
  const icao = request.nextUrl.searchParams.get("icao")?.trim().toUpperCase() ?? "";
  const prefix = resolveGenPrefix(icao, request.nextUrl.searchParams.get("prefix")?.trim().toUpperCase() ?? "");
  if (!/^[A-Z]{2}$/.test(prefix)) return NextResponse.json({ error: "Valid ICAO or 2-letter prefix required (e.g. icao=EVRA or prefix=EV)" }, { status: 400 });
  const key = `${ENR_PDF_PREFIX}/${prefix}-ENR-1.1.pdf`;
  try {
    let bytes = await readPdfFromStorage(key);
    if (!isPdf(bytes)) {
      const sync = await triggerEnrSync(prefix);
      bytes = await readPdfFromStorage(key);
      if (!isPdf(bytes)) return NextResponse.json({ error: sync.detail || "No ENR copy could be made for this prefix.", code: sync.code ?? null }, { status: sync.status === 404 ? 404 : sync.status === 402 ? 402 : 503 });
    }
    const copy = new Uint8Array(bytes.length); copy.set(bytes);
    return new NextResponse(copy, { status: 200, headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${buildPdfDownloadFilename("ENR11", icao || prefix)}"` } });
  } catch (e: unknown) {
    return upstreamFailure("The ENR document could not be read. Try again in a minute.", "unknown", { tag: "AIP-ENR-PDF", what: "ENR PDF read failed (storage or the sync worker)", detail: e });
  }
}
