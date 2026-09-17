import { NextResponse } from "next/server";
import { requireTelegramDeveloper, currentMediaToken } from "@/lib/help/telegram-webapp";
import { helpEffectivePresence, summarizeBlocks, type HelpStatus } from "@/lib/help/shared";
import {
  ReasonRequiredError,
  ThreadClosedError,
  addEvent,
  addMessage,
  getThread,
  getThreadByReference,
  latestMessagesByThread,
  listAllThreads,
  listAttachments,
  listEvents,
  listMessages,
  listSavedReplies,
  bumpSavedReplyUse,
  markRead,
  setPresence,
  setStatus,
  unreadCounts,
} from "@/lib/help/store";
import { publishHelpEvent } from "@/lib/help/stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// One dispatching endpoint for the mini app (keeps the surface small):
//   GET  ?op=inbox                     — threads + saved replies + media token
//   GET  ?op=thread&id=<id|reference>  — full thread
//   POST { op: "message" | "status" | "presence" | "read" | "replyUsed", ... }
// Every call validates Telegram initData and the developer allow-list; anything
// else is 401. This surface never sees Supabase.

export async function GET(request: Request) {
  const user = requireTelegramDeveloper(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const op = url.searchParams.get("op") || "inbox";

  if (op === "thread") {
    const idOrRef = String(url.searchParams.get("id") || "");
    const thread = /^(RPT|CHT)-/i.test(idOrRef) ? await getThreadByReference(idOrRef) : await getThread(idOrRef);
    if (!thread) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const [messages, events] = await Promise.all([listMessages(thread.id), listEvents(thread.id)]);
    const attachmentIds = messages.flatMap((m) =>
      m.blocks.filter((b): b is { type: "attachment"; id: string } => b.type === "attachment").map((b) => b.id),
    );
    const attachments = (await listAttachments(attachmentIds)).map(({ storageKey: _sk, ...pub }) => pub);
    await markRead(thread.id, "developer");
    return NextResponse.json({
      thread: { ...thread, presence: helpEffectivePresence(thread) },
      messages,
      events,
      attachments,
      mediaToken: currentMediaToken(),
    });
  }

  const threads = await listAllThreads();
  const [previews, unread] = await Promise.all([
    latestMessagesByThread(threads.map((t) => t.id)),
    unreadCounts(threads, "developer"),
  ]);
  return NextResponse.json({
    threads: threads.map((t) => ({
      ...t,
      presence: helpEffectivePresence(t),
      preview: previews.get(t.id) ? summarizeBlocks(previews.get(t.id)!.blocks) : t.title,
      unread: unread.get(t.id) || 0,
    })),
    savedReplies: await listSavedReplies(),
    mediaToken: currentMediaToken(),
    fetchedAt: new Date().toISOString(),
  });
}

export async function POST(request: Request) {
  const user = requireTelegramDeveloper(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const op = String(body.op || "");
  const actor = user.username ? `@${user.username}` : user.firstName || "developer";
  const thread = body.id ? await getThread(String(body.id)) : null;
  if (!thread && op !== "replyUsed") return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    if (op === "message" && thread) {
      const message = await addMessage({
        thread,
        author: "developer",
        authorName: actor,
        blocks: Array.isArray(body.blocks) ? (body.blocks as never[]) : [],
      });
      publishHelpEvent({
        type: "message.created",
        threadId: thread.id,
        ownerUserId: thread.userId,
        reference: thread.reference,
        message,
      });
      return NextResponse.json({ message }, { status: 201 });
    }
    if (op === "status" && thread) {
      const { thread: updated, event } = await setStatus({
        thread,
        status: String(body.status || "") as HelpStatus,
        reason: body.reason == null ? null : String(body.reason),
        actor,
      });
      publishHelpEvent({
        type: "thread.updated", threadId: updated.id, ownerUserId: updated.userId,
        reference: updated.reference, thread: updated, event,
      });
      return NextResponse.json({ thread: updated });
    }
    if (op === "presence" && thread) {
      const action = String(body.action || "");
      let updated = thread;
      if (action === "join") {
        updated = (await setPresence({ threadId: thread.id, presence: "present" })) ?? thread;
        const event = await addEvent({ threadId: thread.id, kind: "joined", actor });
        publishHelpEvent({
          type: "thread.updated", threadId: thread.id, ownerUserId: thread.userId,
          reference: thread.reference, thread: updated, event,
        });
      } else if (action === "joining") {
        updated = (await setPresence({ threadId: thread.id, presence: "joining" })) ?? thread;
        publishHelpEvent({
          type: "thread.updated", threadId: thread.id, ownerUserId: thread.userId,
          reference: thread.reference, thread: updated,
        });
      }
      return NextResponse.json({ thread: updated });
    }
    if (op === "read" && thread) {
      await markRead(thread.id, "developer");
      return NextResponse.json({ ok: true });
    }
    if (op === "replyUsed") {
      await bumpSavedReplyUse(String(body.replyId || ""));
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Unknown op" }, { status: 400 });
  } catch (error) {
    if (error instanceof ReasonRequiredError) {
      return NextResponse.json({ error: "Impossible cannot be saved without a written reason" }, { status: 400 });
    }
    if (error instanceof ThreadClosedError) {
      return NextResponse.json({ error: "Thread is closed to new replies", closed: true }, { status: 409 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed" }, { status: 500 });
  }
}
