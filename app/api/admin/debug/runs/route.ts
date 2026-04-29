import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { listDebugRuns, startDebugRun } from "@/lib/debug-runner";

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  return NextResponse.json({ runs: listDebugRuns() });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const body = (await request.json().catch(() => ({}))) as {
    quantity?: number;
    randomSample?: boolean;
    countries?: string[];
    concurrency?: number;
    steps?: string[];
  };
  const baseUrl = new URL(request.url).origin;
  const run = await startDebugRun({
    quantity: body.quantity,
    randomSample: body.randomSample,
    countries: body.countries,
    concurrency: body.concurrency,
    steps: body.steps as Array<"aip" | "notam" | "weather" | "pdf" | "gen"> | undefined,
  }, baseUrl);
  return NextResponse.json({ ok: true, runId: run.id });
}
