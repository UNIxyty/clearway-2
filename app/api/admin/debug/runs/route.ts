import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { listDebugRuns, startDebugRun } from "@/lib/debug-runner";

export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  return NextResponse.json({ runs: listDebugRuns() });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const body = (await request.json().catch(() => ({}))) as {
    quantity?: number;
    allAirports?: boolean;
    randomSample?: boolean;
    countries?: string[];
    excludeCaptchaCountries?: boolean;
    concurrency?: number;
    steps?: string[];
    icaos?: string[];
  };
  // Use an internal loopback base URL for server-side debug steps.
  // This avoids TLS/proxy issues when the incoming request origin is external.
  const baseUrl = process.env.DEBUG_RUNNER_BASE_URL || "http://127.0.0.1:3000";
  const run = await startDebugRun({
    quantity: body.quantity,
    allAirports: body.allAirports,
    randomSample: body.randomSample,
    countries: body.countries,
    excludeCaptchaCountries: body.excludeCaptchaCountries,
    concurrency: body.concurrency,
    steps: body.steps as Array<"aip" | "notam" | "weather" | "pdf" | "gen"> | undefined,
    icaos: body.icaos,
  }, baseUrl);
  return NextResponse.json({ ok: true, runId: run.id });
}
