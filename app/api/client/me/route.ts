import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase-admin";
import { requireAuthenticatedUser } from "@/lib/admin-auth";
import { normaliseScope, normaliseSwitches } from "@/lib/clients/switches.mjs";

export const dynamic = "force-dynamic";

// A client's own standing (Stage 5): their request as they made it, their status, and — once approved — the switches
// and passenger level their wall builds itself from. Never another client, never the scope's matching flights (the
// wall backend answers those, scoped). Staff asking get 404: there is no client here.
export async function GET() {
  const auth = await requireAuthenticatedUser();
  if ("error" in auth) return auth.error;
  const appMeta = (auth.user.app_metadata ?? {}) as Record<string, unknown>;
  if (String(appMeta.role ?? "").toLowerCase() !== "client") return NextResponse.json({ ok: false, error: "That is not on your account." }, { status: 404 });
  const service = createSupabaseServiceRoleClient();
  if (!service) return NextResponse.json({ ok: false, error: "Not available right now." }, { status: 503 });
  const { data } = await service.from("clients").select("company,person_name,kind,note,status,switches,passenger_level,scope,requested_at,decided_at,decision_note").eq("user_id", auth.user.id).maybeSingle();
  if (!data) return NextResponse.json({ ok: false, error: "That is not on your account." }, { status: 404 });
  const approved = data.status === "approved";
  return NextResponse.json({
    ok: true, status: data.status, company: data.company, personName: data.person_name, kind: data.kind, note: data.note, requestedAt: data.requested_at, decidedAt: data.decided_at,
    decisionNote: data.status === "refused" ? data.decision_note : "",
    switches: approved ? normaliseSwitches(data.switches) : [], passengerLevel: approved ? data.passenger_level : "off",
    scopeKinds: approved ? [...new Set(normaliseScope(data.scope).map((e) => e.kind))] : [],
  });
}
