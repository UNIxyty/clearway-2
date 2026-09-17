import { NextResponse } from "next/server";
import { requireDeveloper } from "@/lib/admin-auth";
import { helpEffectivePresence, summarizeBlocks } from "@/lib/help/shared";
import { latestMessagesByThread, listAllThreads, unreadCounts } from "@/lib/help/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Developer inbox — every thread, grouped by the client into "Needs you now"
 * (urgent + chats with someone waiting) and "Waiting". Developer flag only:
 * admin gets the same Forbidden as everyone else, deliberately.
 */
export async function GET() {
  const auth = await requireDeveloper();
  if ("error" in auth) return auth.error;
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
  });
}
