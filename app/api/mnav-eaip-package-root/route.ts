import { NextResponse } from "next/server";
import { resolveMnavNorthMacedoniaEaip } from "@/lib/mnav-north-macedonia-eaip-resolve";
import { staffGate } from "@/lib/admin-auth";

export const revalidate = 300;

export async function GET(request: Request) {
  const notStaff = await staffGate(request); if (notStaff) return notStaff; // staff (or the platform's own services) only, checked here (2026-11-02)
  try {
    const resolved = await resolveMnavNorthMacedoniaEaip();
    return NextResponse.json({
      packageRoot: resolved.packageRoot,
      currentIndexUrl: resolved.currentIndexUrl,
      effectiveDateLabel: resolved.effectiveDateLabel,
      startPageUrl: resolved.startPageUrl,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message, upstreamStatus: "unknown" }, { status: 503 });
  }
}
