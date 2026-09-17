import { NextResponse } from "next/server";
import { requireAuthenticatedUser, requireDeveloper } from "@/lib/admin-auth";
import { helpEffectivePresence, helpThreadIsClosed, type HelpStatus } from "@/lib/help/shared";
import {
  ReasonRequiredError,
  getThread,
  getThreadByReference,
  listAttachments,
  listEvents,
  listMessages,
  setStatus,
} from "@/lib/help/store";
import { publishHelpEvent } from "@/lib/help/stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function resolveThread(idOrReference: string) {
  return /^(RPT|CHT)-/i.test(idOrReference)
    ? getThreadByReference(idOrReference)
    : getThread(idOrReference);
}

/** Full thread: messages, system events, attachments. Owner or developer only. */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const auth = await requireAuthenticatedUser();
  if ("error" in auth) return auth.error;
  const thread = await resolveThread(params.id);
  if (!thread) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (thread.userId !== auth.user.id && !auth.isDeveloper) {
    // Ops must only ever see their own threads.
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const [messages, events] = await Promise.all([listMessages(thread.id), listEvents(thread.id)]);
  const attachmentIds = messages.flatMap((m) =>
    m.blocks.filter((b): b is { type: "attachment"; id: string } => b.type === "attachment").map((b) => b.id),
  );
  const attachments = (await listAttachments(attachmentIds)).map(({ storageKey: _sk, ...pub }) => pub);
  return NextResponse.json({
    thread: { ...thread, presence: helpEffectivePresence(thread) },
    closed: helpThreadIsClosed(thread),
    messages,
    events,
    attachments,
    viewer: auth.isDeveloper ? "developer" : "ops",
  });
}

/** Status change — developer only. Impossible requires a written reason (enforced in the store). */
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const auth = await requireDeveloper();
  if ("error" in auth) return auth.error;
  const thread = await resolveThread(params.id);
  if (!thread) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const { thread: updated, event } = await setStatus({
      thread,
      status: String(body.status || "") as HelpStatus,
      reason: body.reason == null ? null : String(body.reason),
      actor: auth.user.email || auth.user.id,
    });
    publishHelpEvent({
      type: "thread.updated",
      threadId: updated.id,
      ownerUserId: updated.userId,
      reference: updated.reference,
      thread: updated,
      event,
    });
    return NextResponse.json({ thread: updated });
  } catch (error) {
    if (error instanceof ReasonRequiredError) {
      return NextResponse.json({ error: "Impossible cannot be saved without a written reason" }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Failed to set status";
    return NextResponse.json({ error: message }, { status: message === "Invalid status" ? 400 : 500 });
  }
}
