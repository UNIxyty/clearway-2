import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/admin-auth";
import { getActiveCompetition } from "@/lib/pickem-store";

export async function PUT(request: NextRequest) {
  void request;
  const auth = await requireAuthenticatedUser();
  if ("error" in auth) return auth.error;
  const competition = await getActiveCompetition();
  if (!competition) return NextResponse.json({ error: "Competition not configured." }, { status: 404 });
  return NextResponse.json(
    { error: "Manual group picks are disabled. Group standings are auto-derived from match score predictions." },
    { status: 410 },
  );
}
