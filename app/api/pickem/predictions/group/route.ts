import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/admin-auth";
import { getActiveCompetition, listMatches, saveGroupPredictions } from "@/lib/pickem-store";
import { isAllPicksLockedAfterFirstKickoff, isGroupPredictionsLocked } from "@/lib/pickem-rules";

export async function PUT(request: NextRequest) {
  const auth = await requireAuthenticatedUser();
  if ("error" in auth) return auth.error;
  const competition = await getActiveCompetition();
  if (!competition) return NextResponse.json({ error: "Competition not configured." }, { status: 404 });
  const matches = await listMatches(competition.id);
  if (isGroupPredictionsLocked(competition) || isAllPicksLockedAfterFirstKickoff(matches)) {
    return NextResponse.json({ error: "Group predictions are locked." }, { status: 409 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    rows?: Array<{ groupCode?: string; teamId?: string; predictedPosition?: number }>;
  };
  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (!rows.length) return NextResponse.json({ error: "No rows provided." }, { status: 400 });

  const normalized = rows.map((row) => ({
    groupCode: String(row.groupCode || "").trim().toUpperCase(),
    teamId: String(row.teamId || "").trim(),
    predictedPosition: Number(row.predictedPosition),
  }));
  if (
    normalized.some(
      (row) => !row.groupCode || !row.teamId || !Number.isInteger(row.predictedPosition) || row.predictedPosition < 1 || row.predictedPosition > 4,
    )
  ) {
    return NextResponse.json({ error: "Invalid group prediction payload." }, { status: 400 });
  }

  const perGroup = new Map<string, { teams: Set<string>; positions: Set<number> }>();
  for (const row of normalized) {
    const entry = perGroup.get(row.groupCode) || { teams: new Set<string>(), positions: new Set<number>() };
    if (entry.teams.has(row.teamId) || entry.positions.has(row.predictedPosition)) {
      return NextResponse.json({ error: "Duplicate team or position in group payload." }, { status: 400 });
    }
    entry.teams.add(row.teamId);
    entry.positions.add(row.predictedPosition);
    perGroup.set(row.groupCode, entry);
  }

  try {
    await saveGroupPredictions({
      userId: auth.user.id,
      competitionId: competition.id,
      rows: normalized,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save group predictions." },
      { status: 500 },
    );
  }
}
