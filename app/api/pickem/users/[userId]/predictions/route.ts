import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/admin-auth";
import { getActiveCompetition, hasSubmitted, listUserPredictions } from "@/lib/pickem-store";

export async function GET(_: Request, context: { params: Promise<{ userId: string }> }) {
  const auth = await requireAuthenticatedUser();
  if ("error" in auth) return auth.error;
  const competition = await getActiveCompetition();
  if (!competition) return NextResponse.json({ error: "Competition not configured." }, { status: 404 });

  const { userId } = await context.params;
  if (!userId) return NextResponse.json({ error: "Missing user id." }, { status: 400 });

  if (userId !== auth.user.id) {
    const viewerSubmitted = await hasSubmitted({ userId: auth.user.id, competitionId: competition.id });
    if (!viewerSubmitted) {
      return NextResponse.json(
        { error: "Submit your own picks first before viewing others." },
        { status: 403 },
      );
    }
  }

  const predictions = await listUserPredictions({ userId, competitionId: competition.id });
  return NextResponse.json(predictions);
}
