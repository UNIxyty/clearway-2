import fs from "node:fs";
import path from "node:path";

// The docs' styles in one file, for the 404 page only. Next answers an address no route knows with the root
// not-found page (app/not-found.tsx); under /docs that page shows the docs' own not-found and loads this stylesheet.
// Importing the docs CSS into app/not-found.tsx instead would put it on every portal page. Written once by
// `next build` (static), from the same files the docs layout imports.
export const dynamic = "force-static";

const FILES = [
  path.join(process.cwd(), "shared", "docs-tokens.css"),
  path.join(process.cwd(), "app", "docs", "docs.css"),
  path.join(process.cwd(), "app", "docs", "blocks.css"),
  path.join(process.cwd(), "app", "docs", "pages.css"),
];

export function GET() {
  return new Response(FILES.map((f) => fs.readFileSync(f, "utf8")).join("\n"), {
    headers: { "content-type": "text/css; charset=utf-8" },
  });
}
