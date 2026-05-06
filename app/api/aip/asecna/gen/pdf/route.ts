import { NextRequest, NextResponse } from "next/server";
import { createAsecnaFetch, asecnaFormattedLeafBasename, resolveAsecnaHtmlUrl, htmlUrlToPdfUrl } from "@/scripts/asecna/asecna-eaip-http.mjs";
import { getAsecnaAirportByIcao, getAsecnaData } from "@/lib/asecna-airports";
import { buildPdfDownloadFilename } from "@/lib/pdf-download-filename";
import { readPdfFromStorage } from "@/lib/aip-storage";

const GEN_PDF_PREFIX = "aip/gen-pdf";
const AIP_SYNC_URL = process.env.AIP_SYNC_URL?.replace(/\/$/, "");
const NOTAM_SYNC_SECRET = process.env.NOTAM_SYNC_SECRET ?? "";
const SYNC_TIMEOUT_MS = 600_000;

function rwandaHtmlToPdfUrl(htmlUrl: string): string {
  let out = htmlUrl.replace(/#.*$/, "");
  out = out.replace("-en-GB", "");
  out = out.replace(".html", ".pdf");
  out = out.replace("/eAIP/", "/documents/PDF/");
  return out;
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

async function triggerGenSync(icao: string): Promise<void> {
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

async function readStoredGenPdf(icao: string): Promise<Uint8Array | null> {
  const prefix = String(icao || "").slice(0, 2).toUpperCase();
  if (!/^[A-Z]{2}$/.test(prefix)) return null;
  const bytes = await readPdfFromStorage(`${GEN_PDF_PREFIX}/${prefix}-GEN-1.2.pdf`);
  return isValidPdfBytes(bytes) ? bytes : null;
}

function pdfResponse(bytes: Uint8Array, icao: string) {
  const filename = buildPdfDownloadFilename("GEN12", icao);
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  return new NextResponse(copy, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

export async function GET(request: NextRequest) {
  const icao = request.nextUrl.searchParams.get("icao")?.trim().toUpperCase() ?? "";
  if (!/^[A-Z0-9]{4}$/.test(icao)) {
    return NextResponse.json({ error: "Valid 4-letter ICAO required" }, { status: 400 });
  }

  const airport = getAsecnaAirportByIcao(icao);
  if (!airport) {
    return NextResponse.json({ error: "ICAO not found in ASECNA list" }, { status: 404 });
  }

  const data = getAsecnaData();
  const country = (data.countries || []).find((c) => c.code === airport.countryCode);
  if (!country?.gen12?.anchor) {
    const fromStorage = await readStoredGenPdf(icao);
    if (fromStorage) {
      return pdfResponse(fromStorage, icao);
    }
    return NextResponse.json(
      { error: "GEN 1.2 not available for this country in ASECNA menu" },
      { status: 404 },
    );
  }

  const menuDir = country.menuDirUrl || data.menuUrl.replace(/[^/]+$/, "");
  const htmlUrl = country.gen12?.htmlUrl
    || resolveAsecnaHtmlUrl(
      asecnaFormattedLeafBasename(country.gen12.anchor, data.menuBasename || "FR-menu-fr-FR.html"),
      menuDir,
    );
  const pdfUrl = /\/eAIP_Rwanda\//i.test(htmlUrl) ? rwandaHtmlToPdfUrl(htmlUrl) : htmlUrlToPdfUrl(htmlUrl);

  const fetcher = createAsecnaFetch("GEN");
  const res = await fetcher.fetchAsecna(pdfUrl, {}, { strictTls: false });
  if (!res.ok) {
    await triggerGenSync(icao).catch(() => undefined);
    const fromStorage = await readStoredGenPdf(icao);
    if (fromStorage) {
      return pdfResponse(fromStorage, icao);
    }
    return NextResponse.json(
      { error: "Failed to download ASECNA GEN PDF", detail: `${res.status} ${res.statusText}` },
      { status: 502 },
    );
  }

  const bytes = new Uint8Array(await res.arrayBuffer());
  if (!isValidPdfBytes(bytes)) {
    await triggerGenSync(icao).catch(() => undefined);
    const fromStorage = await readStoredGenPdf(icao);
    if (fromStorage) {
      return pdfResponse(fromStorage, icao);
    }
    return NextResponse.json(
      { error: "Failed to download ASECNA GEN PDF", detail: "Downloaded bytes are not a valid PDF." },
      { status: 502 },
    );
  }
  const filename = buildPdfDownloadFilename("GEN12", icao);
  return new NextResponse(bytes, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
