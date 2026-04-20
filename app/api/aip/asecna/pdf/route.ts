import { NextRequest, NextResponse } from "next/server";
import { buildPdfDownloadFilename } from "@/lib/pdf-download-filename";
import { readPdfFromStorage, storageObjectExists } from "@/lib/aip-storage";

const PREFIX = "aip/asecna-pdf";

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
  const exists = await storageObjectExists(`${PREFIX}/${icao}.pdf`);
  return new NextResponse(null, { status: exists ? 200 : 404 });
}

export async function GET(request: NextRequest) {
  const icao = request.nextUrl.searchParams.get("icao")?.trim().toUpperCase() ?? "";
  if (!/^[A-Z0-9]{4}$/.test(icao)) {
    return NextResponse.json({ error: "Valid 4-letter ICAO required" }, { status: 400 });
  }
  const inline = useInline(request);
  const key = `${PREFIX}/${icao}.pdf`;
  try {
    const bytes = await readPdfFromStorage(key);
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
