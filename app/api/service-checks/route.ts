import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/admin-auth";
import { ensureCheckerStarted, getSnapshot, hasResults, runSweep } from "@/lib/service-checker";
import { logError } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function authDisabledForTesting(): boolean {
  return String(process.env.DISABLE_AUTH_FOR_TESTING || "").toLowerCase() === "true";
}

// Session-authed like the other portal APIs; the DISABLE_AUTH_FOR_TESTING
// bypass mirrors middleware.ts / the user-preferences route for isolated
// test environments only.
export async function GET() {
  if (!authDisabledForTesting()) {
    const auth = await requireAuthenticatedUser();
    if ("error" in auth) return auth.error;
  }

  await ensureCheckerStarted();
  if (!hasResults()) {
    // Very first call ever: run the initial sweep so the response has data.
    await runSweep(true);
  } else {
    // Otherwise stay fast: kick any due checks in the background.
    runSweep(false).catch((e) => logError("SERVICE-CHECKS", "Background sweep failed", e));
  }

  return NextResponse.json(getSnapshot());
}
