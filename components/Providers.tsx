"use client";

import { SearchProvider } from "@/lib/search-context";
import { ViewerProvider } from "@/components/agent/viewer/ViewerContext";
import type { ReactNode } from "react";

// ViewerProvider sits above every page so the document viewer (agent spec
// addendum §V2) is one instance shared by the page, the shell and the panel.
export function Providers({ children }: { children: ReactNode }) {
  return <SearchProvider><ViewerProvider>{children}</ViewerProvider></SearchProvider>;
}
