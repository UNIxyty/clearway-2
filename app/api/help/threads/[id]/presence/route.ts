import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/admin-auth";
import { helpThreadHasPresence } from "@/lib/help/shared";
import { addEvent, getThread, setPresence, setStatus } from "@/lib/help/store";
import { publishHelpEvent } from "@/lib/help/stream";
import { notifyTelegramThreadActivity } from "@/lib/help/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Presence transitions for chats (and urgent threads in live mode):
 *   ops:       nudge            — re-notify Telegram; stays 'notified'
 *   developer: joining          — opened the app, on the way
 *   developer: join             — present; typing indicators live from now on
 *   developer: close            — chat closed: status Done + system event
 * Every transition is stated in words with a timestamp on the strip.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const auth = await requireAuthenticatedUser();
  if ("error" in auth) return auth.error;
  const thread = await getThread(params.id);
  if (!thread) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const isOwner = thread.userId === auth.user.id;
  if (!isOwner && !auth.isDeveloper) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!helpThreadHasPresence(thread.type)) {
    return NextResponse.json({ error: "Reports do not carry presence" }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const action = String(body.action || "");
  const actor = auth.user.email || auth.user.id;

  let updated = thread;
  let eventPayload: { kind: "nudged" | "joined" | "chat_closed" | "presence_changed"; note?: string } | null = null;

  if (action === "nudge" && isOwner) {
    await notifyTelegramThreadActivity(thread, `${thread.userName || "ops"} is still waiting in the chat`);
    eventPayload = { kind: "nudged" };
  } else if (action === "joining" && auth.isDeveloper) {
    updated = (await setPresence({ threadId: thread.id, presence: "joining" })) ?? thread;
    eventPayload = { kind: "presence_changed", note: "joining" };
  } else if (action === "join" && auth.isDeveloper) {
    updated = (await setPresence({ threadId: thread.id, presence: "present" })) ?? thread;
    eventPayload = { kind: "joined" };
  } else if (action === "close" && auth.isDeveloper) {
    updated = (await setPresence({ threadId: thread.id, presence: "none" })) ?? thread;
    const result = await setStatus({ thread: updated, status: "done", actor });
    updated = result.thread;
    eventPayload = { kind: "chat_closed" };
  } else {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const event = await addEvent({
    threadId: thread.id,
    kind: eventPayload.kind,
    payload: eventPayload.note ? { note: eventPayload.note } : {},
    actor,
  });

  publishHelpEvent({
    type: "thread.updated",
    threadId: thread.id,
    ownerUserId: thread.userId,
    reference: thread.reference,
    thread: updated,
    event,
  });

  return NextResponse.json({ thread: updated });
}
