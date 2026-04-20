import { NextRequest, NextResponse } from "next/server";
import { buildPdfDownloadFilename } from "@/lib/pdf-download-filename";
import { isUsaAipIcao } from "@/lib/usa-aip";
import { readPdfFromStorage, storageObjectExists } from "@/lib/aip-storage";

const PDF_PREFIX = "aip/usa-pdf";

function useInline(request: NextRequest): boolean {
  const p = request.nextUrl.searchParams;
  if (p.get("download") === "1" || p.get("attachment") === "1") return false;
  return p.get("inline") === "1" || p.get("inline") === "true";
}

export async function HEAD(request: NextRequest) {
  const icao = request.nextUrl.searchParams.get("icao")?.trim().toUpperCase() ?? "";
  if (!/^[A-Z0-9]{4}$/.test(icao) || !isUsaAipIcao(icao)) {
    return new NextResponse(null, { status: 400 });
  }
  const exists = await storageObjectExists(`${PDF_PREFIX}/${icao}.pdf`);
  return new NextResponse(null, { status: exists ? 200 : 404 });
}

export async function GET(request: NextRequest) {
  const icao = request.nextUrl.searchParams.get("icao")?.trim().toUpperCase() ?? "";
  if (!/^[A-Z0-9]{4}$/.test(icao)) {
    return NextResponse.json({ error: "Valid 4-letter ICAO required" }, { status: 400 });
  }
  if (!isUsaAipIcao(icao)) {
    return NextResponse.json({ error: "ICAO is not mapped to USA AIP static PDFs" }, { status: 404 });
  }
  const inline = useInline(request);
  const key = `${PDF_PREFIX}/${icao}.pdf`;
  const filename = buildPdfDownloadFilename("AD2", icao);

  try {
    const bytes = await readPdfFromStorage(key);
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
    const msg = (err as { message?: string })?.message || "Failed to load PDF";
    return NextResponse.json({ error: "Failed to load PDF", detail: msg }, { status: 502 });
  }
}
