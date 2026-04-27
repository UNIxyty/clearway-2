"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeftIcon, ExternalLinkIcon, MonitorIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type ViewerClientProps = {
  noVncUrl: string;
  sessionId: string;
  closeOnClear: boolean;
};

type StatusPayload = {
  ok?: boolean;
  challengeDetected?: boolean;
};

function isAllowedUrl(value: string): boolean {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

async function fetchStatus(sessionId: string): Promise<StatusPayload | null> {
  try {
    const res = await fetch("/api/blocked-hitl-vnc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "status", country: "greece", sessionId }),
    });
    return (await res.json()) as StatusPayload;
  } catch {
    return null;
  }
}

export default function GreeceHitlViewerClient({ noVncUrl, sessionId, closeOnClear }: ViewerClientProps) {
  const hasValidViewer = isAllowedUrl(noVncUrl);
  const [autoCloseNotice, setAutoCloseNotice] = useState("");
  const challengeSeenRef = useRef(false);
  const clearStreakRef = useRef(0);
  const closedRef = useRef(false);

  const shouldPoll = useMemo(
    () => closeOnClear && hasValidViewer && Boolean(sessionId),
    [closeOnClear, hasValidViewer, sessionId],
  );

  useEffect(() => {
    if (!shouldPoll) return;
    let cancelled = false;
    const timer = setInterval(async () => {
      if (cancelled || closedRef.current) return;
      const data = await fetchStatus(sessionId);
      if (!data) return;

      const challengeDetected = Boolean(data.challengeDetected);
      if (challengeDetected) {
        challengeSeenRef.current = true;
        clearStreakRef.current = 0;
        return;
      }
      clearStreakRef.current += 1;
      const shouldClose = challengeSeenRef.current || clearStreakRef.current >= 3;
      if (!shouldClose) return;

      closedRef.current = true;
      setAutoCloseNotice("Captcha cleared. Closing this viewer...");
      window.setTimeout(() => {
        if (!window.closed) window.close();
      }, 450);
    }, 2500);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [sessionId, shouldPoll]);

  return (
    <div className="min-h-dvh bg-background px-4 py-6 md:px-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <Link
          href="/greece-hitl-auto-test"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeftIcon className="size-4" />
          Back to Greece HITL test
        </Link>

        <Card>
          <CardHeader className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="text-balance">Greece verification viewer</CardTitle>
                <CardDescription className="text-pretty">
                  Complete captcha and verification directly inside the portal-style noVNC panel, then return to the
                  Greece HITL page to run collect/GEN/AD2.
                </CardDescription>
              </div>
              <Button asChild variant="outline" disabled={!hasValidViewer}>
                <a href={hasValidViewer ? noVncUrl : "#"} target="_blank" rel="noreferrer">
                  <ExternalLinkIcon className="mr-2 size-4" />
                  Open in new tab
                </a>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {autoCloseNotice && (
              <div className="rounded-lg border border-green-500/40 bg-green-500/10 px-3 py-2 text-sm text-green-900 dark:text-green-200">
                {autoCloseNotice}
              </div>
            )}
            <div className="grid gap-3 rounded-lg border bg-muted/20 p-3 text-sm text-muted-foreground md:grid-cols-2">
              <p>
                Session: <span className="font-mono text-xs tabular-nums">{sessionId || "not provided"}</span>
              </p>
              <p className="truncate">
                Viewer URL: <span className="font-mono text-xs">{hasValidViewer ? noVncUrl : "missing or invalid"}</span>
              </p>
            </div>

            <div className="overflow-hidden rounded-xl border bg-card">
              {hasValidViewer ? (
                <iframe
                  src={noVncUrl}
                  title="Greece noVNC viewer"
                  className="h-[78dvh] w-full border-0"
                  allow="clipboard-read; clipboard-write"
                />
              ) : (
                <div className="flex min-h-[52dvh] items-center justify-center px-6 py-10 text-center">
                  <div className="max-w-md space-y-3">
                    <MonitorIcon className="mx-auto size-8 text-muted-foreground" />
                    <p className="font-medium text-foreground">Viewer is not ready</p>
                    <p className="text-sm text-muted-foreground text-pretty">
                      Start a session from the Greece HITL page first. The viewer opens automatically with a valid noVNC URL.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
