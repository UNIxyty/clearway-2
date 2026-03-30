"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Download, RefreshCwIcon } from "lucide-react";
import {
  INAC_GEN_GROUPS,
  INAC_HISTORY_PAGE_URL,
  INAC_PACKAGE_ROOT_FALLBACK,
  inacEaipGenPdfUrl,
  inacAd21PdfUrl,
} from "@/lib/inac-eaip-gen-toc";
import {
  MNAV_AD2_AERODROMES,
  MNAV_GEN_GROUPS,
  MNAV_PACKAGE_ROOT_FALLBACK,
  MNAV_START_URL,
  mnavAd2TextPagesPdfUrl,
  mnavPdfUrlFromMenuRelative,
} from "@/lib/mnav-north-macedonia-eaip-toc";

type AIPAirport = {
  icao: string;
  name: string;
};

type GenPart = { raw: string; rewritten: string };

const EAD_ICAO_PREFIXES = new Set([
  "LA", "UD", "LO", "UB", "EB", "LQ", "LB", "LD", "LC", "LK", "EK", "EE", "XX", "EF",
  "LF", "UG", "ED", "LG", "BG", "LH", "BI", "EI", "LI", "OJ", "BK", "UA", "UC", "EV",
  "EY", "EL", "LM", "LU", "EH", "EN", "RP", "EP", "LP", "LW", "LR", "LY", "LZ", "LJ",
  "LE", "ES", "GC", "LS", "LT", "UK", "EG",
]);

function isEadIcao(icao: string): boolean {
  return icao.length >= 2 && EAD_ICAO_PREFIXES.has(icao.slice(0, 2).toUpperCase());
}

function emptyGenPart(): GenPart {
  return { raw: "", rewritten: "" };
}

