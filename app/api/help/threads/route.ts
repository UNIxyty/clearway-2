import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/admin-auth";
import { buildHelpContext } from "@/lib/help/context";
import {
  HELP_THREAD_TYPES,
  helpEffectivePresence,
  summarizeBlocks,
  type HelpBlock,
  type HelpThreadType,
} from "@/lib/help/shared";
import {
  addEvent,
  addMessage,
  bindAttachments,
  createThread,
  getThread,
  latestMessagesByThread,
  listThreadsForUser,
  sanitizeBlocks,
  unreadCounts,
} from "@/lib/help/store";
import { publishHelpEvent } from "@/lib/help/stream";
import { notifyTelegramNewThread } from "@/lib/help/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Ops history: ONLY the caller's own threads. */
export async function GET() {
  const auth = await requireAuthenticatedUser();
  if ("error" in auth) return auth.error;
  const threads = await listThreadsForUser(auth.user.id);
  const [previews, unread] = await Promise.all([
    latestMessagesByThread(threads.map((t) => t.id)),
    unreadCounts(threads, "ops"),
  ]);
  return NextResponse.json({
    threads: threads.map((t) => ({
      ...t,
      presence: helpEffectivePresence(t),
      preview: previews.get(t.id) ? summarizeBlocks(previews.get(t.id)!.blocks) : t.title,
      unread: unread.get(t.id) || 0,
    })),
  });
}

/**
 * Create a thread. Body: { type, title, blocks?, attachmentIds?, context?, linkedFrom?, clientKey? }.
 * Every new thread notifies Telegram (the folded-in bug-report path); urgent
 * and chat use the waiting framing and open with presence.
 */
export async function POST(request: Request) {
  const auth = await requireAuthenticatedUser();
  if ("error" in auth) return auth.error;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const type = String(body.type || "") as HelpThreadType;
  if (!HELP_THREAD_TYPES.includes(type)) {
    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  }
  const title = String(body.title || "").trim();
  if (title.length < 3) {
    // Urgent requires its one-line "what is blocked"; every route needs a summary.
    return NextResponse.json(
      { error: type === "urgent" ? "Say in one line what is blocked" : "A short summary is required" },
      { status: 400 },
    );
  }

  const blocks = sanitizeBlocks(body.blocks);
  const clientContext = (body.context && typeof body.context === "object" ? body.context : {}) as Record<string, unknown>;
  const roleLabel = auth.isDeveloper ? "developer" : "ops";
  const displayName =
    String((auth.user.user_metadata as Record<string, unknown> | undefined)?.display_name || "").trim() ||
    auth.user.email || "";

  // Reopening a Done thread files a LINKED report — validate the link target.
  let linkedFrom: string | null = null;
  if (body.linkedFrom) {
    const source = await getThread(String(body.linkedFrom));
    if (source && source.userId === auth.user.id) linkedFrom = source.id;
  }

  const thread = await createThread({
    type,
    title,
    userId: auth.user.id,
    userEmail: auth.user.email ?? null,
    userName: displayName || null,
    context: buildHelpContext({ client: clientContext, role: roleLabel }),
    linkedFrom,
  });

  let firstText = title;
  if (blocks.length) {
    const message = await addMessage({
      thread,
      author: "ops",
      authorId: auth.user.id,
      authorName: displayName || auth.user.email || null,
      blocks: blocks as HelpBlock[],
      clientKey: body.clientKey ? String(body.clientKey) : null,
    });
    const attachmentIds = Array.isArray(body.attachmentIds) ? body.attachmentIds.map(String) : [];
    await bindAttachments({ ids: attachmentIds, ownerId: auth.user.id, threadId: thread.id, messageId: message.id });
    firstText = summarizeBlocks(blocks as HelpBlock[], 800);
  }

  if (linkedFrom) {
    await addEvent({
      threadId: linkedFrom,
      kind: "linked_report",
      payload: { reference: thread.reference, threadId: thread.id },
      actor: displayName || auth.user.email || null,
    });
  }

  // Chats/urgent: the alert is the presence transition not notified → notified.
  const notified = await notifyTelegramNewThread(thread, firstText);
  let finalThread = thread;
  if (notified && (type === "chat" || type === "urgent")) {
    const { setPresence } = await import("@/lib/help/store");
    finalThread = (await setPresence({ threadId: thread.id, presence: "notified" })) ?? thread;
  }

  publishHelpEvent({
    type: "thread.created",
    threadId: thread.id,
    ownerUserId: thread.userId,
    reference: thread.reference,
    thread: finalThread,
  });

  return NextResponse.json({ thread: finalThread, telegramNotified: notified }, { status: 201 });
}
