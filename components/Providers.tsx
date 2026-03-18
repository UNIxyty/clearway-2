"use client";

import { useRouter } from "next/navigation";
import { BackgroundSearchBanner } from "@/components/BackgroundSearchBanner";
import { SearchProvider } from "@/lib/search-context";
import type { ReactNode } from "react";

function ProvidersInner({ children }: { children: ReactNode }) {
  const router = useRouter();
  return (
    <>
      <BackgroundSearchBanner
        onNavigate={(icao) => router.push(`/?icao=${encodeURIComponent(icao)}&fromBanner=1`)}
      />
      {children}
    </>
  );
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SearchProvider>
      <ProvidersInner>{children}</ProvidersInner>
    </SearchProvider>
  );
}
