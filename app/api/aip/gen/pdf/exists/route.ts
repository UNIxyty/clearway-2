import { NextRequest, NextResponse } from "next/server";
import { HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";

const BUCKET = process.env.AWS_NOTAMS_BUCKET || process.env.AWS_S3_BUCKET;
const EAD_GEN_PDF_PREFIX = "aip/gen-pdf";
const NON_EAD_GEN_PDF_PREFIX = "aip/non-ead-gen-pdf";

function s3() {
  const region = process.env.AWS_REGION || "us-east-1";
  return new S3Client({ region });
}

async function exists(client: S3Client, key: string): Promise<boolean> {
  try {
    await client.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return true;
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  const prefix = request.nextUrl.searchParams.get("prefix")?.trim().toUpperCase() ?? "";
  if (!/^[A-Z]{2}$/.test(prefix)) {
    return NextResponse.json({ error: "Valid 2-letter prefix required" }, { status: 400 });
  }
  if (!BUCKET) {
    return NextResponse.json({ exists: false, detail: "Bucket is not configured" }, { status: 200 });
  }
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    return NextResponse.json({ exists: false, detail: "S3 credentials are not configured" }, { status: 200 });
  }

  const client = s3();
  const eadKey = `${EAD_GEN_PDF_PREFIX}/${prefix}-GEN-1.2.pdf`;
  const nonEadKey = `${NON_EAD_GEN_PDF_PREFIX}/${prefix}-GEN-1.2.pdf`;

  const [eadExists, nonEadExists] = await Promise.all([exists(client, eadKey), exists(client, nonEadKey)]);
  return NextResponse.json({ exists: eadExists || nonEadExists, source: eadExists ? "ead" : nonEadExists ? "non-ead" : null });
}
