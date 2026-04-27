"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeftIcon, ExternalLinkIcon, Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ApiResult = Record<string, unknown> & {
  ok?: boolean;
  error?: string;
  message?: string;
  detail?: string;
  sessionId?: string;
  popupUrl?: string;
  verifyUrl?: string;
  url?: string;
  title?: string;
  challengeDetected?: boolean;
  challengeOnly?: boolean;
  needsHumanVerification?: boolean;
  file?: string;
  effectiveDate?: string;
  ad2Icaos?: string[];
};
type ScrapeMode = "collect" | "gen12" | "ad2";
type StartSessionResult = { ok: true; sessionId: string; popupUrl: string } | { ok: false };

const API_TIMEOUT_MS = 25_000;

async function callApi(payload: Record<string, unknown>): Promise<ApiResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  try {
    const res = await fetch("/api/lithuania-hitl-vnc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    return (await res.json()) as ApiResult;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return {
        ok: false,
        error: "Request timed out",
        detail: "Backend did not respond in 25s. Check that lithuania-browser container is running and ready.",
      };
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function buildViewerUrl(popupUrl: string, sessionId: string, closeOnClear = true): string {
  const params = new URLSearchParams({
    src: popupUrl,
    sessionId,
    closeOnClear: closeOnClear ? "1" : "0",
  });
  return `/lithuania-hitl-auto-test/viewer?${params.toString()}`;
}

export default function LithuaniaHitlAutoTestPage() {
  const [sessionId, setSessionId] = useState("");
  const [popupUrl, setPopupUrl] = useState("");
  const [loading, setLoading] = useState<"" | "start" | "status" | ScrapeMode>("");
  const [icao, setIcao] = useState("EYVI");
  const [status, setStatus] = useState<ApiResult | null>(null);
  const [result, setResult] = useState<ApiResult | null>(null);
  const viewerWindowRef = useRef<Window | null>(null);
  const sawChallengeRef = useRef(false);
  const viewerAutoClosedRef = useRef(false);
  const autoModeRef = useRef<ScrapeMode | "">("");
  const autoScrapeInFlightRef = useRef(false);

  const hasSession = Boolean(sessionId.trim());
  const statusLine = useMemo(() => {
    if (!status) return "No status yet";
    if (!status.ok) return status.error || "Status check failed";
    const challenge = status.challengeDetected ? "challenge active" : "challenge cleared";
    return `${challenge}${status.url ? ` | ${status.url}` : ""}`;
  }, [status]);

  function openViewerWindow(url: string, currentSessionId: string, closeOnClear = true) {
    const win = window.open(
      buildViewerUrl(url, currentSessionId, closeOnClear),
      "lithuania_hitl_auto_viewer",
      "popup=yes,width=1040,height=820,resizable=yes",
    );
    if (win) {
      viewerWindowRef.current = win;
      viewerAutoClosedRef.current = false;
    }
  }

  async function executeScrape(mode: ScrapeMode) {
    setLoading(mode);
    setResult(null);
    try {
      const data = await callApi({
        action: "scrape",
        sessionId,
        mode,
        icao: icao.trim().toUpperCase(),
      });
      setResult(data);
      if (data.ok && viewerWindowRef.current && !viewerWindowRef.current.closed) {
        viewerWindowRef.current.close();
        viewerWindowRef.current = null;
        setResult({
          ...data,
          message: `${data.message ? `${data.message} ` : ""}Scrape succeeded. Viewer closed automatically.`,
        });
      }
    } catch (err) {
      setResult({
        ok: false,
        error: "Scrape request failed",
        detail: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setLoading("");
    }
  }

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    if (hasSession) {
      timer = setInterval(async () => {
        const data = await callApi({ action: "status", sessionId }).catch(() => null);
        if (!data) return;
        setStatus(data);

        const challengeDetected = Boolean(data.challengeDetected);
        if (challengeDetected) sawChallengeRef.current = true;

        const viewerWindow = viewerWindowRef.current;
        const viewerOpen = Boolean(viewerWindow && !viewerWindow.closed);
        const mode = autoModeRef.current;
        if (mode && !challengeDetected && !autoScrapeInFlightRef.current) {
          autoScrapeInFlightRef.current = true;
          autoModeRef.current = "";
          setResult({
            ok: true,
            message: `Captcha solved. Running ${mode.toUpperCase()} scrape automatically...`,
          });
          await executeScrape(mode);
          autoScrapeInFlightRef.current = false;
          return;
        }

        if (
          !autoModeRef.current &&
          viewerOpen &&
          sawChallengeRef.current &&
          !challengeDetected &&
          !viewerAutoClosedRef.current
        ) {
          viewerWindow?.close();
          viewerWindowRef.current = null;
          viewerAutoClosedRef.current = true;
          setResult((prev) => {
            if (prev?.ok === false) return prev;
            return { ok: true, message: "Captcha cleared. Viewer closed automatically." };
          });
        }
      }, 2500);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [hasSession, sessionId]);

  async function startSession(openForAuto = false): Promise<StartSessionResult> {
    setLoading("start");
    setResult(null);
    try {
      const data = await callApi({ action: "start" });
      if (!data.ok || !data.sessionId) {
        setResult(data);
        return { ok: false };
      }
      setSessionId(String(data.sessionId));
      sawChallengeRef.current = false;
      viewerAutoClosedRef.current = false;
      setPopupUrl(String(data.popupUrl || ""));
      setStatus(null);
      setResult({ ok: true, message: "Session started. Open viewer and solve captcha." });
      if (data.popupUrl) {
        openViewerWindow(String(data.popupUrl), String(data.sessionId), !openForAuto);
      }
      return { ok: true, sessionId: String(data.sessionId), popupUrl: String(data.popupUrl || "") };
    } catch (err) {
      setResult({
        ok: false,
        error: "Failed to start session",
        detail: err instanceof Error ? err.message : String(err),
      });
      return { ok: false };
    } finally {
      setLoading("");
    }
  }

  async function runStatus() {
    if (!hasSession) return;
    setLoading("status");
    try {
      const data = await callApi({ action: "status", sessionId });
      setStatus(data);
      setResult(data.ok ? null : data);
    } finally {
      setLoading("");
    }
  }

  async function runScrape(mode: ScrapeMode) {
    autoModeRef.current = mode;
    autoScrapeInFlightRef.current = false;
    if (!hasSession) {
      const started = await startSession(true);
      if (!started.ok) {
        autoModeRef.current = "";
        return;
      }
      setResult({
        ok: true,
        message: `Session ready. Solve captcha in viewer and ${mode.toUpperCase()} scrape will start automatically.`,
      });
      return;
    }
    if (popupUrl) {
      openViewerWindow(popupUrl, sessionId, false);
    }
    setResult({
      ok: true,
      message: `Solve captcha in viewer. ${mode.toUpperCase()} scrape will start automatically right after challenge clears.`,
    });
  }

  async function closeSessionNow() {
    if (!hasSession) return;
    await callApi({ action: "close", sessionId }).catch(() => {});
    if (viewerWindowRef.current && !viewerWindowRef.current.closed) {
      viewerWindowRef.current.close();
    }
    viewerWindowRef.current = null;
    sawChallengeRef.current = false;
    viewerAutoClosedRef.current = false;
    autoModeRef.current = "";
    autoScrapeInFlightRef.current = false;
    setSessionId("");
    setPopupUrl("");
    setStatus(null);
    setResult({ ok: true, message: "Session closed." });
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeftIcon className="h-4 w-4" />
          Back to portal
        </Link>

        <Card>
          <CardHeader>
            <CardTitle>Lithuania HITL auto test</CardTitle>
            <CardDescription>
              Test-only automatic human-in-the-loop flow using backend Selenium + noVNC (real browser session, no cookie copy/paste).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => startSession(false)} disabled={loading === "start"}>
                {loading === "start" ? (
                  <>
                    <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
                    Starting...
                  </>
                ) : (
                  "Start session + open viewer"
                )}
              </Button>
              {hasSession && (
                <>
                  <Button
                    variant="outline"
                    onClick={() =>
                      popupUrl &&
                      openViewerWindow(popupUrl, sessionId)
                    }
                    disabled={!popupUrl}
                  >
                    <ExternalLinkIcon className="mr-2 h-4 w-4" />
                    Re-open viewer
                  </Button>
                  <Button variant="ghost" onClick={closeSessionNow}>
                    Close session
                  </Button>
                </>
              )}
            </div>

            <div className="rounded border p-3 text-sm">
              <p className="font-medium">Session ID</p>
              <p className="font-mono text-xs text-muted-foreground break-all">{sessionId || "none"}</p>
              <p className="mt-2 text-muted-foreground">{statusLine}</p>
              {hasSession && (
                <Button size="sm" variant="secondary" className="mt-2" onClick={runStatus} disabled={loading === "status"}>
                  {loading === "status" ? "Checking..." : "Refresh status"}
                </Button>
              )}
            </div>

            <div className="space-y-2 rounded border p-3">
              <Label htmlFor="icao">ICAO (for AD2 mode)</Label>
              <Input
                id="icao"
                value={icao}
                onChange={(e) => setIcao(e.target.value.toUpperCase().slice(0, 4))}
                className="w-24 font-mono"
              />
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => runScrape("collect")} disabled={Boolean(loading)}>
                  {loading === "collect" ? "Collecting..." : "Auto collect (solve + run)"}
                </Button>
                <Button variant="secondary" onClick={() => runScrape("gen12")} disabled={Boolean(loading)}>
                  {loading === "gen12" ? "Downloading GEN..." : "Auto GEN 1.2 (solve + download)"}
                </Button>
                <Button variant="outline" onClick={() => runScrape("ad2")} disabled={Boolean(loading)}>
                  {loading === "ad2" ? "Downloading AD2..." : "Auto AD2 (solve + download)"}
                </Button>
              </div>
            </div>

            {result && (
              <div
                className={`rounded border p-3 text-sm ${
                  result.ok ? "border-green-500/50 bg-green-500/5" : "border-destructive/50 bg-destructive/5"
                }`}
              >
                {!result.ok && <p className="font-medium">{result.error || "Failed"}</p>}
                {result.message && <p>{result.message}</p>}
                {result.detail && <p className="text-muted-foreground">{result.detail}</p>}
                {result.needsHumanVerification && (
                  <p className="text-muted-foreground">Solve challenge in viewer, then retry.</p>
                )}
                {result.file && <p>Saved: {result.file}</p>}
                {result.effectiveDate && <p>Effective date: {result.effectiveDate}</p>}
                {Array.isArray(result.ad2Icaos) && <p>AD2 ICAOs: {result.ad2Icaos.length}</p>}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

