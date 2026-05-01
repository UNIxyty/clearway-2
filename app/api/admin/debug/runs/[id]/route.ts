import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getDebugRun, stopDebugRun, loadPersistedRunFailures } from "@/lib/debug-runner";

type Params = { params: { id: string } };

export async function GET(request: NextRequest, { params }: Params) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const run = getDebugRun(params.id);

  // In-memory run found — return it directly.
  if (run) {
    return NextResponse.json({
      id: run.id,
      status: run.status,
      startedAt: run.startedAt,
      endedAt: run.endedAt,
      totals: run.totals,
      options: run.options,
      events: run.events,
      airports: run.airports,
    });
  }

  // Run not in memory (server restarted) — try loading persisted failures from Supabase.
  const { searchParams } = new URL(request.url);
  if (searchParams.get("failures") === "1") {
    const failures = await loadPersistedRunFailures(params.id);
    return NextResponse.json({ id: params.id, failures });
  }

  return NextResponse.json({ error: "Run not found" }, { status: 404 });
}

export async function POST(_request: NextRequest, { params }: Params) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const ok = stopDebugRun(params.id);
  if (!ok) return NextResponse.json({ error: "Run not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
