// Agent allowlist — DEVELOPER-managed, not admin.
//
// NOTE ON THE PATH: these portal routes live under /api/assistant/, NOT
// /api/agent/. `/agent/*` is a public prefix owned by the agent CONTAINER, and
// cloudflared's `path` is an UNANCHORED regex — `/agent/.*` also matches
// `/api/agent/access`, so routes named that way get silently hijacked by the
// agent service and answer 401 instead of running. Do not move them back.
//
// Same reasoning as the Help Centre developer inbox: the agent is a build in
// progress, and who gets early access to it is a development decision, not an
// operations one. requireDeveloper enforces that; ADMIN_EMAILS confers admin
// and nothing more (see lib/admin-auth.ts).

import { NextRequest, NextResponse } from "next/server";
import { requireDeveloper } from "@/lib/admin-auth";
import { createSupabaseServiceRoleClient } from "@/lib/supabase-admin";
import { auditAgent, grantAgentAccess, listAgentAccess, revokeAgentAccess } from "@/lib/agent/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireDeveloper();
  if ("error" in auth) return auth.error;
  const includeRevoked = request.nextUrl.searchParams.get("includeRevoked") === "true";
  return NextResponse.json({ ok: true, access: await listAgentAccess(includeRevoked) });
}

export async function POST(request: NextRequest) {
  const auth = await requireDeveloper();
  if ("error" in auth) return auth.error;

  const body = (await request.json().catch(() => ({}))) as { userId?: string; email?: string; note?: string };
  const rawUserId = String(body.userId || "").trim();
  const rawEmail = String(body.email || "").trim().toLowerCase();
  if (!rawUserId && !rawEmail) {
    return NextResponse.json({ error: "A user id or email is required." }, { status: 400 });
  }

  // Resolve an email to a real account rather than granting access to a string
  // nobody owns — a grant that silently matches nothing looks like it worked.
  let userId = rawUserId;
  let userEmail: string | null = rawEmail || null;
  const service = createSupabaseServiceRoleClient();
  if (!service) return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });

  try {
    if (!userId) {
      const { data, error } = await service.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (error) throw new Error(error.message);
      const match = data.users.find((u) => String(u.email || "").toLowerCase() === rawEmail);
      if (!match) return NextResponse.json({ error: `No account found for ${rawEmail}.` }, { status: 404 });
      userId = match.id;
      userEmail = match.email ?? rawEmail;
    } else if (!userEmail) {
      const { data } = await service.auth.admin.getUserById(userId);
      userEmail = data?.user?.email ?? null;
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not resolve the user." },
      { status: 500 }
    );
  }

  try {
    const { row, created } = await grantAgentAccess({
      userId,
      userEmail,
      actorId: auth.user.id,
      actorEmail: auth.user.email ?? null,
      note: body.note ? String(body.note).slice(0, 500) : null,
    });
    if (created) {
      await auditAgent({
        kind: "access.granted",
        userId,
        userEmail,
        actorId: auth.user.id,
        actorEmail: auth.user.email ?? null,
        detail: { note: body.note ?? null },
      });
    }
    return NextResponse.json({ ok: true, row, created });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to grant access." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireDeveloper();
  if ("error" in auth) return auth.error;

  const userId = String(request.nextUrl.searchParams.get("userId") || "").trim();
  if (!userId) return NextResponse.json({ error: "userId is required." }, { status: 400 });

  try {
    const revoked = await revokeAgentAccess({
      userId,
      actorId: auth.user.id,
      actorEmail: auth.user.email ?? null,
    });
    if (revoked > 0) {
      // Revocation takes effect immediately: the agent service re-checks the
      // allowlist on every turn, so an open session stops at its next message.
      await auditAgent({
        kind: "access.revoked",
        userId,
        actorId: auth.user.id,
        actorEmail: auth.user.email ?? null,
        detail: { rowsRevoked: revoked },
      });
    }
    return NextResponse.json({ ok: true, revoked });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to revoke access." },
      { status: 500 }
    );
  }
}
