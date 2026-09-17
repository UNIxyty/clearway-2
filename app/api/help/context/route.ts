import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/admin-auth";
import { buildServiceSnapshotSummary } from "@/lib/help/context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Server-known context fields so the composer's Review panel shows real values. */
export async function GET() {
  const auth = await requireAuthenticatedUser();
  if ("error" in auth) return auth.error;
  return NextResponse.json({
    role: auth.isDeveloper ? "developer" : "ops",
    services: buildServiceSnapshotSummary(),
  });
}
