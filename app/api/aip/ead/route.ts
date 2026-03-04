import { NextRequest, NextResponse } from "next/server";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

const AIP_SYNC_URL = process.env.AIP_SYNC_URL?.replace(/\/$/, "");
const NOTAM_SYNC_SECRET = process.env.NOTAM_SYNC_SECRET ?? "";
const BUCKET = process.env.AWS_NOTAMS_BUCKET || process.env.AWS_S3_BUCKET;
const AIP_EAD_PREFIX = "aip/ead";
const SYNC_TIMEOUT_MS = 600_000;

async function getFromS3(icao: string): Promise<{ airports: unknown[]; updatedAt: string | null } | null> {
  if (!BUCKET) return null;
  try {
    const client = new S3Client({ region: process.env.AWS_REGION || "us-east-1" });
    const key = `${AIP_EAD_PREFIX}/${icao}.json`;
    const res = await client.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    const body = await res.Body?.transformToString();
    if (!body) return null;
    const data = JSON.parse(body) as { airports?: unknown[]; updatedAt?: string | null };
    return {
      airports: Array.isArray(data.airports) ? data.airports : [],
      updatedAt: data.updatedAt ?? null,
    };
  } catch (e: unknown) {
    const err = e as { name?: string; Code?: string };
    if (err?.name !== "NoSuchKey" && err?.Code !== "NoSuchKey") {
      console.error("S3 AIP EAD read failed:", e);
    }
    return null;
  }
}

export async function GET(request: NextRequest) {
  const icao = request.nextUrl.searchParams.get("icao")?.trim().toUpperCase() ?? "";
  const sync = request.nextUrl.searchParams.get("sync") === "1" || request.nextUrl.searchParams.get("sync") === "true";

  if (!/^[A-Z0-9]{4}$/.test(icao)) {
    return NextResponse.json({ error: "Valid 4-letter ICAO required" }, { status: 400 });
  }

  if (!sync) {
    const fromS3 = await getFromS3(icao);
    if (fromS3 && fromS3.airports.length > 0) {
      return NextResponse.json({ airports: fromS3.airports, updatedAt: fromS3.updatedAt });
    }
    return NextResponse.json({ airports: [], updatedAt: null }, { status: 200 });
  }

  if (!AIP_SYNC_URL) {
    return NextResponse.json(
      {
        error: "AIP sync not configured",
        detail: "Set AIP_SYNC_URL in Vercel to your AIP EC2 sync server (e.g. http://EC2-IP:3002). See scripts/AIP-AWS-SETUP.md.",
      },
      { status: 503 }
    );
  }

  const syncUrl = `${AIP_SYNC_URL}/sync?icao=${encodeURIComponent(icao)}`;
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (NOTAM_SYNC_SECRET) headers["X-Sync-Secret"] = NOTAM_SYNC_SECRET;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SYNC_TIMEOUT_MS);
    const res = await fetch(syncUrl, { method: "GET", headers, signal: controller.signal });
    clearTimeout(timeout);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json(
        { error: data.error ?? "Sync failed", detail: data.detail },
        { status: res.status === 401 ? 401 : 502 }
      );
    }
    return NextResponse.json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: "AIP sync request failed", detail: `Cannot reach AIP sync server. ${msg}` },
      { status: 502 }
    );
  }
}
