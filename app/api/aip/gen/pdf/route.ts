import { NextRequest, NextResponse } from "next/server";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { buildPdfDownloadFilename } from "@/lib/pdf-download-filename";
import { resolveGenPrefix } from "@/lib/ead-gen-prefix";

const BUCKET = process.env.AWS_NOTAMS_BUCKET || process.env.AWS_S3_BUCKET;
const GEN_PDF_PREFIX = "aip/gen-pdf";

export async function GET(request: NextRequest) {
  const icao = request.nextUrl.searchParams.get("icao")?.trim().toUpperCase() ?? "";
  const prefixParam = request.nextUrl.searchParams.get("prefix")?.trim().toUpperCase() ?? "";

  const prefix = resolveGenPrefix(icao, prefixParam);
  if (!/^[A-Z]{2}$/.test(prefix)) {
    return NextResponse.json(
      { error: "Valid ICAO or 2-letter prefix required (e.g. icao=EDQA or prefix=ED)" },
      { status: 400 }
    );
  }

  if (!BUCKET) {
    return NextResponse.json(
      { error: "PDF storage not configured", detail: "Set AWS_S3_BUCKET (or AWS_NOTAMS_BUCKET) in Vercel." },
      { status: 503 }
    );
  }

  const region = process.env.AWS_REGION || "us-east-1";
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    return NextResponse.json(
      {
        error: "S3 credentials not configured",
        detail: "Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in Vercel.",
      },
      { status: 503 }
    );
  }

  try {
    const client = new S3Client({ region });
    const key = `${GEN_PDF_PREFIX}/${prefix}-GEN-1.2.pdf`;
    const filename = buildPdfDownloadFilename("GEN12", icao || prefix);
    const res = await client.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    const body = res.Body;
    if (!body) return new NextResponse(null, { status: 404 });

    const bytes = await body.transformToByteArray();
    const copy = new Uint8Array(bytes.length);
    copy.set(bytes);
    return new NextResponse(copy, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (e: unknown) {
    const err = e as { name?: string; Code?: string; message?: string };
    if (err?.name === "NoSuchKey" || err?.Code === "NoSuchKey") {
      return NextResponse.json(
        { error: "PDF not found", detail: "Sync GEN first to download the PDF." },
        { status: 404 }
      );
    }
    const msg = err?.message ?? String(e);
    console.error("S3 GEN PDF read failed:", e);
    return NextResponse.json(
      { error: "Failed to load PDF", detail: msg },
      { status: 502 }
    );
  }
}
