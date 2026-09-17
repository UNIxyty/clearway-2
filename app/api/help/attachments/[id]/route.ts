import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/admin-auth";
import { readFile } from "@/lib/storage";
import { getAttachment, getThread } from "@/lib/help/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Serve an attachment. Authenticated route — deliberately NOT /files/* (which
 * has the extension bypass on the separate security track). Visible to the
 * uploader, the thread owner, and developers; nobody else.
 */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const auth = await requireAuthenticatedUser();
  if ("error" in auth) return auth.error;
  const attachment = await getAttachment(params.id);
  if (!attachment) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let allowed = attachment.ownerId === auth.user.id || auth.isDeveloper;
  if (!allowed && attachment.threadId) {
    const thread = await getThread(attachment.threadId);
    allowed = Boolean(thread && thread.userId === auth.user.id);
  }
  if (!allowed) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data = await readFile(attachment.storageKey);
  if (!data) return NextResponse.json({ error: "File missing" }, { status: 404 });

  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": attachment.mime,
      "Content-Length": String(data.length),
      "Content-Disposition": `inline; filename="${attachment.name.replace(/"/g, "")}"`,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
