"use client";

import { SearchProvider } from "@/lib/search-context";
import { ViewerProvider } from "@/components/agent/viewer/ViewerContext";
import { ToastProvider } from "@/components/kit";
import type { ReactNode } from "react";

// ViewerProvider sits above every page so the document viewer (agent spec
// addendum §V2) is one instance shared by the page, the shell and the panel. Toasts (portal redesign §2.6) likewise.
export function Providers({ children }: { children: ReactNode }) {
  return <SearchProvider><ViewerProvider><ToastProvider>{children}</ToastProvider></ViewerProvider></SearchProvider>;
}
