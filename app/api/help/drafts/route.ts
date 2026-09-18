import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/admin-auth";
import { readFile, saveFile, deleteFile } from "@/lib/storage";
import { HELP_THREAD_TYPES, type HelpThreadType } from "@/lib/help/shared";
import { sanitizeBlocks } from "@/lib/help/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Report drafts — SERVER-side, one per route per user, so a draft survives a
// different device and a cleared browser. Stored on the portal's persistent
// /storage volume (help-drafts/<user>/<route>.json) rather than Supabase: no
// migration to apply, same durability class as the service-check results.

const keyOf = (userId: string, route: string) => `help-drafts/${userId}/${route}.json`;

function routeOf(value: unknown): HelpThreadType | null {
  const r = String(value || "");
  return (HELP_THREAD_TYPES as readonly string[]).includes(r) ? (r as HelpThreadType) : null;
}

export async function GET(request: Request) {
  const auth = await requireAuthenticatedUser();
  if ("error" in auth) return auth.error;
  const route = routeOf(new URL(request.url).searchParams.get("route"));
  if (!route) return NextResponse.json({ error: "route required" }, { status: 400 });
  const raw = await readFile(keyOf(auth.user.id, route));
  if (!raw) return NextResponse.json({ draft: null });
  try {
    return NextResponse.json({ draft: JSON.parse(raw.toString("utf-8")) });
  } catch {
    return NextResponse.json({ draft: null });
  }
}

export async function PUT(request: Request) {
  const auth = await requireAuthenticatedUser();
  if ("error" in auth) return auth.error;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const route = routeOf(body.route);
  if (!route) return NextResponse.json({ error: "route required" }, { status: 400 });
  const draft = {
    route,
    title: String(body.title || "").slice(0, 300),
    blocks: sanitizeBlocks(body.blocks),
    screen: String(body.screen || "").slice(0, 300),
    // Uploaded-attachment metadata so a restored draft still shows its files.
    attachments: Array.isArray(body.attachments)
      ? (body.attachments as Array<Record<string, unknown>>).slice(0, 30).map((a) => ({
          id: String(a.id || ""),
          name: String(a.name || "file").slice(0, 200),
          size: Number(a.size || 0),
          mime: String(a.mime || ""),
          isImage: Boolean(a.isImage),
        }))
      : [],
    savedAt: new Date().toISOString(),
  };
  await saveFile(keyOf(auth.user.id, route), JSON.stringify(draft));
  return NextResponse.json({ ok: true, savedAt: draft.savedAt });
}

export async function DELETE(request: Request) {
  const auth = await requireAuthenticatedUser();
  if ("error" in auth) return auth.error;
  const route = routeOf(new URL(request.url).searchParams.get("route"));
  if (!route) return NextResponse.json({ error: "route required" }, { status: 400 });
  await deleteFile(keyOf(auth.user.id, route));
  return NextResponse.json({ ok: true });
}
