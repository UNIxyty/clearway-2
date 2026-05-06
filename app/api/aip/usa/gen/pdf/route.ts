import { NextRequest, NextResponse } from "next/server";
import { buildPdfDownloadFilename } from "@/lib/pdf-download-filename";
import { readPdfFromStorage, storageObjectExists } from "@/lib/aip-storage";

const PRIMARY_GEN_KEY = "aip/usa-gen-pdf/GEN-1.2.pdf";
const FALLBACK_GEN_KEYS = [
  "aip/gen-pdf/US-GEN-1.2.pdf",
  "aip/gen-pdf/KA-GEN-1.2.pdf",
];

function useInline(request: NextRequest): boolean {
  const p = request.nextUrl.searchParams;
  if (p.get("download") === "1" || p.get("attachment") === "1") return false;
  return p.get("inline") === "1" || p.get("inline") === "true";
}

export async function HEAD() {
  const [primary, ...fallback] = await Promise.all([
    storageObjectExists(PRIMARY_GEN_KEY),
    ...FALLBACK_GEN_KEYS.map((key) => storageObjectExists(key)),
  ]);
  const exists = primary || fallback.some(Boolean);
  return new NextResponse(null, { status: exists ? 200 : 404 });
}

export async function GET(request: NextRequest) {
  const inline = useInline(request);
  const icao = request.nextUrl.searchParams.get("icao")?.trim().toUpperCase() || "USA";
  const filename = buildPdfDownloadFilename("GEN12", icao);

  try {
    let bytes = await readPdfFromStorage(PRIMARY_GEN_KEY);
    if (!bytes) {
      for (const fallbackKey of FALLBACK_GEN_KEYS) {
        bytes = await readPdfFromStorage(fallbackKey);
        if (bytes) break;
      }
    }
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
