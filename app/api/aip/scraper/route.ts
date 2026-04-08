import { NextRequest, NextResponse } from "next/server";
import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

const AIP_SYNC_URL = process.env.AIP_SYNC_URL?.replace(/\/$/, "");
const NOTAM_SYNC_SECRET = process.env.NOTAM_SYNC_SECRET ?? "";
const BUCKET = process.env.AWS_NOTAMS_BUCKET || process.env.AWS_S3_BUCKET;
const JSON_PREFIX = "aip/scraper";
const SYNC_TIMEOUT_MS = 600_000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function s3Client() {
  return new S3Client({ region: process.env.AWS_REGION || "us-east-1" });
}

async function getFromS3(icao: string): Promise<{ airports: unknown[]; updatedAt: string | null } | null> {
  if (!BUCKET) return null;
  try {
    const client = s3Client();
    const key = `${JSON_PREFIX}/${icao}.json`;
    const res = await client.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    const body = await res.Body?.transformToString();
    if (!body) return null;
    const data = JSON.parse(body) as { airports?: unknown[]; updatedAt?: string | null };
    const updatedAt = data.updatedAt ?? null;
    if (updatedAt) {
      const age = Date.now() - new Date(updatedAt).getTime();
      if (age >= CACHE_TTL_MS) {
        await client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key })).catch(() => {});
        return null;
      }
    }
    return { airports: Array.isArray(data.airports) ? data.airports : [], updatedAt };
  } catch {
    return null;
  }
}

async function putToS3(icao: string, payload: { airports: unknown[]; updatedAt: string }): Promise<void> {
  if (!BUCKET) return;
  const client = s3Client();
  await client.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: `${JSON_PREFIX}/${icao}.json`,
      Body: JSON.stringify(payload),
      ContentType: "application/json",
    }),
  );
}

export async function GET(request: NextRequest) {
  const icao = request.nextUrl.searchParams.get("icao")?.trim().toUpperCase() ?? "";
  const sync = request.nextUrl.searchParams.get("sync") === "1" || request.nextUrl.searchParams.get("sync") === "true";
  const stream = request.nextUrl.searchParams.get("stream") === "1" || request.nextUrl.searchParams.get("stream") === "true";
  const extract = !(request.nextUrl.searchParams.get("extract") === "0" || request.nextUrl.searchParams.get("extract") === "false");

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
        detail: "Set AIP_SYNC_URL in Vercel to your AIP EC2 sync server.",
      },
      { status: 503 },
    );
  }

  const syncUrl = `${AIP_SYNC_URL}/sync?icao=${encodeURIComponent(icao)}${stream ? "&stream=1" : ""}&extract=${extract ? "1" : "0"}&scraper=1`;
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (NOTAM_SYNC_SECRET) headers["X-Sync-Secret"] = NOTAM_SYNC_SECRET;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SYNC_TIMEOUT_MS);
    const res = await fetch(syncUrl, { method: "GET", headers, signal: controller.signal });
    clearTimeout(timeout);
    if (stream && res.ok && res.body) {
      return new Response(res.body, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        },
      });
    }
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      detail?: string;
      code?: number;
      airports?: unknown[];
    };
    if (!res.ok) {
      return NextResponse.json(
        { error: data.error ?? "Sync failed", detail: data.detail, ...(typeof data.code === "number" ? { code: data.code } : {}) },
        { status: res.status >= 400 && res.status < 600 ? res.status : 502 },
      );
    }
    const airports = Array.isArray(data.airports) ? data.airports : [];
    const updatedAt = new Date().toISOString();
    await putToS3(icao, { airports, updatedAt });
    return NextResponse.json({ airports, updatedAt });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: "AIP sync request failed", detail: `Cannot reach AIP sync server. ${msg}` },
      { status: 502 },
    );
  }
}
