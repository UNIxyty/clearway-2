import { NextRequest, NextResponse } from "next/server";
import { basename } from "path";
import { readFile, storagePathForKey } from "@/lib/storage";
import { assertSafeStorageKey } from "@/lib/utils/path-safety";

function contentTypeFor(pathKey: string): string {
  const lower = pathKey.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".json")) return "application/json";
  if (lower.endsWith(".txt")) return "text/plain; charset=utf-8";
  return "application/octet-stream";
}

function useInline(request: NextRequest): boolean {
  const p = request.nextUrl.searchParams;
  if (p.get("download") === "1" || p.get("attachment") === "1") return false;
  return p.get("inline") === "1" || p.get("inline") === "true";
}

export async function GET(request: NextRequest, context: { params: { path?: string[] } }) {
  const pathParts = context.params.path ?? [];
  const key = pathParts.join("/");
  try {
    const safeKey = assertSafeStorageKey(key);
    const bytes = await readFile(safeKey);
    if (!bytes) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }
    const filename = basename(storagePathForKey(safeKey));
    const disposition = useInline(request)
      ? `inline; filename="${filename}"`
      : `attachment; filename="${filename}"`;
    const body = new Uint8Array(bytes);
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": contentTypeFor(safeKey),
        "Content-Disposition": disposition,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch {
    return NextResponse.json({ error: "Invalid file path" }, { status: 400 });
  }
}
