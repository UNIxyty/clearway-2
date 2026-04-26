"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowLeftIcon, Loader2Icon, ExternalLinkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const VERIFY_URL = "https://www.ans.lt/a1/aip/02_16Apr2026/EY-history-en-US.html";

type ApiResponse = {
  ok?: boolean;
  error?: string;
  detail?: string;
  message?: string;
  needsHumanVerification?: boolean;
  verifyUrl?: string;
  effectiveDate?: string | null;
  ad2Icaos?: string[];
  file?: string;
  sourceUrl?: string;
  icao?: string;
};

export default function LithuaniaHitlTestPage() {
  const [cookie, setCookie] = useState("");
  const [icao, setIcao] = useState("EYVI");
  const [loading, setLoading] = useState<"" | "collect" | "gen12" | "ad2">("");
  const [result, setResult] = useState<ApiResponse | null>(null);

  const cookiePreview = useMemo(() => {
    const c = cookie.trim();
    if (!c) return "No cookie set";
    if (c.length <= 60) return c;
    return `${c.slice(0, 24)} ... ${c.slice(-24)}`;
  }, [cookie]);

  function openVerificationPopup() {
    window.open(VERIFY_URL, "lithuania_verify_popup", "popup=yes,width=1100,height=850");
  }

  async function callApi(mode: "collect" | "gen12" | "ad2") {
    setLoading(mode);
    setResult(null);
    try {
      const res = await fetch("/api/lithuania-hitl-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cookie: cookie.trim(),
          mode,
          icao: icao.trim().toUpperCase(),
        }),
      });
      const data = (await res.json()) as ApiResponse;
      setResult(data);
    } catch (err) {
      setResult({
        ok: false,
        error: "Request failed",
        detail: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setLoading("");
    }
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Back to portal
        </Link>

        <Card>
          <CardHeader>
            <CardTitle>Lithuania HITL test page</CardTitle>
            <CardDescription>
              Test-only human-in-the-loop flow for Lithuania captcha-protected scraping (not wired to production search).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3 rounded-md border p-4">
              <p className="text-sm font-medium">Step 1: Complete verification</p>
              <p className="text-sm text-muted-foreground">
                Open Lithuania AIP in a popup and solve captcha/challenge there.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button onClick={openVerificationPopup} type="button">
                  <ExternalLinkIcon className="mr-2 h-4 w-4" />
                  Open verification popup
                </Button>
                <a
                  href={VERIFY_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center rounded-md border px-3 py-2 text-sm hover:bg-muted"
                >
                  Open in new tab
                </a>
              </div>
            </div>

            <div className="space-y-3 rounded-md border p-4">
              <p className="text-sm font-medium">Step 2: Paste session cookie</p>
              <p className="text-sm text-muted-foreground">
                Copy the `cf_clearance` (and related) cookie string from your browser for `ans.lt`, then paste it here.
              </p>
              <Label htmlFor="cookie">Cookie header value</Label>
              <Input
                id="cookie"
                placeholder="cf_clearance=...; __cf_bm=...; ..."
                value={cookie}
                onChange={(e) => setCookie(e.target.value)}
                className="font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">{cookiePreview}</p>
            </div>

            <div className="space-y-3 rounded-md border p-4">
              <p className="text-sm font-medium">Step 3: Run scraper action</p>
              <div className="flex items-end gap-3">
                <div className="space-y-1">
                  <Label htmlFor="icao">AD2 ICAO (for AD2 mode)</Label>
                  <Input
                    id="icao"
                    value={icao}
                    onChange={(e) => setIcao(e.target.value.toUpperCase().slice(0, 4))}
                    className="w-24 font-mono"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => callApi("collect")} disabled={Boolean(loading)}>
                    {loading === "collect" ? (
                      <>
                        <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
                        Collecting...
                      </>
                    ) : (
                      "Collect"
                    )}
                  </Button>
                  <Button onClick={() => callApi("gen12")} disabled={Boolean(loading)} variant="secondary">
                    {loading === "gen12" ? (
                      <>
                        <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
                        Downloading GEN...
                      </>
                    ) : (
                      "Download GEN 1.2"
                    )}
                  </Button>
                  <Button onClick={() => callApi("ad2")} disabled={Boolean(loading)} variant="outline">
                    {loading === "ad2" ? (
                      <>
                        <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
                        Downloading AD2...
                      </>
                    ) : (
                      "Download AD2"
                    )}
                  </Button>
                </div>
              </div>
            </div>

            {result && (
              <div
                className={`space-y-2 rounded-md border p-3 text-sm ${
                  result.ok ? "border-green-500/50 bg-green-500/5" : "border-destructive/50 bg-destructive/5"
                }`}
              >
                {!result.ok && <p className="font-medium">{result.error || result.message || "Failed"}</p>}
                {result.detail && <p className="text-muted-foreground">{result.detail}</p>}
                {result.needsHumanVerification && (
                  <p>
                    Verification required. Solve captcha in popup, update cookie, and retry.{" "}
                    {result.verifyUrl && (
                      <a href={result.verifyUrl} target="_blank" rel="noreferrer" className="underline">
                        Open verify URL
                      </a>
                    )}
                  </p>
                )}
                {result.ok && (
                  <>
                    {result.effectiveDate && <p>Effective date: {result.effectiveDate}</p>}
                    {Array.isArray(result.ad2Icaos) && <p>AD2 ICAOs found: {result.ad2Icaos.length}</p>}
                    {result.icao && <p>Downloaded ICAO: {result.icao}</p>}
                    {result.file && <p>Saved file: {result.file}</p>}
                    {result.sourceUrl && (
                      <p>
                        Source:{" "}
                        <a className="underline" target="_blank" rel="noreferrer" href={result.sourceUrl}>
                          {result.sourceUrl}
                        </a>
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

