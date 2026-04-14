import { NextRequest, NextResponse } from "next/server";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { resolveGenPrefix } from "@/lib/ead-gen-prefix";

const BUCKET = process.env.AWS_NOTAMS_BUCKET || process.env.AWS_S3_BUCKET;
const GEN_PREFIX = "aip/gen";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function s3Client() {
  return new S3Client({ region: process.env.AWS_REGION || "us-east-1" });
}

export type GenPart = { raw: string; rewritten: string };
export type GenPayload = {
  general: GenPart;
  nonScheduled: GenPart;
  privateFlights: GenPart;
  updatedAt: string;
};

function emptyPart(): GenPart {
  return { raw: "", rewritten: "" };
}

function normPart(p: unknown): GenPart {
  if (p && typeof p === "object" && "raw" in p) {
    const o = p as { raw?: string; rewritten?: string };
    return {
      raw: typeof o.raw === "string" ? o.raw : "",
      rewritten: typeof o.rewritten === "string" ? o.rewritten : (o.raw ?? ""),
    };
  }
  return emptyPart();
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
      nonScheduled?: GenPart;
      privateFlights?: GenPart;
      updatedAt?: string;
    };
    // New format: general + nonScheduled + privateFlights
    if (data.general && typeof data.general === "object") {
      return {
        general: normPart(data.general),
        nonScheduled: normPart(data.nonScheduled),
        privateFlights: data.privateFlights && typeof data.privateFlights === "object"
          ? normPart(data.privateFlights)
          : normPart(data.part4),
        updatedAt: data.updatedAt ?? new Date().toISOString(),
      };
    }
    // Legacy: single raw/rewritten
    if (typeof data.raw !== "string") return null;
    return {
      general: { raw: data.raw, rewritten: typeof data.rewritten === "string" ? data.rewritten : data.raw },
      nonScheduled: emptyPart(),
      privateFlights: emptyPart(),
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

  const prefix = resolveGenPrefix(icao, prefixParam);
  if (!/^[A-Z]{2}$/.test(prefix)) {
    return NextResponse.json(
      { error: "Valid ICAO or 2-letter prefix required (e.g. icao=EDQA or prefix=ED)" },
      { status: 400 }
    );
  }

  const payload = await getGenFromS3(prefix);
  if (!payload) {
    return NextResponse.json(
      { general: emptyPart(), nonScheduled: emptyPart(), privateFlights: emptyPart(), updatedAt: null },
      { status: 200 }
    );
  }
  if (payload.updatedAt) {
    const age = Date.now() - new Date(payload.updatedAt).getTime();
    if (age >= CACHE_TTL_MS) {
      return NextResponse.json(
        { general: emptyPart(), nonScheduled: emptyPart(), privateFlights: emptyPart(), updatedAt: null, expired: true },
        { status: 200 }
      );
    }
  }
  return NextResponse.json(payload);
}
