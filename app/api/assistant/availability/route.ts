// "Does the agent exist for me?" — asked by the portal shell so it can decide
// whether to render an entry point at all.
//
// A user without access must see NO trace of the agent: not a disabled button,
// not an empty panel. So this answers a plain boolean to any signed-in caller
// rather than 403-ing, and the client renders nothing when it is false. The
// reason is returned for developers debugging their own setup; it leaks
// nothing, since a user learns only that the agent is not available to them.

import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/admin-auth";
import { getKillSwitch, hasAgentAccess } from "@/lib/agent/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = await requireAuthenticatedUser();
    // A client, an unknown role or nobody: the gate's own refusal (404 / 401), not a 200 that says false (2026-11-02).
    // The shell reads any non-OK answer as "no agent".
    if ("error" in auth) return auth.error;

    const [killSwitch, allowed] = await Promise.all([getKillSwitch(), hasAgentAccess(auth.user.id)]);
    if (!killSwitch.enabled) return NextResponse.json({ available: false, reason: "disabled_globally" });
    if (!allowed) return NextResponse.json({ available: false, reason: "not_on_allowlist" });
    return NextResponse.json({ available: true, reason: null });
  } catch {
    return NextResponse.json({ available: false, reason: "not_on_allowlist" });
  }
}
