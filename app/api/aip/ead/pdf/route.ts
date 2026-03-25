import { NextRequest, NextResponse } from "next/server";
import { S3Client, GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";

const BUCKET = process.env.AWS_NOTAMS_BUCKET || process.env.AWS_S3_BUCKET;
const AIP_EAD_PDF_PREFIX = "aip/ead-pdf";
const AIP_SYNC_URL = process.env.AIP_SYNC_URL?.replace(/\/$/, "");
const NOTAM_SYNC_SECRET = process.env.NOTAM_SYNC_SECRET ?? "";
const SYNC_TIMEOUT_MS = 300_000;

function badIcaoResponse() {
  return NextResponse.json({ error: "Valid 4-letter ICAO required" }, { status: 400 });
}

function configErrorResponse() {
  if (!BUCKET) {
    return NextResponse.json(
      { error: "PDF storage not configured", detail: "Set AWS_S3_BUCKET (or AWS_NOTAMS_BUCKET) in Vercel." },
      { status: 503 }
    );
  }
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    return NextResponse.json(
      {
        error: "S3 credentials not configured",
        detail: "Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in Vercel (same as for NOTAMs). IAM user must have s3:GetObject on your bucket, including aip/ead-pdf/*.",
      },
      { status: 503 }
    );
  }
  return null;
}

/** True = inline (iframe), false = attachment (download). */
function useInlineDisposition(request: NextRequest): boolean {
  const p = request.nextUrl.searchParams;
  if (p.get("download") === "1" || p.get("attachment") === "1") return false;
  return p.get("inline") === "1" || p.get("inline") === "true";
}

async function triggerPdfOnlySync(icao: string): Promise<void> {
  if (!AIP_SYNC_URL) return;
  const syncUrl = `${AIP_SYNC_URL}/sync?icao=${encodeURIComponent(icao)}&extract=0`;
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (NOTAM_SYNC_SECRET) headers["X-Sync-Secret"] = NOTAM_SYNC_SECRET;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SYNC_TIMEOUT_MS);
  try {
    const res = await fetch(syncUrl, { method: "GET", headers, signal: controller.signal });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string; detail?: string };
      throw new Error(data.detail || data.error || `Sync failed (${res.status})`);
    }
  } finally {
    clearTimeout(timeout);
  }
}

export async function HEAD(request: NextRequest) {
  const icao = request.nextUrl.searchParams.get("icao")?.trim().toUpperCase() ?? "";
  if (!/^[A-Z0-9]{4}$/.test(icao)) {
    return new NextResponse(null, { status: 400 });
  }

  const cfg = configErrorResponse();
  if (cfg) {
    return new NextResponse(null, { status: 503 });
  }

  const region = process.env.AWS_REGION || "us-east-1";
  try {
    const client = new S3Client({ region });
    const key = `${AIP_EAD_PDF_PREFIX}/${icao}.pdf`;
    await client.send(new HeadObjectCommand({ Bucket: BUCKET!, Key: key }));
    return new NextResponse(null, { status: 200 });
  } catch (e: unknown) {
    const err = e as { name?: string; Code?: string; message?: string };
    if (err?.name === "NotFound" || err?.name === "NoSuchKey" || err?.Code === "NoSuchKey" || err?.Code === "404") {
      return new NextResponse(null, { status: 404 });
    }
    console.error("S3 AIP PDF head failed:", e);
    return new NextResponse(null, { status: 502 });
  }
}

export async function GET(request: NextRequest) {
  const icao = request.nextUrl.searchParams.get("icao")?.trim().toUpperCase() ?? "";

  if (!/^[A-Z0-9]{4}$/.test(icao)) {
    return badIcaoResponse();
  }

  const cfg = configErrorResponse();
  if (cfg) return cfg;

  const region = process.env.AWS_REGION || "us-east-1";
  const inline = useInlineDisposition(request);
  const filename = `${icao}_AIP_AD2.pdf`;

  try {
    const client = new S3Client({ region });
    const key = `${AIP_EAD_PDF_PREFIX}/${icao}.pdf`;
    let res;
    try {
      res = await client.send(new GetObjectCommand({ Bucket: BUCKET!, Key: key }));
    } catch (e: unknown) {
      const err = e as { name?: string; Code?: string };
      const missing = err?.name === "NoSuchKey" || err?.Code === "NoSuchKey";
      if (!missing) throw e;
      // Auto-heal: missing PDF triggers PDF-only sync, then retry S3 once.
      await triggerPdfOnlySync(icao);
      res = await client.send(new GetObjectCommand({ Bucket: BUCKET!, Key: key }));
    }
    const body = res.Body;
    if (!body) return new NextResponse(null, { status: 404 });

    const bytes = await body.transformToByteArray();
    const copy = new Uint8Array(bytes.length);
    copy.set(bytes);
    const disposition = inline
      ? `inline; filename="${filename}"`
      : `attachment; filename="${filename}"`;
    return new NextResponse(copy, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": disposition,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (e: unknown) {
    const err = e as { name?: string; Code?: string; message?: string };
    if (err?.name === "NoSuchKey" || err?.Code === "NoSuchKey") {
      return NextResponse.json(
        {
          error: "PDF not found",
          detail:
            "PDF is unavailable after auto-sync attempt. Check AIP_SYNC_URL/SYNC_SECRET and scraper server logs.",
        },
        { status: 404 }
      );
    }
    const msg = err?.message ?? String(e);
    const isAccessDenied =
      err?.name === "AccessDenied" ||
      err?.Code === "AccessDenied" ||
      /access denied|credentials/i.test(msg);
    const hint = isAccessDenied
      ? " Ensure the IAM user has s3:GetObject on this bucket for keys under aip/ead-pdf/*."
      : "";
    console.error("S3 AIP PDF read failed:", e);
    return NextResponse.json(
      { error: "Failed to load PDF", detail: msg + hint },
      { status: 502 }
    );
  }
}
