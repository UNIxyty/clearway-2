import { NextRequest, NextResponse } from "next/server";
import { buildPdfDownloadFilename } from "@/lib/pdf-download-filename";
import { resolveGenPrefix } from "@/lib/ead-gen-prefix";
import { readPdfFromStorage } from "@/lib/aip-storage";

const GEN_PDF_PREFIX = "aip/gen-pdf";
const SCRAPER_GEN_PDF_PREFIX = "aip/scraper-gen-pdf";
const NON_EAD_GEN_PDF_PREFIX = "aip/non-ead-gen-pdf";
const AIP_SYNC_URL = process.env.AIP_SYNC_URL?.replace(/\/$/, "");
const NOTAM_SYNC_SECRET = process.env.NOTAM_SYNC_SECRET ?? "";
const SYNC_TIMEOUT_MS = 600_000;

function buildCandidateKeys(prefix: string, icao: string): string[] {
  const keys = [`${GEN_PDF_PREFIX}/${prefix}-GEN-1.2.pdf`];
  if (/^[A-Z0-9]{4}$/.test(icao)) {
    keys.push(`${SCRAPER_GEN_PDF_PREFIX}/${icao}-GEN-1.2.pdf`);
  }
  keys.push(`${NON_EAD_GEN_PDF_PREFIX}/${prefix}-GEN-1.2.pdf`);
  // USA can be published under generic EAD namespace in some deployments.
  if (icao.startsWith("K") || icao.startsWith("P")) {
    keys.push(`${GEN_PDF_PREFIX}/US-GEN-1.2.pdf`);
    keys.push("aip/usa-gen-pdf/GEN-1.2.pdf");
  }
  return [...new Set(keys)];
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

async function readFirstPdf(keys: string[]): Promise<Uint8Array | null> {
  for (const key of keys) {
    const bytes = await readPdfFromStorage(key);
    if (isValidPdfBytes(bytes)) return bytes;
  }
  return null;
}

async function triggerGenSync(icao: string): Promise<void> {
  if (!AIP_SYNC_URL || !/^[A-Z0-9]{4}$/.test(icao)) return;
  const syncUrl = `${AIP_SYNC_URL}/sync/gen?icao=${encodeURIComponent(icao)}`;
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
  const prefixParam = request.nextUrl.searchParams.get("prefix")?.trim().toUpperCase() ?? "";

  const prefix = resolveGenPrefix(icao, prefixParam);
  if (!/^[A-Z]{2}$/.test(prefix)) {
    return NextResponse.json(
      { error: "Valid ICAO or 2-letter prefix required (e.g. icao=EDQA or prefix=ED)" },
      { status: 400 }
    );
  }

  try {
    const filename = buildPdfDownloadFilename("GEN12", icao || prefix);
    const keys = buildCandidateKeys(prefix, icao);
    let bytes = await readFirstPdf(keys);
    if (!bytes && /^[A-Z0-9]{4}$/.test(icao)) {
      await triggerGenSync(icao);
      bytes = await readFirstPdf(keys);
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
    const msg = e instanceof Error ? e.message : String(e);
    console.error("GEN PDF read failed:", e);
    return NextResponse.json(
      { error: "Failed to load PDF", detail: msg },
      { status: 502 }
    );
  }
}
