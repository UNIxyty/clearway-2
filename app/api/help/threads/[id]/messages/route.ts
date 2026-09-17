import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/admin-auth";
import { summarizeBlocks, type HelpBlock } from "@/lib/help/shared";
import {
  ThreadClosedError,
  addMessage,
  bindAttachments,
  getThread,
  sanitizeBlocks,
  setPresence,
} from "@/lib/help/store";
import { publishHelpEvent } from "@/lib/help/stream";
import { notifyTelegramNewThread, notifyTelegramThreadActivity } from "@/lib/help/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Post a message. Ops = the thread owner; developer = anyone with the flag.
 * The 48-hour Done rule is enforced by the store and surfaces as 409 { closed: true }
 * so the client can offer "file a linked report, keeping everything typed".
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const auth = await requireAuthenticatedUser();
  if ("error" in auth) return auth.error;
  const thread = await getThread(params.id);
  if (!thread) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isOwner = thread.userId === auth.user.id;
  if (!isOwner && !auth.isDeveloper) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const author: "ops" | "developer" = isOwner && !auth.isDeveloper ? "ops" : "developer";

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const blocks = sanitizeBlocks(body.blocks);
  if (!blocks.length) return NextResponse.json({ error: "Message has no content" }, { status: 400 });
  const displayName =
    String((auth.user.user_metadata as Record<string, unknown> | undefined)?.display_name || "").trim() ||
    auth.user.email || "";

  let message;
  try {
    message = await addMessage({
      thread,
      author,
      authorId: auth.user.id,
      authorName: displayName || null,
      blocks: blocks as HelpBlock[],
      clientKey: body.clientKey ? String(body.clientKey) : null,
    });
  } catch (error) {
    if (error instanceof ThreadClosedError) {
      return NextResponse.json(
        { error: "This thread was closed 48 hours after Done. Reopening files a linked report.", closed: true },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed" }, { status: 500 });
  }

  const attachmentIds = Array.isArray(body.attachmentIds) ? body.attachmentIds.map(String) : [];
  await bindAttachments({ ids: attachmentIds, ownerId: auth.user.id, threadId: thread.id, messageId: message.id });

  // First ops message on a chat that was never delivered: notify → presence 'notified'.
  let updatedThread = thread;
  if (author === "ops" && (thread.type === "chat" || thread.type === "urgent") && thread.presence === "not_notified") {
    const ok = await notifyTelegramNewThread(thread, summarizeBlocks(blocks as HelpBlock[], 800));
    if (ok) updatedThread = (await setPresence({ threadId: thread.id, presence: "notified" })) ?? thread;
  } else if (author === "ops") {
    await notifyTelegramThreadActivity(thread, `${displayName || "ops"}: ${summarizeBlocks(blocks as HelpBlock[], 300)}`);
  }

  publishHelpEvent({
    type: "message.created",
    threadId: thread.id,
    ownerUserId: thread.userId,
    reference: thread.reference,
    message,
    thread: updatedThread === thread ? undefined : updatedThread,
  });

  return NextResponse.json({ message }, { status: 201 });
}
