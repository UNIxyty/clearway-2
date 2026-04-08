import { NextRequest, NextResponse } from "next/server";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

const BUCKET = process.env.AWS_NOTAMS_BUCKET || process.env.AWS_S3_BUCKET;
const GEN_PDF_PREFIX = "aip/scraper-gen-pdf";
const AIP_SYNC_URL = process.env.AIP_SYNC_URL?.replace(/\/$/, "");
const NOTAM_SYNC_SECRET = process.env.NOTAM_SYNC_SECRET ?? "";
const SYNC_TIMEOUT_MS = 300_000;

function s3() {
  return new S3Client({ region: process.env.AWS_REGION || "us-east-1" });
}

async function triggerGenSync(icao: string): Promise<void> {
  if (!AIP_SYNC_URL) return;
  const syncUrl = `${AIP_SYNC_URL}/sync/gen?icao=${encodeURIComponent(icao)}&scraper=1`;
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (NOTAM_SYNC_SECRET) headers["X-Sync-Secret"] = NOTAM_SYNC_SECRET;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SYNC_TIMEOUT_MS);
  try {
    const res = await fetch(syncUrl, { method: "GET", headers, signal: controller.signal });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string; detail?: string };
      throw new Error(data.detail || data.error || `GEN sync failed (${res.status})`);
    }
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET(request: NextRequest) {
  const icao = request.nextUrl.searchParams.get("icao")?.trim().toUpperCase() ?? "";
  if (!/^[A-Z0-9]{4}$/.test(icao)) {
    return NextResponse.json({ error: "Valid 4-letter ICAO required" }, { status: 400 });
  }

  if (!BUCKET) {
    return NextResponse.json(
      { error: "PDF storage not configured", detail: "Set AWS_S3_BUCKET (or AWS_NOTAMS_BUCKET) in Vercel." },
      { status: 503 },
    );
  }

  const key = `${GEN_PDF_PREFIX}/${icao}-GEN-1.2.pdf`;
  try {
    let res;
    try {
      res = await s3().send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    } catch (e: unknown) {
      const err = e as { name?: string; Code?: string };
      const missing = err?.name === "NoSuchKey" || err?.Code === "NoSuchKey";
      if (!missing) throw e;
      await triggerGenSync(icao);
      res = await s3().send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    }

    const body = res.Body;
    if (!body) return new NextResponse(null, { status: 404 });
    const bytes = await body.transformToByteArray();
    const copy = new Uint8Array(bytes.length);
    copy.set(bytes);
    return new NextResponse(copy, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${icao}_SCRAPER_GEN_1.2.pdf"`,
      },
    });
  } catch (e: unknown) {
    const err = e as { name?: string; Code?: string; message?: string };
    if (err?.name === "NoSuchKey" || err?.Code === "NoSuchKey") {
      return NextResponse.json(
        { error: "PDF not found", detail: "Sync scraper GEN first to download the PDF." },
        { status: 404 },
      );
    }
    const msg = err?.message ?? String(e);
    return NextResponse.json({ error: "Failed to load PDF", detail: msg }, { status: 502 });
  }
}
