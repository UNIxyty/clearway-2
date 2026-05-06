import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/admin-auth";
import { createBugReport, listBugReports } from "@/lib/bug-reports-store";
import { notifyTelegramBugReport } from "@/lib/telegram-bug-actions";

export async function GET() {
  const auth = await requireAuthenticatedUser();
  if ("error" in auth) return auth.error;
  const reports = await listBugReports({ limit: 200 });
  return NextResponse.json({ reports });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuthenticatedUser();
  if ("error" in auth) return auth.error;

  const body = (await request.json().catch(() => ({}))) as {
    airportIcao?: string;
    description?: string;
  };

  const airportIcao = String(body.airportIcao || "").trim().toUpperCase();
  const description = String(body.description || "").trim();
  if (!description || description.length < 6) {
    return NextResponse.json({ error: "Bug description is required (min 6 chars)." }, { status: 400 });
  }
  if (!/^[A-Z0-9]{4}$/.test(airportIcao)) {
    return NextResponse.json({ error: "Airport ICAO must be 4 letters/numbers." }, { status: 400 });
  }

  try {
    const report = await createBugReport({
      userId: auth.user.id,
      userEmail: auth.user.email ?? null,
      airportIcao,
      description,
    });
    await notifyTelegramBugReport(report);
    return NextResponse.json({ ok: true, report });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create bug report";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
