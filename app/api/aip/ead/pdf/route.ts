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
      { error: "PDF storage not configured", detail: "Set AWS_S3_BUCKET (or AWS_NOTAMS_BUCKET) in Vercel." },
      { status: 503 }
    );
  }

  const region = process.env.AWS_REGION || "us-east-1";
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    return NextResponse.json(
      {
        error: "S3 credentials not configured",
        detail: "Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in Vercel (same as for NOTAMs). IAM user must have s3:GetObject on your bucket, including aip/ead-pdf/*.",
      },
      { status: 503 }
    );
  }

  try {
    const client = new S3Client({ region });
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
    const err = e as { name?: string; Code?: string; message?: string };
    if (err?.name === "NoSuchKey" || err?.Code === "NoSuchKey") {
      return NextResponse.json(
        { error: "PDF not found", detail: "Sync this airport first to download the AIP PDF." },
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
