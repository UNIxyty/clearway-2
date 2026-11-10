import { NextRequest, NextResponse } from "next/server";
import { basename } from "path";
import { readFile, storagePathForKey } from "@/lib/storage";
import { assertSafeStorageKey } from "@/lib/utils/path-safety";
import { staffGate } from "@/lib/admin-auth";

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

// What /files serves: an ALLOW-list (2026-11-02). Everything not named here is 404, including folders nobody has added yet
// — a new folder in storage is private until someone adds it here on purpose. /files checks no owner, so each entry must
// be something every signed-in person may read. (Until 2026-11-02 it served every storage root, help drafts included:
// anyone could read another person's unsent drafts by their user id.)
const SERVED: Array<{ re: RegExp; why: string }> = [
  // AIP AD 2 copies by source: published aeronautical documents, the same for every reader (app/api/aip/resolve links them)
  { re: /^aip\/(ead|asecna|scraper|usa)-pdf\/[A-Za-z0-9._-]+\.pdf$/, why: "published AIP aerodrome chapters; no owner" },
  // AIP GEN copies: published, the same for every reader (the document viewer opens them by this path)
  { re: /^aip\/(gen|usa-gen|scraper-gen)-pdf\/[A-Za-z0-9._ -]+\.pdf$/, why: "published AIP GEN sections; no owner" },
  // AIP ENR copies (2026-11-10): the same, for ENR 1.1
  { re: /^aip\/enr-pdf\/[A-Za-z0-9._ -]+\.pdf$/, why: "published AIP ENR sections; no owner" },
];
const served = (key: string) => SERVED.some((x) => x.re.test(key));

export async function GET(request: NextRequest, context: { params: { path?: string[] } }) {
  const notStaff = await staffGate(request); if (notStaff) return notStaff; // staff (or the platform's own services) only, checked here (2026-11-02)
  const pathParts = context.params.path ?? [];
  const key = pathParts.join("/");
  // not on the list → the same 404 as a missing file, before anything else is looked at: nothing says the path exists
  if (!served(key)) return NextResponse.json({ error: "File not found" }, { status: 404 });
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
