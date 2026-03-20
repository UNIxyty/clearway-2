import { NextRequest, NextResponse } from "next/server";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

const WEATHER_BUCKET = process.env.AWS_NOTAMS_BUCKET || process.env.AWS_S3_BUCKET;
const WEATHER_PREFIX = process.env.WEATHER_S3_PREFIX || "weather";
const NOTAM_SYNC_URL = process.env.NOTAM_SYNC_URL?.replace(/\/$/, "");
const NOTAM_SYNC_SECRET = process.env.NOTAM_SYNC_SECRET ?? "";
const SYNC_TIMEOUT_MS = 120_000;

type WeatherPayload = {
  icao: string;
  weather: string;
  updatedAt: string | null;
};

async function getFromS3(icao: string): Promise<WeatherPayload | null> {
  if (!WEATHER_BUCKET) return null;
  try {
    const client = new S3Client({ region: process.env.AWS_REGION || "us-east-1" });
    const key = `${WEATHER_PREFIX}/${icao}.json`;
    const res = await client.send(new GetObjectCommand({ Bucket: WEATHER_BUCKET, Key: key }));
    const body = await res.Body?.transformToString();
    if (!body) return null;
    const data = JSON.parse(body) as { icao?: string; weather?: string; updatedAt?: string };
    return {
      icao: data.icao ?? icao,
      weather: data.weather ?? "",
      updatedAt: data.updatedAt ?? null,
    };
  } catch (e: unknown) {
    const err = e as { name?: string; Code?: string };
    if (err?.name !== "NoSuchKey" && err?.Code !== "NoSuchKey") {
      console.error("S3 weather read failed:", e);
    }
    return null;
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const icao = searchParams.get("icao")?.trim().toUpperCase() ?? "";
  const sync = searchParams.get("sync") === "1" || searchParams.get("sync") === "true";
  const stream = searchParams.get("stream") === "1" || searchParams.get("stream") === "true";

  if (!/^[A-Z0-9]{4}$/.test(icao)) {
    return NextResponse.json({ error: "Valid 4-letter ICAO code required" }, { status: 400 });
  }

  if (sync) {
    if (!NOTAM_SYNC_URL) {
      return NextResponse.json({ error: "Sync not configured", detail: "Set NOTAM_SYNC_URL for weather sync." }, { status: 503 });
    }
    const syncUrl = `${NOTAM_SYNC_URL}/sync/weather?icao=${encodeURIComponent(icao)}${stream ? "&stream=1" : ""}`;
    const headers: HeadersInit = { "Content-Type": "application/json" };
    if (NOTAM_SYNC_SECRET) headers["X-Sync-Secret"] = NOTAM_SYNC_SECRET;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), SYNC_TIMEOUT_MS);
      const res = await fetch(syncUrl, { method: "GET", headers, signal: controller.signal });
      clearTimeout(timeoutId);

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
        weather?: string;
        updatedAt?: string;
        error?: string;
        detail?: string;
      };
      if (!res.ok) {
        return NextResponse.json({ error: data.error ?? "Weather sync failed", detail: data.detail }, { status: 502 });
      }
      return NextResponse.json({ icao, weather: data.weather ?? "", updatedAt: data.updatedAt ?? null });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ error: "Weather sync server unreachable", detail: msg }, { status: 502 });
    }
  }

  const fromS3 = await getFromS3(icao);
  if (fromS3) return NextResponse.json(fromS3);
  return NextResponse.json({ icao, weather: "", updatedAt: null });
}

