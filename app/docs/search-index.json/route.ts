import { NextResponse } from "next/server";
import { searchIndex } from "@/lib/docs/content";

// The search index, written once by `next build` (static): sections, pages, tasks and glossary terms from
// content/docs/. Behind the same sign-in as the docs (middleware.ts). How search uses it: lib/docs/search.ts.
export const dynamic = "force-static";

export function GET() {
  return NextResponse.json(searchIndex());
}
