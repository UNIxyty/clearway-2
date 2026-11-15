import { NextResponse } from "next/server";
import { onboardingReady } from "@/lib/clients/onboarding";
import { createSupabaseServiceRoleClient } from "@/lib/supabase-admin";
import { requireAdmin } from "@/lib/admin-auth";
import { listClients, listDecisions } from "@/lib/clients/admin";
import { ACTIVE_SWITCHES as SWITCHES, STARTING_SWITCHES, PASSENGER_LEVELS, SCOPE_KINDS, normaliseSwitches } from "@/lib/clients/switches.mjs";
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
    const [rows, decisions] = await Promise.all([listClients(service), listDecisions(service)]);
    // Today's switches only. A row may still store a retired one (lib/clients/switches.mjs); it needs no migration:
    // it is dropped here and on every other read, and the page is never told of it. The decision log is history and
    // keeps the names it was written with.
    const clients = rows.map((c) => ({ ...c, switches: normaliseSwitches(c.switches) }));
    return NextResponse.json({ ok: true, onboardingReady: await onboardingReady(service), clients, decisions, catalogue: { switches: SWITCHES, starting: STARTING_SWITCHES, passengerLevels: PASSENGER_LEVELS, scopeKinds: SCOPE_KINDS } });
  } catch (error) {
    return failure(500, NOT_LOADED, { tag: "ADMIN-CLIENTS", what: "list failed", detail: error });
  }
}
