import { NextRequest, NextResponse } from "next/server";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

const BUCKET = process.env.AWS_NOTAMS_BUCKET || process.env.AWS_S3_BUCKET;
const AIP_EAD_PDF_PREFIX = "aip/ead-pdf";

export async function GET(request: NextRequest) {
  const icao = request.nextUrl.searchParams.get("icao")?.trim().toUpperCase() ?? "";

  if (!/^[A-Z0-9]{4}$/.test(icao)) {
    return NextResponse.json({ error: "Valid 4-letter ICAO required" }, { status: 400 });
  }

  if (!BUCKET) {
    return NextResponse.json(
      { error: "PDF storage not configured", detail: "Set AWS_S3_BUCKET (or AWS_NOTAMS_BUCKET)." },
      { status: 503 }
    );
  }

  try {
    const client = new S3Client({ region: process.env.AWS_REGION || "us-east-1" });
    const key = `${AIP_EAD_PDF_PREFIX}/${icao}.pdf`;
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
        "Content-Disposition": `attachment; filename="${icao}_AIP_AD2.pdf"`,
      },
    });
  } catch (e: unknown) {
    const err = e as { name?: string; Code?: string };
    if (err?.name === "NoSuchKey" || err?.Code === "NoSuchKey") {
      return NextResponse.json(
        { error: "PDF not found", detail: "Sync this airport first to download the AIP PDF." },
        { status: 404 }
      );
    }
    console.error("S3 AIP PDF read failed:", e);
    return NextResponse.json({ error: "Failed to load PDF" }, { status: 502 });
  }
}
