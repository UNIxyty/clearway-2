import { NextRequest, NextResponse } from "next/server";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

const BUCKET = process.env.AWS_NOTAMS_BUCKET || process.env.AWS_S3_BUCKET;
const GEN_PREFIX = "aip/gen";

function s3Client() {
  return new S3Client({ region: process.env.AWS_REGION || "us-east-1" });
}

export type GenPart = { raw: string; rewritten: string };
export type GenPayload = {
  general: GenPart;
  part4: GenPart;
  updatedAt: string;
};

function emptyPart(): GenPart {
  return { raw: "", rewritten: "" };
}

async function getGenFromS3(prefix: string): Promise<GenPayload | null> {
  if (!BUCKET) return null;
  try {
    const client = s3Client();
    const key = `${GEN_PREFIX}/${prefix}.json`;
    const res = await client.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    const body = await res.Body?.transformToString();
    if (!body) return null;
    const data = JSON.parse(body) as {
      raw?: string;
      rewritten?: string;
      general?: GenPart;
      part4?: GenPart;
      updatedAt?: string;
    };
    // New format: general + part4
    if (data.general && typeof data.general === "object") {
      return {
        general: {
          raw: typeof data.general.raw === "string" ? data.general.raw : "",
          rewritten: typeof data.general.rewritten === "string" ? data.general.rewritten : (data.general.raw ?? ""),
        },
        part4: data.part4 && typeof data.part4 === "object"
          ? { raw: typeof data.part4.raw === "string" ? data.part4.raw : "", rewritten: typeof data.part4.rewritten === "string" ? data.part4.rewritten : (data.part4.raw ?? "") }
          : emptyPart(),
        updatedAt: data.updatedAt ?? new Date().toISOString(),
      };
    }
    // Legacy: single raw/rewritten
    if (typeof data.raw !== "string") return null;
    return {
      general: { raw: data.raw, rewritten: typeof data.rewritten === "string" ? data.rewritten : data.raw },
      part4: emptyPart(),
      updatedAt: data.updatedAt ?? new Date().toISOString(),
    };
  } catch (e: unknown) {
    const err = e as { name?: string; Code?: string };
    if (err?.name !== "NoSuchKey" && err?.Code !== "NoSuchKey") {
      console.error("S3 GEN read failed:", e);
    }
    return null;
  }
}

export async function GET(request: NextRequest) {
  const icao = request.nextUrl.searchParams.get("icao")?.trim().toUpperCase() ?? "";
  const prefixParam = request.nextUrl.searchParams.get("prefix")?.trim().toUpperCase() ?? "";

  const prefix = prefixParam || (icao.length >= 2 ? icao.slice(0, 2) : "");
  if (!/^[A-Z]{2}$/.test(prefix)) {
    return NextResponse.json(
      { error: "Valid ICAO or 2-letter prefix required (e.g. icao=EDQA or prefix=ED)" },
      { status: 400 }
    );
  }

  const payload = await getGenFromS3(prefix);
  if (!payload) {
    return NextResponse.json(
      { general: emptyPart(), part4: emptyPart(), updatedAt: null },
      { status: 200 }
    );
  }
  return NextResponse.json(payload);
}
