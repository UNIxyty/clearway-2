import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/permissions/server";
import { failure, upstreamFailure } from "@/lib/public-error";

export const dynamic = "force-dynamic";

// Check the AIP library's links now (every country, or ?country=), through the aip-sync worker. The whole table runs
// in the background and takes some minutes; one country answers when done.
const AIP_SYNC_URL = process.env.AIP_SYNC_URL?.replace(/\/$/, "");
const SECRET = process.env.NOTAM_SYNC_SECRET ?? "";

export async function POST(request: Request) {
  const auth = await requirePermission("portal.aip.fetch");
  if ("error" in auth) return auth.error;
  if (!AIP_SYNC_URL) return failure(503, "The AIP library is not set up on this server.", { tag: "AIP-LIBRARY", what: "AIP_SYNC_URL is not set" }, { code: "not_configured" });
  const country = new URL(request.url).searchParams.get("country")?.trim().slice(0, 60) ?? "";
  try {
    const headers: HeadersInit = {};
    if (SECRET) headers["X-Sync-Secret"] = SECRET;
    const r = await fetch(`${AIP_SYNC_URL}/library/check${country ? `?country=${encodeURIComponent(country)}` : ""}`, { method: "POST", headers, signal: AbortSignal.timeout(country ? 120_000 : 20_000) });
    if (!r.ok) return upstreamFailure("The check could not be started. Try again in a minute.", r.status);
    return NextResponse.json(await r.json(), { status: r.status });
  } catch {
    return upstreamFailure("The AIP library service did not answer.", "unreachable");
  }
}
