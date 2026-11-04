"use client";

import { SearchProvider } from "@/lib/search-context";
import { ViewerProvider } from "@/components/agent/viewer/ViewerContext";
import type { ReactNode } from "react";

// ViewerProvider sits above every page so the document viewer (agent spec
// addendum §V2) is one instance shared by the page, the shell and the panel. Toasts (portal redesign §2.6) likewise.
export function Providers({ children }: { children: ReactNode }) {
  // toasts are one provider for every page, in the root layout (2026-11-04); these two are the staff side's
  return <SearchProvider><ViewerProvider>{children}</ViewerProvider></SearchProvider>;
}
