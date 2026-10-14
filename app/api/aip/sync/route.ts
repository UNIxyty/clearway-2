import { NextRequest, NextResponse } from "next/server";
import { failure, logFailure } from "@/lib/public-error";
import { AIP_NOT_SET_UP, AIP_NO_ANSWER, aipSyncFailure } from "@/lib/aip-sync-failure";
import { requirePermission } from "@/lib/permissions/server";
import { hasInternalDebugAccess } from "@/lib/internal-debug-auth";

const AIP_SYNC_URL = process.env.AIP_SYNC_URL?.replace(/\/$/, "");
const NOTAM_SYNC_SECRET = process.env.NOTAM_SYNC_SECRET ?? "";

export async function GET(request: NextRequest) {
  if (!hasInternalDebugAccess(request)) {
    const auth = await requirePermission("portal.aip.fetch");
    if ("error" in auth) return auth.error;
  }
  const icao = request.nextUrl.searchParams.get("icao")?.trim().toUpperCase() ?? "";

  if (!/^[A-Z0-9]{4}$/.test(icao)) {
    return NextResponse.json({ error: "Valid 4-letter ICAO required" }, { status: 400 });
  }

  if (!AIP_SYNC_URL) {
    return failure(503, AIP_NOT_SET_UP, { tag: "AIP-SYNC", what: "AIP sync requested but AIP_SYNC_URL is not set" }, { code: "not_configured" });
  }

  const syncUrl = `${AIP_SYNC_URL}/sync?icao=${encodeURIComponent(icao)}`;
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (NOTAM_SYNC_SECRET) headers["X-Sync-Secret"] = NOTAM_SYNC_SECRET;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 600_000);
    const res = await fetch(syncUrl, { method: "GET", headers, signal: controller.signal });
    clearTimeout(timeout);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      logFailure("AIP-SYNC", `AIP sync for ${icao} returned ${res.status}`, { error: data.error, detail: data.detail });
      return NextResponse.json(aipSyncFailure({ ...data, status: res.status }), { status: res.status === 401 ? 401 : 502 });
    }
    return NextResponse.json(data);
  } catch (e) {
    return failure(502, AIP_NO_ANSWER, { tag: "AIP-SYNC", what: `AIP sync for ${icao} unreachable`, detail: e });
  }
}
