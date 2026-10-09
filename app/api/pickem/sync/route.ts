import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { syncPickemFromFootballApi } from "@/lib/pickem-football-sync";
import { getActiveCompetition } from "@/lib/pickem-store";
import { requirePermission } from "@/lib/permissions/server";

export async function POST() {
  const auth = await requirePermission("portal.pickem.admin");
  if ("error" in auth) return auth.error;

  const competition = await getActiveCompetition();
  if (!competition) return NextResponse.json({ error: "Competition not configured." }, { status: 404 });

  const result = await syncPickemFromFootballApi(competition.id);
  return NextResponse.json({ ok: true, ...result, competitionId: competition.id });
}
