import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/permissions/server";
import { failure, upstreamFailure } from "@/lib/public-error";

export const dynamic = "force-dynamic";

// The AIP library's table (bug report 8 item 3, 2026-11-10): one row per country with the official, GEN and ENR links
// and their last check, kept by the aip-sync worker (scripts/aip-library.mjs). Staff only; a client never reaches /api
// outside the client allow-list.
const AIP_SYNC_URL = process.env.AIP_SYNC_URL?.replace(/\/$/, "");
const SECRET = process.env.NOTAM_SYNC_SECRET ?? "";

export async function GET() {
  const auth = await requirePermission("portal.aip.fetch");
  if ("error" in auth) return auth.error;
  if (!AIP_SYNC_URL) return failure(503, "The AIP library is not set up on this server.", { tag: "AIP-LIBRARY", what: "AIP_SYNC_URL is not set" }, { code: "not_configured" });
  try {
    const headers: HeadersInit = {};
    if (SECRET) headers["X-Sync-Secret"] = SECRET;
    const r = await fetch(`${AIP_SYNC_URL}/library`, { headers, signal: AbortSignal.timeout(20_000), cache: "no-store" });
    if (!r.ok) return upstreamFailure("The AIP library could not be read. Try again in a minute.", r.status);
    return NextResponse.json(await r.json());
  } catch {
    return upstreamFailure("The AIP library service did not answer.", "unreachable");
  }
}
