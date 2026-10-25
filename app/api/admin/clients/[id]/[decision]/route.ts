import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase-admin";
import { requirePermission } from "@/lib/permissions/server";
import { closeAccess, getClient, saveAccess } from "@/lib/clients/admin";
import { forgetScope } from "@/lib/clients/scope.mjs";
import { TRY_AGAIN, failure } from "@/lib/public-error";

export const dynamic = "force-dynamic";
const NOT_SAVED = `The decision was not saved. ${TRY_AGAIN}`;

// approve: the full access set (scope, switches, level) for a requested, refused or removed client; refuse: a request,
// with a note the person sees; remove: access ends now — signed out everywhere, scope and switches emptied, the row kept.
export async function POST(request: Request, { params }: { params: Promise<{ id: string; decision: string }> }) {
  try {
    const auth = await requirePermission("clients.manage");
    if ("error" in auth) return auth.error;
    const service = createSupabaseServiceRoleClient();
    if (!service) return failure(503, NOT_SAVED, { tag: "ADMIN-CLIENTS", what: "SUPABASE_SERVICE_ROLE_KEY not set" });
    const { id, decision } = await params;
    if (!["approve", "refuse", "remove"].includes(decision)) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
    const row = await getClient(service, id);
    if (!row) return NextResponse.json({ ok: false, error: "No such client." }, { status: 404 });
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const actor = { id: auth.user.id, email: auth.user.email ?? null };
    if (decision === "approve") {
      const out = await saveAccess(service, row, body, actor, "approved");
      if (out.problems) return NextResponse.json({ ok: false, error: out.problems.join(" "), problems: out.problems }, { status: 400 });
      forgetScope(row.user_id);
      return NextResponse.json({ ok: true, client: out.row });
    }
    if (decision === "remove" && String(body.confirmCompany ?? "").trim().toLowerCase() !== row.company.trim().toLowerCase()) {
      return NextResponse.json({ ok: false, error: "Type the company name exactly to remove access." }, { status: 400 });
    }
    const out = await closeAccess(service, row, decision === "refuse" ? "refused" : "removed", actor, String(body.note ?? ""));
    forgetScope(row.user_id);
    return NextResponse.json({ ok: true, client: out.row });
  } catch (error) {
    return failure(500, NOT_SAVED, { tag: "ADMIN-CLIENTS", what: "decision failed", detail: error });
  }
}
