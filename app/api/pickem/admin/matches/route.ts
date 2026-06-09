import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { recomputePickemPoints } from "@/lib/pickem-scoring";
import { getActiveCompetition, listMatches, listTeams, updateMatchScore } from "@/lib/pickem-store";

export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const competition = await getActiveCompetition();
  if (!competition) {
    return NextResponse.json({ error: "Competition not configured." }, { status: 404 });
  }

  const [teams, matches] = await Promise.all([listTeams(competition.id), listMatches(competition.id)]);
  return NextResponse.json({
    competition,
    teams,
    matches,
    isDeveloper: auth.isDeveloper,
    viewer: {
      id: auth.user.id,
      email: auth.user.email ?? null,
      name:
        String(
          (auth.user.user_metadata as Record<string, unknown> | undefined)?.full_name ||
            (auth.user.user_metadata as Record<string, unknown> | undefined)?.name ||
            "",
        ).trim() || null,
    },
  });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const competition = await getActiveCompetition();
  if (!competition) {
    return NextResponse.json({ error: "Competition not configured." }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    matchId?: string;
    homeScore?: number | null;
    awayScore?: number | null;
    status?: string;
  };
  const matchId = String(body.matchId || "").trim();
  if (!matchId) {
    return NextResponse.json({ error: "matchId is required." }, { status: 400 });
  }

  const homeScore = body.homeScore === null ? null : Number(body.homeScore);
  const awayScore = body.awayScore === null ? null : Number(body.awayScore);
  if (
    (homeScore !== null && (!Number.isInteger(homeScore) || homeScore < 0)) ||
    (awayScore !== null && (!Number.isInteger(awayScore) || awayScore < 0))
  ) {
    return NextResponse.json({ error: "Scores must be non-negative integers or null." }, { status: 400 });
  }

  const nextStatus = String(body.status || "").trim().toLowerCase();
  const status = nextStatus || (homeScore !== null && awayScore !== null ? "finished" : "scheduled");

  try {
    await updateMatchScore({
      competitionId: competition.id,
      matchId,
      homeScore,
      awayScore,
      status,
    });
    await recomputePickemPoints(competition.id);
    const matches = await listMatches(competition.id);
    return NextResponse.json({ ok: true, matches });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update match." },
      { status: 500 },
    );
  }
}

