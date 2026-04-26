"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";

type Snapshot = {
  ok?: boolean;
  error?: string;
  detail?: string;
  imageBase64?: string;
  viewport?: { width: number; height: number };
  url?: string;
  title?: string;
  challengeDetected?: boolean;
  challengeOnly?: boolean;
  challengeBox?: { x: number; y: number; width: number; height: number } | null;
  recommendedPopup?: { width: number; height: number } | null;
};

async function callApi(payload: Record<string, unknown>, timeoutMs = 10000): Promise<Snapshot> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("Request timeout")), timeoutMs);
  try {
    const res = await fetch("/api/lithuania-hitl-auto", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    return (await res.json()) as Snapshot;
  } finally {
    clearTimeout(timer);
  }
}

function LithuaniaHitlPopupPageInner() {
  const params = useSearchParams();
  const sessionId = String(params.get("sessionId") || "");
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastError, setLastError] = useState("");
  const imgRef = useRef<HTMLImageElement | null>(null);
  const resizedOnceRef = useRef(false);
  const inFlightRef = useRef(false);

  const imageSrc = useMemo(() => {
    if (!snapshot?.imageBase64) return "";
    return `data:image/jpeg;base64,${snapshot.imageBase64}`;
  }, [snapshot?.imageBase64]);

  async function refresh() {
    if (!sessionId) return;
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setLoading(true);
    try {
      const data = await callApi({ action: "snapshot", sessionId }, 12000);
      setSnapshot(data);
      setLastError(data.ok ? "" : data.error || data.detail || "Failed to fetch snapshot");

      if (
        data.ok &&
        data.challengeOnly &&
        data.recommendedPopup &&
        typeof window !== "undefined" &&
        (!resizedOnceRef.current ||
          Math.abs(window.outerWidth - data.recommendedPopup.width) > 40 ||
          Math.abs(window.outerHeight - data.recommendedPopup.height) > 40)
      ) {
        window.resizeTo(data.recommendedPopup.width, data.recommendedPopup.height);
        resizedOnceRef.current = true;
      }
    } catch (err) {
      setLastError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
      inFlightRef.current = false;
    }
  }

  async function clickAt(clientX: number, clientY: number) {
    const img = imgRef.current;
    const vp = snapshot?.viewport;
    if (!img || !vp || !sessionId) return;
    const rect = img.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return;
    const relX = (clientX - rect.left) / rect.width;
    const relY = (clientY - rect.top) / rect.height;
    const x = Math.max(0, Math.min(vp.width - 1, Math.round(relX * vp.width)));
    const y = Math.max(0, Math.min(vp.height - 1, Math.round(relY * vp.height)));
    const data = await callApi({ action: "click", sessionId, x, y });
    setSnapshot(data);
    setLastError(data.ok ? "" : data.error || data.detail || "Click failed");
  }

  async function pressKey(key: string) {
    if (!sessionId) return;
    const data = await callApi({ action: "press", sessionId, key });
    setSnapshot(data);
    setLastError(data.ok ? "" : data.error || data.detail || `Key ${key} failed`);
  }

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 3000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  return (
    <div className="min-h-screen bg-background p-2">
      <div className="mx-auto max-w-full space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Button size="sm" variant="secondary" onClick={refresh} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => pressKey("Tab")} disabled={!sessionId}>
            Tab
          </Button>
          <Button size="sm" variant="outline" onClick={() => pressKey("Enter")} disabled={!sessionId}>
            Enter
          </Button>
          <Button size="sm" variant="ghost" onClick={() => window.close()}>
            Close
          </Button>
          <span className="text-muted-foreground">
            {snapshot?.challengeDetected ? "Challenge detected" : "No challenge marker"}
            {snapshot?.challengeOnly ? " | challenge-only view (auto-resized)" : ""}
          </span>
        </div>

        <div className="rounded border p-1">
          {imageSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              ref={imgRef}
              src={imageSrc}
              alt="Live browser snapshot"
              className="h-auto w-full cursor-crosshair rounded"
              onClick={(e) => clickAt(e.clientX, e.clientY)}
            />
          ) : (
            <p className="p-6 text-sm text-muted-foreground">Loading snapshot...</p>
          )}
        </div>

        <div className="space-y-1 rounded border p-2 text-xs">
          <p className="font-mono break-all">session: {sessionId || "missing"}</p>
          <p className="font-mono break-all">url: {snapshot?.url || "-"}</p>
          <p className="font-mono">title: {snapshot?.title || "-"}</p>
          {lastError && <p className="text-destructive">{lastError}</p>}
        </div>
      </div>
    </div>
  );
}

export default function LithuaniaHitlPopupPage() {
  return (
    <Suspense fallback={<div className="min-h-screen p-4 text-sm text-muted-foreground">Loading popup session...</div>}>
      <LithuaniaHitlPopupPageInner />
    </Suspense>
  );
}

