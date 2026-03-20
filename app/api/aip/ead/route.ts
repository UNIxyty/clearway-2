import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

const AIP_SYNC_URL = process.env.AIP_SYNC_URL?.replace(/\/$/, "");
const NOTAM_SYNC_SECRET = process.env.NOTAM_SYNC_SECRET ?? "";
const BUCKET = process.env.AWS_NOTAMS_BUCKET || process.env.AWS_S3_BUCKET;
const AIP_EAD_PREFIX = "aip/ead";
const SYNC_TIMEOUT_MS = 600_000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h – delete cache older than this
const DISABLE_AI_FOR_TESTING = String(process.env.DISABLE_AI_FOR_TESTING || "").toLowerCase() === "true";

function s3Client() {
  return new S3Client({ region: process.env.AWS_REGION || "us-east-1" });
}

async function getFromS3(icao: string): Promise<{ airports: unknown[]; updatedAt: string | null } | null> {
  if (!BUCKET) return null;
  try {
    const client = s3Client();
    const key = `${AIP_EAD_PREFIX}/${icao}.json`;
    const res = await client.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    const body = await res.Body?.transformToString();
    if (!body) return null;
    const data = JSON.parse(body) as { airports?: unknown[]; updatedAt?: string | null };
    const updatedAt = data.updatedAt ?? null;
    if (updatedAt) {
      const age = Date.now() - new Date(updatedAt).getTime();
      if (age >= CACHE_TTL_MS) {
        await client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key })).catch((e) => console.error("S3 AIP EAD delete stale failed:", e));
        return null;
      }
    }
    return {
      airports: Array.isArray(data.airports) ? data.airports : [],
      updatedAt,
    };
  } catch (e: unknown) {
    const err = e as { name?: string; Code?: string };
    if (err?.name !== "NoSuchKey" && err?.Code !== "NoSuchKey") {
      console.error("S3 AIP EAD read failed:", e);
    }
    return null;
  }
}

async function putToS3(icao: string, payload: { airports: unknown[]; updatedAt: string }): Promise<void> {
  if (!BUCKET) return;
  try {
    const client = s3Client();
    const key = `${AIP_EAD_PREFIX}/${icao}.json`;
    await client.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: JSON.stringify(payload),
        ContentType: "application/json",
      })
    );
  } catch (e) {
    console.error("S3 AIP EAD write failed:", e);
  }
}

export async function GET(request: NextRequest) {
  const icao = request.nextUrl.searchParams.get("icao")?.trim().toUpperCase() ?? "";
  const sync = request.nextUrl.searchParams.get("sync") === "1" || request.nextUrl.searchParams.get("sync") === "true";
  const stream = request.nextUrl.searchParams.get("stream") === "1" || request.nextUrl.searchParams.get("stream") === "true";

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

  // Read user's AIP model preference (no default — user must choose in Settings)
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  let userAipModel: string | null = null;
  
  if (url && anonKey) {
    try {
      const cookieStore = cookies();
      const supabase = createServerClient(url, anonKey, {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll() {},
        },
      });

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: prefs } = await supabase
          .from("user_preferences")
          .select("aip_model")
          .eq("user_id", user.id)
          .maybeSingle();
        
        if (prefs?.aip_model) {
          userAipModel = prefs.aip_model;
        }
      }
    } catch (e) {
      console.error("Failed to read user AIP model pref:", e);
    }
  }

  const modelParam = userAipModel || process.env.OPENAI_MODEL || "gpt-4o-mini";
  const extractParam = DISABLE_AI_FOR_TESTING ? "&extract=regex" : "";
  const syncUrl = `${AIP_SYNC_URL}/sync?icao=${encodeURIComponent(icao)}${stream ? "&stream=1" : ""}&model=${encodeURIComponent(modelParam)}${extractParam}`;
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
    const data = (await res.json().catch(() => ({}))) as { error?: string; detail?: string; airports?: unknown[]; done?: boolean };
    if (!res.ok) {
      return NextResponse.json(
        { error: data.error ?? "Sync failed", detail: data.detail },
        { status: res.status === 401 ? 401 : 502 }
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
      { status: 502 }
    );
  }
}
