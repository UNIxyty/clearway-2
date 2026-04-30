"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import LithuaniaHitlViewerClient from "./viewer-client";

function LithuaniaHitlViewerPageClient() {
  const params = useSearchParams();
  return (
    <LithuaniaHitlViewerClient
      noVncUrl={params.get("src") || ""}
      sessionId={params.get("sessionId") || ""}
      closeOnClear={params.get("closeOnClear") !== "0"}
    />
  );
}

export default function LithuaniaHitlViewerPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading noVNC viewer...</div>}>
      <LithuaniaHitlViewerPageClient />
    </Suspense>
  );
}
