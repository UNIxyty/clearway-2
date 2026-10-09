import { NextResponse } from "next/server";
import { holds, requirePermission } from "@/lib/permissions/server";
import { getThread, markRead } from "@/lib/help/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Mark the caller's side of the thread read (feeds unread counts + read receipts). */
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const auth = await requirePermission(["portal.help.ask", "portal.help.answer"]);
  if ("error" in auth) return auth.error;
  // Someone else's thread needs portal.help.answer (Admin → Permissions); your own, portal.help.ask.
  const answers = await holds(auth.role, "portal.help.answer");
  const thread = await getThread(params.id);
  if (!thread) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const isOwner = thread.userId === auth.user.id;
  if (!isOwner && !answers) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await markRead(thread.id, isOwner && !answers ? "ops" : "developer");
  return NextResponse.json({ ok: true });
}
