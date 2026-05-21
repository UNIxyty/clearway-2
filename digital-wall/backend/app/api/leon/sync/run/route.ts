import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { runLeonSync } from "@/lib/leon/sync";

function hasCronAccess(request: NextRequest) {
  const expected = String(process.env.LEON_SYNC_CRON_SECRET || "").trim();
  if (!expected) return false;
  const provided = String(request.headers.get("x-leon-sync-secret") || "").trim();
  return provided && provided === expected;
}

export async function POST(request: NextRequest) {
  try {
    const cron = hasCronAccess(request);
    if (!cron) {
      const auth = await requireAdmin();
      if ("error" in auth) return auth.error;
    }

    const result = await runLeonSync(cron ? "scheduled" : "manual");
    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
