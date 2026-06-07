import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/admin-auth";
import { getActiveCompetition, listMatches, saveMatchPredictions } from "@/lib/pickem-store";
import { isAllPicksLockedAfterFirstKickoff, isMatchPredictionLocked } from "@/lib/pickem-rules";

export async function PUT(request: NextRequest) {
  const auth = await requireAuthenticatedUser();
  if ("error" in auth) return auth.error;
  const competition = await getActiveCompetition();
  if (!competition) return NextResponse.json({ error: "Competition not configured." }, { status: 404 });
  const matches = await listMatches(competition.id);
  if (isAllPicksLockedAfterFirstKickoff(matches)) {
    return NextResponse.json({ error: "Predictions are locked after first kickoff." }, { status: 409 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    rows?: Array<{ matchId?: string; predictedHomeScore?: number; predictedAwayScore?: number }>;
  };
  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (!rows.length) return NextResponse.json({ error: "No rows provided." }, { status: 400 });

  const normalized = rows.map((row) => ({
    matchId: String(row.matchId || "").trim(),
    predictedHomeScore: Number(row.predictedHomeScore),
    predictedAwayScore: Number(row.predictedAwayScore),
  }));
  if (
    normalized.some(
      (row) =>
        !row.matchId ||
        !Number.isInteger(row.predictedHomeScore) ||
        !Number.isInteger(row.predictedAwayScore) ||
        row.predictedHomeScore < 0 ||
        row.predictedAwayScore < 0,
    )
  ) {
    return NextResponse.json({ error: "Invalid match prediction payload." }, { status: 400 });
  }

  const byId = new Map(matches.map((m) => [m.id, m]));
  for (const row of normalized) {
    const match = byId.get(row.matchId);
    if (!match) return NextResponse.json({ error: `Unknown match: ${row.matchId}` }, { status: 400 });
    if (isMatchPredictionLocked(match)) {
      return NextResponse.json({ error: `Match ${row.matchId} is locked.` }, { status: 409 });
    }
  }

  await saveMatchPredictions({
    userId: auth.user.id,
    competitionId: competition.id,
    rows: normalized,
  });
  return NextResponse.json({ ok: true });
}
