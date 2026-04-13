"use client";

import { SearchProvider } from "@/lib/search-context";
import type { ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  return <SearchProvider>{children}</SearchProvider>;
}
