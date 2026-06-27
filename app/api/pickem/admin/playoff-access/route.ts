import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import {
  clearUserPlayoffAccess,
  getActiveCompetition,
  getLeaderboard,
  getTournamentState,
  listUserPlayoffAccess,
  upsertUserPlayoffAccess,
} from "@/lib/pickem-store";

export const dynamic = "force-dynamic";

/*
 * Admin: per-user playoff access grants (the playoffs analogue of Pick Locks).
 * A grant lets one user into the playoffs — interactive, until access_until —
 * even before playoffs are opened to everyone. Also returns the global launch
 * state so the UI can show whether playoffs are already open to all.
 */
export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const competition = await getActiveCompetition();
  if (!competition) return NextResponse.json({ error: "Competition not configured." }, { status: 404 });

  const [rows, state, grants] = await Promise.all([
    getLeaderboard(competition.id),
    getTournamentState(competition.id),
    listUserPlayoffAccess({ competitionId: competition.id }),
  ]);

  return NextResponse.json({
    competition,
    participants: rows.map((row) => ({
      userId: row.userId,
      displayName: row.displayName,
      rank: row.rank,
      points: row.points,
    })),
    globalOpenedAt: state.playoffsOpenedAt,
    globalDeadline: state.playoffsPredictionDeadline,
    grants,
  });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const competition = await getActiveCompetition();
  if (!competition) return NextResponse.json({ error: "Competition not configured." }, { status: 404 });

  const body = (await request.json().catch(() => ({}))) as {
    userId?: string;
    accessUntil?: string | null;
    clear?: boolean;
    reason?: string | null;
  };

  const userId = String(body.userId || "").trim();
  if (!userId) return NextResponse.json({ error: "userId is required." }, { status: 400 });

  if (body.clear === true || body.accessUntil === null) {
    await clearUserPlayoffAccess({ userId, competitionId: competition.id });
    const grants = await listUserPlayoffAccess({ competitionId: competition.id });
    return NextResponse.json({ ok: true, grants });
  }

  const accessUntil = String(body.accessUntil || "").trim();
  const ts = new Date(accessUntil).getTime();
  if (!Number.isFinite(ts)) {
    return NextResponse.json({ error: "accessUntil must be a valid timestamp." }, { status: 400 });
  }
  if (ts <= Date.now()) {
    return NextResponse.json({ error: "accessUntil must be in the future." }, { status: 400 });
  }

  await upsertUserPlayoffAccess({
    userId,
    competitionId: competition.id,
    accessUntil: new Date(ts).toISOString(),
    reason: body.reason || null,
    grantedByUserId: auth.user.id,
  });
  const grants = await listUserPlayoffAccess({ competitionId: competition.id });
  return NextResponse.json({ ok: true, grants });
}
