import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/admin-auth";
import { getSnapshot, runSweep } from "@/lib/service-checker";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function authDisabledForTesting(): boolean {
  return String(process.env.DISABLE_AUTH_FOR_TESTING || "").toLowerCase() === "true";
}

// Force a full sweep of every check right now, then return the fresh results.
export async function POST() {
  if (!authDisabledForTesting()) {
    const auth = await requireAuthenticatedUser();
    if ("error" in auth) return auth.error;
  }

  await runSweep(true);
  return NextResponse.json(getSnapshot());
}
