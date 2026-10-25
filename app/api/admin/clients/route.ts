import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase-admin";
import { requireAdmin } from "@/lib/admin-auth";
import { listClients, listDecisions } from "@/lib/clients/admin";
import { SWITCHES, STARTING_SWITCHES, PASSENGER_LEVELS, SCOPE_KINDS } from "@/lib/clients/switches.mjs";
import { TRY_AGAIN, failure } from "@/lib/public-error";

export const dynamic = "force-dynamic";
const NOT_LOADED = `Clients could not be loaded. ${TRY_AGAIN}`;

// Admin › Clients (Stage 5): every client with their scope, switches and level, and the decision log. Admins read it;
// changes go through PATCH /api/admin/clients/[id] and POST /api/admin/clients/[id]/(approve|refuse|remove), which hold
// clients.manage. Names here are staff's view of clients; no passenger ever appears.
export async function GET() {
  try {
    const auth = await requireAdmin();
    if ("error" in auth) return auth.error;
    const service = createSupabaseServiceRoleClient();
    if (!service) return failure(503, NOT_LOADED, { tag: "ADMIN-CLIENTS", what: "SUPABASE_SERVICE_ROLE_KEY not set" });
    const [clients, decisions] = await Promise.all([listClients(service), listDecisions(service)]);
    return NextResponse.json({ ok: true, clients, decisions, catalogue: { switches: SWITCHES, starting: STARTING_SWITCHES, passengerLevels: PASSENGER_LEVELS, scopeKinds: SCOPE_KINDS } });
  } catch (error) {
    return failure(500, NOT_LOADED, { tag: "ADMIN-CLIENTS", what: "list failed", detail: error });
  }
}
