import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { recomputePickemPoints } from "@/lib/pickem-scoring";
import { claimPlayoffsAutoOpen, getActiveCompetition, listMatches, listTeams, updateMatchScore } from "@/lib/pickem-store";

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

    // Auto-open playoffs once EVERY group-stage match is FINISHED (not merely
    // scored — a live/in-progress match already carries a running scoreline, so
    // checking for a non-null score would fire mid-matchday). Mirrors the
    // finished-check in lib/pickem-scoring.ts. Idempotent: the store guard only
    // stamps playoffs_opened_at if it's still null, so this can't re-fire or
    // clobber a manual open, and it never sets the prediction deadline.
    //
    // NOTE: this only OPENS the feature. The "Playoffs Opened" email is NOT sent
    // automatically — the admin sends it deliberately from Email Tools → Send to
    // All. (Auto-sending once blasted every user prematurely off a live match.)
    const groupMatches = matches.filter(m => m.stage === "group");
    const allGroupFinished =
      groupMatches.length > 0 &&
      groupMatches.every(
        m => m.homeScore !== null && m.awayScore !== null && String(m.status).toLowerCase() === "finished",
      );
    if (allGroupFinished) {
      try {
        const justOpened = await claimPlayoffsAutoOpen(competition.id);
        if (justOpened) {
          console.log(`Playoffs auto-opened after all ${groupMatches.length} group matches finished — send the Playoffs Opened email manually from Email Tools`);
        }
      } catch (autoOpenErr) {
        // Never fail the score save because of the auto-open side-effect.
        console.error("[matches] playoffs auto-open failed", autoOpenErr);
      }
    }

    return NextResponse.json({ ok: true, matches });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update match." },
      { status: 500 },
    );
  }
}

