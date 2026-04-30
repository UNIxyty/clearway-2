import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/admin-auth";

const AIP_SYNC_URL = process.env.AIP_SYNC_URL?.replace(/\/$/, "");
const NOTAM_SYNC_SECRET = process.env.NOTAM_SYNC_SECRET ?? "";
const SYNC_TIMEOUT_MS = 300_000;

export async function GET(request: NextRequest) {
  const auth = await requireAuthenticatedUser();
  if ("error" in auth) return auth.error;

  const icao = request.nextUrl.searchParams.get("icao")?.trim().toUpperCase() ?? "";
  const stream = request.nextUrl.searchParams.get("stream") === "1" || request.nextUrl.searchParams.get("stream") === "true";

  const prefix = icao.length >= 2 ? icao.slice(0, 2) : "";
  if (!/^[A-Z0-9]{4}$/.test(icao) || !prefix) {
    return NextResponse.json({ error: "Valid 4-letter ICAO required" }, { status: 400 });
  }

  if (!AIP_SYNC_URL) {
    return NextResponse.json(
      { error: "AIP sync not configured", detail: "Set AIP_SYNC_URL in Vercel." },
      { status: 503 }
    );
  }

  const syncUrl = `${AIP_SYNC_URL}/sync/gen?icao=${encodeURIComponent(icao)}${stream ? "&stream=1" : ""}`;
  const headers: HeadersInit = {};
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
    const data = (await res.json().catch(() => ({}))) as { error?: string; detail?: string; ok?: boolean; prefix?: string };
    if (!res.ok) {
      return NextResponse.json(
        { error: data.error ?? "GEN sync failed", detail: data.detail },
        { status: res.status === 401 ? 401 : 502 }
      );
    }
    return NextResponse.json({ ok: true, prefix: data.prefix ?? prefix });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: "GEN sync request failed", detail: `Cannot reach AIP sync server. ${msg}` },
      { status: 502 }
    );
  }
}
