import { NextRequest, NextResponse } from "next/server";
import { buildPdfDownloadFilename } from "@/lib/pdf-download-filename";
import { resolveGenPrefix } from "@/lib/ead-gen-prefix";
import { readPdfFromStorage } from "@/lib/aip-storage";

const GEN_PDF_PREFIX = "aip/gen-pdf";
const SCRAPER_GEN_PDF_PREFIX = "aip/scraper-gen-pdf";
const NON_EAD_GEN_PDF_PREFIX = "aip/non-ead-gen-pdf";

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
    let bytes: Uint8Array | null = null;
    for (const key of keys) {
      bytes = await readPdfFromStorage(key);
      if (bytes) break;
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
