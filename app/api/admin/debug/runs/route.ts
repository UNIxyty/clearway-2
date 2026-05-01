import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { listDebugRuns, startDebugRun, listPersistedRunIds } from "@/lib/debug-runner";

export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const inMemory = listDebugRuns();
  const inMemoryIds = new Set(inMemory.map((r) => r.id));

  // Also include persisted run IDs (from Supabase) so runs survive server restart.
  const persistedIds = await listPersistedRunIds(20);
  const persistedOnly = persistedIds
    .filter((id) => !inMemoryIds.has(id))
    .map((id) => ({
      id,
      status: "completed" as const,
      startedAt: "",
      endedAt: null,
      totals: { airports: 0, failed: 0, timeout: 0 },
      persisted: true,
    }));

  return NextResponse.json({ runs: [...inMemory, ...persistedOnly] });
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
