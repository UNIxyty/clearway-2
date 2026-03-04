import { NextRequest, NextResponse } from "next/server";

const AIP_SYNC_URL = process.env.AIP_SYNC_URL?.replace(/\/$/, "");
const NOTAM_SYNC_SECRET = process.env.NOTAM_SYNC_SECRET ?? "";

export async function GET(request: NextRequest) {
  const icao = request.nextUrl.searchParams.get("icao")?.trim().toUpperCase() ?? "";
  const extract = request.nextUrl.searchParams.get("extract"); // "regex" or omit for AI

  if (!/^[A-Z0-9]{4}$/.test(icao)) {
    return NextResponse.json({ error: "Valid 4-letter ICAO required" }, { status: 400 });
  }

  if (!AIP_SYNC_URL) {
    return NextResponse.json(
      {
        error: "AIP sync not configured",
        detail:
          "Set AIP_SYNC_URL in Vercel to your AIP EC2 sync server (e.g. http://EC2-IP:3002). See scripts/AIP-AWS-SETUP.md.",
      },
      { status: 503 }
    );
  }

  const syncUrl = `${AIP_SYNC_URL}/sync?icao=${encodeURIComponent(icao)}${extract === "regex" ? "&extract=regex" : ""}`;
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (NOTAM_SYNC_SECRET) headers["X-Sync-Secret"] = NOTAM_SYNC_SECRET;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120_000);
    const res = await fetch(syncUrl, { method: "GET", headers, signal: controller.signal });
    clearTimeout(timeout);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json(
        { error: data.error ?? "Sync failed", detail: data.detail },
        { status: res.status === 401 ? 401 : 502 }
      );
    }
    return NextResponse.json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      {
        error: "AIP sync request failed",
        detail: `Cannot reach AIP sync server at AIP_SYNC_URL. Ensure the sync server is running on EC2 (node scripts/aip-sync-server.mjs), port 3002 is open, and AIP_SYNC_URL is correct. ${msg}`,
      },
      { status: 502 }
    );
  }
}
