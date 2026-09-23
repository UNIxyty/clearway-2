// Global agent kill switch — developer-managed, independent of the allowlist.
// If something goes wrong in an aviation ops context, one switch beats twelve
// revocations.

import { NextRequest, NextResponse } from "next/server";
import { requireDeveloper } from "@/lib/admin-auth";
import { auditAgent, getKillSwitch, setKillSwitch } from "@/lib/agent/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireDeveloper();
  if ("error" in auth) return auth.error;
  return NextResponse.json({ ok: true, killSwitch: await getKillSwitch() });
}

export async function PUT(request: NextRequest) {
  const auth = await requireDeveloper();
  if ("error" in auth) return auth.error;

  const body = (await request.json().catch(() => ({}))) as { enabled?: boolean; reason?: string };
  if (typeof body.enabled !== "boolean") {
    return NextResponse.json({ error: "`enabled` must be true or false." }, { status: 400 });
  }
  // Turning the agent OFF must say why: the next person to look needs to know
  // whether this was a deliberate stop or a forgotten toggle.
  const reason = String(body.reason || "").trim();
  if (!body.enabled && reason.length < 3) {
    return NextResponse.json({ error: "A reason is required when disabling the agent." }, { status: 400 });
  }

  try {
    const killSwitch = await setKillSwitch({
      enabled: body.enabled,
      actorId: auth.user.id,
      actorEmail: auth.user.email ?? null,
      reason: reason || null,
    });
    await auditAgent({
      kind: "killswitch.changed",
      actorId: auth.user.id,
      actorEmail: auth.user.email ?? null,
      detail: { enabled: body.enabled, reason: reason || null },
    });
    return NextResponse.json({ ok: true, killSwitch });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update the kill switch." },
      { status: 500 }
    );
  }
}
