import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/admin-auth";
import { sendPickemSubmissionEmail } from "@/lib/pickem-email";
import { getActiveCompetition, hasSubmitted } from "@/lib/pickem-store";

export async function POST() {
  const auth = await requireAuthenticatedUser();
  if ("error" in auth) return auth.error;

  const competition = await getActiveCompetition();
  if (!competition) {
    return NextResponse.json({ error: "Competition not configured." }, { status: 404 });
  }

  const submitted = await hasSubmitted({ userId: auth.user.id, competitionId: competition.id });
  if (!submitted) {
    return NextResponse.json({ error: "Submit predictions first." }, { status: 400 });
  }

  if (!auth.user.email) {
    return NextResponse.json({ error: "No email found on account." }, { status: 400 });
  }

  const displayName =
    String(auth.user.user_metadata?.display_name || auth.user.user_metadata?.name || "").trim() ||
    String(auth.user.email).split("@")[0];

  const sent = await sendPickemSubmissionEmail({
    to: auth.user.email,
    displayName,
    competitionName: competition.name,
  });

  if (!sent) {
    return NextResponse.json(
      { error: "Email could not be sent. Check RESEND_API_KEY and sender domain setup." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, message: "Confirmation email sent." });
}

