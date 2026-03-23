"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeftIcon, Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type AirportRow = {
  icao: string;
  airport_name: string;
};

type DownloadSummary = {
  run_dir?: string;
  airport?: {
    airport_name?: string;
    saved_to?: string;
    download_ok?: boolean;
    error?: string | null;
  };
  gen_1_2?: {
    saved_to?: string;
    download_ok?: boolean;
    error?: string | null;
  };
};

export default function RusAipTestPage() {
  const [icao, setIcao] = useState("UUOO");
  const [airports, setAirports] = useState<AirportRow[]>([]);
  const [loadingAirports, setLoadingAirports] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DownloadSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadAirports() {
      setLoadingAirports(true);
      try {
        const res = await fetch("/api/rus-aip-test/airports");
        const data = (await res.json()) as { ok: boolean; airports?: AirportRow[]; error?: string };
        if (!cancelled) {
          if (data.ok && data.airports) setAirports(data.airports);
          else setError(data.error ?? "Failed to load airport database");
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load airport database");
      } finally {
        if (!cancelled) setLoadingAirports(false);
      }
    }
    loadAirports();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedAirport = useMemo(() => {
    const code = icao.trim().toUpperCase();
    return airports.find((a) => a.icao === code) ?? null;
  }, [airports, icao]);

  async function handleDownload() {
    const code = icao.trim().toUpperCase();
    if (!/^[A-Z]{4}$/.test(code)) {
      setError("Enter a valid 4-letter ICAO (example: UUOO).");
      return;
    }
    setDownloading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/rus-aip-test/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ icao: code }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        error?: string;
        summary?: DownloadSummary;
      };
      if (!data.ok) {
        setError(data.error ?? "Download failed");
        return;
      }
      setResult(data.summary ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setDownloading(false);
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
            <CardTitle>Russian AIP ICAO test page</CardTitle>
            <CardDescription>
              Type an ICAO and download only that airport AIP main file plus GEN 1.2 into a timestamped folder.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="icao">ICAO</Label>
              <div className="flex gap-2">
                <Input
                  id="icao"
                  placeholder="UUOO"
                  value={icao}
                  onChange={(e) => setIcao(e.target.value.toUpperCase().slice(0, 4))}
                  className="w-28 font-mono"
                  list="rus-aip-icaos"
                />
                <Button onClick={handleDownload} disabled={downloading}>
                  {downloading ? (
                    <>
                      <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
                      Downloading...
                    </>
                  ) : (
                    "Download airport + GEN 1.2"
                  )}
                </Button>
              </div>
              <datalist id="rus-aip-icaos">
                {airports.map((a) => (
                  <option key={a.icao} value={a.icao}>
                    {a.airport_name}
                  </option>
                ))}
              </datalist>
              <p className="text-sm text-muted-foreground">
                {loadingAirports
                  ? "Loading ICAO database..."
                  : `Airports in database: ${airports.length}`}
              </p>
              {selectedAirport && (
                <p className="text-sm text-muted-foreground">
                  {selectedAirport.icao} - {selectedAirport.airport_name}
                </p>
              )}
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            {result && (
              <div className="space-y-2 rounded-lg border p-3 text-sm">
                <p>
                  <span className="font-medium">Run folder:</span>{" "}
                  <span className="font-mono">{result.run_dir}</span>
                </p>
                <p>
                  <span className="font-medium">Airport AIP:</span>{" "}
                  {result.airport?.download_ok ? "OK" : "Failed"}
                </p>
                <p className="font-mono break-all">{result.airport?.saved_to}</p>
                <p>
                  <span className="font-medium">GEN 1.2:</span>{" "}
                  {result.gen_1_2?.download_ok ? "OK" : "Failed"}
                </p>
                <p className="font-mono break-all">{result.gen_1_2?.saved_to}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
