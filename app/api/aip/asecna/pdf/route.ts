import { NextRequest, NextResponse } from "next/server";
import { S3Client, GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";

const BUCKET = process.env.AWS_NOTAMS_BUCKET || process.env.AWS_S3_BUCKET;
const REGION = process.env.AWS_REGION || "us-east-1";
const PREFIX = "aip/asecna-pdf";

function s3() {
  return new S3Client({ region: REGION });
}

function contentDisposition(inline: boolean, icao: string) {
  const file = `${icao}_ASECNA_AD2.pdf`;
  return inline ? `inline; filename="${file}"` : `attachment; filename="${file}"`;
}

function useInline(request: NextRequest): boolean {
  const p = request.nextUrl.searchParams;
  if (p.get("download") === "1" || p.get("attachment") === "1") return false;
  return p.get("inline") === "1" || p.get("inline") === "true";
}

export async function HEAD(request: NextRequest) {
  const icao = request.nextUrl.searchParams.get("icao")?.trim().toUpperCase() ?? "";
  if (!/^[A-Z0-9]{4}$/.test(icao) || !BUCKET) return new NextResponse(null, { status: 400 });
  try {
    await s3().send(new HeadObjectCommand({ Bucket: BUCKET, Key: `${PREFIX}/${icao}.pdf` }));
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
  const inline = useInline(request);
  const key = `${PREFIX}/${icao}.pdf`;
  try {
    const res = await s3().send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    const body = res.Body;
    if (!body) return new NextResponse(null, { status: 404 });
    const bytes = await body.transformToByteArray();
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
    const missing = (err as { name?: string; Code?: string }).name === "NoSuchKey";
    if (missing) return NextResponse.json({ error: "PDF not found" }, { status: 404 });
    return NextResponse.json({ error: "Failed to load PDF" }, { status: 502 });
  }
}