export default function GenPage() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [airport, setAirport] = useState<AIPAirport | null>(null);
  const [genData, setGenData] = useState<{ general: GenPart; nonScheduled: GenPart; privateFlights: GenPart; updatedAt: string | null } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncSteps, setSyncSteps] = useState<string[]>([]);
  const [genViewMode, setGenViewMode] = useState<"raw" | "rewritten">("rewritten");
  const [genPartMode, setGenPartMode] = useState<"general" | "nonScheduled" | "privateFlights">("general");
  const [pdfDownloading, setPdfDownloading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfReadyByPrefix, setPdfReadyByPrefix] = useState<Record<string, boolean>>({});
  const [inacPackageRoot, setInacPackageRoot] = useState<string | null>(null);
  const [inacRootLoading, setInacRootLoading] = useState(false);
  const [inacRootError, setInacRootError] = useState<string | null>(null);
  const [mnavPackageRoot, setMnavPackageRoot] = useState<string | null>(null);
  const [mnavRootLoading, setMnavRootLoading] = useState(false);
  const [mnavRootError, setMnavRootError] = useState<string | null>(null);

  const prefix = useMemo(() => airport?.icao?.slice(0, 2).toUpperCase() ?? "", [airport?.icao]);

  useEffect(() => {
    if (prefix !== "SV") {
      setInacPackageRoot(null);
      setInacRootLoading(false);
      setInacRootError(null);
      return;
    }
    let cancelled = false;
    setInacRootLoading(true);
    setInacPackageRoot(null);
    setInacRootError(null);
    (async () => {
      try {
        const res = await fetch("/api/inac-eaip-package-root");
        const data: { packageRoot?: string; error?: string } = await res.json();
        if (!res.ok) {
          throw new Error(data.error ?? `${res.status} ${res.statusText}`);
        }
        if (typeof data.packageRoot !== "string" || !data.packageRoot) {
          throw new Error("Missing packageRoot in API response");
        }
        if (!cancelled) {
          setInacPackageRoot(data.packageRoot);
          setInacRootError(null);
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        if (!cancelled) {
          setInacPackageRoot(INAC_PACKAGE_ROOT_FALLBACK);
          setInacRootError(message);
        }
      } finally {
        if (!cancelled) setInacRootLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [prefix]);

  useEffect(() => {
    if (prefix !== "LW") {
      setMnavPackageRoot(null);
      setMnavRootLoading(false);
      setMnavRootError(null);
      return;
    }
    let cancelled = false;
    setMnavRootLoading(true);
    setMnavPackageRoot(null);
    setMnavRootError(null);
    (async () => {
      try {
        const res = await fetch("/api/mnav-eaip-package-root");
        const data: { packageRoot?: string; error?: string } = await res.json();
        if (!res.ok) {
          throw new Error(data.error ?? `${res.status} ${res.statusText}`);
        }
        if (typeof data.packageRoot !== "string" || !data.packageRoot) {
          throw new Error("Missing packageRoot in API response");
        }
        if (!cancelled) {
          setMnavPackageRoot(data.packageRoot);
          setMnavRootError(null);
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        if (!cancelled) {
          setMnavPackageRoot(MNAV_PACKAGE_ROOT_FALLBACK);
          setMnavRootError(message);
        }
      } finally {
        if (!cancelled) setMnavRootLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [prefix]);

  async function searchAirport() {
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    setError(null);
    setAirport(null);
    setGenData(null);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      const data = (await res.json().catch(() => ({}))) as { results?: AIPAirport[]; error?: string };
      if (!res.ok) throw new Error(data.error || "Search failed");
      const first = (data.results ?? [])[0] ?? null;
      if (!first) throw new Error("No airport found for this search");
      setAirport(first);
      await loadGen(first.icao);
    } catch (e: unknown) {
      setError((e as { message?: string })?.message || "Search failed");
    } finally {
      setLoading(false);
    }
  }

  async function loadGen(icao: string) {
    const p = icao.slice(0, 2).toUpperCase();
    const url = isEadIcao(icao)
      ? `/api/aip/gen?icao=${encodeURIComponent(icao)}`
      : `/api/aip/gen-non-ead?prefix=${encodeURIComponent(p)}`;
    const res = await fetch(url, { cache: "no-store" });
    const data = (await res.json().catch(() => ({}))) as {
      general?: GenPart;
      nonScheduled?: GenPart;
      privateFlights?: GenPart;
      part4?: GenPart;
      updatedAt?: string | null;
    };
    setGenData({
      general: data.general && typeof data.general === "object" ? data.general : emptyGenPart(),
      nonScheduled: data.nonScheduled && typeof data.nonScheduled === "object" ? data.nonScheduled : emptyGenPart(),
      privateFlights:
        (data.privateFlights && typeof data.privateFlights === "object"
          ? data.privateFlights
          : data.part4 && typeof data.part4 === "object"
            ? data.part4
            : null) ?? emptyGenPart(),
      updatedAt: data.updatedAt ?? null,
    });
    if (data.updatedAt) {
      setPdfReadyByPrefix((prev) => ({ ...prev, [p]: true }));
    }
  }

  async function syncGen() {
    if (!airport) return;
    setSyncing(true);
    setSyncSteps([]);
    setError(null);
    try {
      const res = await fetch(`/api/aip/gen/sync?icao=${encodeURIComponent(airport.icao)}&stream=1`, { cache: "no-store" });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "GEN sync failed");
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const events = buf.split(/\n\n/);
          buf = events.pop() ?? "";
          for (const event of events) {
            const dataLine = event.split("\n").find((l) => l.startsWith("data: "));
            if (!dataLine) continue;
            const payload = JSON.parse(dataLine.slice(6)) as { step?: string; done?: boolean; error?: string; pdfReady?: boolean };
            if (payload.pdfReady) {
              setPdfReadyByPrefix((prev) => ({ ...prev, [prefix]: true }));
            }
            if (payload.step) setSyncSteps((prev) => [...prev, payload.step!]);
            if (payload.error) throw new Error(payload.error);
            if (payload.done) {
              await loadGen(airport.icao);
              return;
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
      await loadGen(airport.icao);
    } catch (e: unknown) {
      setError((e as { message?: string })?.message || "GEN sync failed");
    } finally {
      setSyncing(false);
    }
  }

  async function downloadGenPdf() {
    if (!prefix) return;
    setPdfDownloading(true);
    setPdfError(null);
    try {
      const res = await fetch(`/api/aip/gen/pdf?prefix=${encodeURIComponent(prefix)}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || data.detail || "Failed to load GEN PDF");
      }
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `${prefix}_GEN_1.2.pdf`;
      a.click();
      URL.revokeObjectURL(blobUrl);
      setPdfReadyByPrefix((prev) => ({ ...prev, [prefix]: true }));
    } catch (e: unknown) {
      setPdfError((e as { message?: string })?.message || "Failed to load GEN PDF");
    } finally {
      setPdfDownloading(false);
    }
  }

  const part = genData ? genData[genPartMode] : null;
  const text = part ? (genViewMode === "rewritten" ? (part.rewritten || part.raw) : part.raw) : "";

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 p-4 sm:p-6">
      <div className="mx-auto w-full max-w-4xl space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Clearway</p>
            <h1 className="text-lg font-semibold">GEN page</h1>
          </div>
          <Link href="/" className="text-sm text-muted-foreground hover:text-foreground underline">
            Back to AIP page
          </Link>
        </div>

        <Card className="shadow-md border-border/80">
          <CardHeader>
            <CardTitle>Search GEN by airport or country</CardTitle>
            <CardDescription>This page triggers GEN sync only.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ICAO, airport name, or country" />
              <Button onClick={searchAirport} disabled={loading || !query.trim()}>{loading ? <Spinner className="size-4" /> : "Find"}</Button>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            {airport && (
              <p className="text-sm text-muted-foreground">
                Selected: <span className="font-mono text-foreground">{airport.icao}</span> — {airport.name}
              </p>
            )}
          </CardContent>
        </Card>

        {airport && prefix === "SV" && (
          <Card className="shadow-md border-border/80">
            <CardHeader>
              <CardTitle>Part 1 — GEN (official INAC PDF)</CardTitle>
              <CardDescription>
                Same sections as the eAIP menu (GEN_0 … GEN_4). Each link is the PDF the site serves when you open the HTML
                section and use the <strong>PDF</strong> control in the top toolbar (<code className="text-[11px]">commands-en-GB.html</code>
                / <code className="text-[11px]">changeHrefToPdf</code>). Active package is taken from the{" "}
                <a href={INAC_HISTORY_PAGE_URL} target="_blank" rel="noopener noreferrer" className="underline">
                  INAC amendment history
                </a>{" "}
                (currently effective issue). Package root:{" "}
                {inacRootLoading ? (
                  <span className="inline-flex items-center gap-1 text-muted-foreground">
                    <Spinner className="size-3" />
                    Resolving…
                  </span>
                ) : (
                  <span className="font-mono text-xs break-all">{inacPackageRoot ?? "—"}</span>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-1">
              {inacRootError && (
                <p className="text-xs text-amber-600 dark:text-amber-500 mb-2">
                  Could not resolve the live package from INAC ({inacRootError}). Links use the fallback date until the next
                  successful fetch.
                </p>
              )}
              <p className="text-xs text-muted-foreground mb-3">
                Links go to <code className="text-[11px]">/pdf/eAIP/&lt;section&gt;.pdf</code> (not the framed HTML page).
              </p>
              {inacRootLoading || !inacPackageRoot ? (
                <div className="flex justify-center py-8 text-muted-foreground">
                  <Spinner className="size-8" />
                </div>
              ) : (
                <div className="space-y-2 max-h-[min(28rem,55vh)] overflow-y-auto rounded-lg border border-border/60 bg-muted/10 p-2">
                  {INAC_GEN_GROUPS.map((group) => (
                    <details key={group.id} className="group rounded-md border border-border/50 bg-background/80 px-2 py-1">
                      <summary className="cursor-pointer text-sm font-medium list-none flex items-center gap-2 py-1 [&::-webkit-details-marker]:hidden">
                        <span className="text-muted-foreground group-open:rotate-90 transition-transform text-[10px]">▶</span>
                        {group.label}
                      </summary>
                      <ul className="mt-1 ml-4 space-y-0.5 pb-2 border-l border-border/40 pl-3">
                        {group.sections.map((s) => (
                          <li key={s.id}>
                            <a
                              href={inacEaipGenPdfUrl(s.file, inacPackageRoot)}
                              className="text-sm text-primary hover:underline inline-flex items-center gap-1 break-words"
                            >
                              <Download className="size-3 shrink-0 opacity-70" />
                              {s.label}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </details>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {airport && prefix === "SV" && (
          <Card className="shadow-md border-border/80">
            <CardHeader>
              <CardTitle>Part 3 — AD 2.1 (official INAC PDF)</CardTitle>
              <CardDescription>
                Mirrors the menu path <strong>AD_2</strong> → this ICAO → toolbar <strong>PDF</strong>. File:{" "}
                <code className="text-[11px]">/pdf/eAIP/AD2.1{airport.icao.toUpperCase()}.pdf</code>
              </CardDescription>
            </CardHeader>
            <CardContent>
              {inacRootLoading || !inacPackageRoot ? (
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Spinner className="size-4" />
                  Resolving package…
                </div>
              ) : (
                <a
                  href={inacAd21PdfUrl(airport.icao, inacPackageRoot)}
                  className="text-sm text-primary hover:underline inline-flex items-center gap-2 font-medium"
                >
                  <Download className="size-4 shrink-0 opacity-80" />
                  Download AD 2.1 PDF for {airport.icao.toUpperCase()}
                </a>
              )}
            </CardContent>
          </Card>
        )}

        {airport && prefix === "LW" && (
          <Card className="shadow-md border-border/80">
            <CardHeader>
              <CardTitle>Part 1 — GEN (official M-NAV PDF)</CardTitle>
              <CardDescription>
                Same tree as <code className="text-[11px]">current/en/menu.htm</code> /{" "}
                <code className="text-[11px]">tree_items.js</code>: expand <strong>GEN</strong>, then the <strong>+</strong> beside
                each block (e.g. GEN 1 National regulations…), then the section. Each link is the leaf PDF (no separate toolbar
                step). Effective AIP from{" "}
                <a href={MNAV_START_URL} target="_blank" rel="noopener noreferrer" className="underline">
                  M-NAV Start
                </a>
                . Package root:{" "}
                {mnavRootLoading ? (
                  <span className="inline-flex items-center gap-1 text-muted-foreground">
                    <Spinner className="size-3" />
                    Resolving…
                  </span>
                ) : (
                  <span className="font-mono text-xs break-all">{mnavPackageRoot ?? "—"}</span>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-1">
              {mnavRootError && (
                <p className="text-xs text-amber-600 dark:text-amber-500 mb-2">
                  Could not resolve the live package from M-NAV ({mnavRootError}). Links use the fallback path until the next
                  successful fetch.
                </p>
              )}
              <p className="text-xs text-muted-foreground mb-3">
                Files under <code className="text-[11px]">current/pdf/gen/LW_GEN_*_en.pdf</code>.
              </p>
              {mnavRootLoading || !mnavPackageRoot ? (
                <div className="flex justify-center py-8 text-muted-foreground">
                  <Spinner className="size-8" />
                </div>
              ) : (
                <div className="space-y-2 max-h-[min(28rem,55vh)] overflow-y-auto rounded-lg border border-border/60 bg-muted/10 p-2">
                  {MNAV_GEN_GROUPS.map((group) => (
                    <details key={group.id} className="group rounded-md border border-border/50 bg-background/80 px-2 py-1">
                      <summary className="cursor-pointer text-sm font-medium list-none flex items-center gap-2 py-1 [&::-webkit-details-marker]:hidden">
                        <span className="text-muted-foreground group-open:rotate-90 transition-transform text-[10px]">▶</span>
                        <span className="flex flex-col items-start gap-0">
                          <span>{group.menuHeading}</span>
                          <span className="text-[11px] font-normal text-muted-foreground">{group.label}</span>
                        </span>
                      </summary>
                      <ul className="mt-1 ml-4 space-y-0.5 pb-2 border-l border-border/40 pl-3">
                        {group.sections.map((s) => (
                          <li key={s.id}>
                            <a
                              href={mnavPdfUrlFromMenuRelative(s.pdfRel, mnavPackageRoot)}
                              className="text-sm text-primary hover:underline inline-flex items-center gap-1 break-words"
                            >
                              <Download className="size-3 shrink-0 opacity-70" />
                              {s.label}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </details>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {airport && prefix === "LW" && (
          <Card className="shadow-md border-border/80">
            <CardHeader>
              <CardTitle>Part 3 — AD 2 (M-NAV Textpages)</CardTitle>
              <CardDescription>
                Menu: expand <strong>AD 2 Aerodromes</strong> (plus on the left), pick the aerodrome, then <strong>Textpages</strong>.
                File:{" "}
                <code className="text-[11px]">
                  current/pdf/aerodromes/LW_AD_2_{airport.icao.toUpperCase()}_en.pdf
                </code>
                . Published aerodromes in AIP:{" "}
                {MNAV_AD2_AERODROMES.map((a) => a.icao).join(", ")}.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {mnavRootLoading || !mnavPackageRoot ? (
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Spinner className="size-4" />
                  Resolving package…
                </div>
              ) : (
                <a
                  href={mnavAd2TextPagesPdfUrl(airport.icao, mnavPackageRoot)}
                  className="text-sm text-primary hover:underline inline-flex items-center gap-2 font-medium"
                >
                  <Download className="size-4 shrink-0 opacity-80" />
                  Download AD 2 Textpages PDF for {airport.icao.toUpperCase()}
                </a>
              )}
            </CardContent>
          </Card>
        )}

        {airport && (
          <Card className="shadow-md border-border/80">
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div>
                <CardTitle>GEN ({prefix})</CardTitle>
                <CardDescription>
                  {isEadIcao(airport.icao) ? "Source: Eurocontrol (EAD)." : "Source: Hard Coded (PDF Based). Data may be old and inaccurate."}
                </CardDescription>
              </div>
              <div className="flex items-center gap-1">
                <Button type="button" variant="ghost" size="sm" onClick={downloadGenPdf} disabled={pdfDownloading || !pdfReadyByPrefix[prefix]}>
                  <Download className={`size-4 ${pdfDownloading ? "animate-pulse" : ""}`} />
                  <span className="text-xs">Download PDF</span>
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={syncGen} disabled={syncing}>
                  <RefreshCwIcon className={`size-4 ${syncing ? "animate-spin" : ""}`} />
                  <span className="text-xs">Sync</span>
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {pdfError && <p className="text-sm text-destructive">{pdfError}</p>}
              {syncing && (
                <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Spinner className="size-4 text-primary" />
                    <span>Syncing GEN from server...</span>
                  </div>
                  {syncSteps.length > 0 && (
                    <ul className="mt-2 list-disc pl-5 text-xs text-muted-foreground">
                      {syncSteps.map((step, i) => (
                        <li key={i}>{step}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <div className="flex rounded-lg border border-border/60 p-0.5 bg-muted/30">
                  <button type="button" onClick={() => setGenPartMode("general")} className={`px-3 py-1.5 text-sm rounded-md ${genPartMode === "general" ? "bg-background shadow-sm font-medium" : "text-muted-foreground"}`}>GENERAL</button>
                  <button type="button" onClick={() => setGenPartMode("nonScheduled")} className={`px-3 py-1.5 text-sm rounded-md ${genPartMode === "nonScheduled" ? "bg-background shadow-sm font-medium" : "text-muted-foreground"}`}>Non scheduled</button>
                  <button type="button" onClick={() => setGenPartMode("privateFlights")} className={`px-3 py-1.5 text-sm rounded-md ${genPartMode === "privateFlights" ? "bg-background shadow-sm font-medium" : "text-muted-foreground"}`}>Private flights</button>
                </div>
                <div className="flex rounded-lg border border-border/60 p-0.5 bg-muted/30">
                  <button type="button" onClick={() => setGenViewMode("raw")} className={`px-3 py-1.5 text-sm rounded-md ${genViewMode === "raw" ? "bg-background shadow-sm font-medium" : "text-muted-foreground"}`}>Raw</button>
                  <button type="button" onClick={() => setGenViewMode("rewritten")} className={`px-3 py-1.5 text-sm rounded-md ${genViewMode === "rewritten" ? "bg-background shadow-sm font-medium" : "text-muted-foreground"}`}>AI rewritten</button>
                </div>
              </div>

              <div className="rounded-lg border border-border/60 bg-muted/10 p-4">
                <p className="whitespace-pre-wrap break-words text-[14px] leading-6">
                  {text || "No GEN content yet. Click Sync to fetch GEN for this prefix."}
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

