import { NextResponse } from "next/server";
import { searchIndex } from "@/lib/docs/content";
import { staffGate } from "@/lib/admin-auth";
import docsSite from "@/content/docs/site.json";

// The search index: sections, pages, tasks and glossary terms from content/docs/. How search uses it: lib/docs/search.ts.
// It follows the docs' own sign-in rule here, at the endpoint (2026-11-04): public docs (site.json) → anyone; otherwise
// staff only, as the docs pages are. It used to be static and left the rule to the middleware alone, so with that layer
// off a client or a role nobody planned for got the whole index — the admin section's pages and tasks included.
// Read once per process: the content ships with the build (traced into .next/standalone/content/docs).
export const dynamic = "force-dynamic";

let cached: ReturnType<typeof searchIndex> | null = null;

export async function GET(request: Request) {
  if (docsSite.public !== true) {
    const refused = await staffGate(request);
    if (refused) return refused;
  }
  cached ??= searchIndex();
  return NextResponse.json(cached, { headers: { "cache-control": "private, no-store" } });
}
