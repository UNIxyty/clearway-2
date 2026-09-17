import { NextResponse } from "next/server";
import { readFile } from "@/lib/storage";
import { getAttachment } from "@/lib/help/store";
import { validateMediaToken } from "@/lib/help/telegram-webapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Attachment bytes for the mini app. <img> cannot send the initData header,
 * so this route takes the short-lived media token minted by the inbox call.
 */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const token = new URL(request.url).searchParams.get("mt") || "";
  if (!validateMediaToken(token)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const attachment = await getAttachment(params.id);
  if (!attachment) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const data = await readFile(attachment.storageKey);
  if (!data) return NextResponse.json({ error: "File missing" }, { status: 404 });
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": attachment.mime,
      "Content-Length": String(data.length),
      "Content-Disposition": `inline; filename="${attachment.name.replace(/"/g, "")}"`,
      "Cache-Control": "private, max-age=600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
