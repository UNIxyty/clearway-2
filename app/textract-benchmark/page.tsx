"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeftIcon, Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type BenchmarkResponse = {
  ok: boolean;
  error?: string;
  mode?: "aws_textract_full" | "local_fast_hybrid" | "compare_both";
  crop?: { cropped: boolean; originalPages: number; finalPages: number };
  runs?: {
    aws_textract_full?: {
      ok: boolean;
      error?: string;
      timingsMs?: Record<string, number>;
      scriptResult?: Record<string, string>;
      aiResult?: Record<string, string> | null;
      aiError?: string | null;
      upload?: { bucket: string; key: string };
      textractOutput?: { bucket: string; key: string };
      metadata?: { model: string; icaoHint: string; linesCount: number };
    };
    local_fast_hybrid?: {
      ok: boolean;
      error?: string;
      timingsMs?: Record<string, number>;
      scriptResult?: Record<string, string>;
      aiResult?: Record<string, string> | null;
      aiError?: string | null;
      metadata?: { model: string; icaoHint: string; linesCount: number };
    };
  };
};

function formatMs(ms?: number): string {
  if (typeof ms !== "number") return "-";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

export default function TextractBenchmarkPage() {
  const [file, setFile] = useState<File | null>(null);
  const [openaiApiKey, setOpenaiApiKey] = useState("");
  const [openaiModel, setOpenaiModel] = useState("gpt-4.1-mini");
  const [mode, setMode] = useState<"aws_textract_full" | "local_fast_hybrid" | "compare_both">(
    "compare_both"
  );
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BenchmarkResponse | null>(null);

  async function handleStart() {
    if (!file) {
      setResult({ ok: false, error: "Please choose a PDF file." });
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("mode", mode);
      if (openaiApiKey.trim()) form.append("openaiApiKey", openaiApiKey.trim());
      if (openaiModel.trim()) form.append("openaiModel", openaiModel.trim());

      const res = await fetch("/api/textract-benchmark/run", {
        method: "POST",
        body: form,
      });
      const data = (await res.json()) as BenchmarkResponse;
      setResult(data);
    } catch (e) {
      setResult({ ok: false, error: e instanceof Error ? e.message : "Request failed" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="mx-auto max-w-5xl space-y-6">
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
            <CardTitle>Textract Benchmark Test</CardTitle>
            <CardDescription>
              Upload one PDF and compare two pipelines: (1) Textract + script fields extraction, (2) Textract + OpenAI field filling.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-2">
              <Label>PDF file</Label>
              <Input
                type="file"
                accept="application/pdf"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>

            <div className="grid gap-2">
              <Label>Mode</Label>
              <select
                value={mode}
                onChange={(e) =>
                  setMode(
                    e.target.value as "aws_textract_full" | "local_fast_hybrid" | "compare_both"
                  )
                }
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="compare_both">Compare Both</option>
                <option value="local_fast_hybrid">Local Fast Hybrid</option>
                <option value="aws_textract_full">AWS Textract Full</option>
              </select>
            </div>

            <div className="grid gap-2">
              <Label>OpenAI API key (optional, required for AI run)</Label>
              <Input
                type="password"
                value={openaiApiKey}
                onChange={(e) => setOpenaiApiKey(e.target.value)}
                placeholder="sk-..."
                autoComplete="off"
              />
            </div>

            <div className="grid gap-2">
              <Label>OpenAI model</Label>
              <Input
                value={openaiModel}
                onChange={(e) => setOpenaiModel(e.target.value)}
                placeholder="gpt-4.1-mini"
              />
            </div>

            <Button onClick={handleStart} disabled={loading || !file}>
              {loading ? (
                <>
                  <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
                  Running benchmark...
                </>
              ) : (
                "Start"
              )}
            </Button>

            {result && !result.ok && (
              <p className="text-sm text-destructive">{result.error || "Request failed."}</p>
            )}
          </CardContent>
        </Card>

        {result?.ok && (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Timing Results</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 text-sm">
                {result.crop && (
                  <p>
                    <strong>Input crop:</strong>{" "}
                    {result.crop.cropped
                      ? `cropped ${result.crop.originalPages} -> ${result.crop.finalPages} pages`
                      : `no crop (${result.crop.finalPages} pages)`}
                  </p>
                )}
                {result.runs?.local_fast_hybrid && (
                  <div className="rounded border p-3">
                    <p className="font-medium">Local Fast Hybrid</p>
                    {result.runs.local_fast_hybrid.ok ? (
                      <>
                        <p>Text extract: {formatMs(result.runs.local_fast_hybrid.timingsMs?.localTextExtract)}</p>
                        <p>Script extract: {formatMs(result.runs.local_fast_hybrid.timingsMs?.scriptExtract)}</p>
                        <p>AI fill: {formatMs(result.runs.local_fast_hybrid.timingsMs?.aiFill)}</p>
                        <p>End-to-end: {formatMs(result.runs.local_fast_hybrid.timingsMs?.endToEnd)}</p>
                      </>
                    ) : (
                      <p className="text-destructive">{result.runs.local_fast_hybrid.error}</p>
                    )}
                  </div>
                )}
                {result.runs?.aws_textract_full && (
                  <div className="rounded border p-3">
                    <p className="font-medium">AWS Textract Full</p>
                    {result.runs.aws_textract_full.ok ? (
                      <>
                        <p>Textract total: {formatMs(result.runs.aws_textract_full.timingsMs?.textractTotal)}</p>
                        <p>Script extract: {formatMs(result.runs.aws_textract_full.timingsMs?.scriptExtract)}</p>
                        <p>AI extract: {formatMs(result.runs.aws_textract_full.timingsMs?.aiExtract)}</p>
                        <p>End-to-end: {formatMs(result.runs.aws_textract_full.timingsMs?.endToEnd)}</p>
                        <p className="text-muted-foreground">
                          upload: s3://{result.runs.aws_textract_full.upload?.bucket}/{result.runs.aws_textract_full.upload?.key}
                        </p>
                        <p className="text-muted-foreground">
                          textract json: s3://{result.runs.aws_textract_full.textractOutput?.bucket}/{result.runs.aws_textract_full.textractOutput?.key}
                        </p>
                      </>
                    ) : (
                      <p className="text-destructive">{result.runs.aws_textract_full.error}</p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Script Output</CardTitle>
                </CardHeader>
                <CardContent>
                  <pre className="max-h-[560px] overflow-auto rounded bg-muted p-3 text-xs">
                    {JSON.stringify(
                      result.runs?.local_fast_hybrid?.scriptResult ??
                        result.runs?.aws_textract_full?.scriptResult ??
                        {},
                      null,
                      2
                    )}
                  </pre>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>OpenAI Output</CardTitle>
                  {(result.runs?.local_fast_hybrid?.aiError || result.runs?.aws_textract_full?.aiError) && (
                    <CardDescription className="text-destructive">
                      {result.runs?.local_fast_hybrid?.aiError || result.runs?.aws_textract_full?.aiError}
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent>
                  <pre className="max-h-[560px] overflow-auto rounded bg-muted p-3 text-xs">
                    {JSON.stringify(
                      result.runs?.local_fast_hybrid?.aiResult ??
                        result.runs?.aws_textract_full?.aiResult ??
                        {},
                      null,
                      2
                    )}
                  </pre>
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
