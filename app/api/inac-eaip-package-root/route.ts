import { NextResponse } from "next/server";
import {
  INAC_HISTORY_PAGE_URL,
  indexUrlFromPackageRoot,
  resolveInacEaipPackageRoot,
} from "@/lib/inac-venezuela-eaip-resolve";
import { staffGate } from "@/lib/admin-auth";

export const revalidate = 300;

export async function GET(request: Request) {
  const notStaff = await staffGate(request); if (notStaff) return notStaff; // staff (or the platform's own services) only, checked here (2026-11-02)
  try {
    const packageRoot = await resolveInacEaipPackageRoot();
    return NextResponse.json({
      packageRoot,
      historyPageUrl: INAC_HISTORY_PAGE_URL,
      indexUrl: indexUrlFromPackageRoot(packageRoot),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message, upstreamStatus: "unknown" }, { status: 503 });
  }
}
