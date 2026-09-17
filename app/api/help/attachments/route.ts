import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { requireAuthenticatedUser } from "@/lib/admin-auth";
import { saveFile } from "@/lib/storage";
import { HELP_ATTACHMENT_MAX_BYTES, HELP_ATTACHMENT_MIMES } from "@/lib/help/shared";
import { createAttachment } from "@/lib/help/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Upload one attachment (multipart field "file"). Uploaded before the message
 * exists; bound to a thread/message on send. Guards: 10 MB, allow-listed types.
 * The too-large answer names the limit and suggests what to do instead —
 * that copy lives in the client, the numbers live here.
 */
export async function POST(request: Request) {
  const auth = await requireAuthenticatedUser();
  if ("error" in auth) return auth.error;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form data" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file" }, { status: 400 });

  if (file.size > HELP_ATTACHMENT_MAX_BYTES) {
    return NextResponse.json(
      { error: "too-large", limitBytes: HELP_ATTACHMENT_MAX_BYTES, sizeBytes: file.size },
      { status: 413 },
    );
  }
  const mime = String(file.type || "application/octet-stream");
  if (!(HELP_ATTACHMENT_MIMES as readonly string[]).includes(mime)) {
    return NextResponse.json({ error: "unsupported-type", mime }, { status: 415 });
  }

  const safeName = String(file.name || "file").replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "file";
  const storageKey = `help-attachments/${randomUUID()}/${safeName}`;
  await saveFile(storageKey, Buffer.from(await file.arrayBuffer()));

  const attachment = await createAttachment({
    ownerId: auth.user.id,
    name: safeName,
    size: file.size,
    mime,
    isImage: mime.startsWith("image/"),
    storageKey,
  });

  const { ...pub } = attachment;
  return NextResponse.json({ attachment: pub }, { status: 201 });
}
