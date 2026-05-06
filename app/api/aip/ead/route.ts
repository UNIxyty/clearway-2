import { NextRequest, NextResponse } from "next/server";
import { readJsonFromStorage, removeFromStorage, writeJsonToStorage } from "@/lib/aip-storage";
import { requireAuthenticatedUser } from "@/lib/admin-auth";
import { hasInternalDebugAccess } from "@/lib/internal-debug-auth";

const AIP_SYNC_URL = process.env.AIP_SYNC_URL?.replace(/\/$/, "");
const NOTAM_SYNC_SECRET = process.env.NOTAM_SYNC_SECRET ?? "";
const AIP_EAD_PREFIX = "aip/ead";
const SYNC_TIMEOUT_MS = 600_000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h – delete cache older than this
const FAST_CACHE_MAX_AGE_MS = Number(process.env.AIP_FAST_CACHE_MAX_AGE_MS || 6 * 60 * 60 * 1000); // 6h

async function getFromStorage(icao: string): Promise<{ airports: unknown[]; updatedAt: string | null } | null> {
  try {
    const key = `${AIP_EAD_PREFIX}/${icao}.json`;
    const data = await readJsonFromStorage<{ airports?: unknown[]; updatedAt?: string | null }>(key);
    if (!data) return null;
    const updatedAt = data.updatedAt ?? null;
    if (updatedAt) {
      const age = Date.now() - new Date(updatedAt).getTime();
      if (age >= CACHE_TTL_MS) {
        await removeFromStorage(key).catch(() => {});
        return null;
      }
    }
    return {
      airports: Array.isArray(data.airports) ? data.airports : [],
      updatedAt,
    };
  } catch {
    return null;
  }
}

async function putToStorage(icao: string, payload: { airports: unknown[]; updatedAt: string }): Promise<void> {
  try {
    const key = `${AIP_EAD_PREFIX}/${icao}.json`;
    await writeJsonToStorage(key, payload);
  } catch (e) {
    console.error("Local AIP EAD write failed:", e);
  }
}

function ageMs(updatedAt: string | null): number | null {
  if (!updatedAt) return null;
  const ts = new Date(updatedAt).getTime();
  if (!Number.isFinite(ts)) return null;
  return Date.now() - ts;
}

async function fetchFromSyncServer(icao: string, extract: boolean, stream = false): Promise<Response> {
  if (!AIP_SYNC_URL) {
    throw new Error("AIP sync not configured");
  }
  const syncUrl = `${AIP_SYNC_URL}/sync?icao=${encodeURIComponent(icao)}${stream ? "&stream=1" : ""}&extract=${extract ? "1" : "0"}`;
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (NOTAM_SYNC_SECRET) headers["X-Sync-Secret"] = NOTAM_SYNC_SECRET;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SYNC_TIMEOUT_MS);
  try {
    return await fetch(syncUrl, { method: "GET", headers, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}


export async function GET(request: NextRequest) {
  if (!hasInternalDebugAccess(request)) {
    const auth = await requireAuthenticatedUser();
    if ("error" in auth) return auth.error;
  }

  const icao = request.nextUrl.searchParams.get("icao")?.trim().toUpperCase() ?? "";
  const sync = request.nextUrl.searchParams.get("sync") === "1" || request.nextUrl.searchParams.get("sync") === "true";
  const stream = request.nextUrl.searchParams.get("stream") === "1" || request.nextUrl.searchParams.get("stream") === "true";
  const extract = !(request.nextUrl.searchParams.get("extract") === "0" || request.nextUrl.searchParams.get("extract") === "false");
  const force = request.nextUrl.searchParams.get("force") === "1" || request.nextUrl.searchParams.get("force") === "true";

  if (!/^[A-Z0-9]{4}$/.test(icao)) {
    return NextResponse.json({ error: "Valid 4-letter ICAO required" }, { status: 400 });
  }

  if (!sync) {
    const fromStorage = await getFromStorage(icao);
    if (fromStorage) {
      return NextResponse.json({ airports: fromStorage.airports, updatedAt: fromStorage.updatedAt });
    }
    return NextResponse.json({ airports: [], updatedAt: null }, { status: 200 });
  }

  if (!AIP_SYNC_URL) {
    return NextResponse.json(
      {
        error: "AIP sync not configured",
        detail: "Set AIP_SYNC_URL to your self-hosted AIP sync service.",
      },
      { status: 503 }
    );
  }

  if (!stream && !force) {
    const fromStorage = await getFromStorage(icao);
    if (fromStorage) {
      const age = ageMs(fromStorage.updatedAt);
      const stale = age === null || age > FAST_CACHE_MAX_AGE_MS;
      return NextResponse.json({
        airports: fromStorage.airports,
        updatedAt: fromStorage.updatedAt,
        cache: {
          served: true,
          stale,
          ageMs: age,
          refreshStarted: false,
        },
      });
    }
  }

  try {
    const res = await fetchFromSyncServer(icao, extract, stream);
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
    const data = (await res.json().catch(() => ({}))) as { error?: string; detail?: string; code?: number; airports?: unknown[] };
    if (!res.ok) {
      const code = typeof data.code === "number" ? data.code : undefined;
      let status = 502;
      if (res.status === 401) status = 401;
      else if (res.status === 402 || code === 402) status = 402;
      else if (res.status >= 400 && res.status < 600) status = res.status;
      return NextResponse.json({ error: data.error ?? "Sync failed", detail: data.detail, ...(code !== undefined ? { code } : {}) }, { status });
    }
    const airports = Array.isArray(data.airports) ? data.airports : [];
    const updatedAt = new Date().toISOString();
    await putToStorage(icao, { airports, updatedAt });
    return NextResponse.json({ airports, updatedAt, cache: { served: false } });
  } catch (e) {
    if (request.signal.aborted) {
      return NextResponse.json({ error: "Request cancelled by client" }, { status: 499 });
    }
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: "AIP sync request failed", detail: `Cannot reach AIP sync server. ${msg}` },
      { status: 502 }
    );
  }
}
