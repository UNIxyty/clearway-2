import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase-admin";
import { requirePermission } from "@/lib/permissions/server";
import { getClient, saveAccess } from "@/lib/clients/admin";
import { forgetScope } from "@/lib/clients/scope.mjs";
import { TRY_AGAIN, failure } from "@/lib/public-error";

export const dynamic = "force-dynamic";
const NOT_SAVED = `The change was not saved. ${TRY_AGAIN}`;

// Change an approved client's scope, switches or passenger level (clients.manage). Logged as "changed", and as
// "passengers" too when the level moved. The services see it within ten seconds (scope cache), the portal at once.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePermission("clients.manage");
    if ("error" in auth) return auth.error;
    const service = createSupabaseServiceRoleClient();
    if (!service) return failure(503, NOT_SAVED, { tag: "ADMIN-CLIENTS", what: "SUPABASE_SERVICE_ROLE_KEY not set" });
    const { id } = await params;
    const row = await getClient(service, id);
    if (!row) return NextResponse.json({ ok: false, error: "No such client." }, { status: 404 });
    if (row.status !== "approved") return NextResponse.json({ ok: false, error: "Only an approved client can be changed; approve them first." }, { status: 409 });
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const out = await saveAccess(service, row, body, { id: auth.user.id, email: auth.user.email ?? null }, "changed");
    if (out.problems) return NextResponse.json({ ok: false, error: out.problems.join(" "), problems: out.problems }, { status: 400 });
    forgetScope(row.user_id);
    return NextResponse.json({ ok: true, client: out.row });
  } catch (error) {
    return failure(500, NOT_SAVED, { tag: "ADMIN-CLIENTS", what: "change failed", detail: error });
  }
}
