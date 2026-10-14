import { NextRequest, NextResponse } from "next/server";
import { hasInternalDebugAccess } from "@/lib/internal-debug-auth";
import { failure, logFailure, publicEventStream, upstreamFailure } from "@/lib/public-error";
import { AIP_NOT_SET_UP, AIP_NO_ANSWER, GEN_FAILED, aipSyncFailure } from "@/lib/aip-sync-failure";
import { requirePermission } from "@/lib/permissions/server";

const AIP_SYNC_URL = process.env.AIP_SYNC_URL?.replace(/\/$/, "");
const NOTAM_SYNC_SECRET = process.env.NOTAM_SYNC_SECRET ?? "";
const SYNC_TIMEOUT_MS = 600_000;

export async function GET(request: NextRequest) {
  if (!hasInternalDebugAccess(request)) {
    const auth = await requirePermission("portal.aip.fetch");
    if ("error" in auth) return auth.error;
  }

  const icao = request.nextUrl.searchParams.get("icao")?.trim().toUpperCase() ?? "";
  const stream = request.nextUrl.searchParams.get("stream") === "1" || request.nextUrl.searchParams.get("stream") === "true";

  const prefix = icao.length >= 2 ? icao.slice(0, 2) : "";
  if (!/^[A-Z0-9]{4}$/.test(icao) || !prefix) {
    return NextResponse.json({ error: "Valid 4-letter ICAO required" }, { status: 400 });
  }

  if (!AIP_SYNC_URL) {
    return failure(503, AIP_NOT_SET_UP, { tag: "AIP-GEN-SYNC", what: "GEN sync requested but AIP_SYNC_URL is not set" }, { code: "not_configured" });
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
      return new Response(publicEventStream(res.body, "AIP-GEN-SYNC", (e) => aipSyncFailure(e, GEN_FAILED)), {
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
      logFailure("AIP-GEN-SYNC", `GEN sync for ${icao} returned ${res.status}`, { error: data.error, detail: data.detail });
      return NextResponse.json({ ...aipSyncFailure({ ...data, status: res.status }, GEN_FAILED), upstreamStatus: res.status }, { status: res.status === 401 ? 401 : 503 });
    }
    return NextResponse.json({ ok: true, prefix: data.prefix ?? prefix });
  } catch (e) {
    return upstreamFailure(AIP_NO_ANSWER, "unreachable", { tag: "AIP-GEN-SYNC", what: `GEN sync for ${icao} unreachable`, detail: e });
  }
}
