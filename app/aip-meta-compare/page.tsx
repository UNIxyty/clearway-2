"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeftIcon, Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Engine = "sonnet" | "haiku";

type CardState = {
  loading: boolean;
  error: string | null;
  data: Record<string, unknown> | null;
  stderr: string | null;
};

const emptyCard = (): CardState => ({
  loading: false,
  error: null,
  data: null,
  stderr: null,
});

export default function AipMetaComparePage() {
  const [file, setFile] = useState<File | null>(null);
  const [sonnet, setSonnet] = useState<CardState>(() => emptyCard());
  const [haiku, setHaiku] = useState<CardState>(() => emptyCard());

  async function runEngine(engine: Engine) {
    if (!file) return;
    const setState = engine === "sonnet" ? setSonnet : setHaiku;
    setState({ loading: true, error: null, data: null, stderr: null });
    try {
      const fd = new FormData();
      fd.set("pdf", file);
      const res = await fetch(`/api/aip-meta-compare?engine=${engine}`, {
        method: "POST",
        body: fd,
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        data?: Record<string, unknown>;
        stderr?: string;
      };
      if (!res.ok || !json.ok) {
        setState({
          loading: false,
          error: json.error ?? `HTTP ${res.status}`,
          data: null,
          stderr: typeof json.stderr === "string" ? json.stderr : null,
        });
        return;
      }
      setState({
        loading: false,
        error: null,
        data: json.data ?? null,
        stderr: typeof json.stderr === "string" ? json.stderr : null,
      });
    } catch (e) {
      setState({
        loading: false,
        error: e instanceof Error ? e.message : "Request failed",
        data: null,
        stderr: null,
      });
    }
  }

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6">
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <Button variant="outline" size="sm" asChild>
          <Link href="/" className="gap-2">
            <ArrowLeftIcon className="h-4 w-4" />
            Back
          </Link>
        </Button>
        <div>
          <h1 className="text-xl font-semibold text-foreground">AIP meta extract compare</h1>
          <p className="text-sm text-muted-foreground">
            Local test: Sonnet extractor (server script) vs Haiku extractor. Set{" "}
            <code className="rounded bg-muted px-1">ANTHROPIC_API_KEY</code> in{" "}
            <code className="rounded bg-muted px-1">.env.local</code>. One-time deps:{" "}
            <code className="rounded bg-muted px-1">
              python3 -m venv .venv && .venv/bin/pip install -r requirements-aip-extract.txt
            </code>{" "}
            (macOS blocks system <code className="rounded bg-muted px-1">pip</code>).
          </p>
        </div>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">PDF</CardTitle>
          <CardDescription>Choose an AIP AD2 PDF. Each card runs the same file independently.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label htmlFor="pdf-file">File</Label>
          <Input
            id="pdf-file"
            type="file"
            accept="application/pdf,.pdf"
            className="cursor-pointer"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setFile(f);
              setSonnet(emptyCard());
              setHaiku(emptyCard());
            }}
          />
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sonnet (current server)</CardTitle>
            <CardDescription>
              <code className="text-xs">aip-meta-extractor.py</code> — same pipeline as EC2 AIP sync.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              className="w-full cursor-pointer"
              disabled={!file || sonnet.loading}
              onClick={() => runEngine("sonnet")}
            >
              {sonnet.loading ? (
                <>
                  <Loader2Icon className="h-4 w-4 animate-spin" />
                  Extracting…
                </>
              ) : (
                "Run extraction"
              )}
            </Button>
            {sonnet.error && (
              <p className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-sm text-destructive">
                {sonnet.error}
              </p>
            )}
            {sonnet.stderr && (
              <pre className="max-h-32 overflow-auto rounded-md bg-muted p-2 text-xs">{sonnet.stderr}</pre>
            )}
            {sonnet.data && (
              <pre className="max-h-[480px] overflow-auto rounded-md border bg-card p-3 text-xs">
                {JSON.stringify(sonnet.data, null, 2)}
              </pre>
            )}
          </CardContent>
          <CardFooter className="text-xs text-muted-foreground">
            Default DPI 200 · model set in script
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Haiku (new)</CardTitle>
            <CardDescription>
              <code className="text-xs">aip-meta-extractor-haiku.py</code> — Haiku for most calls; Sonnet for
              runways where configured.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              className="w-full cursor-pointer"
              disabled={!file || haiku.loading}
              onClick={() => runEngine("haiku")}
            >
              {haiku.loading ? (
                <>
                  <Loader2Icon className="h-4 w-4 animate-spin" />
                  Extracting…
                </>
              ) : (
                "Run extraction"
              )}
            </Button>
            {haiku.error && (
              <p className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-sm text-destructive">
                {haiku.error}
              </p>
            )}
            {haiku.stderr && (
              <pre className="max-h-32 overflow-auto rounded-md bg-muted p-2 text-xs">{haiku.stderr}</pre>
            )}
            {haiku.data && (
              <pre className="max-h-[480px] overflow-auto rounded-md border bg-card p-3 text-xs">
                {JSON.stringify(haiku.data, null, 2)}
              </pre>
            )}
          </CardContent>
          <CardFooter className="text-xs text-muted-foreground">
            Default DPI 150 · see script constants
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
