import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import {
  clearGroupResult,
  getActiveCompetition,
  listGroupResults,
  listGroups,
  listTeams,
  replaceGroupResultOrder,
} from "@/lib/pickem-store";
import { recomputePickemPoints } from "@/lib/pickem-scoring";

export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const competition = await getActiveCompetition();
  if (!competition) {
    return NextResponse.json({ error: "Competition not configured." }, { status: 404 });
  }

  const [groups, teams, groupResults] = await Promise.all([
    listGroups(competition.id),
    listTeams(competition.id),
    listGroupResults(competition.id),
  ]);

  return NextResponse.json({
    competition,
    groups,
    teams,
    groupResults,
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
    groupCode?: string;
    orderTeamIds?: string[];
    clear?: boolean;
  };

  const groupCode = String(body.groupCode || "").trim().toUpperCase();
  if (!groupCode) {
    return NextResponse.json({ error: "groupCode is required." }, { status: 400 });
  }

  const [groups, teams] = await Promise.all([listGroups(competition.id), listTeams(competition.id)]);
  const groupExists = groups.some((g) => g.code === groupCode);
  if (!groupExists) {
    return NextResponse.json({ error: "Group not found." }, { status: 404 });
  }

  const groupTeamIds = teams.filter((team) => team.groupCode === groupCode).map((team) => team.id);
  if (groupTeamIds.length !== 4) {
    return NextResponse.json(
      { error: "This group does not have exactly 4 teams configured." },
      { status: 400 },
    );
  }

  try {
    if (body.clear === true) {
      await clearGroupResult({ competitionId: competition.id, groupCode });
      await recomputePickemPoints(competition.id);
      const groupResults = await listGroupResults(competition.id);
      return NextResponse.json({ ok: true, groupResults });
    }

    const orderTeamIds = Array.isArray(body.orderTeamIds) ? body.orderTeamIds.map((id) => String(id)) : [];
    if (orderTeamIds.length !== 4) {
      return NextResponse.json({ error: "orderTeamIds must contain exactly 4 teams." }, { status: 400 });
    }
    if (new Set(orderTeamIds).size !== 4) {
      return NextResponse.json({ error: "orderTeamIds contains duplicate teams." }, { status: 400 });
    }
    const allowed = new Set(groupTeamIds);
    if (orderTeamIds.some((teamId) => !allowed.has(teamId))) {
      return NextResponse.json({ error: "orderTeamIds must be a valid permutation for the selected group." }, { status: 400 });
    }

    await replaceGroupResultOrder({
      competitionId: competition.id,
      groupCode,
      rows: orderTeamIds.map((teamId, idx) => ({ teamId, finalPosition: idx + 1 })),
    });
    await recomputePickemPoints(competition.id);
    const groupResults = await listGroupResults(competition.id);
    return NextResponse.json({ ok: true, groupResults });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update group standings." },
      { status: 500 },
    );
  }
}
