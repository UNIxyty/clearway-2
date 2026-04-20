import { NextRequest, NextResponse } from "next/server";
import { readJsonFromStorage, removeFromStorage, writeJsonToStorage } from "@/lib/aip-storage";

const AIP_SYNC_URL = process.env.AIP_SYNC_URL?.replace(/\/$/, "");
const NOTAM_SYNC_SECRET = process.env.NOTAM_SYNC_SECRET ?? "";
const JSON_PREFIX = "aip/scraper";
const SYNC_TIMEOUT_MS = 600_000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

async function getFromStorage(icao: string): Promise<{ airports: unknown[]; updatedAt: string | null } | null> {
  try {
    const key = `${JSON_PREFIX}/${icao}.json`;
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
    return { airports: Array.isArray(data.airports) ? data.airports : [], updatedAt };
  } catch {
    return null;
  }
}

async function putToStorage(icao: string, payload: { airports: unknown[]; updatedAt: string }): Promise<void> {
  await writeJsonToStorage(`${JSON_PREFIX}/${icao}.json`, payload);
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
    const fromStorage = await getFromStorage(icao);
    if (fromStorage && fromStorage.airports.length > 0) {
      return NextResponse.json({ airports: fromStorage.airports, updatedAt: fromStorage.updatedAt });
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
    const onAbort = () => controller.abort();
    request.signal.addEventListener("abort", onAbort, { once: true });
    const timeout = setTimeout(() => controller.abort(), SYNC_TIMEOUT_MS);
    const res = await fetch(syncUrl, { method: "GET", headers, signal: controller.signal });
    clearTimeout(timeout);
    request.signal.removeEventListener("abort", onAbort);
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
    await putToStorage(icao, { airports, updatedAt });
    return NextResponse.json({ airports, updatedAt });
  } catch (e) {
    if (request.signal.aborted) {
      return NextResponse.json({ error: "Request cancelled by client" }, { status: 499 });
    }
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: "AIP sync request failed", detail: `Cannot reach AIP sync server. ${msg}` },
      { status: 502 },
    );
  }
}
