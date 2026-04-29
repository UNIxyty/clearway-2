import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getDebugRun, stopDebugRun } from "@/lib/debug-runner";

type Params = { params: { id: string } };

export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const run = getDebugRun(params.id);
  if (!run) return NextResponse.json({ error: "Run not found" }, { status: 404 });
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

export async function POST(_request: NextRequest, { params }: Params) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const ok = stopDebugRun(params.id);
  if (!ok) return NextResponse.json({ error: "Run not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
