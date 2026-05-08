import { NextRequest, NextResponse } from "next/server";
import { buildPdfDownloadFilename } from "@/lib/pdf-download-filename";
import { readPdfFromStorage, storageObjectExists } from "@/lib/aip-storage";

const PRIMARY_GEN_KEY = "aip/usa-gen-pdf/GEN-1.2.pdf";
const FALLBACK_GEN_KEYS = [
  "aip/gen-pdf/US-GEN-1.2.pdf",
  "aip/gen-pdf/KA-GEN-1.2.pdf",
];

const AIP_SYNC_URL = process.env.AIP_SYNC_URL?.replace(/\/$/, "");
const NOTAM_SYNC_SECRET = process.env.NOTAM_SYNC_SECRET ?? "";
const SYNC_TIMEOUT_MS = 600_000;

function useInline(request: NextRequest): boolean {
  const p = request.nextUrl.searchParams;
  if (p.get("download") === "1" || p.get("attachment") === "1") return false;
  return p.get("inline") === "1" || p.get("inline") === "true";
}

async function triggerUsaGenSync(icao: string): Promise<void> {
  if (!AIP_SYNC_URL) return;
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

async function readFromStorage(): Promise<Uint8Array | null> {
  let bytes = await readPdfFromStorage(PRIMARY_GEN_KEY);
  if (bytes) return bytes;
  for (const key of FALLBACK_GEN_KEYS) {
    bytes = await readPdfFromStorage(key);
    if (bytes) return bytes;
  }
  return null;
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
    let bytes = await readFromStorage();
    if (!bytes) {
      await triggerUsaGenSync(icao).catch(() => undefined);
      bytes = await readFromStorage();
    }
    if (!bytes) {
      return NextResponse.json({ error: "USA GEN 1.2 PDF not available", detail: "File not found in storage and sync did not produce it." }, { status: 404 });
    }
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
