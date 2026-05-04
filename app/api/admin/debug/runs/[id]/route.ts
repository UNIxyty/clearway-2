import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getDebugRun, stopDebugRun, loadPersistedRunFailures } from "@/lib/debug-runner";

type Params = { params: { id: string } };

export async function GET(request: NextRequest, { params }: Params) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const run = getDebugRun(params.id);
  const { searchParams } = new URL(request.url);
  const shouldDownload = searchParams.get("download") === "1";

  // In-memory run found — return it directly.
  if (run) {
    const payload = {
      id: run.id,
      status: run.status,
      startedAt: run.startedAt,
      endedAt: run.endedAt,
      totals: run.totals,
      options: run.options,
      events: run.events,
      airports: run.airports,
    };
    if (shouldDownload) {
      return new NextResponse(JSON.stringify(payload, null, 2), {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename="debug-run-${run.id}.json"`,
        },
      });
    }
    return NextResponse.json(payload);
  }

  // Run not in memory (server restarted) — try loading persisted failures from Supabase.
  if (searchParams.get("failures") === "1") {
    const failures = await loadPersistedRunFailures(params.id);
    const payload = { id: params.id, failures };
    if (shouldDownload) {
      return new NextResponse(JSON.stringify(payload, null, 2), {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename="debug-run-${params.id}-failures.json"`,
        },
      });
    }
    return NextResponse.json(payload);
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
