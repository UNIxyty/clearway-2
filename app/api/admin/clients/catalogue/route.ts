import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase-admin";
import { requirePermission } from "@/lib/permissions/server";
import { scopeCatalogue } from "@/lib/clients/catalogue";
import { TRY_AGAIN, failure } from "@/lib/public-error";

export const dynamic = "force-dynamic";
const NOT_LOADED = `The suggestions could not be loaded. ${TRY_AGAIN}`;

// The real operators, aircraft and trips a client's scope may name (2026-11-02), for the Clients page's suggestions.
// clients.manage only. People and companies come from GET /api/admin/clients, which the page already has.
export async function GET() {
  try {
    const auth = await requirePermission("clients.manage");
    if ("error" in auth) return auth.error;
    const service = createSupabaseServiceRoleClient();
    if (!service) return failure(503, NOT_LOADED, { tag: "ADMIN-CLIENTS", what: "SUPABASE_SERVICE_ROLE_KEY not set" });
    const token = (await auth.supabase.auth.getSession()).data.session?.access_token ?? null;
    const cat = await scopeCatalogue(service, token);
    return NextResponse.json({ ok: true, ...cat });
  } catch (error) {
    return failure(500, NOT_LOADED, { tag: "ADMIN-CLIENTS", what: "catalogue failed", detail: error });
  }
}
