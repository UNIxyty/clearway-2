import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import {
  clearUserLockOverride,
  getActiveCompetition,
  getLeaderboard,
  listUserLockOverrides,
  upsertUserLockOverride,
} from "@/lib/pickem-store";

export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const competition = await getActiveCompetition();
  if (!competition) return NextResponse.json({ error: "Competition not configured." }, { status: 404 });

  const [rows, overrides] = await Promise.all([
    getLeaderboard(competition.id),
    listUserLockOverrides({ competitionId: competition.id }),
  ]);

  return NextResponse.json({
    competition,
    participants: rows.map((row) => ({
      userId: row.userId,
      displayName: row.displayName,
      rank: row.rank,
      points: row.points,
    })),
    overrides,
  });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const competition = await getActiveCompetition();
  if (!competition) return NextResponse.json({ error: "Competition not configured." }, { status: 404 });

  const body = (await request.json().catch(() => ({}))) as {
    userId?: string;
    unlockUntil?: string | null;
    clear?: boolean;
    reason?: string | null;
  };

  const userId = String(body.userId || "").trim();
  if (!userId) return NextResponse.json({ error: "userId is required." }, { status: 400 });

  if (body.clear === true || body.unlockUntil === null) {
    await clearUserLockOverride({ userId, competitionId: competition.id });
    const overrides = await listUserLockOverrides({ competitionId: competition.id });
    return NextResponse.json({ ok: true, overrides });
  }

  const unlockUntil = String(body.unlockUntil || "").trim();
  const unlockTs = new Date(unlockUntil).getTime();
  if (!Number.isFinite(unlockTs)) {
    return NextResponse.json({ error: "unlockUntil must be a valid timestamp." }, { status: 400 });
  }
  if (unlockTs <= Date.now()) {
    return NextResponse.json({ error: "unlockUntil must be in the future." }, { status: 400 });
  }

  await upsertUserLockOverride({
    userId,
    competitionId: competition.id,
    unlockUntil: new Date(unlockTs).toISOString(),
    reason: body.reason || null,
    updatedByUserId: auth.user.id,
  });
  const overrides = await listUserLockOverrides({ competitionId: competition.id });
  return NextResponse.json({ ok: true, overrides });
}
