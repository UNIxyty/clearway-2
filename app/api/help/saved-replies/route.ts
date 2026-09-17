import { NextResponse } from "next/server";
import { requireDeveloper } from "@/lib/admin-auth";
import { HELP_STATUSES, type HelpStatus } from "@/lib/help/shared";
import { deleteSavedReply, listSavedReplies, upsertSavedReply, bumpSavedReplyUse } from "@/lib/help/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Saved replies — developer only, on every method. */
export async function GET() {
  const auth = await requireDeveloper();
  if ("error" in auth) return auth.error;
  return NextResponse.json({ replies: await listSavedReplies() });
}

export async function POST(request: Request) {
  const auth = await requireDeveloper();
  if ("error" in auth) return auth.error;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // { used: id } bumps the honest use counter; otherwise create/update.
  if (body.used) {
    await bumpSavedReplyUse(String(body.used));
    return NextResponse.json({ ok: true });
  }

  const text = String(body.text || "").trim();
  if (!text) return NextResponse.json({ error: "Text required" }, { status: 400 });
  const setsStatusRaw = body.setsStatus == null ? null : String(body.setsStatus);
  const setsStatus =
    setsStatusRaw && HELP_STATUSES.includes(setsStatusRaw as HelpStatus) ? (setsStatusRaw as HelpStatus) : null;
  const reply = await upsertSavedReply({
    id: body.id ? String(body.id) : undefined,
    text,
    setsStatus,
  });
  return NextResponse.json({ reply }, { status: body.id ? 200 : 201 });
}

export async function DELETE(request: Request) {
  const auth = await requireDeveloper();
  if ("error" in auth) return auth.error;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await deleteSavedReply(id);
  return NextResponse.json({ ok: true });
}
