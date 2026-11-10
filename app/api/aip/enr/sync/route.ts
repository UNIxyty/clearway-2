import { NextRequest, NextResponse } from "next/server";
import { ENR_ENABLED, ENR_PAUSED_TEXT } from "@/lib/aip-enr.mjs";
import { failure, upstreamFailure } from "@/lib/public-error";
import { requirePermission } from "@/lib/permissions/server";

// Fetch ENR 1.1 for a prefix now, through the aip-sync worker (its /sync/enr: the country's own source, else EAD).
const AIP_SYNC_URL = process.env.AIP_SYNC_URL?.replace(/\/$/, "");
const NOTAM_SYNC_SECRET = process.env.NOTAM_SYNC_SECRET ?? "";

export async function GET(request: NextRequest) {
  const auth = await requirePermission("portal.aip.fetch");
  if ("error" in auth) return auth.error;
  if (!ENR_ENABLED) return NextResponse.json({ ok: false, error: ENR_PAUSED_TEXT, code: "enr-paused" }, { status: 503 });   // ENR is paused (lib/aip-enr.mjs)
  const prefix = (request.nextUrl.searchParams.get("prefix") || request.nextUrl.searchParams.get("icao") || "").trim().toUpperCase().slice(0, 2);
  if (!/^[A-Z]{2}$/.test(prefix)) return NextResponse.json({ error: "Valid prefix required (e.g. prefix=EV)" }, { status: 400 });
  if (!AIP_SYNC_URL) return failure(503, "The AIP sync worker is not set up on this server.", { tag: "AIP-ENR-SYNC", what: "AIP_SYNC_URL is not set" }, { code: "not_configured" });
  const headers: HeadersInit = {};
  if (NOTAM_SYNC_SECRET) headers["X-Sync-Secret"] = NOTAM_SYNC_SECRET;
  try {
    const r = await fetch(`${AIP_SYNC_URL}/sync/enr?prefix=${encodeURIComponent(prefix)}`, { headers, signal: AbortSignal.timeout(600_000) });
    const body = await r.json().catch(() => ({}));
    return NextResponse.json(body, { status: r.ok ? 200 : r.status === 404 ? 404 : r.status === 402 ? 402 : 503 });
  } catch { return upstreamFailure("The AIP sync worker did not answer.", "unreachable"); }
}
