"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type RunSummary = {
  id: string;
  status: string;
  startedAt: string;
  endedAt: string | null;
  totals: { airports: number; failed: number; timeout: number };
};

type RunDetail = RunSummary & {
  options?: {
    steps?: string[];
  };
  airports: Array<{
    icao: string;
    country: string;
    name: string;
    steps: Record<string, string>;
    stepDetails: Record<string, string>;
    logs: string[];
  }>;
};

function stepStatusClass(state: string) {
  if (state === "passed") return "text-emerald-700 dark:text-emerald-400";
  if (state === "pending" || state === "running") return "text-amber-700 dark:text-amber-400";
  if (state === "failed" || state === "timeout") return "text-red-700 dark:text-red-400";
  if (state === "skipped") return "text-muted-foreground";
  return "text-foreground";
}

const FINAL_STEP_STATES = new Set(["passed", "failed", "timeout", "skipped"]);
const DEFAULT_DEBUG_STEPS = ["aip", "notam", "weather", "pdf", "gen"];

export default function AdminDebugPage() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [selectedRunId, setSelectedRunId] = useState("");
  const [selectedRun, setSelectedRun] = useState<RunDetail | null>(null);
  const [quantity, setQuantity] = useState("20");
  const [allAirports, setAllAirports] = useState(false);
  const [concurrency, setConcurrency] = useState("3");
  const [randomSample, setRandomSample] = useState(true);
  const [excludeCaptchaCountries, setExcludeCaptchaCountries] = useState(true);
  const [loading, setLoading] = useState(false);
  const [countryFilter, setCountryFilter] = useState("");
  const [selectedSteps, setSelectedSteps] = useState<Record<string, boolean>>({
    aip: true,
    notam: true,
    weather: true,
    pdf: true,
    gen: true,
  });
  const selectedStepCount = Object.values(selectedSteps).filter(Boolean).length;

  const refreshRuns = async () => {
    const res = await fetch("/api/admin/debug/runs", { cache: "no-store" });
    const data = await res.json();
    setRuns(Array.isArray(data.runs) ? data.runs : []);
  };

  const refreshRunDetail = async (runId: string) => {
    if (!runId) return;
    const res = await fetch(`/api/admin/debug/runs/${encodeURIComponent(runId)}`, { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    setSelectedRun(data as RunDetail);
  };

  useEffect(() => {
    fetch("/api/admin/status", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => setIsAdmin(Boolean(data?.isAdmin)))
      .catch(() => setIsAdmin(false));
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    refreshRuns().catch(() => {});
    const timer = setInterval(() => refreshRuns().catch(() => {}), 5000);
    return () => clearInterval(timer);
  }, [isAdmin]);

  useEffect(() => {
    if (!selectedRunId) return;
    refreshRunDetail(selectedRunId).catch(() => {});
    const timer = setInterval(() => refreshRunDetail(selectedRunId).catch(() => {}), 2500);
    return () => clearInterval(timer);
  }, [selectedRunId]);

  const grouped = useMemo(() => {
    const run = selectedRun;
    if (!run) return [] as Array<{ country: string; airports: RunDetail["airports"] }>;
    const map = new Map<string, RunDetail["airports"]>();
    for (const airport of run.airports) {
      const list = map.get(airport.country) ?? [];
      list.push(airport);
      map.set(airport.country, list);
    }
    return Array.from(map.entries()).map(([country, airports]) => ({ country, airports }));
  }, [selectedRun]);
  const progress = useMemo(() => {
    const run = selectedRun;
    const steps = run?.options?.steps?.length ? run.options.steps : DEFAULT_DEBUG_STEPS;
    const total = (run?.airports.length || 0) * steps.length;
    if (!run || total === 0) return { completed: 0, total: 0, percent: 0 };
    let completed = 0;
    for (const airport of run.airports) {
      for (const step of steps) {
        if (FINAL_STEP_STATES.has(airport.steps[step])) completed += 1;
      }
    }
    return {
      completed,
      total,
      percent: Math.round((completed / total) * 100),
    };
  }, [selectedRun]);

  if (isAdmin === false) {
    return <div className="p-6 text-sm text-muted-foreground">Admin access required.</div>;
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Debug Runner</CardTitle>
          <CardDescription>Start/stop admin debug runs and inspect airport step cards.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            Quantity
            <Input
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="w-28"
              disabled={allAirports}
              aria-describedby="debug-quantity-help"
            />
            <span id="debug-quantity-help" className="sr-only">
              Quantity is ignored when test all airports is enabled.
            </span>
          </label>
          <label className="text-sm">
            Concurrency
            <Input value={concurrency} onChange={(e) => setConcurrency(e.target.value)} className="w-28" />
          </label>
          <label className="text-sm flex items-center gap-2">
            <input
              type="checkbox"
              checked={allAirports}
              onChange={(e) => setAllAirports(e.target.checked)}
            />
            Test all airports
          </label>
          <label className="text-sm flex items-center gap-2">
            <input
              type="checkbox"
              checked={randomSample}
              onChange={(e) => setRandomSample(e.target.checked)}
              disabled={allAirports}
            />
            Random sample
          </label>
          <label className="text-sm flex items-center gap-2">
            <input
              type="checkbox"
              checked={excludeCaptchaCountries}
              onChange={(e) => setExcludeCaptchaCountries(e.target.checked)}
            />
            Exclude captcha countries
          </label>
          <label className="text-sm">
            Countries (comma separated)
            <Input
              value={countryFilter}
              onChange={(e) => setCountryFilter(e.target.value)}
              className="w-[320px]"
              placeholder="Germany, France"
            />
          </label>
          <div className="flex flex-wrap gap-2 text-xs">
            {["aip", "notam", "weather", "pdf", "gen"].map((step) => (
              <label key={step} className="inline-flex items-center gap-1 rounded border px-2 py-1">
                <input
                  type="checkbox"
                  checked={Boolean(selectedSteps[step])}
                  onChange={(e) => setSelectedSteps((prev) => ({ ...prev, [step]: e.target.checked }))}
                />
                {step.toUpperCase()}
              </label>
            ))}
          </div>
          <Button
            disabled={loading || selectedStepCount === 0}
            onClick={async () => {
              setLoading(true);
              try {
                const steps = Object.entries(selectedSteps)
                  .filter(([, enabled]) => enabled)
                  .map(([step]) => step);
                const countries = countryFilter
                  .split(",")
                  .map((x) => x.trim())
                  .filter(Boolean);
                const res = await fetch("/api/admin/debug/runs", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    quantity: Number(quantity),
                    allAirports,
                    concurrency: Number(concurrency),
                    randomSample,
                    countries,
                    excludeCaptchaCountries,
                    steps,
                  }),
                });
                const data = await res.json();
                if (data.runId) setSelectedRunId(data.runId);
                await refreshRuns();
              } finally {
                setLoading(false);
              }
            }}
          >
            Start run
          </Button>
          {selectedRunId ? (
            <Button
              variant="outline"
              onClick={async () => {
                await fetch(`/api/admin/debug/runs/${encodeURIComponent(selectedRunId)}`, { method: "POST" });
                await refreshRuns();
                await refreshRunDetail(selectedRunId);
              }}
            >
              Stop selected run
            </Button>
          ) : null}
          {selectedRunId ? (
            <Link className="text-sm underline" href={`/admin/debug/raw?run=${encodeURIComponent(selectedRunId)}`}>
              Open raw stream
            </Link>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Runs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {runs.map((run) => (
            <button
              key={run.id}
              type="button"
              className={`w-full rounded border p-2 text-left text-sm ${selectedRunId === run.id ? "border-primary" : "border-border"}`}
              onClick={() => setSelectedRunId(run.id)}
            >
              <div className="font-mono">{run.id}</div>
              <div>Status: {run.status} | Airports: {run.totals.airports} | Failed: {run.totals.failed} | Timeout: {run.totals.timeout}</div>
            </button>
          ))}
        </CardContent>
      </Card>

      {selectedRun ? (
        <Card>
          <CardHeader>
            <CardTitle>Progress</CardTitle>
            <CardDescription>
              {progress.completed} of {progress.total} selected checks finished across {selectedRun.airports.length} airport(s).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Progress value={progress.percent} aria-label="Debug run progress" />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{progress.percent}% complete</span>
              <span className="tabular-nums">
                Failed: {selectedRun.totals.failed} | Timeout: {selectedRun.totals.timeout}
              </span>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {grouped.map((group) => (
        <Card key={group.country}>
          <CardHeader>
            <CardTitle>{group.country}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 md:grid-cols-2">
            {group.airports.map((airport) => (
              <div key={airport.icao} className="rounded border p-2 text-xs">
                <div className="font-mono text-sm">{airport.icao} — {airport.name}</div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className={stepStatusClass(airport.steps.aip)}>AIP: {airport.steps.aip}</span>
                  <span className={stepStatusClass(airport.steps.notam)}>NOTAM: {airport.steps.notam}</span>
                  <span className={stepStatusClass(airport.steps.weather)}>WX: {airport.steps.weather}</span>
                  <span className={stepStatusClass(airport.steps.pdf)}>PDF: {airport.steps.pdf}</span>
                  <span className={stepStatusClass(airport.steps.gen)}>GEN: {airport.steps.gen}</span>
                </div>
                {(["aip", "notam", "weather", "pdf", "gen"] as const).map((step) => {
                  const state = airport.steps[step];
                  if (state !== "failed" && state !== "timeout") return null;
                  return (
                    <div key={`${airport.icao}-${step}`} className={`mt-1 rounded border border-red-300 bg-red-50 px-2 py-1 dark:border-red-900/70 dark:bg-red-950/40 ${stepStatusClass(state)}`}>
                      {step.toUpperCase()} {state}: {airport.stepDetails?.[step] || "No detail"}
                    </div>
                  );
                })}
                {airport.logs.slice(-4).map((line) => <div key={line} className="mt-1 text-muted-foreground">{line}</div>)}
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
