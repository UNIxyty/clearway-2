import type { Metadata } from "next";
import "@/shared/docs-tokens.css";
import "./docs.css";
import "./blocks.css";
import { SITE } from "@/lib/docs/content";

// The docs site: its own shell (components/docs/DocsFrame), not the portal's — components/portal/Shell.tsx leaves
// /docs bare. It shares the root layout: fonts, shared/portal-tokens.css, and the theme script, so a theme chosen in the
// portal is the theme here (the same localStorage key), set before the first paint.
// Who can read it: content/docs/site.json "public" (false = behind the portal's sign-in; middleware.ts).
export const metadata: Metadata = { title: { default: `${SITE.product} ${SITE.docsName}`, template: `%s · ${SITE.product} ${SITE.docsName}` } };

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
