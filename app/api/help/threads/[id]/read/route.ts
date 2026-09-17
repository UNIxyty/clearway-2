import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/admin-auth";
import { getThread, markRead } from "@/lib/help/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Mark the caller's side of the thread read (feeds unread counts + read receipts). */
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const auth = await requireAuthenticatedUser();
  if ("error" in auth) return auth.error;
  const thread = await getThread(params.id);
  if (!thread) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const isOwner = thread.userId === auth.user.id;
  if (!isOwner && !auth.isDeveloper) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await markRead(thread.id, isOwner && !auth.isDeveloper ? "ops" : "developer");
  return NextResponse.json({ ok: true });
}
