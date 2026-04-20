import { NextRequest, NextResponse } from "next/server";
import { buildPdfDownloadFilename } from "@/lib/pdf-download-filename";
import { readPdfFromStorage, storageObjectExists } from "@/lib/aip-storage";

const GEN_KEY = "aip/usa-gen-pdf/GEN-1.2.pdf";

function useInline(request: NextRequest): boolean {
  const p = request.nextUrl.searchParams;
  if (p.get("download") === "1" || p.get("attachment") === "1") return false;
  return p.get("inline") === "1" || p.get("inline") === "true";
}

export async function HEAD() {
  const exists = await storageObjectExists(GEN_KEY);
  return new NextResponse(null, { status: exists ? 200 : 404 });
}

export async function GET(request: NextRequest) {
  const inline = useInline(request);
  const icao = request.nextUrl.searchParams.get("icao")?.trim().toUpperCase() || "USA";
  const filename = buildPdfDownloadFilename("GEN12", icao);

  try {
    const bytes = await readPdfFromStorage(GEN_KEY);
    if (!bytes) return new NextResponse(null, { status: 404 });
    const copy = new Uint8Array(bytes.length);
    copy.set(bytes);
    return new NextResponse(copy, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": inline ? `inline; filename="${filename}"` : `attachment; filename="${filename}"`,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (err: unknown) {
    const msg = (err as { message?: string })?.message || "Failed to load USA GEN PDF";
    return NextResponse.json({ error: "Failed to load USA GEN PDF", detail: msg }, { status: 502 });
  }
}
