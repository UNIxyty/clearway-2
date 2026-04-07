import { NextRequest, NextResponse } from "next/server";
import { S3Client, GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";

const BUCKET = process.env.AWS_NOTAMS_BUCKET || process.env.AWS_S3_BUCKET;
const AIP_SCRAPER_PDF_PREFIX = "aip/scraper-pdf";
const AIP_SYNC_URL = process.env.AIP_SYNC_URL?.replace(/\/$/, "");
const NOTAM_SYNC_SECRET = process.env.NOTAM_SYNC_SECRET ?? "";
const SYNC_TIMEOUT_MS = 300_000;

function inlineDisposition(request: NextRequest): boolean {
  const p = request.nextUrl.searchParams;
  if (p.get("download") === "1" || p.get("attachment") === "1") return false;
  return p.get("inline") === "1" || p.get("inline") === "true";
}

async function triggerPdfSync(icao: string): Promise<void> {
  if (!AIP_SYNC_URL) return;
  const syncUrl = `${AIP_SYNC_URL}/sync?icao=${encodeURIComponent(icao)}&extract=0&scraper=1`;
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (NOTAM_SYNC_SECRET) headers["X-Sync-Secret"] = NOTAM_SYNC_SECRET;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SYNC_TIMEOUT_MS);
  try {
    const res = await fetch(syncUrl, { method: "GET", headers, signal: controller.signal });
    if (!res.ok) throw new Error(`Sync failed (${res.status})`);
  } finally {
    clearTimeout(timeout);
  }
}

export async function HEAD(request: NextRequest) {
  const icao = request.nextUrl.searchParams.get("icao")?.trim().toUpperCase() ?? "";
  if (!/^[A-Z0-9]{4}$/.test(icao)) return new NextResponse(null, { status: 400 });
  if (!BUCKET) return new NextResponse(null, { status: 503 });
  try {
    const client = new S3Client({ region: process.env.AWS_REGION || "us-east-1" });
    await client.send(new HeadObjectCommand({ Bucket: BUCKET, Key: `${AIP_SCRAPER_PDF_PREFIX}/${icao}.pdf` }));
    return new NextResponse(null, { status: 200 });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}

export async function GET(request: NextRequest) {
  const icao = request.nextUrl.searchParams.get("icao")?.trim().toUpperCase() ?? "";
  if (!/^[A-Z0-9]{4}$/.test(icao)) {
    return NextResponse.json({ error: "Valid 4-letter ICAO required" }, { status: 400 });
  }
  if (!BUCKET) {
    return NextResponse.json({ error: "PDF storage not configured" }, { status: 503 });
  }
  const client = new S3Client({ region: process.env.AWS_REGION || "us-east-1" });
  const key = `${AIP_SCRAPER_PDF_PREFIX}/${icao}.pdf`;
  const inline = inlineDisposition(request);
  try {
    let res;
    try {
      res = await client.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    } catch {
      await triggerPdfSync(icao);
      res = await client.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    }
    const body = res.Body;
    if (!body) return new NextResponse(null, { status: 404 });
    const bytes = await body.transformToByteArray();
    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": inline
          ? `inline; filename="${icao}_SCRAPER_AD2.pdf"`
          : `attachment; filename="${icao}_SCRAPER_AD2.pdf"`,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: "Failed to load PDF", detail: msg }, { status: 502 });
  }
}

