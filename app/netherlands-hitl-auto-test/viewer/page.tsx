"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import NetherlandsHitlViewerClient from "./viewer-client";

function NetherlandsHitlViewerPageClient() {
  const params = useSearchParams();
  return (
    <NetherlandsHitlViewerClient
      noVncUrl={params.get("src") || ""}
      sessionId={params.get("sessionId") || ""}
      closeOnClear={params.get("closeOnClear") !== "0"}
    />
  );
}

export default function NetherlandsHitlViewerPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading noVNC viewer...</div>}>
      <NetherlandsHitlViewerPageClient />
    </Suspense>
  );
}
