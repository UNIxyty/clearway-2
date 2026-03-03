"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { ArrowLeftIcon, DownloadIcon, FileTextIcon, Loader2Icon } from "lucide-react";

type ExtractedAirport = {
  "Airport Code"?: string;
  "Airport Name"?: string;
  "AD2.2 Types of Traffic Permitted"?: string;
  "AD2.2 Remarks"?: string;
  "AD2.3 AD Operator"?: string;
  "AD 2.3 Customs and Immigration"?: string;
  "AD2.3 ATS"?: string;
  "AD2.3 Remarks"?: string;
  "AD2.6 AD category for fire fighting"?: string;
  _source?: string;
};

export default function AipTestPage() {
  const [icao, setIcao] = useState("ESGG");
  const [downloadLoading, setDownloadLoading] = useState(false);
  const [downloadResult, setDownloadResult] = useState<{ ok: boolean; message?: string; error?: string; path?: string } | null>(null);
  const [extractLoading, setExtractLoading] = useState(false);
  const [useAi, setUseAi] = useState(true);
  const [extractResult, setExtractResult] = useState<{ ok: boolean; airports?: ExtractedAirport[]; error?: string } | null>(null);
  const [pdfList, setPdfList] = useState<string[]>([]);
  const [extracted, setExtracted] = useState<{ airports: ExtractedAirport[] } | null>(null);
  const [listLoading, setListLoading] = useState(false);

  const fetchList = useCallback(async () => {
    setListLoading(true);
    try {
      const res = await fetch("/api/aip-test/list");
      const data = await res.json();
      setPdfList(data.files ?? []);
    } finally {
      setListLoading(false);
    }
  }, []);

  const fetchExtracted = useCallback(async () => {
    try {
      const res = await fetch("/api/aip-test/extracted");
      const data = await res.json();
      if (data.airports) setExtracted({ airports: data.airports });
    } catch {
      setExtracted(null);
    }
  }, []);

  useEffect(() => {
    fetchList();
    fetchExtracted();
  }, [fetchList, fetchExtracted]);

  async function handleDownload() {
    const code = icao.trim().toUpperCase();
    if (!/^[A-Z0-9]{4}$/.test(code)) {
      setDownloadResult({ ok: false, error: "Enter a valid 4-letter ICAO (e.g. ESGG)." });
      return;
    }
    setDownloadLoading(true);
    setDownloadResult(null);
    try {
      const res = await fetch("/api/aip-test/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ icao: code }),
      });
      const data = await res.json();
      setDownloadResult({
        ok: data.ok,
        message: data.message,
        error: data.error,
        path: data.path,
      });
      if (data.ok) fetchList();
    } catch (e) {
      setDownloadResult({ ok: false, error: e instanceof Error ? e.message : "Request failed" });
    } finally {
      setDownloadLoading(false);
    }
  }

  async function handleExtract() {
    setExtractLoading(true);
    setExtractResult(null);
    try {
      const res = await fetch(`/api/aip-test/extract?useAi=${useAi ? "1" : "0"}`, { method: "POST" });
      const data = await res.json();
      setExtractResult({
        ok: data.ok,
        airports: data.airports,
        error: data.error,
      });
      if (data.ok && data.airports) {
        setExtracted({ airports: data.airports });
        fetchList();
      }
    } catch (e) {
      setExtractResult({ ok: false, error: e instanceof Error ? e.message : "Request failed" });
    } finally {
      setExtractLoading(false);
    }
  }

  const displayAirports = extractResult?.airports ?? extracted?.airports ?? [];

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeftIcon className="h-4 w-4" />
            Back to portal
          </Link>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileTextIcon className="h-5 w-5" />
              AIP download &amp; extract test
            </CardTitle>
            <CardDescription>
              Test EAD PDF download and extraction locally. Requires .env with EAD_USER and EAD_PASSWORD_ENC (and OPENAI_API_KEY for AI extract). Download runs Playwright and works when run locally or on EC2 with xvfb.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Download */}
            <div className="space-y-2">
              <Label>Download AIP PDF for ICAO</Label>
              <div className="flex flex-wrap gap-2">
                <Input
                  placeholder="e.g. ESGG"
                  value={icao}
                  onChange={(e) => setIcao(e.target.value.toUpperCase().slice(0, 4))}
                  className="w-24 font-mono"
                />
                <Button onClick={handleDownload} disabled={downloadLoading}>
                  {downloadLoading ? (
                    <>
                      <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
                      Downloading…
                    </>
                  ) : (
                    "Download PDF"
                  )}
                </Button>
              </div>
              {downloadResult && (
                <p className={`text-sm ${downloadResult.ok ? "text-green-600 dark:text-green-400" : "text-destructive"}`}>
                  {downloadResult.ok ? downloadResult.message ?? downloadResult.path : downloadResult.error}
                </p>
              )}
            </div>

            {/* Extract */}
            <div className="space-y-2">
              <Label>Extract from PDFs in data/ead-aip</Label>
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={useAi}
                    onChange={(e) => setUseAi(e.target.checked)}
                    className="rounded border-input"
                  />
                  Use AI (OpenAI)
                </label>
                <Button onClick={handleExtract} disabled={extractLoading} variant="secondary">
                  {extractLoading ? (
                    <>
                      <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
                      Extracting…
                    </>
                  ) : (
                    "Extract"
                  )}
                </Button>
              </div>
              {extractResult && !extractResult.ok && (
                <p className="text-sm text-destructive">{extractResult.error}</p>
              )}
            </div>

            {/* List of PDFs + download buttons */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Download actual AIP PDFs</Label>
                <Button variant="ghost" size="sm" onClick={fetchList} disabled={listLoading}>
                  {listLoading ? "…" : "Refresh list"}
                </Button>
              </div>
              {pdfList.length === 0 ? (
                <p className="text-sm text-muted-foreground">No PDFs in data/ead-aip. Run Download PDF first.</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {pdfList.map((filename) => (
                    <li key={filename} className="flex items-center justify-between rounded border bg-muted/30 px-3 py-2 text-sm">
                      <span className="font-mono truncate">{filename}</span>
                      <a
                        href={`/api/aip-test/pdf?filename=${encodeURIComponent(filename)}`}
                        download={filename}
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                      >
                        <DownloadIcon className="h-4 w-4 shrink-0" />
                        Download
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Extracted data */}
            <div className="space-y-2">
              <Label>Extracted airports</Label>
              {displayAirports.length === 0 ? (
                <p className="text-sm text-muted-foreground">Run Extract to see data from the PDFs.</p>
              ) : (
                <div className="overflow-x-auto rounded border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="p-2 text-left font-medium">Code</th>
                        <th className="p-2 text-left font-medium">Name</th>
                        <th className="p-2 text-left font-medium">Traffic</th>
                        <th className="p-2 text-left font-medium">AD Operator</th>
                        <th className="p-2 text-left font-medium">ATS</th>
                        <th className="p-2 text-left font-medium">Fire</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayAirports.map((a, i) => (
                        <tr key={i} className="border-b last:border-0">
                          <td className="p-2 font-mono">{a["Airport Code"] ?? ""}</td>
                          <td className="p-2 max-w-[140px] truncate" title={a["Airport Name"] ?? ""}>{a["Airport Name"] ?? ""}</td>
                          <td className="p-2 max-w-[100px] truncate" title={a["AD2.2 Types of Traffic Permitted"] ?? ""}>{a["AD2.2 Types of Traffic Permitted"] ?? ""}</td>
                          <td className="p-2 max-w-[120px] truncate" title={a["AD2.3 AD Operator"] ?? ""}>{a["AD2.3 AD Operator"] ?? ""}</td>
                          <td className="p-2 max-w-[80px] truncate">{a["AD2.3 ATS"] ?? ""}</td>
                          <td className="p-2 max-w-[80px] truncate">{a["AD2.6 AD category for fire fighting"] ?? ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
