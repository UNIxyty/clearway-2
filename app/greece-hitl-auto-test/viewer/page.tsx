"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import GreeceHitlViewerClient from "./viewer-client";

function GreeceHitlViewerPageClient() {
  const params = useSearchParams();
  return (
    <GreeceHitlViewerClient
      noVncUrl={params.get("src") || ""}
      sessionId={params.get("sessionId") || ""}
      closeOnClear={params.get("closeOnClear") !== "0"}
    />
  );
}

export default function GreeceHitlViewerPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading noVNC viewer...</div>}>
      <GreeceHitlViewerPageClient />
    </Suspense>
  );
}
