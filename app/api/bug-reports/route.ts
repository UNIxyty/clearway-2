import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/admin-auth";
import { listBugReports, listBugReportsForUser } from "@/lib/bug-reports-store";
import type { BugReportRow, BugReportStatus } from "@/lib/bug-reports-shared";
import { buildHelpContext } from "@/lib/help/context";
import { summarizeBlocks, type HelpStatus, type HelpThread } from "@/lib/help/shared";
import { createThread, addMessage, listAllThreads, listThreadsForUser } from "@/lib/help/store";
import { publishHelpEvent } from "@/lib/help/stream";
import { notifyTelegramNewThread } from "@/lib/help/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The Help Centre absorbed this endpoint (it was the seed of the system): new
// reports become help threads; the response keeps the legacy row shape the AIP
// banner renders. Old bug_reports rows remain readable — the caller's own only.

const HELP_TO_LEGACY_STATUS: Record<HelpStatus, BugReportStatus> = {
  untouched: "sent",
  under_process: "in_work",
  done: "fixed",
  impossible: "impossible_to_fix",
};

function icaoFromContext(thread: HelpThread): string {
  const match = /\/aip\/([A-Z0-9]{4})/i.exec(String(thread.context.page || ""));
  return match ? match[1].toUpperCase() : "----";
}

function threadAsLegacyRow(thread: HelpThread, description: string): BugReportRow {
  return {
    id: thread.id,
    userId: thread.userId,
    userEmail: thread.userEmail,
    airportIcao: icaoFromContext(thread),
    description,
    status: HELP_TO_LEGACY_STATUS[thread.status],
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt,
    statusUpdatedAt: thread.statusUpdatedAt,
    statusUpdatedBy: thread.statusUpdatedBy,
  };
}

/**
 * The caller's OWN reports — except developers (the Help Centre developer
 * flag, resolved server-side in requireAuthenticatedUser), who triage
 * everyone's. This previously returned every user's reports to any
 * authenticated session (platform-audit finding).
 */
export async function GET() {
  const auth = await requireAuthenticatedUser();
  if ("error" in auth) return auth.error;
  const [legacy, threads] = await Promise.all(
    auth.isDeveloper
      ? [listBugReports({ limit: 200 }), listAllThreads(200)]
      : [listBugReportsForUser(auth.user.id), listThreadsForUser(auth.user.id)]
  );
  const fromThreads = threads
    .filter((t) => t.type === "bug")
    .map((t) => threadAsLegacyRow(t, t.title));
  const reports = [...fromThreads, ...legacy].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 200);
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
    const displayName =
      String((auth.user.user_metadata as Record<string, unknown> | undefined)?.display_name || "").trim() ||
      auth.user.email || "";
    const title = description.length > 90 ? `${description.slice(0, 89)}…` : description;
    const thread = await createThread({
      type: "bug",
      title,
      userId: auth.user.id,
      userEmail: auth.user.email ?? null,
      userName: displayName || null,
      context: buildHelpContext({
        client: { page: `/aip/${airportIcao}` },
        role: auth.isDeveloper ? "developer" : "ops",
      }),
    });
    const message = await addMessage({
      thread,
      author: "ops",
      authorId: auth.user.id,
      authorName: displayName || null,
      blocks: [{ type: "paragraph", text: description }],
    });

    let telegramWarning: string | null = null;
    const notified = await notifyTelegramNewThread(thread, summarizeBlocks(message.blocks, 800));
    if (!notified) telegramWarning = "Telegram delivery failed";

    publishHelpEvent({
      type: "thread.created",
      threadId: thread.id,
      ownerUserId: thread.userId,
      reference: thread.reference,
      thread,
    });

    return NextResponse.json({ ok: true, report: threadAsLegacyRow(thread, description), telegramWarning });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create bug report";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
